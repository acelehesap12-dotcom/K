import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export default async function riskRoutes(fastify, opts) {
  // Get user portfolio risk metrics
  fastify.get('/portfolio', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT 
          id,
          total_portfolio_value,
          var_95,
          var_99,
          margin_requirement,
          span_margin,
          available_margin,
          risk_level,
          calculated_at
         FROM exchange.portfolio_risk_metrics
         WHERE user_id = $1
         ORDER BY calculated_at DESC
         LIMIT 1`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.send({
          message: 'No risk metrics calculated yet',
          portfolioValue: 0,
          var95: 0,
          var99: 0,
        });
      }

      reply.send(result.rows[0]);
    } catch (error) {
      logger.error('Get portfolio risk error:', error);
      reply.code(500).send({ error: 'Failed to get risk metrics' });
    }
  });

  // Get user positions
  fastify.get('/positions', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT 
          id,
          symbol,
          quantity,
          entry_price,
          current_price,
          unrealized_pnl,
          realized_pnl,
          margin_used,
          status
         FROM exchange.positions
         WHERE user_id = $1 AND status = 'open'`,
        [request.user.id]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get positions error:', error);
      reply.code(500).send({ error: 'Failed to get positions' });
    }
  });

  // Get margin requirements
  fastify.get('/margin', async (request, reply) => {
    try {
      await request.jwtVerify();

      const userResult = await query(
        'SELECT kk99_balance FROM exchange.users WHERE id = $1',
        [request.user.id]
      );

      const riskResult = await query(
        `SELECT margin_requirement, available_margin
         FROM exchange.portfolio_risk_metrics
         WHERE user_id = $1
         ORDER BY calculated_at DESC
         LIMIT 1`,
        [request.user.id]
      );

      reply.send({
        totalBalance: userResult.rows[0]?.kk99_balance || 0,
        marginRequired: riskResult.rows[0]?.margin_requirement || 0,
        marginAvailable: riskResult.rows[0]?.available_margin || 0,
      });
    } catch (error) {
      logger.error('Get margin error:', error);
      reply.code(500).send({ error: 'Failed to get margin' });
    }
  });

  // Get liquidation warnings
  fastify.get('/liquidation-warnings', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT 
          id,
          user_id,
          total_portfolio_value,
          margin_requirement,
          available_margin,
          risk_level,
          calculated_at
         FROM exchange.portfolio_risk_metrics
         WHERE user_id = $1 AND (risk_level = 'high' OR risk_level = 'critical')
         ORDER BY calculated_at DESC`,
        [request.user.id]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get liquidation warnings error:', error);
      reply.code(500).send({ error: 'Failed to get warnings' });
    }
  });
}
