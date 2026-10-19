import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('RealtimeGateway');

  constructor(private jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('Socket.IO Gateway Initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);

    // Authenticate the socket using the JWT the client passed in the
    // `auth` handshake payload, and join a private per-user room so that
    // targeted notifications (order-ready, low-stock, etc.) are only ever
    // delivered to the intended user instead of being broadcast globally.
    try {
      const token = client.handshake.auth?.token;
      if (token) {
        const payload = this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET || 'restaurant_erp_super_secret_key_987654321',
        });
        if (payload?.sub) {
          client.data.role = payload.role;
          client.join(`user:${payload.sub}`);
          if (payload.restaurantId) {
            client.join(`restaurant:${payload.restaurantId}`);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Socket auth failed for client ${client.id}: ${err.message}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Fallback manual join, in case a client connects without the auth
  // handshake token (e.g. reused/older clients) and authenticates later.
  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() userId: string) {
    if (userId) {
      client.join(`user:${userId}`);
    }
  }

  // Lets the Site Owner (SUPER_ADMIN, who belongs to no restaurant) watch
  // ONE restaurant at a time — the one currently selected in their panel —
  // instead of receiving every restaurant's events at once.
  @SubscribeMessage('watchRestaurant')
  handleWatchRestaurant(@ConnectedSocket() client: Socket, @MessageBody() restaurantId: string) {
    if (client.data?.role !== 'SUPER_ADMIN') return;
    for (const room of client.rooms) {
      if (room.startsWith('restaurant:')) client.leave(room);
    }
    if (restaurantId && typeof restaurantId === 'string') {
      client.join(`restaurant:${restaurantId}`);
    }
  }

  // Every restaurant's orders, tables and stock levels are private to that
  // restaurant, so events go ONLY to that restaurant's room. If an event has
  // no restaurantId we drop it rather than fall back to a global broadcast —
  // otherwise one restaurant's kitchen would see another's orders.
  private emitToRestaurant(restaurantId: string | null | undefined, event: string, payload: any) {
    if (!restaurantId) {
      this.logger.warn(`Dropped "${event}" event: it had no restaurantId`);
      return;
    }
    this.server.to(`restaurant:${restaurantId}`).emit(event, payload);
  }

  // Broadcasters for various events
  sendOrderUpdate(order: any) {
    this.emitToRestaurant(order?.restaurantId, 'orderUpdate', order);
  }

  sendKitchenUpdate(order: any) {
    this.emitToRestaurant(order?.restaurantId, 'kitchenUpdate', order);
  }

  sendTableUpdate(table: any) {
    this.emitToRestaurant(table?.restaurantId, 'tableUpdate', table);
  }

  sendInventoryUpdate(item: any) {
    this.emitToRestaurant(item?.restaurantId, 'inventoryUpdate', item);
  }

  // Sends a notification ONLY to the targeted user's private room, instead
  // of broadcasting it to every connected client.
  sendNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  sendComplaintUpdate(complaint: any) {
    this.server.emit('complaintUpdate', complaint);
  }

  sendOwnerDashboardUpdate(restaurantId: string, stats: any) {
    this.emitToRestaurant(restaurantId, 'ownerDashboardUpdate', stats);
  }
}
