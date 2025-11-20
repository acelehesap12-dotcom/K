import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export default async function userRoutes(fastify, opts) {
  // Get user profile
  fastify.get('/profile', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT id, email, username, kk99_balance, status, kyc_status, created_at, last_login_at
         FROM exchange.users
         WHERE id = $1`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      reply.send(result.rows[0]);
    } catch (error) {
      logger.error('Get profile error:', error);
      reply.code(500).send({ error: 'Failed to get profile' });
    }
  });

  // Update user profile
  fastify.put('/profile', async (request, reply) => {
    try {
      await request.jwtVerify();

      const { username } = request.body;

      if (!username) {
        return reply.code(400).send({ error: 'Username is required' });
      }

      const result = await query(
        `UPDATE exchange.users
         SET username = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, email, username, kk99_balance, status`,
        [username, request.user.id]
      );

      reply.send(result.rows[0]);
    } catch (error) {
      logger.error('Update profile error:', error);
      reply.code(500).send({ error: 'Failed to update profile' });
    }
  });

  // Get KK99 balance
  fastify.get('/kk99-balance', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT kk99_balance FROM exchange.users WHERE id = $1`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      reply.send({
        balance: result.rows[0].kk99_balance,
        currency: 'KK99',
      });
    } catch (error) {
      logger.error('Get KK99 balance error:', error);
      reply.code(500).send({ error: 'Failed to get balance' });
    }
  });

  // Get trading statistics
  fastify.get('/stats', async (request, reply) => {
    try {
      await request.jwtVerify();

      // Total trades
      const tradesResult = await query(
        `SELECT COUNT(*) as total_trades, 
                SUM(total_value) as total_volume
         FROM exchange.trades
         WHERE buyer_user_id = $1 OR seller_user_id = $1`,
        [request.user.id]
      );

      // Total fees paid
      const feesResult = await query(
        `SELECT SUM(buyer_fee_kk99 + seller_fee_kk99) as total_fees
         FROM exchange.trades
         WHERE buyer_user_id = $1 OR seller_user_id = $1`,
        [request.user.id]
      );

      // Win rate (positive trades vs negative)
      const winRateResult = await query(
        `SELECT 
          COUNT(CASE WHEN buyer_user_id = $1 AND total_value > 0 THEN 1 END) +
          COUNT(CASE WHEN seller_user_id = $1 AND total_value > 0 THEN 1 END) as wins,
          COUNT(*) as total
         FROM exchange.trades
         WHERE buyer_user_id = $1 OR seller_user_id = $1`,
        [request.user.id]
      );

      const stats = {
        totalTrades: parseInt(tradesResult.rows[0].total_trades || 0),
        totalVolume: parseFloat(tradesResult.rows[0].total_volume || 0),
        totalFeesPaid: parseFloat(feesResult.rows[0].total_fees || 0),
        winRate: tradesResult.rows[0].total_trades > 0 
          ? ((winRateResult.rows[0].wins / winRateResult.rows[0].total) * 100).toFixed(2)
          : 0,
      };

      reply.send(stats);
    } catch (error) {
      logger.error('Get stats error:', error);
      reply.code(500).send({ error: 'Failed to get statistics' });
    }
  });
}
