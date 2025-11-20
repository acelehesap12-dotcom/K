import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { publishEvent } from '../services/kafka.js';

export default async function orderRoutes(fastify, opts) {
  // Create order
  fastify.post('/', async (request, reply) => {
    try {
      await request.jwtVerify();

      const { symbol, side, orderType, quantity, price, timeInForce } = request.body;

      if (!symbol || !side || !orderType || !quantity) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      // Get asset class
      const assetResult = await query(
        'SELECT id FROM exchange.asset_classes WHERE symbol = $1',
        [symbol]
      );

      if (assetResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Asset class not found' });
      }

      const assetClassId = assetResult.rows[0].id;

      // Create order
      const result = await query(
        `INSERT INTO exchange.orders 
         (user_id, asset_class_id, symbol, order_type, side, quantity, price, time_in_force, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, symbol, side, quantity, price, status, created_at`,
        [request.user.id, assetClassId, symbol, orderType, side.toUpperCase(), quantity, price || null, timeInForce || 'GTC', 'open']
      );

      const order = result.rows[0];

      // Publish order event
      await publishEvent('order-events', request.user.id, {
        orderId: order.id,
        userId: request.user.id,
        symbol: order.symbol,
        side: order.side,
        orderType,
        quantity: order.quantity,
        price: order.price,
        timeInForce: timeInForce || 'GTC',
        createdAt: Date.now(),
      });

      reply.code(201).send(order);
    } catch (error) {
      logger.error('Order creation error:', error);
      reply.code(500).send({ error: 'Failed to create order' });
    }
  });

  // Get user orders
  fastify.get('/', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT id, symbol, order_type, side, quantity, price, status, filled_quantity, 
                average_fill_price, total_fee_kk99, created_at, filled_at
         FROM exchange.orders
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [request.user.id]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get orders error:', error);
      reply.code(500).send({ error: 'Failed to get orders' });
    }
  });

  // Cancel order
  fastify.delete('/:orderId', async (request, reply) => {
    try {
      await request.jwtVerify();

      const { orderId } = request.params;

      // Check order belongs to user
      const orderResult = await query(
        'SELECT id, status FROM exchange.orders WHERE id = $1 AND user_id = $2',
        [orderId, request.user.id]
      );

      if (orderResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const order = orderResult.rows[0];

      if (order.status !== 'open' && order.status !== 'partially_filled') {
        return reply.code(400).send({ error: 'Cannot cancel order in current status' });
      }

      // Cancel order
      await query(
        'UPDATE exchange.orders SET status = $1, updated_at = NOW() WHERE id = $2',
        ['cancelled', orderId]
      );

      reply.send({ status: 'cancelled' });
    } catch (error) {
      logger.error('Cancel order error:', error);
      reply.code(500).send({ error: 'Failed to cancel order' });
    }
  });
}
