// create-product.dto.ts
import { IsString, IsNumber, IsPositive, IsInt, Min, MaxLength, IsUUID, IsOptional, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  description: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string; // если картинка передаётся ссылкой, а не файлом
}