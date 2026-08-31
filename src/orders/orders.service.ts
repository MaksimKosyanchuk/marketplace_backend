import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus, Prisma, Role } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService, @InjectQueue('orders') private ordersQueue: Queue,) {}

  async checkout(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new BadRequestException('Cart is empty');

    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: { product: true },
    });

    if (items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      let totalAmount = new Prisma.Decimal(0);
      const orderItemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

      for (const item of items) {
        const result = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });

        if (result.count === 0) {
          throw new BadRequestException(
            `Insufficient stock for product "${item.product.name}"`,
          );
        }

        const lineTotal = item.product.price.mul(item.quantity);
        totalAmount = totalAmount.add(lineTotal);

        orderItemsData.push({
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
        });
      }

      const newOrder = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.NEW,
          totalAmount,
          items: { createMany: { data: orderItemsData } },
        },
        include: { items: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });

    // ВАЖНО: задача в очередь кладётся ПОСЛЕ успешного коммита транзакции,
    // а не внутри неё — иначе воркер может забрать задачу раньше, чем БД зафиксирует изменения
    await this.ordersQueue.add('process-order', { orderId: order.id });

    return order;
  }

  async findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, userRole: Role, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Customer может смотреть только свои заказы, Admin — любые
    if (userRole !== Role.ADMIN && order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  async findAll() {
    return this.prisma.order.findMany({
      include: { items: true, user: { select: { id: true, email: true, nickName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: dto.status },
    });
  }
}