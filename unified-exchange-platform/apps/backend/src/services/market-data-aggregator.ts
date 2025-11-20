import { binanceAPI } from './binance-api.js';
import { polygonAPI } from './polygon-api.js';
import { logger } from '../utils/logger.js';
import { query } from '../db/connection.js';
import { publishEvent } from './kafka.js';

/**
 * Market Data Aggregator - Combines data from multiple REAL APIs
 * NO MOCKS - ALL LIVE DATA
 */

interface AggregatedMarketData {
  symbol: string;
  assetClass: 'CRYPTO' | 'STOCK' | 'FOREX' | 'COMMODITY';
  price: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  bid: number | null;
  ask: number | null;
  timestamp: number;
  sources: string[];
}

class MarketDataAggregator {
  /**
   * Get real-time price from appropriate exchange
   */
  async getPrice(symbol: string, assetClass: string): Promise<number> {
    try {
      switch (assetClass.toUpperCase()) {
        case 'CRYPTO':
          return await binanceAPI.getPrice(symbol);

        case 'STOCK':
        case 'ETF':
          const quote = await polygonAPI.getQuote(symbol);
          return quote.price;

        case 'FOREX':
          const [from, to] = symbol.split('-');
          return await polygonAPI.getForexRate(from, to);

        default:
          throw new Error(`Unsupported asset class: ${assetClass}`);
      }
    } catch (error) {
      logger.error(`Failed to get price for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get aggregated market data with fallbacks
   */
  async getMarketData(symbol: string, assetClass: string): Promise<AggregatedMarketData> {
    const sources: string[] = [];
    let data: Partial<AggregatedMarketData> = {
      symbol,
      assetClass: assetClass as any,
      timestamp: Date.now(),
    };

    try {
      if (assetClass === 'CRYPTO') {
        // Get from Binance
        const ticker = await binanceAPI.get24hTicker(symbol);
        data.price = parseFloat(ticker.price);
        data.volume = parseFloat(ticker.volume);
        data.high = parseFloat(ticker.highPrice);
        data.low = parseFloat(ticker.lowPrice);
        sources.push('binance');

        // Get order book for bid/ask
        const orderBook = await binanceAPI.getOrderBook(symbol, 5);
        data.bid = orderBook.bids.length > 0 ? parseFloat(orderBook.bids[0][0]) : null;
        data.ask = orderBook.asks.length > 0 ? parseFloat(orderBook.asks[0][0]) : null;
      } else if (assetClass === 'STOCK' || assetClass === 'ETF') {
        // Get from Polygon
        const prevClose = await polygonAPI.getPreviousClose(symbol);
        data.open = prevClose.open;
        data.high = prevClose.high;
        data.low = prevClose.low;
        data.price = prevClose.close;
        data.volume = prevClose.volume;
        sources.push('polygon');

        // Get real-time quote
        const quote = await polygonAPI.getQuote(symbol);
        data.price = quote.price;
        sources.push('polygon-realtime');
      }

      data.sources = sources;

      // Store in TimescaleDB
      await this.storeMarketData(data as AggregatedMarketData);

      // Publish to Kafka for real-time consumers
      await publishEvent('market-data', 'market-data-key', {
        ...data,
        timestamp: new Date().toISOString(),
      });

      return data as AggregatedMarketData;
    } catch (error) {
      logger.error(`Failed to get market data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Store market data in TimescaleDB
   */
  private async storeMarketData(data: AggregatedMarketData): Promise<void> {
    try {
      await query(
        `INSERT INTO timescale.market_data 
         (time, symbol, asset_class, open, high, low, close, volume, bid, ask, vwap, last_trade_price, trade_count)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          data.symbol,
          data.assetClass,
          data.open || data.price,
          data.high,
          data.low,
          data.price,
          data.volume,
          data.bid,
          data.ask,
          data.price, // vwap approximation
          data.price,
          1,
        ]
      );
    } catch (error) {
      logger.error('Failed to store market data:', error);
      // Don't throw - this is background storage
    }
  }

  /**
   * Get historical candlestick data
   */
  async getHistoricalCandles(
    symbol: string,
    assetClass: string,
    interval: '1m' | '5m' | '1h' | '1d' = '1h',
    limit: number = 100
  ): Promise<any[]> {
    try {
      if (assetClass === 'CRYPTO') {
        return await binanceAPI.getKlines(symbol, interval, limit);
      } else if (assetClass === 'STOCK' || assetClass === 'ETF') {
        const to = new Date();
        const from = new Date(to.getTime() - limit * 24 * 60 * 60 * 1000); // limit days ago

        const aggregates = await polygonAPI.getAggregates(
          symbol,
          1,
          interval === '1d' ? 'day' : interval === '1h' ? 'hour' : 'minute',
          from.toISOString().split('T')[0],
          to.toISOString().split('T')[0],
          limit
        );

        return aggregates.map((agg) => ({
          openTime: agg.t,
          open: agg.o.toString(),
          high: agg.h.toString(),
          low: agg.l.toString(),
          close: agg.c.toString(),
          volume: agg.v.toString(),
          closeTime: agg.t + 86400000, // +1 day
        }));
      }

      throw new Error(`Unsupported asset class: ${assetClass}`);
    } catch (error) {
      logger.error(`Failed to get historical candles for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Start real-time data streaming for a symbol
   */
  startStreaming(symbol: string, assetClass: string, callback: (data: any) => void): any {
    if (assetClass === 'CRYPTO') {
      return binanceAPI.streamMarketData(symbol, async (data) => {
        await this.storeMarketData({
          ...data,
          assetClass: 'CRYPTO',
          open: data.price,
          sources: ['binance-websocket'],
        });
        callback(data);
      });
    } else if (assetClass === 'STOCK' || assetClass === 'ETF') {
      return polygonAPI.streamStockData([symbol], async (data) => {
        await this.storeMarketData({
          symbol: data.symbol,
          assetClass: 'STOCK',
          price: data.price,
          volume: data.size,
          high: data.price,
          low: data.price,
          open: data.price,
          bid: null,
          ask: null,
          timestamp: data.timestamp,
          sources: ['polygon-websocket'],
        });
        callback(data);
      });
    }

    throw new Error(`Streaming not supported for ${assetClass}`);
  }
}

export const marketDataAggregator = new MarketDataAggregator();
