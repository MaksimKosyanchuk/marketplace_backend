// src/products/config/multer.config.ts
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';

export const productMulterOptions = {
    storage: diskStorage({
        destination: './uploads/products',
        filename: (req, file, cb) => {
            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
            cb(null, uniqueName);
        },
    }),
    fileFilter: (req: any, file: any, cb: any) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
            return cb(
                new BadRequestException(
                    'Only image files (jpg, jpeg, png, webp) are allowed',
                ),
                false,
            );
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
};
