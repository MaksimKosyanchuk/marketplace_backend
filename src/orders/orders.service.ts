// orders.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { QueryOrderDto } from './dto/query-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('orders') private ordersQueue: Queue,
  ) {}

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
          status: OrderStatus.NEW, // заказ создан, ждёт оплаты
          totalAmount,
          items: { createMany: { data: orderItemsData } },
        },
        include: { items: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });

    return order;
  }

  async payOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (order.status !== OrderStatus.NEW) {
      throw new BadRequestException(`Order is already ${order.status.toLowerCase()}, cannot pay again`);
    }

    const payment = this.mockChargePayment(order.totalAmount);

    if (!payment.success) {
      await this.cancelAndRestock(orderId);
      throw new BadRequestException('Payment failed, order cancelled and stock restored');
    }

    await this.ordersQueue.add('process-order', { orderId: order.id });

    return { success: true, orderId: order.id, transactionId: payment.transactionId };
  }

  private mockChargePayment(amount: Prisma.Decimal): { success: boolean; transactionId: string } {

    return { success: true, transactionId: `mock_${Date.now()}` };
  }

  private mockRefundPayment(amount: Prisma.Decimal): { success: boolean; refundId: string } {
    return { success: true, refundId: `refund_${Date.now()}` };
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return this.finalizeCancellation(order);
  }

  private async finalizeCancellation(order: Prisma.OrderGetPayload<{ include: { items: true } }>) {
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }
    if (order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed order');
    }

    // если заказ был уже оплачен (не NEW) — делаем мок-возврат средств
    let refund: { success: boolean; refundId: string } | null = null;
    if (order.status !== OrderStatus.NEW) {
      refund = this.mockRefundPayment(order.totalAmount);
      if (!refund.success) {
        throw new BadRequestException('Refund failed, please contact support');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      return tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
        include: { items: true },
      });
    });

    return { order: updated, refund };
  }

  private async cancelAndRestock(orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) return;

      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
    });
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

    if (userRole !== Role.ADMIN && order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  async findAll(query: QueryOrderDto) {
    const { status, page, limit } = query;

    const where: Prisma.OrderWhereInput = {
      ...(status && { status }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: { items: true, user: { select: { id: true, email: true, nickName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
    };
  }

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // 1. Нельзя перевести обратно в NEW
    if (dto.status === OrderStatus.NEW) {
      throw new BadRequestException('Cannot manually set status back to NEW');
    }

    // 2. Если статус не меняется — возвращаем как есть
    if (order.status === dto.status) {
      return order;
    }

    // 3. Завершенный или отмененный заказ менять нельзя
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.COMPLETED
    ) {
      throw new BadRequestException(
        `Cannot change status of an already ${order.status.toLowerCase()} order`,
      );
    }

    // 4. Если заказ NEW (неоплачен) — его можно только CANCELLED
    if (order.status === OrderStatus.NEW && dto.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Unpaid order (NEW) can only be set to CANCELLED',
      );
    }

    // 5. Обработка отмены
    if (dto.status === OrderStatus.CANCELLED) {
      const isPaid = order.status !== OrderStatus.NEW;

      if (isPaid) {
        this.mockRefundPayment(order.totalAmount);
      }

      return this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }

        return tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED },
          include: { items: true },
        });
      });
    }

    // 6. Смена на остальные статусы (PROCESSING, SHIPPED, COMPLETED и т.д.)
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: dto.status },
      include: { items: true },
    });
  }
}