import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { LoggerService } from '../logger/logger.service';

describe('OrdersService', () => {
    let service: OrdersService;
    let prisma: jest.Mocked<PrismaService>;
    let ordersQueue: any;

    const mockUser = { id: 'user-1', role: Role.USER };
    const mockAdmin = { id: 'admin-1', role: Role.ADMIN };

    const mockCart = { id: 'cart-1', userId: 'user-1' };
    const mockProduct = {
        id: 'product-1',
        name: 'Laptop',
        price: new Prisma.Decimal(1000),
        stock: 10,
    };

    const mockCartItem = {
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'product-1',
        quantity: 2,
        product: mockProduct,
    };

    const mockOrder = {
        id: 'order-1',
        userId: 'user-1',
        status: OrderStatus.NEW,
        totalAmount: new Prisma.Decimal(2000),
        items: [
            {
                id: 'order-item-1',
                orderId: 'order-1',
                productId: 'product-1',
                productName: 'Laptop',
                quantity: 2,
                price: new Prisma.Decimal(1000),
            },
        ],
    };

    const mockPrismaService = {
        cart: {
            findUnique: jest.fn(),
        },
        cartItem: {
            findMany: jest.fn(),
            deleteMany: jest.fn(),
        },
        order: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        product: {
            updateMany: jest.fn(),
            update: jest.fn(),
        },
        $transaction: jest.fn(),
    };

    const mockOrdersQueue = {
        add: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrdersService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: LoggerService,
                    useValue: {
                        log: jest.fn(),
                        error: jest.fn(),
                        warn: jest.fn(),
                        debug: jest.fn(),
                        verbose: jest.fn(),
                    },
                },
                {
                    provide: getQueueToken('orders'),
                    useValue: mockOrdersQueue,
                },
            ],
        }).compile();

        service = module.get<OrdersService>(OrdersService);
        prisma = module.get(PrismaService);
        ordersQueue = module.get(getQueueToken('orders'));

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('checkout', () => {
        it('should throw BadRequestException if cart is not found', async () => {
            prisma.cart.findUnique.mockResolvedValue(null);

            await expect(service.checkout('user-1')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('should throw BadRequestException if cart has no items', async () => {
            prisma.cart.findUnique.mockResolvedValue(mockCart as any);
            prisma.cartItem.findMany.mockResolvedValue([]);

            await expect(service.checkout('user-1')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('should process checkout successfully', async () => {
            prisma.cart.findUnique.mockResolvedValue(mockCart as any);
            prisma.cartItem.findMany.mockResolvedValue([mockCartItem] as any);

            prisma.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    product: {
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                    },
                    order: {
                        create: jest.fn().mockResolvedValue(mockOrder),
                    },
                    cartItem: {
                        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
                    },
                };
                return cb(tx);
            });

            const result = await service.checkout('user-1');

            expect(result).toEqual(mockOrder);
        });

        it('should throw BadRequestException if product stock is insufficient', async () => {
            prisma.cart.findUnique.mockResolvedValue(mockCart as any);
            prisma.cartItem.findMany.mockResolvedValue([mockCartItem] as any);

            prisma.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    product: {
                        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                    },
                };
                return cb(tx);
            });

            await expect(service.checkout('user-1')).rejects.toThrow(
                BadRequestException,
            );
        });
    });

    describe('payOrder', () => {
        it('should throw NotFoundException if order does not exist', async () => {
            prisma.order.findUnique.mockResolvedValue(null);

            await expect(
                service.payOrder('user-1', 'invalid-id'),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw ForbiddenException if order belongs to another user', async () => {
            prisma.order.findUnique.mockResolvedValue(mockOrder as any);

            await expect(
                service.payOrder('other-user', 'order-1'),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should throw BadRequestException if order status is not NEW', async () => {
            prisma.order.findUnique.mockResolvedValue({
                ...mockOrder,
                status: OrderStatus.PROCESSING,
            } as any);

            await expect(
                service.payOrder('user-1', 'order-1'),
            ).rejects.toThrow(BadRequestException);
        });

        it('should process payment and add job to queue', async () => {
            prisma.order.findUnique.mockResolvedValue(mockOrder as any);
            prisma.order.update.mockResolvedValue({
                ...mockOrder,
                status: OrderStatus.PROCESSING,
            } as any);

            const result = await service.payOrder('user-1', 'order-1');

            expect(prisma.order.update).toHaveBeenCalledTimes(2);
            expect(ordersQueue.add).toHaveBeenCalledWith('process-order', {
                orderId: 'order-1',
            });
            expect(result.success).toBe(true);
        });
    });

    describe('cancelOrder', () => {
        it('should throw ForbiddenException if user tries to cancel another users order', async () => {
            prisma.order.findUnique.mockResolvedValue(mockOrder as any);

            await expect(
                service.cancelOrder('other-user', 'order-1'),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should throw BadRequestException if order is in PAYMENT_PENDING status', async () => {
            prisma.order.findUnique.mockResolvedValue({
                ...mockOrder,
                status: OrderStatus.PAYMENT_PENDING,
            } as any);

            await expect(
                service.cancelOrder('user-1', 'order-1'),
            ).rejects.toThrow(BadRequestException);
        });

        it('should cancel NEW order and restock products', async () => {
            prisma.order.findUnique.mockResolvedValue(mockOrder as any);

            prisma.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    product: { update: jest.fn().mockResolvedValue({}) },
                    order: {
                        update: jest.fn().mockResolvedValue({
                            ...mockOrder,
                            status: OrderStatus.CANCELLED,
                        }),
                    },
                };
                return cb(tx);
            });

            const result = await service.cancelOrder('user-1', 'order-1');

            expect(result.order.status).toBe(OrderStatus.CANCELLED);
            expect(result.refund).toBeNull();
        });
    });

    describe('findOne', () => {
        it('should return order for owner', async () => {
            prisma.order.findUnique.mockResolvedValue(mockOrder as any);

            const result = await service.findOne(
                mockUser.id,
                mockUser.role,
                'order-1',
            );

            expect(result).toEqual(mockOrder);
        });

        it('should return order for admin', async () => {
            prisma.order.findUnique.mockResolvedValue(mockOrder as any);

            const result = await service.findOne(
                mockAdmin.id,
                mockAdmin.role,
                'order-1',
            );

            expect(result).toEqual(mockOrder);
        });

        it('should throw ForbiddenException for non-owner non-admin user', async () => {
            prisma.order.findUnique.mockResolvedValue(mockOrder as any);

            await expect(
                service.findOne('other-user', Role.USER, 'order-1'),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('findAll', () => {
        it('should return paginated list of orders', async () => {
            prisma.$transaction.mockResolvedValue([
                [mockOrder],
                1,
            ] as any);

            const result = await service.findAll({ page: 1, limit: 10 });

            expect(result).toEqual({
                items: [mockOrder],
                meta: {
                    total: 1,
                    page: 1,
                    limit: 10,
                    pageCount: 1,
                },
            });
        });
    });

    describe('updateStatus', () => {
        it('should throw BadRequestException when trying to set status to NEW manually', async () => {
            prisma.order.findUnique.mockResolvedValue(mockOrder as any);

            await expect(
                service.updateStatus('order-1', { status: OrderStatus.NEW }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should update status to DELIVERED for PROCESSING order', async () => {
            const processingOrder = {
                ...mockOrder,
                status: OrderStatus.PROCESSING,
            };
            prisma.order.findUnique.mockResolvedValue(processingOrder as any);
            prisma.order.update.mockResolvedValue({
                ...processingOrder,
                status: OrderStatus.DELIVERED,
            } as any);

            const result = await service.updateStatus('order-1', {
                status: OrderStatus.DELIVERED,
            });

            expect(result.status).toBe(OrderStatus.DELIVERED);
        });
    });
});