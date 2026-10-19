import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRestaurantDto, CreateTableDto, UpdateTableStatusDto, OnboardRestaurantDto } from './dto/restaurant.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import * as bcrypt from 'bcryptjs';

export type TableCaller = { role: string; restaurantId: string | null };

@Injectable()
export class RestaurantService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  // Restaurant Operations
  async createRestaurant(dto: CreateRestaurantDto) {
    return this.prisma.restaurant.create({
      data: dto,
    });
  }

  /**
   * Super-Admin-only flow: creates a brand new restaurant AND its first
   * OWNER account together, atomically. This is the only supported way to
   * bring a new restaurant onto the platform — nothing about role or
   * restaurant assignment is ever taken from an unauthenticated caller.
   */
  async onboardRestaurant(dto: OnboardRestaurantDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.ownerEmail } });
    if (existingUser) {
      throw new BadRequestException('A user with this owner email already exists');
    }

    let ownerRole = await this.prisma.role.findUnique({ where: { name: 'OWNER' } });
    if (!ownerRole) {
      ownerRole = await this.prisma.role.create({ data: { name: 'OWNER', description: 'Restaurant owner/admin' } });
    }

    const hashedPassword = await bcrypt.hash(dto.ownerPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.name,
          address: dto.address,
          phone: dto.phone,
          gstNumber: dto.gstNumber,
          status: 'ACTIVE',
        },
      });

      const ownerUser = await tx.user.create({
        data: {
          email: dto.ownerEmail,
          password: hashedPassword,
          name: dto.ownerName,
          roleId: ownerRole.id,
          isVerified: true,
        },
      });

      await tx.staff.create({
        data: {
          userId: ownerUser.id,
          restaurantId: restaurant.id,
          phone: dto.ownerPhone || dto.phone,
          salary: 0,
          status: 'ACTIVE',
        },
      });

      return {
        restaurant,
        owner: { id: ownerUser.id, email: ownerUser.email, name: ownerUser.name },
      };
    });
  }

  /**
   * Platform-wide oversight for the Site Owner: every restaurant side by
   * side with its revenue and activity, so you can see at a glance which
   * restaurants are active, how much business they're doing, and their
   * current status. Demo restaurants are excluded by default since they're
   * not real businesses — pass includeDemo=true to see them anyway.
   */
  async getPlatformOverview(includeDemo = false) {
    const restaurants = await this.prisma.restaurant.findMany({
      where: includeDemo ? {} : { isDemo: false },
      include: {
        _count: { select: { staff: true, tables: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const revenueByRestaurant = await this.prisma.order.groupBy({
      by: ['restaurantId'],
      where: {
        status: 'COMPLETED',
        restaurantId: { in: restaurants.map((r) => r.id) },
      },
      _sum: { totalPrice: true },
      _count: { id: true },
    });

    const revenueMap = new Map<string, { revenue: number; completedOrders: number }>(
      revenueByRestaurant.map((r) => [r.restaurantId, { revenue: r._sum.totalPrice || 0, completedOrders: r._count.id }]),
    );

    const restaurantsWithRevenue = restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      isDemo: r.isDemo,
      staffCount: r._count.staff,
      tableCount: r._count.tables,
      totalOrders: r._count.orders,
      completedOrders: revenueMap.get(r.id)?.completedOrders || 0,
      totalRevenue: revenueMap.get(r.id)?.revenue || 0,
      createdAt: r.createdAt,
    }));

    const platformTotals = restaurantsWithRevenue.reduce(
      (acc, r) => ({
        totalRevenue: acc.totalRevenue + r.totalRevenue,
        totalOrders: acc.totalOrders + r.totalOrders,
        totalRestaurants: acc.totalRestaurants + 1,
        activeRestaurants: acc.activeRestaurants + (r.status === 'ACTIVE' ? 1 : 0),
        suspendedRestaurants: acc.suspendedRestaurants + (r.status === 'SUSPENDED' ? 1 : 0),
      }),
      { totalRevenue: 0, totalOrders: 0, totalRestaurants: 0, activeRestaurants: 0, suspendedRestaurants: 0 },
    );

    return { platformTotals, restaurants: restaurantsWithRevenue };
  }

  /**
   * Detailed revenue drill-down for a single restaurant: daily revenue for
   * the last 30 days plus a payment-method breakdown, so the Site Owner can
   * see trends, not just a lifetime total.
   */
  async getRestaurantRevenue(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrders = await this.prisma.order.findMany({
      where: { restaurantId, status: 'COMPLETED', createdAt: { gte: thirtyDaysAgo } },
      select: { totalPrice: true, createdAt: true },
    });

    const dailyRevenueMap = new Map<string, number>();
    for (const order of recentOrders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      dailyRevenueMap.set(day, (dailyRevenueMap.get(day) || 0) + order.totalPrice);
    }
    const dailyRevenue = Array.from(dailyRevenueMap.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const paymentsByMethod = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { status: 'COMPLETED', order: { restaurantId } },
      _sum: { amount: true },
      _count: { id: true },
    });

    const allTimeTotal = await this.prisma.order.aggregate({
      where: { restaurantId, status: 'COMPLETED' },
      _sum: { totalPrice: true },
      _count: { id: true },
    });

    return {
      restaurant: { id: restaurant.id, name: restaurant.name, status: restaurant.status },
      allTimeRevenue: allTimeTotal._sum.totalPrice || 0,
      allTimeCompletedOrders: allTimeTotal._count.id,
      last30DaysRevenue: dailyRevenue.reduce((sum, d) => sum + d.revenue, 0),
      dailyRevenue,
      paymentsByMethod: paymentsByMethod.map((p) => ({
        method: p.method,
        totalAmount: p._sum.amount || 0,
        count: p._count.id,
      })),
    };
  }

  async findAllRestaurants() {
    return this.prisma.restaurant.findMany({
      include: {
        _count: {
          select: { staff: true, tables: true, orders: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Self-service restaurant creation for an owner who signed up via OTP
   * and doesn't have a restaurant yet. A given owner account can only ever
   * create one restaurant this way — enforced by checking they have no
   * existing Staff record.
   */
  async createMyRestaurant(userId: string, dto: CreateRestaurantDto) {
    const existingStaff = await this.prisma.staff.findUnique({ where: { userId } });
    if (existingStaff) {
      throw new BadRequestException('You already have a restaurant associated with your account');
    }

    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.name,
          address: dto.address,
          phone: dto.phone,
          gstNumber: dto.gstNumber,
          status: 'ACTIVE',
        },
      });

      await tx.staff.create({
        data: {
          userId,
          restaurantId: restaurant.id,
          phone: dto.phone,
          salary: 0,
          status: 'ACTIVE',
        },
      });

      return restaurant;
    });
  }

  async findOneRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        tables: true,
        menuCategories: true,
      },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return restaurant;
  }

  async updateRestaurant(id: string, dto: CreateRestaurantDto) {
    return this.prisma.restaurant.update({
      where: { id },
      data: dto,
    });
  }

  async updateRestaurantStatus(id: string, status: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    return this.prisma.restaurant.update({
      where: { id },
      data: { status },
    });
  }

  async deleteRestaurant(id: string) {
    return this.prisma.restaurant.delete({
      where: { id },
    });
  }

  // Table Operations
  //
  // Tables are private to one restaurant. Every method below works out which
  // restaurant is allowed from the logged-in user (never from request data):
  // an Owner or Manager can only touch their own restaurant's tables, while
  // the Site Owner (SUPER_ADMIN) can act on any restaurant.
  private assertRestaurantAccess(caller: TableCaller, restaurantId: string) {
    if (caller.role === 'SUPER_ADMIN') return;
    if (!caller.restaurantId || caller.restaurantId !== restaurantId) {
      throw new ForbiddenException('You can only manage tables in your own restaurant');
    }
  }

  async createTable(dto: CreateTableDto, caller: TableCaller) {
    let restaurantId: string;
    if (caller.role === 'SUPER_ADMIN') {
      if (!dto.restaurantId) {
        throw new BadRequestException('restaurantId is required when a Site Owner adds a table');
      }
      restaurantId = dto.restaurantId;
    } else {
      if (!caller.restaurantId) {
        throw new ForbiddenException('You are not associated with a restaurant');
      }
      restaurantId = caller.restaurantId;
    }

    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const number = dto.number.trim();
    if (!number) {
      throw new BadRequestException('Table name/number cannot be empty');
    }

    // Two tables with the same name in one restaurant would be impossible to
    // tell apart on the waiter screen, so reject duplicates (ignoring case).
    const duplicate = await this.prisma.table.findFirst({
      where: { restaurantId, number: { equals: number, mode: 'insensitive' } },
    });
    if (duplicate) {
      throw new BadRequestException(`A table named "${duplicate.number}" already exists in this restaurant`);
    }

    const table = await this.prisma.table.create({
      data: {
        number,
        capacity: dto.capacity,
        status: dto.status || 'AVAILABLE',
        restaurantId,
        qrCode: `TABLE_QR_${number}_${Date.now()}`,
      },
    });

    // Waiter screens in this restaurant pick the new table up immediately.
    this.realtime.sendTableUpdate(table);
    return table;
  }

  async findTablesByRestaurant(restaurantId: string, caller: TableCaller) {
    this.assertRestaurantAccess(caller, restaurantId);
    return this.prisma.table.findMany({
      where: { restaurantId },
      orderBy: { number: 'asc' },
    });
  }

  async updateTableStatus(id: string, status: string, caller: TableCaller) {
    const existing = await this.prisma.table.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Table not found');
    }
    this.assertRestaurantAccess(caller, existing.restaurantId);

    const table = await this.prisma.table.update({
      where: { id },
      data: { status },
    });
    this.realtime.sendTableUpdate(table);
    return table;
  }

  async deleteTable(id: string, caller: TableCaller) {
    const existing = await this.prisma.table.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Table not found');
    }
    this.assertRestaurantAccess(caller, existing.restaurantId);

    // Orders keep a reference to their table (for bills and reports), so a
    // table that has ever had an order can't be removed without breaking that
    // history. Fail with a clear message instead of a raw database error.
    const orderCount = await this.prisma.order.count({ where: { tableId: id } });
    if (orderCount > 0) {
      throw new BadRequestException(
        `Table "${existing.number}" has ${orderCount} order(s) in its history, so it can't be deleted. Set its status to RESERVED to stop using it.`,
      );
    }

    await this.prisma.table.delete({ where: { id } });
    this.realtime.sendTableUpdate({ ...existing, deleted: true });
    return { ok: true };
  }
}
