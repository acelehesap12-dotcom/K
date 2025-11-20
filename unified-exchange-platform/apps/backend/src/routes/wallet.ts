import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { verifyDeposit, calculateKK99Amount, publishDepositEvent } from '../services/blockchain.js';

export default async function walletRoutes(fastify, opts) {
  // Get user wallets
  fastify.get('/', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT id, wallet_address, chain, balance, verified, created_at
         FROM exchange.wallets
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [request.user.id]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get wallets error:', error);
      reply.code(500).send({ error: 'Failed to get wallets' });
    }
  });

  // Add wallet
  fastify.post('/', async (request, reply) => {
    try {
      await request.jwtVerify();

      const { walletAddress, chain } = request.body;

      if (!walletAddress || !chain) {
        return reply.code(400).send({ error: 'Missing wallet address or chain' });
      }

      const validChains = ['ETH', 'SOL', 'TRX', 'BTC'];
      if (!validChains.includes(chain.toUpperCase())) {
        return reply.code(400).send({ error: 'Invalid chain' });
      }

      // Check if wallet already exists
      const existing = await query(
        'SELECT id FROM exchange.wallets WHERE wallet_address = $1 AND chain = $2',
        [walletAddress, chain.toUpperCase()]
      );

      if (existing.rows.length > 0) {
        return reply.code(409).send({ error: 'Wallet already exists' });
      }

      const result = await query(
        `INSERT INTO exchange.wallets (user_id, wallet_address, chain, verified)
         VALUES ($1, $2, $3, $4)
         RETURNING id, wallet_address, chain, balance, verified, created_at`,
        [request.user.id, walletAddress, chain.toUpperCase(), false]
      );

      reply.code(201).send(result.rows[0]);
    } catch (error) {
      logger.error('Add wallet error:', error);
      reply.code(500).send({ error: 'Failed to add wallet' });
    }
  });

  // Record deposit
  fastify.post('/deposit', async (request, reply) => {
    try {
      await request.jwtVerify();

      const { walletId, transactionHash, amount, chain } = request.body;

      if (!walletId || !transactionHash || !amount || !chain) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      // Verify wallet belongs to user
      const walletResult = await query(
        'SELECT id, wallet_address FROM exchange.wallets WHERE id = $1 AND user_id = $2',
        [walletId, request.user.id]
      );

      if (walletResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Wallet not found' });
      }

      // Calculate KK99 amount (after fees)
      const { gross, fee, net } = await calculateKK99Amount(amount, chain);

      // Create deposit record
      const depositResult = await query(
        `INSERT INTO exchange.deposits 
         (user_id, wallet_id, transaction_hash, amount, kk99_amount_credited, chain, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, status, created_at`,
        [request.user.id, walletId, transactionHash, gross, net, chain.toUpperCase(), 'pending']
      );

      const deposit = depositResult.rows[0];

      // Publish event
      await publishDepositEvent({
        id: deposit.id,
        userId: request.user.id,
        chain: chain.toUpperCase(),
        transactionHash,
        amount: gross,
        kk99Amount: net,
        status: deposit.status,
      });

      reply.code(201).send({
        deposit,
        kk99Amount: net,
        message: 'Deposit recorded. Awaiting blockchain confirmation.',
      });
    } catch (error) {
      logger.error('Deposit recording error:', error);
      reply.code(500).send({ error: 'Failed to record deposit' });
    }
  });

  // Get deposit history
  fastify.get('/deposits', async (request, reply) => {
    try {
      await request.jwtVerify();

      const result = await query(
        `SELECT id, transaction_hash, amount, kk99_amount_credited, chain, status, created_at, confirmed_at
         FROM exchange.deposits
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [request.user.id]
      );

      reply.send(result.rows);
    } catch (error) {
      logger.error('Get deposits error:', error);
      reply.code(500).send({ error: 'Failed to get deposits' });
    }
  });
}
