import axios from 'axios';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';

/**
 * Polygon.io API Integration - REAL Stock Market Data (No Mocks)
 * Docs: https://polygon.io/docs/stocks/getting-started
 */

const POLYGON_API_BASE = 'https://api.polygon.io';

interface PolygonTicker {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
}

interface PolygonQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: number;
}

interface PolygonAggregate {
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  vw: number; // volume weighted average price
  t: number; // timestamp
  n: number; // number of transactions
}

class PolygonAPI {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.POLYGON_API_KEY || '';

    if (!this.apiKey) {
      logger.warn('Polygon API key not configured - limited access');
    }
  }

  /**
   * Get real-time stock quote
   */
  async getQuote(symbol: string): Promise<any> {
    try {
      const response = await axios.get(
        `${POLYGON_API_BASE}/v2/last/trade/${symbol}`,
        {
          params: { apiKey: this.apiKey },
        }
      );

      const trade = response.data.results;
      return {
        symbol,
        price: trade.p,
        size: trade.s,
        exchange: trade.x,
        timestamp: trade.t,
      };
    } catch (error) {
      logger.error(`Failed to get Polygon quote for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get aggregated bars (OHLCV)
   */
  async getAggregates(
    symbol: string,
    multiplier: number = 1,
    timespan: 'minute' | 'hour' | 'day' | 'week' | 'month' = 'day',
    from: string,
    to: string,
    limit: number = 5000
  ): Promise<PolygonAggregate[]> {
    try {
      const response = await axios.get(
        `${POLYGON_API_BASE}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`,
        {
          params: {
            apiKey: this.apiKey,
            limit,
            sort: 'desc',
          },
        }
      );

      return response.data.results || [];
    } catch (error) {
      logger.error(`Failed to get aggregates for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get previous day's open, high, low, close (OHLC)
   */
  async getPreviousClose(symbol: string): Promise<any> {
    try {
      const response = await axios.get(
        `${POLYGON_API_BASE}/v2/aggs/ticker/${symbol}/prev`,
        {
          params: { apiKey: this.apiKey },
        }
      );

      const result = response.data.results[0];
      return {
        symbol,
        open: result.o,
        high: result.h,
        low: result.l,
        close: result.c,
        volume: result.v,
        vwap: result.vw,
        timestamp: result.t,
      };
    } catch (error) {
      logger.error(`Failed to get previous close for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get ticker details
   */
  async getTickerDetails(symbol: string): Promise<PolygonTicker> {
    try {
      const response = await axios.get(
        `${POLYGON_API_BASE}/v3/reference/tickers/${symbol}`,
        {
          params: { apiKey: this.apiKey },
        }
      );

      return response.data.results;
    } catch (error) {
      logger.error(`Failed to get ticker details for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get market snapshot for all tickers
   */
  async getSnapshot(tickers?: string[]): Promise<any[]> {
    try {
      const url = tickers
        ? `${POLYGON_API_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${tickers.join(',')}`
        : `${POLYGON_API_BASE}/v2/snapshot/locale/us/markets/stocks/tickers`;

      const response = await axios.get(url, {
        params: { apiKey: this.apiKey },
      });

      return response.data.tickers || [];
    } catch (error) {
      logger.error('Failed to get market snapshot:', error);
      throw error;
    }
  }

  /**
   * Get gainers/losers
   */
  async getGainersLosers(direction: 'gainers' | 'losers' = 'gainers'): Promise<any[]> {
    try {
      const response = await axios.get(
        `${POLYGON_API_BASE}/v2/snapshot/locale/us/markets/stocks/${direction}`,
        {
          params: { apiKey: this.apiKey },
        }
      );

      return response.data.tickers || [];
    } catch (error) {
      logger.error(`Failed to get ${direction}:`, error);
      throw error;
    }
  }

  /**
   * Stream real-time stock data via WebSocket
   */
  streamStockData(symbols: string[], callback: (data: any) => void): WebSocket {
    const ws = new WebSocket(`wss://socket.polygon.io/stocks`);

    ws.on('open', () => {
      // Authenticate
      ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }));

      // Subscribe to symbols
      ws.send(
        JSON.stringify({
          action: 'subscribe',
          params: symbols.map((s) => `T.${s}`).join(','), // Trades
        })
      );
    });

    ws.on('message', (data: any) => {
      try {
        const messages = JSON.parse(data.toString());
        if (Array.isArray(messages)) {
          messages.forEach((msg) => {
            if (msg.ev === 'T') {
              // Trade event
              callback({
                type: 'trade',
                symbol: msg.sym,
                price: msg.p,
                size: msg.s,
                exchange: msg.x,
                timestamp: msg.t,
              });
            }
          });
        }
      } catch (error) {
        logger.error('WebSocket message parsing error:', error);
      }
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      logger.info('Polygon WebSocket closed');
    });

    return ws;
  }

  /**
   * Get forex (currency) rates
   */
  async getForexRate(from: string, to: string): Promise<number> {
    try {
      const response = await axios.get(
        `${POLYGON_API_BASE}/v1/conversion/${from}/${to}`,
        {
          params: {
            apiKey: this.apiKey,
            amount: 1,
            precision: 6,
          },
        }
      );

      return response.data.converted;
    } catch (error) {
      logger.error(`Failed to get forex rate ${from}/${to}:`, error);
      throw error;
    }
  }

  /**
   * Get crypto price from Polygon
   */
  async getCryptoPrice(from: string, to: string = 'USD'): Promise<number> {
    try {
      const response = await axios.get(
        `${POLYGON_API_BASE}/v1/conversion/${from}/${to}`,
        {
          params: {
            apiKey: this.apiKey,
            amount: 1,
            precision: 8,
          },
        }
      );

      return response.data.converted;
    } catch (error) {
      logger.error(`Failed to get crypto price ${from}/${to}:`, error);
      throw error;
    }
  }
}

export const polygonAPI = new PolygonAPI();
