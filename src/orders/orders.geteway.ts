import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(OrdersGateway.name);

    constructor(private readonly jwtService: JwtService) {}

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth?.token;
            if (!token) {
                client.disconnect();
                return;
            }

            // Верифікація токена
            const payload = await this.jwtService.verifyAsync(token);
            const userId = payload.sub || payload.id;

            // Приєднуємо сокет до персональної кімнати користувача
            await client.join(`user_${userId}`);
            this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
        } catch (err) {
            this.logger.error(`Socket connection error: ${err.message}`);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    // Метод, який викликає воркер оплати або сервіс замовлень
    emitOrderStatusUpdate(userId: string, orderId: string, status: string) {
        this.server.to(`user_${userId}`).emit('order_status_updated', {
            orderId,
            status,
        });
    }
}
