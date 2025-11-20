import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export default async function tradeRoutes(fastify, opts) {
  // Get user trades
  fastify.get('/', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT id, symbol, quantity, price, 
                CASE 
                  WHEN buyer_user_id = $1 THEN 'BUY'
                  ELSE 'SELL'
                END as side,
                total_value, created_at
         FROM exchange.trades
         WHERE buyer_user_id = $1 OR seller_user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [request.user.id]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get trades error:', error);
      reply.code(500).send({ error: 'Failed to get trades' });
    }
  });

  // Get trade details
  fastify.get('/:tradeId', async (request, reply) => {
    try {
      await request.jwtVerify();

      const { tradeId } = request.params;

      const result = await query(
        `SELECT id, symbol, quantity, price, total_value, 
                buyer_fee_kk99, seller_fee_kk99, created_at
         FROM exchange.trades
         WHERE id = $1 AND (buyer_user_id = $2 OR seller_user_id = $2)`,
        [tradeId, request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Trade not found' });
      }

      reply.send(result.rows[0]);
    } catch (error) {
      logger.error('Get trade details error:', error);
      reply.code(500).send({ error: 'Failed to get trade details' });
    }
  });

  // Get trade history with filtering
  fastify.get('/history/export', async (request, reply) => {
    try {
      await request.jwtVerify();

      const { symbol, startDate, endDate } = request.query;

      let sql = `SELECT id, symbol, quantity, price, total_value, created_at
                 FROM exchange.trades
                 WHERE buyer_user_id = $1 OR seller_user_id = $1`;

      const params = [request.user.id];

      if (symbol) {
        sql += ` AND symbol = $${params.length + 1}`;
        params.push(symbol);
      }

      if (startDate) {
        sql += ` AND created_at >= $${params.length + 1}`;
        params.push(new Date(startDate));
      }

      if (endDate) {
        sql += ` AND created_at <= $${params.length + 1}`;
        params.push(new Date(endDate));
      }

      sql += ` ORDER BY created_at DESC`;

      const result = await query(sql, params);

      reply.header('Content-Disposition', 'attachment; filename="trades.csv"');
      reply.type('text/csv');

      let csv = 'ID,Symbol,Quantity,Price,Total Value,Timestamp\n';
      result.rows.forEach(trade => {
        csv += `${trade.id},${trade.symbol},${trade.quantity},${trade.price},${trade.total_value},${trade.created_at}\n`;
      });

      reply.send(csv);
    } catch (error) {
      logger.error('Export trades error:', error);
      reply.code(500).send({ error: 'Failed to export trades' });
    }
  });
}
