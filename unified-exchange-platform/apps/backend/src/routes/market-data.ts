import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export default async function marketDataRoutes(fastify, opts) {
  // Get market data for asset
  fastify.get('/:symbol', async (request, reply) => {
    try {
      const { symbol } = request.params;
      const { limit = 100 } = request.query;

      // Get latest market data from TimescaleDB
      const result = await query(
        `SELECT time, symbol, open, high, low, close, volume, bid, ask
         FROM timescale.market_data
         WHERE symbol = $1
         ORDER BY time DESC
         LIMIT $2`,
        [symbol, limit]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get market data error:', error);
      reply.code(500).send({ error: 'Failed to get market data' });
    }
  });

  // Get OHLCV candlesticks
  fastify.get('/:symbol/candles', async (request, reply) => {
    try {
      const { symbol } = request.params;
      const { interval = '1m', limit = 100 } = request.query;

      let table = 'timescale.tick_data_1m';
      if (interval === '5m') table = 'timescale.tick_data_5m';
      else if (interval === '1h') table = 'timescale.tick_data_1h';

      const result = await query(
        `SELECT time, open, high, low, close, volume
         FROM ${table}
         WHERE symbol = $1
         ORDER BY time DESC
         LIMIT $2`,
        [symbol, limit]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get candles error:', error);
      reply.code(500).send({ error: 'Failed to get candlesticks' });
    }
  });

  // Get order book snapshot
  fastify.get('/:symbol/orderbook', async (request, reply) => {
    try {
      const { symbol } = request.params;

      const result = await query(
        `SELECT time, best_bid, best_ask, mid_price, spread, spread_bps
         FROM timescale.order_book_snapshots
         WHERE symbol = $1
         ORDER BY time DESC
         LIMIT 1`,
        [symbol]
      );

      if (result.rows.length === 0) {
        return reply.send({
          symbol,
          bid: null,
          ask: null,
          spread: null,
        });
      }

      const data = result.rows[0];
      reply.send({
        symbol,
        bid: data.best_bid,
        ask: data.best_ask,
        mid: data.mid_price,
        spread: data.spread,
        spreadBps: data.spread_bps,
        timestamp: data.time,
      });
    } catch (error) {
      logger.error('Get orderbook error:', error);
      reply.code(500).send({ error: 'Failed to get orderbook' });
    }
  });

  // Get market anomalies
  fastify.get('/:symbol/anomalies', async (request, reply) => {
    try {
      await request.jwtVerify(); // Require auth for anomaly alerts
      
      const { symbol } = request.params;
      const { hours = 24 } = request.query;

      const result = await query(
        `SELECT time, anomaly_type, severity, description, metric_value, threshold_value
         FROM timescale.market_anomalies
         WHERE symbol = $1 AND time > NOW() - INTERVAL '${hours} hours'
         ORDER BY time DESC`,
        [symbol]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get anomalies error:', error);
      reply.code(500).send({ error: 'Failed to get anomalies' });
    }
  });

  // Get all supported assets
  fastify.get('/list/all', async (request, reply) => {
    try {
      const result = await query(
        `SELECT symbol, name, class_type, base_asset, quote_asset, active
         FROM exchange.asset_classes
         WHERE active = true
         ORDER BY class_type, symbol`
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get assets list error:', error);
      reply.code(500).send({ error: 'Failed to get assets list' });
    }
  });
}
