import { IsString, IsNumber, IsPositive, IsInt, Min, MaxLength, IsUUID, IsOptional, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

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

  // Позволяет передавать URL или null (при удалении/отсутствии ссылки)
  @IsOptional()
  @IsUrl({}, { message: 'imageUrl must be a valid URL' })
  imageUrl?: string | null;

  // Фиктивное поле для Multer (чтобы ValidationPipe с whitelist не забраковывал запрос при FormData)
  @IsOptional()
  image?: any;
}