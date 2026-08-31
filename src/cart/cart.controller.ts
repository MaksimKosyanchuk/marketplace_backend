// cart.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Req() req) {
    return this.cartService.getCart(req.user.id);
  }

  @Post('items')
  addItem(@Req() req, @Body() dto: AddToCartDto) {
    return this.cartService.addItem(req.user.id, dto);
  }

  @Patch('items/:id')
  updateItem(@Req() req, @Param('id') id: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(req.user.id, id, dto);
  }

  @Delete('items/:id')
  removeItem(@Req() req, @Param('id') id: string) {
    return this.cartService.removeItem(req.user.id, id);
  }

  @Delete()
  clearCart(@Req() req) {
    return this.cartService.clearCart(req.user.id);
  }
}