// orders.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, Query} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { QueryOrderDto } from './dto/query-order.dto';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  checkout(@Req() req) {
    return this.ordersService.checkout(req.user.id);
  }

  @Post(':id/pay')
  payOrder(@Req() req, @Param('id') id: string) {
    return this.ordersService.payOrder(req.user.id, id);
  }

  @Post(':id/cancel')
  cancelOrder(@Req() req, @Param('id') id: string) {
    return this.ordersService.cancelOrder(req.user.id, id);
  }

  @Get('my')
  findMyOrders(@Req() req) {
    return this.ordersService.findMyOrders(req.user.id);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.ordersService.findOne(req.user.id, req.user.role, id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query() query: QueryOrderDto) {
    return this.ordersService.findAll(query);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }
}