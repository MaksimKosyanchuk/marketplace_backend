import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
    let service: CategoriesService;
    let prisma: jest.Mocked<PrismaService>;
    let redis: jest.Mocked<RedisService>;

    const mockCategory = {
        id: 'cat-1',
        name: 'Electronics',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockPrismaService = {
        category: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        product: {
            count: jest.fn(),
        },
    };

    const mockRedisService = {
        delByPattern: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CategoriesService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: RedisService,
                    useValue: mockRedisService,
                },
            ],
        }).compile();

        service = module.get<CategoriesService>(CategoriesService);
        prisma = module.get(PrismaService);
        redis = module.get(RedisService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create a new category', async () => {
            const dto = { name: 'Electronics' };
            prisma.category.findUnique.mockResolvedValue(null);
            prisma.category.create.mockResolvedValue(mockCategory as any);

            const result = await service.create(dto);

            expect(prisma.category.findUnique).toHaveBeenCalledWith({
                where: { name: dto.name },
            });
            expect(prisma.category.create).toHaveBeenCalledWith({ data: dto });
            expect(result).toEqual(mockCategory);
        });

        it('should throw ConflictException if category name already exists', async () => {
            const dto = { name: 'Electronics' };
            prisma.category.findUnique.mockResolvedValue(mockCategory as any);

            await expect(service.create(dto)).rejects.toThrow(
                ConflictException,
            );
            expect(prisma.category.create).not.toHaveBeenCalled();
        });
    });

    describe('findAll', () => {
        it('should return an array of categories ordered by name asc', async () => {
            const categories = [mockCategory];
            prisma.category.findMany.mockResolvedValue(categories as any);

            const result = await service.findAll();

            expect(prisma.category.findMany).toHaveBeenCalledWith({
                orderBy: { name: 'asc' },
            });
            expect(result).toEqual(categories);
        });
    });

    describe('findOne', () => {
        it('should return category if exists', async () => {
            prisma.category.findUnique.mockResolvedValue(mockCategory as any);

            const result = await service.findOne('cat-1');

            expect(prisma.category.findUnique).toHaveBeenCalledWith({
                where: { id: 'cat-1' },
            });
            expect(result).toEqual(mockCategory);
        });

        it('should throw NotFoundException if category does not exist', async () => {
            prisma.category.findUnique.mockResolvedValue(null);

            await expect(service.findOne('invalid-id')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('update', () => {
        it('should update category and clear redis cache pattern', async () => {
            const dto = { name: 'Tech Gadgets' };
            const updatedCategory = { ...mockCategory, name: dto.name };

            prisma.category.findUnique.mockResolvedValue(mockCategory as any);
            prisma.category.update.mockResolvedValue(updatedCategory as any);

            const result = await service.update('cat-1', dto);

            expect(prisma.category.update).toHaveBeenCalledWith({
                where: { id: 'cat-1' },
                data: dto,
            });
            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
            expect(result).toEqual(updatedCategory);
        });

        it('should throw NotFoundException if category to update does not exist', async () => {
            prisma.category.findUnique.mockResolvedValue(null);

            await expect(
                service.update('invalid-id', { name: 'New Name' }),
            ).rejects.toThrow(NotFoundException);
            expect(prisma.category.update).not.toHaveBeenCalled();
            expect(redis.delByPattern).not.toHaveBeenCalled();
        });
    });

    describe('remove', () => {
        it('should remove category if it has no active products', async () => {
            prisma.category.findUnique.mockResolvedValue(mockCategory as any);
            prisma.product.count.mockResolvedValue(0);
            prisma.category.delete.mockResolvedValue(mockCategory as any);

            const result = await service.remove('cat-1');

            expect(prisma.product.count).toHaveBeenCalledWith({
                where: { categoryId: 'cat-1', isArchived: false },
            });
            expect(prisma.category.delete).toHaveBeenCalledWith({
                where: { id: 'cat-1' },
            });
            expect(result).toEqual(mockCategory);
        });

        it('should throw ConflictException if category has existing products', async () => {
            prisma.category.findUnique.mockResolvedValue(mockCategory as any);
            prisma.product.count.mockResolvedValue(3);

            await expect(service.remove('cat-1')).rejects.toThrow(
                ConflictException,
            );
            expect(prisma.category.delete).not.toHaveBeenCalled();
        });

        it('should throw NotFoundException if category to remove does not exist', async () => {
            prisma.category.findUnique.mockResolvedValue(null);

            await expect(service.remove('invalid-id')).rejects.toThrow(
                NotFoundException,
            );
            expect(prisma.category.delete).not.toHaveBeenCalled();
        });
    });
});