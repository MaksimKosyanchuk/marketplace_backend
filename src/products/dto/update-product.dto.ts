import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';
import { IsOptional, IsUrl, ValidateIf } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  // Валидируем как URL только если значение передано и не является null / пустой строкой
  @IsOptional()
  @ValidateIf((o) => o.imageUrl !== null && o.imageUrl !== '')
  @IsUrl({}, { message: 'imageUrl must be a valid URL or null' })
  imageUrl?: string | null;
}