import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, Role } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
    let controller: OrdersController;
    let ordersService: jest.Mocked<OrdersService>;

    const mockUserReq = {
        user: {
            id: 'user-1',
            role: Role.USER,
        },
    } as any;

    const mockAdminReq = {
        user: {
            id: 'admin-1',
            role: Role.ADMIN,
        },
    } as any;

    const mockOrder = {
        id: 'order-1',
        userId: 'user-1',
        status: OrderStatus.NEW,
        totalAmount: 2000,
        items: [],
    };

    const mockOrdersService = {
        checkout: jest.fn(),
        payOrder: jest.fn(),
        cancelOrder: jest.fn(),
        findMyOrders: jest.fn(),
        findOne: jest.fn(),
        findAll: jest.fn(),
        updateStatus: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [OrdersController],
            providers: [
                {
                    provide: OrdersService,
                    useValue: mockOrdersService,
                },
            ],
        }).compile();

        controller = module.get<OrdersController>(OrdersController);
        ordersService = module.get(OrdersService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('checkout', () => {
        it('should call ordersService.checkout with user id', async () => {
            mockOrdersService.checkout.mockResolvedValue(mockOrder as any);

            const result = await controller.checkout(mockUserReq);

            expect(ordersService.checkout).toHaveBeenCalledWith('user-1');
            expect(result).toEqual(mockOrder);
        });
    });

    describe('payOrder', () => {
        it('should call ordersService.payOrder with user id and order id', async () => {
            const expectedResponse = { success: true };
            mockOrdersService.payOrder.mockResolvedValue(expectedResponse as any);

            const result = await controller.payOrder(mockUserReq, 'order-1');

            expect(ordersService.payOrder).toHaveBeenCalledWith('user-1', 'order-1');
            expect(result).toEqual(expectedResponse);
        });
    });

    describe('cancelOrder', () => {
        it('should call ordersService.cancelOrder with user id and order id', async () => {
            const expectedResponse = { order: mockOrder, refund: null };
            mockOrdersService.cancelOrder.mockResolvedValue(expectedResponse as any);

            const result = await controller.cancelOrder(mockUserReq, 'order-1');

            expect(ordersService.cancelOrder).toHaveBeenCalledWith('user-1', 'order-1');
            expect(result).toEqual(expectedResponse);
        });
    });

    describe('findMyOrders', () => {
        it('should return list of user orders', async () => {
            mockOrdersService.findMyOrders.mockResolvedValue([mockOrder] as any);

            const result = await controller.findMyOrders(mockUserReq);

            expect(ordersService.findMyOrders).toHaveBeenCalledWith('user-1');
            expect(result).toEqual([mockOrder]);
        });
    });

    describe('findOne', () => {
        it('should call ordersService.findOne with user id, role and order id', async () => {
            mockOrdersService.findOne.mockResolvedValue(mockOrder as any);

            const result = await controller.findOne(mockUserReq, 'order-1');

            expect(ordersService.findOne).toHaveBeenCalledWith(
                'user-1',
                Role.USER,
                'order-1',
            );
            expect(result).toEqual(mockOrder);
        });
    });

    describe('findAll', () => {
        it('should return paginated orders list for admin query', async () => {
            const queryDto = { page: 1, limit: 10 };
            const paginatedResult = {
                items: [mockOrder],
                meta: { total: 1, page: 1, limit: 10, pageCount: 1 },
            };
            mockOrdersService.findAll.mockResolvedValue(paginatedResult as any);

            const result = await controller.findAll(queryDto as any);

            expect(ordersService.findAll).toHaveBeenCalledWith(queryDto);
            expect(result).toEqual(paginatedResult);
        });
    });

    describe('updateStatus', () => {
        it('should update order status', async () => {
            const dto = { status: OrderStatus.DELIVERED };
            const updatedOrder = { ...mockOrder, status: OrderStatus.DELIVERED };
            mockOrdersService.updateStatus.mockResolvedValue(updatedOrder as any);

            const result = await controller.updateStatus('order-1', dto);

            expect(ordersService.updateStatus).toHaveBeenCalledWith('order-1', dto);
            expect(result).toEqual(updatedOrder);
        });
    });
});