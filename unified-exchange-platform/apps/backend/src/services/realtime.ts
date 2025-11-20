import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import WebSocket from '@fastify/websocket';
import { logger } from './utils/logger.js';

interface OrderUpdate {
  type: 'ORDER_CREATED' | 'ORDER_FILLED' | 'ORDER_CANCELLED' | 'TRADE_EXECUTED';
  data: any;
  timestamp: number;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: number;
}

export class RealtimeService {
  private fastify: FastifyInstance;
  private connections: Map<string, WebSocket> = new Map();

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  async initialize() {
    await this.fastify.register(WebSocket);

    // WebSocket endpoint for real-time updates
    this.fastify.get('/ws/:userId', { websocket: true }, async (socket, request) => {
      const userId = request.params.userId;
      const token = request.query.token as string;

      // Verify JWT token
      try {
        await request.jwtVerify();
      } catch (err) {
        logger.error(`WebSocket auth failed for user ${userId}:`, err);
        socket.close(1008, 'Unauthorized');
        return;
      }

      this.connections.set(userId, socket);
      logger.info(`WebSocket connected: ${userId}`);

      // Send initial connection message
      socket.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'Connected to real-time service',
        timestamp: Date.now(),
      }));

      socket.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(userId, data, socket);
        } catch (err) {
          logger.error('Invalid message format:', err);
        }
      });

      socket.on('close', () => {
        this.connections.delete(userId);
        logger.info(`WebSocket disconnected: ${userId}`);
      });

      socket.on('error', (error) => {
        logger.error(`WebSocket error for ${userId}:`, error);
        this.connections.delete(userId);
      });
    });

    logger.info('Real-time service initialized');
  }

  private handleClientMessage(userId: string, data: any, socket: WebSocket) {
    switch (data.type) {
      case 'SUBSCRIBE_TICKER':
        logger.debug(`User ${userId} subscribed to ticker ${data.symbol}`);
        socket.send(JSON.stringify({
          type: 'SUBSCRIBED',
          symbol: data.symbol,
          timestamp: Date.now(),
        }));
        break;

      case 'UNSUBSCRIBE_TICKER':
        logger.debug(`User ${userId} unsubscribed from ticker ${data.symbol}`);
        break;

      case 'PING':
        socket.send(JSON.stringify({
          type: 'PONG',
          timestamp: Date.now(),
        }));
        break;

      default:
        logger.warn(`Unknown message type: ${data.type}`);
    }
  }

  /**
   * Broadcast order update to user's WebSocket
   */
  public broadcastOrderUpdate(userId: string, update: OrderUpdate) {
    const socket = this.connections.get(userId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify(update));
    }
  }

  /**
   * Broadcast price update to all connected users
   */
  public broadcastPriceUpdate(update: PriceUpdate) {
    this.connections.forEach((socket) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(update));
      }
    });
  }

  /**
   * Broadcast trade execution to relevant users
   */
  public broadcastTradeExecution(buyerId: string, sellerId: string, tradeData: any) {
    const tradeUpdate: OrderUpdate = {
      type: 'TRADE_EXECUTED',
      data: tradeData,
      timestamp: Date.now(),
    };

    const buyerSocket = this.connections.get(buyerId);
    const sellerSocket = this.connections.get(sellerId);

    if (buyerSocket && buyerSocket.readyState === 1) {
      buyerSocket.send(JSON.stringify(tradeUpdate));
    }

    if (sellerSocket && sellerSocket.readyState === 1) {
      sellerSocket.send(JSON.stringify(tradeUpdate));
    }
  }

  /**
   * Broadcast liquidation warning
   */
  public broadcastLiquidationWarning(userId: string, warning: any) {
    const socket = this.connections.get(userId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'LIQUIDATION_WARNING',
        severity: warning.severity,
        message: warning.message,
        timestamp: Date.now(),
      }));
    }
  }

  /**
   * Get connection statistics
   */
  public getStats() {
    return {
      activeConnections: this.connections.size,
      connectedUsers: Array.from(this.connections.keys()),
    };
  }
}
