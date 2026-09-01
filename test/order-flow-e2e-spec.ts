import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Order Creation Flow (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let userToken: string;
    let testUserId: string;
    let testCategoryId: string;
    let testProductId: string;

    const INITIAL_STOCK = 10;
    const BUY_QUANTITY = 3;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        await prisma.orderItem.deleteMany();
        await prisma.order.deleteMany();
        await prisma.cartItem.deleteMany();
        await prisma.product.deleteMany();
        await prisma.category.deleteMany();
        await prisma.user.deleteMany();

        const authRes = await request(app.getHttpServer())
            .post('/auth/register')
            .send({
                email: 'customer@example.com',
                password: 'Password123!',
                nickName: 'Test Customer',
            })
            .expect(201);

        userToken = authRes.body.accessToken || authRes.body.token;
        testUserId = authRes.body.user?.id || authRes.body.id;

        const category = await prisma.category.create({
            data: { name: 'E2E Category' },
        });
        testCategoryId = category.id;

        const product = await prisma.product.create({
            data: {
                name: 'E2E Test Smartphone',
                description: 'Test Description',
                price: 500,
                stock: INITIAL_STOCK,
                categoryId: testCategoryId,
            },
        });
        testProductId = product.id;
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany();
        await prisma.order.deleteMany();
        await prisma.cartItem.deleteMany();
        await prisma.product.deleteMany();
        await prisma.category.deleteMany();
        await prisma.user.deleteMany();
        await app.close();
    });

    it('Критичний флоу: додавання в кошик -> оформлення замовлення -> списування stock', async () => {
        await request(app.getHttpServer())
            .post('/cart/items')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                productId: testProductId,
                quantity: BUY_QUANTITY,
            })
            .expect(201);

        const cartRes = await request(app.getHttpServer())
            .get('/cart')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);

        expect(cartRes.body.items).toHaveLength(1);
        expect(cartRes.body.items[0].productId).toBe(testProductId);
        expect(cartRes.body.items[0].quantity).toBe(BUY_QUANTITY);

        const orderRes = await request(app.getHttpServer())
            .post('/orders/checkout')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                shippingAddress: 'Main St 123, Kyiv',
            })
            .expect(201);

        expect(orderRes.body.id).toBeDefined();
        expect(orderRes.body.items).toHaveLength(1);

        const cartAfterOrder = await request(app.getHttpServer())
            .get('/cart')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);

        expect(cartAfterOrder.body.items || []).toHaveLength(0);
        
        const updatedProduct = await prisma.product.findUnique({
            where: { id: testProductId },
        });

        const expectedStock = INITIAL_STOCK - BUY_QUANTITY;
        expect(updatedProduct?.stock).toBe(expectedStock);
    });
});