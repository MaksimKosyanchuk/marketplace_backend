// products.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSort, QueryProductDto } from './dto/query-product.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  private readonly CACHE_PREFIX = 'products:list:';
  private readonly CACHE_TTL = 60; // сек

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findAll(query: QueryProductDto) {
    const cacheKey = this.CACHE_PREFIX + JSON.stringify(query);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { search, categoryId, minPrice, maxPrice, sort, page, limit } = query;

    const where: Prisma.ProductWhereInput = {
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
      ...(categoryId && { categoryId }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        price: {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
      }),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === ProductSort.PRICE_ASC ? { price: 'asc' } :
      sort === ProductSort.PRICE_DESC ? { price: 'desc' } :
      { createdAt: 'desc' }; // newest по умолчанию

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { category: true },
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = {
      items,
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    return result;
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto) {
    await this.ensureCategoryExists(dto.categoryId);

    const product = await this.prisma.product.create({ data: dto });
    await this.invalidateCache();
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    if (dto.categoryId) {
      await this.ensureCategoryExists(dto.categoryId);
    }

    const product = await this.prisma.product.update({ where: { id }, data: dto });
    await this.invalidateCache();
    return product;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    await this.invalidateCache();
    return { success: true };
  }

  private async ensureCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new BadRequestException('Category not found');
  }

  private async invalidateCache() {
    const keys = await this.redis.keys(this.CACHE_PREFIX + '*');
    await this.redis.del(...keys);
  }
}