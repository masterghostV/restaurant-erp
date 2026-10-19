import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderStatusDto, RecordPaymentDto } from './dto/order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

// Who is asking, taken from the verified login (never from request data).
const caller = (req: any) => ({ role: req.user.role, restaurantId: req.user.restaurantId });

@ApiTags('Orders & Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'WAITER', 'CASHIER')
  @ApiOperation({ summary: 'Create a KOT order from Waiter' })
  async createOrder(@Request() req, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(dto, caller(req));
  }

  @Get('restaurant/:restaurantId')
  @ApiOperation({ summary: 'Get all orders of a restaurant outlet' })
  async findOrders(@Request() req, @Param('restaurantId') restaurantId: string) {
    return this.orderService.findOrdersByRestaurant(restaurantId, caller(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a single order' })
  async findOneOrder(@Request() req, @Param('id') id: string) {
    return this.orderService.findOneOrder(id, caller(req));
  }

  @Put(':id/status')
  @Roles('SUPER_ADMIN', 'OWNER', 'KITCHEN', 'WAITER', 'CASHIER')
  @ApiOperation({ summary: 'Change order status (NEW -> PREPARING -> READY -> SERVED -> COMPLETED)' })
  async updateStatus(@Request() req, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateOrderStatus(id, dto, caller(req));
  }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'OWNER', 'WAITER', 'KITCHEN')
  @ApiOperation({ summary: 'Cancel an order (only before it is Ready/Served) and restore any deducted stock' })
  async cancelOrder(@Request() req, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.orderService.cancelOrder(id, caller(req), reason);
  }

  @Post(':id/payment')
  @Roles('SUPER_ADMIN', 'CASHIER')
  @ApiOperation({ summary: 'Record checkout payment and close a single order' })
  async recordPayment(@Request() req, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.orderService.recordPayment(id, dto, caller(req));
  }

  @Get('table/:tableId/bill')
  @Roles('SUPER_ADMIN', 'CASHIER', 'OWNER', 'WAITER')
  @ApiOperation({ summary: 'Get the combined, still-open bill for a table (all rounds of ordering combined)' })
  async getTableBill(@Request() req, @Param('tableId') tableId: string) {
    return this.orderService.getTableBill(tableId, caller(req));
  }

  @Post('table/:tableId/payment')
  @Roles('SUPER_ADMIN', 'CASHIER')
  @ApiOperation({ summary: 'Pay off every open order for a table in a single consolidated bill' })
  async recordTablePayment(@Request() req, @Param('tableId') tableId: string, @Body() dto: RecordPaymentDto) {
    return this.orderService.recordTablePayment(tableId, dto, caller(req));
  }
}
