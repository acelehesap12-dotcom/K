import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';
import { binanceAPI } from './binance-api.js';
import { polygonAPI } from './polygon-api.js';

interface WebSocketClient {
  ws: WebSocket;
  subscriptions: Set<string>;
  userId?: string;
}

class WebSocketServer {
  private clients: Map<WebSocket, WebSocketClient> = new Map();
  private marketDataStreams: Map<string, any> = new Map();

  async initialize(fastify: FastifyInstance) {
    fastify.get('/ws/market/:symbol', { websocket: true }, (connection, req) => {
      const { socket } = connection;
      const symbol = (req.params as any).symbol;

      logger.info(`WebSocket client connected for ${symbol}`);

      const client: WebSocketClient = {
        ws: socket,
        subscriptions: new Set([symbol]),
      };

      this.clients.set(socket, client);
      this.subscribeToMarket(symbol);

      socket.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(client, data);
        } catch (error) {
          logger.error('WebSocket message parse error:', error);
        }
      });

      socket.on('close', () => {
        logger.info(`WebSocket client disconnected from ${symbol}`);
        this.clients.delete(socket);
        this.checkUnsubscribe(symbol);
      });

      // Send initial data
      this.sendInitialData(client, symbol);
    });

    logger.info('WebSocket server initialized');
  }

  private async sendInitialData(client: WebSocketClient, symbol: string) {
    try {
      // Send current price
      const isCrypto = symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL');
      
      let price, change24h;
      if (isCrypto) {
        const ticker = await binanceAPI.get24hTicker(symbol.replace('-', ''));
        price = parseFloat(ticker.lastPrice);
        change24h = parseFloat(ticker.priceChangePercent);
      } else {
        const quote = await polygonAPI.getQuote(symbol);
        price = quote.price;
        change24h = quote.change_percent || 0;
      }

      this.send(client.ws, {
        type: 'ticker',
        symbol,
        price,
        change24h,
        timestamp: new Date().toISOString(),
      });

      // Send orderbook
      if (isCrypto) {
        const orderbook = await binanceAPI.getOrderBook(symbol.replace('-', ''), 20);
        this.send(client.ws, {
          type: 'orderbook',
          symbol,
          bids: orderbook.bids.map((b: any) => ({
            price: parseFloat(b[0]),
            amount: parseFloat(b[1]),
            total: parseFloat(b[0]) * parseFloat(b[1]),
          })),
          asks: orderbook.asks.map((a: any) => ({
            price: parseFloat(a[0]),
            amount: parseFloat(a[1]),
            total: parseFloat(a[0]) * parseFloat(a[1]),
          })),
        });
      }
    } catch (error) {
      logger.error('Error sending initial data:', error);
    }
  }

  private subscribeToMarket(symbol: string) {
    if (this.marketDataStreams.has(symbol)) {
      return; // Already subscribed
    }

    const isCrypto = symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL');

    if (isCrypto) {
      // Subscribe to Binance WebSocket
      const ws = binanceAPI.streamMarketData(symbol.replace('-', ''), (data) => {
        this.broadcast(symbol, {
          type: 'ticker',
          symbol,
          price: parseFloat(data.c),
          change24h: parseFloat(data.P),
          volume24h: parseFloat(data.v),
          timestamp: new Date(data.E).toISOString(),
        });
      });

      this.marketDataStreams.set(symbol, ws);
    } else {
      // Subscribe to Polygon WebSocket
      const ws = polygonAPI.streamStockData([symbol], (data) => {
        if (data.ev === 'T') {
          // Trade event
          this.broadcast(symbol, {
            type: 'trade',
            symbol,
            price: data.p,
            amount: data.s,
            side: data.p > (data.vw || data.p) ? 'buy' : 'sell',
            timestamp: new Date(data.t).toISOString(),
          });
        }
      });

      this.marketDataStreams.set(symbol, ws);
    }

    logger.info(`Subscribed to market data for ${symbol}`);
  }

  private checkUnsubscribe(symbol: string) {
    // Check if any clients are still subscribed to this symbol
    const hasSubscribers = Array.from(this.clients.values()).some((client) =>
      client.subscriptions.has(symbol)
    );

    if (!hasSubscribers && this.marketDataStreams.has(symbol)) {
      const stream = this.marketDataStreams.get(symbol);
      if (stream && stream.close) {
        stream.close();
      }
      this.marketDataStreams.delete(symbol);
      logger.info(`Unsubscribed from market data for ${symbol}`);
    }
  }

  private handleMessage(client: WebSocketClient, message: any) {
    switch (message.type) {
      case 'subscribe':
        if (message.symbol) {
          client.subscriptions.add(message.symbol);
          this.subscribeToMarket(message.symbol);
          this.sendInitialData(client, message.symbol);
        }
        break;

      case 'unsubscribe':
        if (message.symbol) {
          client.subscriptions.delete(message.symbol);
          this.checkUnsubscribe(message.symbol);
        }
        break;

      case 'ping':
        this.send(client.ws, { type: 'pong', timestamp: Date.now() });
        break;

      default:
        logger.warn('Unknown WebSocket message type:', message.type);
    }
  }

  private broadcast(symbol: string, data: any) {
    this.clients.forEach((client) => {
      if (client.subscriptions.has(symbol) && client.ws.readyState === WebSocket.OPEN) {
        this.send(client.ws, data);
      }
    });
  }

  private send(ws: WebSocket, data: any) {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      logger.error('WebSocket send error:', error);
    }
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      activeStreams: this.marketDataStreams.size,
      subscriptions: Array.from(this.clients.values()).reduce(
        (acc, client) => acc + client.subscriptions.size,
        0
      ),
    };
  }
}

export const wsServer = new WebSocketServer();
