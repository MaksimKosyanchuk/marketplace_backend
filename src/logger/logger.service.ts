import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoggerService {
    constructor(private readonly prisma: PrismaService) {}

    async log(context: string, message: string, meta?: any) {
        await this.saveToDb('INFO', context, message, meta);
    }

    async warn(context: string, message: string, meta?: any) {
        await this.saveToDb('WARN', context, message, meta);
    }

    async error(context: string, message: string, meta?: any) {
        await this.saveToDb('ERROR', context, message, meta);
    }

    private async saveToDb(level: string, context: string, message: string, meta?: any) {
        try {
            await this.prisma.log.create({
                data: {
                    level,
                    context,
                    message,
                    meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
                },
            });
        } catch (error) {
            // Щоб падіння бази логів не рушило основний бізнес-процес
            console.error('Failed to write log to DB:', error);
        }
    }
}