import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { CreateRestaurantDto, CreateTableDto, UpdateTableStatusDto, OnboardRestaurantDto, UpdateRestaurantStatusDto } from './dto/restaurant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Restaurants & Tables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('restaurants')
export class RestaurantController {
  constructor(private restaurantService: RestaurantService) {}

  @Post('onboard')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Onboard a brand new restaurant with its first owner account (Super Admin only)' })
  async onboardRestaurant(@Body() dto: OnboardRestaurantDto) {
    return this.restaurantService.onboardRestaurant(dto);
  }

  @Post('my-restaurant')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Self-service: an OTP-verified owner with no restaurant yet creates their own' })
  async createMyRestaurant(@Request() req, @Body() dto: CreateRestaurantDto) {
    return this.restaurantService.createMyRestaurant(req.user.id, dto);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new restaurant outlet (without an owner account)' })
  async createRestaurant(@Body() dto: CreateRestaurantDto) {
    return this.restaurantService.createRestaurant(dto);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'OWNER')
  @ApiOperation({ summary: 'Get all restaurant outlets' })
  async findAllRestaurants() {
    return this.restaurantService.findAllRestaurants();
  }

  @Get('overview')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Platform-wide oversight: every restaurant with its revenue, order count, and status side by side (Site Owner / Super Admin only)',
  })
  async getPlatformOverview(@Request() req) {
    const includeDemo = req.query?.includeDemo === 'true';
    return this.restaurantService.getPlatformOverview(includeDemo);
  }

  @Get(':id/revenue')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Detailed revenue drill-down for one restaurant: 30-day daily trend + payment method breakdown' })
  async getRestaurantRevenue(@Param('id') id: string) {
    return this.restaurantService.getRestaurantRevenue(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a restaurant outlet details' })
  async findOneRestaurant(@Param('id') id: string) {
    return this.restaurantService.findOneRestaurant(id);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'OWNER')
  @ApiOperation({ summary: 'Update a restaurant outlet' })
  async updateRestaurant(@Param('id') id: string, @Body() dto: CreateRestaurantDto) {
    return this.restaurantService.updateRestaurant(id, dto);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Activate or suspend a restaurant (Super Admin only)' })
  async updateRestaurantStatus(@Param('id') id: string, @Body() dto: UpdateRestaurantStatusDto) {
    return this.restaurantService.updateRestaurantStatus(id, dto.status);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a restaurant outlet' })
  async deleteRestaurant(@Param('id') id: string) {
    return this.restaurantService.deleteRestaurant(id);
  }

  // Tables Endpoints
  @Post('tables')
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Add a dining table. Owners/Managers add to their own restaurant; the Site Owner must pass restaurantId.',
  })
  async createTable(@Request() req, @Body() dto: CreateTableDto) {
    return this.restaurantService.createTable(dto, { role: req.user.role, restaurantId: req.user.restaurantId });
  }

  @Get(':restaurantId/tables')
  @ApiOperation({ summary: 'Get all tables of your restaurant' })
  async findTables(@Request() req, @Param('restaurantId') restaurantId: string) {
    return this.restaurantService.findTablesByRestaurant(restaurantId, {
      role: req.user.role,
      restaurantId: req.user.restaurantId,
    });
  }

  @Put('tables/:id/status')
  @ApiOperation({ summary: 'Update table status (e.g. occupied, available) — own restaurant only' })
  async updateTableStatus(@Request() req, @Param('id') id: string, @Body() dto: UpdateTableStatusDto) {
    return this.restaurantService.updateTableStatus(id, dto.status, {
      role: req.user.role,
      restaurantId: req.user.restaurantId,
    });
  }

  @Delete('tables/:id')
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Delete a table that has no order history — own restaurant only' })
  async deleteTable(@Request() req, @Param('id') id: string) {
    return this.restaurantService.deleteTable(id, { role: req.user.role, restaurantId: req.user.restaurantId });
  }
}
