import axios from 'axios';
import crypto from 'crypto';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';
import { publishEvent } from './kafka.js';

/**
 * Binance API Integration - REAL API (No Mocks)
 * Docs: https://binance-docs.github.io/apidocs/spot/en/
 */

const BINANCE_API_BASE = 'https://api.binance.com';
const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

interface BinanceTicker {
  symbol: string;
  price: string;
  volume: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
}

interface BinanceOrderBook {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  numberOfTrades: number;
}

class BinanceAPI {
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.apiSecret = process.env.BINANCE_API_SECRET || '';

    if (!this.apiKey || !this.apiSecret) {
      logger.warn('Binance API credentials not configured - read-only mode');
    }
  }

  /**
   * Generate signature for authenticated requests
   */
  private sign(params: Record<string, any>): string {
    const queryString = new URLSearchParams(params).toString();
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Make authenticated API request
   */
  private async request(endpoint: string, params: Record<string, any> = {}, method: 'GET' | 'POST' = 'GET') {
    try {
      const timestamp = Date.now();
      const requestParams = { ...params, timestamp };
      const signature = this.sign(requestParams);

      const url = `${BINANCE_API_BASE}${endpoint}`;
      const config = {
        headers: { 'X-MBX-APIKEY': this.apiKey },
        params: { ...requestParams, signature },
      };

      const response = method === 'GET'
        ? await axios.get(url, config)
        : await axios.post(url, null, config);

      return response.data;
    } catch (error: any) {
      logger.error('Binance API request failed:', {
        endpoint,
        error: error.response?.data || error.message,
      });
      throw error;
    }
  }

  /**
   * Get real-time price for a symbol
   */
  async getPrice(symbol: string): Promise<number> {
    try {
      const response = await axios.get(`${BINANCE_API_BASE}/api/v3/ticker/price`, {
        params: { symbol: symbol.replace('-', '') }, // BTC-USD -> BTCUSD
      });

      const price = parseFloat(response.data.price);
      logger.debug(`Binance price for ${symbol}:`, price);
      return price;
    } catch (error) {
      logger.error(`Failed to get Binance price for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get 24h ticker data
   */
  async get24hTicker(symbol: string): Promise<BinanceTicker> {
    try {
      const response = await axios.get(`${BINANCE_API_BASE}/api/v3/ticker/24hr`, {
        params: { symbol: symbol.replace('-', '') },
      });

      return response.data;
    } catch (error) {
      logger.error(`Failed to get 24h ticker for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get order book depth
   */
  async getOrderBook(symbol: string, limit: number = 100): Promise<BinanceOrderBook> {
    try {
      const response = await axios.get(`${BINANCE_API_BASE}/api/v3/depth`, {
        params: {
          symbol: symbol.replace('-', ''),
          limit,
        },
      });

      return response.data;
    } catch (error) {
      logger.error(`Failed to get order book for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get historical klines (candlestick data)
   */
  async getKlines(
    symbol: string,
    interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1h',
    limit: number = 500
  ): Promise<BinanceKline[]> {
    try {
      const response = await axios.get(`${BINANCE_API_BASE}/api/v3/klines`, {
        params: {
          symbol: symbol.replace('-', ''),
          interval,
          limit,
        },
      });

      return response.data.map((k: any[]) => ({
        openTime: k[0],
        open: k[1],
        high: k[2],
        low: k[3],
        close: k[4],
        volume: k[5],
        closeTime: k[6],
        quoteAssetVolume: k[7],
        numberOfTrades: k[8],
      }));
    } catch (error) {
      logger.error(`Failed to get klines for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(symbol: string, limit: number = 100): Promise<any[]> {
    try {
      const response = await axios.get(`${BINANCE_API_BASE}/api/v3/trades`, {
        params: {
          symbol: symbol.replace('-', ''),
          limit,
        },
      });

      return response.data;
    } catch (error) {
      logger.error(`Failed to get recent trades for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Stream real-time market data via WebSocket
   */
  streamMarketData(symbol: string, callback: (data: any) => void): WebSocket {
    const ws = new WebSocket(
      `${BINANCE_WS_BASE}/${symbol.toLowerCase().replace('-', '')}@ticker`
    );

    ws.on('message', (data: any) => {
      try {
        const ticker = JSON.parse(data.toString());
        callback({
          symbol: ticker.s,
          price: parseFloat(ticker.c),
          volume: parseFloat(ticker.v),
          high: parseFloat(ticker.h),
          low: parseFloat(ticker.l),
          priceChange: parseFloat(ticker.p),
          priceChangePercent: parseFloat(ticker.P),
          timestamp: ticker.E,
        });
      } catch (error) {
        logger.error('WebSocket message parsing error:', error);
      }
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      logger.info(`WebSocket closed for ${symbol}`);
    });

    return ws;
  }

  /**
   * Get account balances (requires API keys)
   */
  async getAccountBalances(): Promise<any[]> {
    if (!this.apiKey) throw new Error('Binance API key required');

    try {
      const data = await this.request('/api/v3/account');
      return data.balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    } catch (error) {
      logger.error('Failed to get Binance account balances:', error);
      throw error;
    }
  }

  /**
   * Place market order (requires API keys)
   */
  async placeMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number): Promise<any> {
    if (!this.apiKey) throw new Error('Binance API key required');

    try {
      const data = await this.request(
        '/api/v3/order',
        {
          symbol: symbol.replace('-', ''),
          side,
          type: 'MARKET',
          quantity,
        },
        'POST'
      );

      logger.info('Market order placed:', data);
      return data;
    } catch (error) {
      logger.error('Failed to place market order:', error);
      throw error;
    }
  }
}

export const binanceAPI = new BinanceAPI();
