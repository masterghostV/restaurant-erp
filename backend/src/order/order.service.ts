import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, UpdateOrderStatusDto, RecordPaymentDto } from './dto/order.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export type OrderCaller = { role: string; restaurantId: string | null };

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  // Orders belong to one restaurant. Staff may only touch their own
  // restaurant's orders; the Site Owner (SUPER_ADMIN) may touch any.
  private assertRestaurantAccess(caller: OrderCaller, restaurantId: string) {
    if (caller.role === 'SUPER_ADMIN') return;
    if (!caller.restaurantId || caller.restaurantId !== restaurantId) {
      throw new ForbiddenException('You can only access orders from your own restaurant');
    }
  }

  private async assertOrderAccess(orderId: string, caller: OrderCaller) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { restaurantId: true } });
    if (!order) throw new NotFoundException('Order not found');
    this.assertRestaurantAccess(caller, order.restaurantId);
  }

  private async assertTableAccess(tableId: string, caller: OrderCaller) {
    const table = await this.prisma.table.findUnique({ where: { id: tableId }, select: { restaurantId: true } });
    if (!table) throw new NotFoundException('Table not found');
    this.assertRestaurantAccess(caller, table.restaurantId);
  }

  async createOrder(dto: CreateOrderDto, caller: OrderCaller) {
    // The restaurant comes from who is logged in, not from the request body,
    // so a waiter can never send an order into another restaurant's kitchen.
    const restaurantId = caller.role === 'SUPER_ADMIN' ? dto.restaurantId : caller.restaurantId;
    if (!restaurantId) {
      throw new ForbiddenException('You are not associated with a restaurant');
    }
    dto.restaurantId = restaurantId;

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('An order needs at least one item');
    }

    if (dto.tableId) {
      const table = await this.prisma.table.findUnique({ where: { id: dto.tableId } });
      if (!table || table.restaurantId !== restaurantId) {
        throw new NotFoundException('That table does not exist in this restaurant');
      }
    }

    // 1. Fetch details of all menu items in the order (only this restaurant's)
    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, category: { restaurantId } },
    });

    if (menuItems.length !== menuItemIds.length) {
      throw new NotFoundException('Some menu items were not found');
    }

    let subtotal = 0;
    let taxAmount = 0;

    const orderItemsData = dto.items.map((itemDto) => {
      const menuItem = menuItems.find((m) => m.id === itemDto.menuItemId);
      const itemSubtotal = menuItem.price * itemDto.quantity;
      const itemTax = itemSubtotal * (menuItem.taxRate / 100);

      subtotal += itemSubtotal;
      taxAmount += itemTax;

      return {
        menuItemId: itemDto.menuItemId,
        quantity: itemDto.quantity,
        price: menuItem.price,
        notes: itemDto.notes,
        status: 'PENDING',
      };
    });

    const totalPrice = subtotal + taxAmount;

    // 2. Database transaction to write Order and OrderItems, and update table status
    const deductedInventoryItems: any[] = [];

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          tableId: dto.tableId,
          waiterId: dto.waiterId,
          restaurantId: dto.restaurantId,
          status: 'NEW',
          subtotal,
          taxAmount,
          totalPrice,
          notes: dto.notes,
          orderItems: {
            create: orderItemsData,
          },
        },
        include: {
          orderItems: {
            include: { menuItem: true },
          },
          table: true,
        },
      });

      if (dto.tableId) {
        await tx.table.update({
          where: { id: dto.tableId },
          data: { status: 'OCCUPIED' },
        });
      }

      // Deduct ingredients automatically
      for (const item of dto.items) {
        const recipe = await tx.recipe.findUnique({
          where: { menuItemId: item.menuItemId },
          include: { recipeIngredients: true },
        });

        if (recipe && recipe.recipeIngredients.length > 0) {
          for (const ing of recipe.recipeIngredients) {
            const neededQty = ing.quantityNeeded * item.quantity;

            // Re-check current stock inside the transaction to avoid
            // driving quantity negative (mirrors the guard already used
            // in InventoryService.createTransaction).
            const inventoryItem = await tx.inventoryItem.findUnique({
              where: { id: ing.inventoryItemId },
            });

            if (!inventoryItem) {
              throw new NotFoundException(
                `Inventory item ${ing.inventoryItemId} referenced by recipe not found`,
              );
            }

            if (inventoryItem.quantity < neededQty) {
              throw new BadRequestException(
                `Insufficient stock for "${inventoryItem.name}". Needed ${neededQty} ${inventoryItem.unit}, have ${inventoryItem.quantity} ${inventoryItem.unit}.`,
              );
            }

            // Log consumption transaction
            await tx.inventoryTransaction.create({
              data: {
                inventoryItemId: ing.inventoryItemId,
                type: 'CONSUMED',
                quantity: neededQty,
                notes: `KOT Order ${createdOrder.id}`,
              },
            });

            // Adjust stock
            const updatedItem = await tx.inventoryItem.update({
              where: { id: ing.inventoryItemId },
              data: {
                quantity: {
                  decrement: neededQty,
                },
              },
            });
            deductedInventoryItems.push(updatedItem);

            // Low-stock notification, mirroring InventoryService's behavior,
            // since this deduction path bypasses that service entirely.
            const newQty = inventoryItem.quantity - neededQty;
            if (newQty <= inventoryItem.threshold) {
              const staffs = await tx.staff.findMany({
                where: { restaurantId: inventoryItem.restaurantId },
              });
              for (const staff of staffs) {
                await tx.notification.create({
                  data: {
                    userId: staff.userId,
                    title: 'Low Stock Alert',
                    message: `${inventoryItem.name} is running low (${newQty.toFixed(2)} ${inventoryItem.unit} remaining).`,
                    type: 'LOW_STOCK',
                  },
                });
              }
            }
          }
        }
      }

      return createdOrder;
    });

    // 3. Trigger realtime broadcasts
    this.realtime.sendKitchenUpdate(order);
    this.realtime.sendOrderUpdate(order);

    // Let the Inventory Store screen (and anywhere else watching stock
    // levels) know about every ingredient this order just consumed —
    // without this, stock is correctly deducted in the database but the
    // page never finds out until it's manually refreshed.
    for (const item of deductedInventoryItems) {
      this.realtime.sendInventoryUpdate(item);
    }

    return order;
  }

  async findOrdersByRestaurant(restaurantId: string, caller: OrderCaller) {
    this.assertRestaurantAccess(caller, restaurantId);
    return this.prisma.order.findMany({
      where: { restaurantId },
      include: {
        orderItems: {
          include: { menuItem: true },
        },
        table: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrder(id: string, caller: OrderCaller) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: { menuItem: true },
        },
        table: true,
        payments: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    this.assertRestaurantAccess(caller, order.restaurantId);
    return order;
  }

  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto, caller: OrderCaller) {
    await this.assertOrderAccess(id, caller);
    const order = await this.prisma.order.update({
      where: { id },
      data: { status: dto.status },
      include: {
        orderItems: {
          include: { menuItem: true },
        },
        table: true,
      },
    });

    // Notify Waiter if food is ready
    if (dto.status === 'READY' && order.waiterId) {
      const waiterUser = await this.prisma.user.findUnique({
        where: { id: order.waiterId },
      });

      if (waiterUser) {
        const notif = await this.prisma.notification.create({
          data: {
            userId: order.waiterId,
            title: 'Order Ready',
            message: `Food for Table ${order.table?.number || 'N/A'} is ready to serve!`,
            type: 'ORDER_READY',
          },
        });

        this.realtime.sendNotification(order.waiterId, notif);
      }
    }

    this.realtime.sendKitchenUpdate(order);
    this.realtime.sendOrderUpdate(order);

    return order;
  }

  /**
   * Cancels an order that hasn't been cooked/served yet, and reverses any
   * ingredient stock that was automatically deducted for it — otherwise
   * cancelling an order would permanently "lose" that inventory even
   * though the food was never actually made.
   */
  async cancelOrder(id: string, caller: OrderCaller, reason?: string) {
    await this.assertOrderAccess(id, caller);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { orderItems: true, table: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel an order that has already been paid.');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('This order is already cancelled.');
    }
    if (order.status === 'READY' || order.status === 'SERVED') {
      throw new BadRequestException(
        'This order has already been cooked/served and can no longer be cancelled. Use a complaint or manual inventory adjustment instead.',
      );
    }

    const restoredInventoryItems: any[] = [];

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // Reverse ingredient deductions for every item in this order.
      for (const item of order.orderItems) {
        const recipe = await tx.recipe.findUnique({
          where: { menuItemId: item.menuItemId },
          include: { recipeIngredients: true },
        });

        if (recipe && recipe.recipeIngredients.length > 0) {
          for (const ing of recipe.recipeIngredients) {
            const restoredQty = ing.quantityNeeded * item.quantity;

            await tx.inventoryTransaction.create({
              data: {
                inventoryItemId: ing.inventoryItemId,
                type: 'STOCK_IN',
                quantity: restoredQty,
                notes: `Order ${order.id} cancelled — ingredients restored`,
              },
            });

            const restored = await tx.inventoryItem.update({
              where: { id: ing.inventoryItemId },
              data: { quantity: { increment: restoredQty } },
            });
            restoredInventoryItems.push(restored);
          }
        }
      }

      const cancelled = await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: reason ? `${order.notes ? order.notes + ' | ' : ''}Cancelled: ${reason}` : order.notes,
        },
        include: {
          orderItems: { include: { menuItem: true } },
          table: true,
        },
      });

      // Free the table back up, but only if this was the last remaining
      // open order for it (a table that ordered in multiple rounds might
      // still have other active orders).
      if (order.tableId) {
        const otherOpenOrders = await tx.order.count({
          where: {
            tableId: order.tableId,
            id: { not: id },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
        });
        if (otherOpenOrders === 0) {
          await tx.table.update({
            where: { id: order.tableId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      return cancelled;
    });

    this.realtime.sendKitchenUpdate(updatedOrder);
    this.realtime.sendOrderUpdate(updatedOrder);
    for (const item of restoredInventoryItems) {
      this.realtime.sendInventoryUpdate(item);
    }
    if (updatedOrder.tableId) {
      const table = await this.prisma.table.findUnique({ where: { id: updatedOrder.tableId } });
      if (table) this.realtime.sendTableUpdate(table);
    }

    return updatedOrder;
  }

  async recordPayment(id: string, dto: RecordPaymentDto, caller: OrderCaller) {
    await this.assertOrderAccess(id, caller);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { table: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'COMPLETED') {
      throw new BadRequestException('This order has already been paid.');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot record payment for a cancelled order.');
    }

    const discountAmount = dto.discountAmount || 0;
    const finalPrice = Math.max(0, order.totalPrice - discountAmount);

    // Guard against a mismatched/short payment closing out the bill. A
    // small epsilon accounts for floating point rounding on currency math.
    const EPSILON = 0.01;
    if (Math.abs(dto.amount - finalPrice) > EPSILON) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) does not match the amount due (${finalPrice.toFixed(2)}).`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Payment
      const payment = await tx.payment.create({
        data: {
          orderId: id,
          amount: dto.amount,
          status: 'COMPLETED',
          method: dto.method,
          transactionId: dto.transactionId,
        },
      });

      // 2. Update Order
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          discountAmount,
          totalPrice: finalPrice,
        },
        include: {
          orderItems: {
            include: { menuItem: true },
          },
          table: true,
          payments: true,
        },
      });

      // 3. Update Table back to AVAILABLE
      if (order.tableId) {
        await tx.table.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        });
      }

      return { updatedOrder, payment };
    });

    // Notify POS modules & Owner Dashboard updates
    this.realtime.sendOrderUpdate(result.updatedOrder);

    // Compute today's business stats and emit to Owner Panel
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = await this.prisma.order.findMany({
      where: {
        restaurantId: order.restaurantId,
        status: 'COMPLETED',
        createdAt: { gte: today },
      },
    });

    const salesSum = todayOrders.reduce((acc, curr) => acc + curr.totalPrice, 0);
    this.realtime.sendOwnerDashboardUpdate(order.restaurantId, {
      sales: salesSum,
      completedOrders: todayOrders.length,
    });

    return result;
  }

  /**
   * Returns every still-open order for a table (i.e. everything the
   * customer ordered during this sitting — including orders placed at
   * different times), combined into one logical bill. Used by the Cashier
   * panel once the Waiter has clicked "Finish Table".
   */
  async getTableBill(tableId: string, caller: OrderCaller) {
    await this.assertTableAccess(tableId, caller);
    const table = await this.prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Table not found');

    const orders = await this.prisma.order.findMany({
      where: {
        tableId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: {
        orderItems: { include: { menuItem: true } },
        table: true,
        payments: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const subtotal = orders.reduce((sum, o) => sum + o.subtotal, 0);
    const taxAmount = orders.reduce((sum, o) => sum + o.taxAmount, 0);
    const totalPrice = orders.reduce((sum, o) => sum + o.totalPrice, 0);

    // Any partial payments already collected toward this bill (e.g. a
    // customer who paid half in cash already, splitting the rest onto a
    // card) — so the Cashier screen can show what's actually still owed.
    const amountPaid = orders
      .flatMap((o) => o.payments)
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0);

    return { table, orders, subtotal, taxAmount, totalPrice, amountPaid, amountDue: Math.max(0, totalPrice - amountPaid) };
  }

  /**
   * Pays off every open order for a table in one action — this is the
   * "one bill even if the customer ordered in multiple rounds" flow.
   * The paid amount/discount is split proportionally across each order
   * (by its share of the combined total) so every order still ends up
   * with its own accurate Payment record for auditing, while the Cashier
   * only ever has to do this once per table.
   */
  /**
   * Pays (all or part of) a table's combined bill in one action. Supports
   * split billing — e.g. half in cash, half on card — by allowing `amount`
   * to be less than the full amount due; the bill only actually closes out
   * (orders marked COMPLETED, table freed) once enough payments have been
   * recorded to cover the whole thing.
   *
   * `discountAmount` should represent the discount for the WHOLE bill and
   * stay consistent across calls for the same table (the frontend should
   * lock the discount field after the first installment) — it is only
   * ever actually applied once, on the payment that finally completes
   * the bill.
   */
  async recordTablePayment(tableId: string, dto: RecordPaymentDto, caller: OrderCaller) {
    await this.assertTableAccess(tableId, caller);
    const table = await this.prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Table not found');

    const orders = await this.prisma.order.findMany({
      where: {
        tableId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    });

    if (orders.length === 0) {
      throw new BadRequestException('There are no open orders for this table to bill.');
    }

    const orderIds = orders.map((o) => o.id);
    const combinedTotal = orders.reduce((sum, o) => sum + o.totalPrice, 0);

    const priorPayments = await this.prisma.payment.aggregate({
      where: { orderId: { in: orderIds }, status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const previouslyPaid = priorPayments._sum.amount || 0;

    const discountAmount = dto.discountAmount || 0;
    const netTotalDue = Math.max(0, combinedTotal - discountAmount);
    const remainingDue = Math.max(0, netTotalDue - previouslyPaid);

    const EPSILON = 0.01;
    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }
    if (dto.amount > remainingDue + EPSILON) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds the remaining balance due (${remainingDue.toFixed(2)}).`,
      );
    }

    const isFinalPayment = Math.abs(dto.amount - remainingDue) <= EPSILON;

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrders = [];

      for (const order of orders) {
        // Each order's share of the combined bill, proportional to how
        // much of the total it represents — used to split both this
        // installment's payment and (on the final installment) the
        // discount, across each underlying order for accurate records.
        const share = combinedTotal > 0 ? order.totalPrice / combinedTotal : 1 / orders.length;
        const orderPaymentAmount = dto.amount * share;

        await tx.payment.create({
          data: {
            orderId: order.id,
            amount: orderPaymentAmount,
            status: 'COMPLETED',
            method: dto.method,
            transactionId: dto.transactionId,
          },
        });

        if (isFinalPayment) {
          const orderDiscount = discountAmount * share;
          const orderFinalPrice = Math.max(0, order.totalPrice - orderDiscount);

          const updated = await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'COMPLETED',
              discountAmount: orderDiscount,
              totalPrice: orderFinalPrice,
            },
            include: {
              orderItems: { include: { menuItem: true } },
              table: true,
              payments: true,
            },
          });
          updatedOrders.push(updated);
        } else {
          // Not done yet (split payment) — the order itself doesn't
          // change status, but the frontend still needs to see the new
          // Payment record that was just added so it can update the
          // "amount still due" figure without a manual refresh.
          const refreshed = await tx.order.findUnique({
            where: { id: order.id },
            include: {
              orderItems: { include: { menuItem: true } },
              table: true,
              payments: true,
            },
          });
          if (refreshed) updatedOrders.push(refreshed);
        }
      }

      if (isFinalPayment) {
        await tx.table.update({
          where: { id: tableId },
          data: { status: 'AVAILABLE' },
        });
      }

      return updatedOrders;
    });

    for (const updatedOrder of result) {
      this.realtime.sendOrderUpdate(updatedOrder);
    }
    if (isFinalPayment) {
      const freedTable = await this.prisma.table.findUnique({ where: { id: tableId } });
      if (freedTable) this.realtime.sendTableUpdate(freedTable);
    }

    if (isFinalPayment) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayOrders = await this.prisma.order.findMany({
        where: {
          restaurantId: table.restaurantId,
          status: 'COMPLETED',
          createdAt: { gte: today },
        },
      });

      const salesSum = todayOrders.reduce((acc, curr) => acc + curr.totalPrice, 0);
      this.realtime.sendOwnerDashboardUpdate(table.restaurantId, {
        sales: salesSum,
        completedOrders: todayOrders.length,
      });
    }

    return {
      orders: result,
      amountPaidThisInstallment: dto.amount,
      isFinalPayment,
      remainingBalance: isFinalPayment ? 0 : Math.max(0, remainingDue - dto.amount),
    };
  }
}
