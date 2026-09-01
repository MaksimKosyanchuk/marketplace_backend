import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from './cart.service';

describe('CartService', () => {
    let service: CartService;
    let prisma: jest.Mocked<PrismaService>;

    const mockCart = { id: 'cart-1', userId: 'user-1' };

    const mockProduct = {
        id: 'product-1',
        name: 'Test Laptop',
        price: 1000,
        stock: 5,
    };

    const mockCartItem = {
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'product-1',
        quantity: 2,
        product: mockProduct,
        cart: mockCart,
    };

    const mockPrismaService = {
        cart: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        cartItem: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            deleteMany: jest.fn(),
        },
        product: {
            findUnique: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CartService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<CartService>(CartService);
        prisma = module.get(PrismaService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getCart', () => {
        it('should return existing cart items and total sum', async () => {
            prisma.cart.findUnique.mockResolvedValue(mockCart as any);
            prisma.cartItem.findMany.mockResolvedValue([mockCartItem] as any);

            const result = await service.getCart('user-1');

            expect(prisma.cart.findUnique).toHaveBeenCalledWith({
                where: { userId: 'user-1' },
            });
            expect(result).toEqual({
                cartId: 'cart-1',
                items: [mockCartItem],
                total: 2000, // 1000 * 2
            });
        });

        it('should create new cart if it does not exist', async () => {
            prisma.cart.findUnique.mockResolvedValue(null);
            prisma.cart.create.mockResolvedValue(mockCart as any);
            prisma.cartItem.findMany.mockResolvedValue([]);

            const result = await service.getCart('user-1');

            expect(prisma.cart.create).toHaveBeenCalledWith({
                data: { userId: 'user-1' },
            });
            expect(result).toEqual({
                cartId: 'cart-1',
                items: [],
                total: 0,
            });
        });
    });

    describe('addItem', () => {
        it('should throw NotFoundException if product is not found', async () => {
            prisma.product.findUnique.mockResolvedValue(null);

            await expect(
                service.addItem('user-1', { productId: 'invalid', quantity: 1 }),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if requested quantity exceeds stock', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct as any);
            prisma.cart.findUnique.mockResolvedValue(mockCart as any);
            prisma.cartItem.findUnique.mockResolvedValue(null);

            await expect(
                service.addItem('user-1', { productId: 'product-1', quantity: 10 }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should create new item in cart if not exists', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct as any);
            prisma.cart.findUnique.mockResolvedValue(mockCart as any);
            prisma.cartItem.findUnique.mockResolvedValue(null);
            prisma.cartItem.create.mockResolvedValue(mockCartItem as any);

            const result = await service.addItem('user-1', {
                productId: 'product-1',
                quantity: 2,
            });

            expect(prisma.cartItem.create).toHaveBeenCalledWith({
                data: {
                    cartId: 'cart-1',
                    productId: 'product-1',
                    quantity: 2,
                },
                include: { product: true },
            });
            expect(result).toEqual(mockCartItem);
        });

        it('should update quantity if item already in cart', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct as any);
            prisma.cart.findUnique.mockResolvedValue(mockCart as any);
            prisma.cartItem.findUnique.mockResolvedValue(mockCartItem as any);
            prisma.cartItem.update.mockResolvedValue({
                ...mockCartItem,
                quantity: 4,
            } as any);

            const result = await service.addItem('user-1', {
                productId: 'product-1',
                quantity: 2,
            });

            expect(prisma.cartItem.update).toHaveBeenCalledWith({
                where: { id: 'item-1' },
                data: { quantity: 4 }, // 2 existing + 2 new
                include: { product: true },
            });
            expect(result.quantity).toBe(4);
        });
    });

    describe('updateItem', () => {
        it('should throw NotFoundException if item does not belong to user', async () => {
            prisma.cartItem.findUnique.mockResolvedValue({
                ...mockCartItem,
                cart: { userId: 'other-user' },
            } as any);

            await expect(
                service.updateItem('user-1', 'item-1', { quantity: 3 }),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if new quantity exceeds stock', async () => {
            prisma.cartItem.findUnique.mockResolvedValue(mockCartItem as any);

            await expect(
                service.updateItem('user-1', 'item-1', { quantity: 10 }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should update item quantity successfully', async () => {
            prisma.cartItem.findUnique.mockResolvedValue(mockCartItem as any);
            prisma.cartItem.update.mockResolvedValue({
                ...mockCartItem,
                quantity: 4,
            } as any);

            const result = await service.updateItem('user-1', 'item-1', { quantity: 4 });

            expect(prisma.cartItem.update).toHaveBeenCalledWith({
                where: { id: 'item-1' },
                data: { quantity: 4 },
                include: { product: true },
            });
            expect(result.quantity).toBe(4);
        });
    });

    describe('removeItem', () => {
        it('should remove item from cart', async () => {
            prisma.cartItem.findUnique.mockResolvedValue(mockCartItem as any);
            prisma.cartItem.delete.mockResolvedValue(mockCartItem as any);

            const result = await service.removeItem('user-1', 'item-1');

            expect(prisma.cartItem.delete).toHaveBeenCalledWith({
                where: { id: 'item-1' },
            });
            expect(result).toEqual({ success: true });
        });
    });

    describe('clearCart', () => {
        it('should delete all items from user cart', async () => {
            prisma.cart.findUnique.mockResolvedValue(mockCart as any);
            prisma.cartItem.deleteMany.mockResolvedValue({ count: 2 } as any);

            const result = await service.clearCart('user-1');

            expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
                where: { cartId: 'cart-1' },
            });
            expect(result).toEqual({ success: true });
        });
    });
});