import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { logger } from './utils/logger.js';
import { dbPool } from './db/connection.js';
import { initVault } from './services/vault.js';
import { initKafka } from './services/kafka.js';
import { errorHandler, ApiError } from './utils/errors.js';
import { metricsMiddleware, metricsEndpoint, updateDatabaseMetrics } from './utils/metrics.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import orderRoutes from './routes/orders.js';
import tradeRoutes from './routes/trades.js';
import userRoutes from './routes/users.js';
import marketDataRoutes from './routes/market-data.js';
import riskRoutes from './routes/risk.js';
import advancedOrderRoutes from './routes/advanced-orders.js';
// New services
import { circuitBreakerService } from './services/circuit-breaker.js';
import { slippageEngine } from './services/slippage-protection.js';
import { riskDashboardService } from './services/risk-dashboard.js';
import { rebalancingEngine } from './services/portfolio-rebalancing.js';
import { orderAnalyticsService } from './services/order-analytics.js';
import { feeCalculator } from './services/fee-calculator.js';
import { enhancedAuthService } from './services/enhanced-auth.js';
import { sorEngine } from './services/smart-order-routing.js';
import { complianceService } from './services/compliance.js';
import { vaultHSMService } from './services/vault-hsm.js';

const fastify = Fastify({
  logger: logger,
  requestTimeout: 30000,
});

// Security middleware
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
    },
  },
});

// CORS
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
});

// JWT
await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  sign: { expiresIn: process.env.JWT_EXPIRES_IN || '24h' },
});

// Rate limiting
await fastify.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_REQUESTS || '1000'),
  timeWindow: process.env.RATE_LIMIT_WINDOW_MS || '1 minute',
});

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

fastify.get('/ready', async (request, reply) => {
  try {
    // Check database
    const result = await dbPool.query('SELECT 1');
    if (!result) throw new Error('DB not ready');

    // Check Vault
    // Check Kafka
    return { status: 'ready' };
  } catch (error) {
    reply.code(503);
    return { status: 'not_ready', error: error.message };
  }
});

// Routes
fastify.register(authRoutes, { prefix: '/api/v1/auth' });
fastify.register(walletRoutes, { prefix: '/api/v1/wallets' });
fastify.register(orderRoutes, { prefix: '/api/v1/orders' });
fastify.register(tradeRoutes, { prefix: '/api/v1/trades' });
fastify.register(userRoutes, { prefix: '/api/v1/users' });
fastify.register(marketDataRoutes, { prefix: '/api/v1/market' });
fastify.register(riskRoutes, { prefix: '/api/v1/risk' });
fastify.register(advancedOrderRoutes, { prefix: '/api/v1/advanced-orders' });

// Metrics endpoint
fastify.get('/metrics', async (request, reply) => {
  reply.type('text/plain');
  return metricsEndpoint();
});

// Error handling
fastify.setErrorHandler(errorHandler);

// Initialize services
logger.info('Initializing Vault...');
await initVault();

logger.info('Initializing HSM Vault...');
await vaultHSMService.initializeHSM();

logger.info('Initializing Kafka...');
await initKafka();

logger.info('Initializing Circuit Breaker Service...');
await circuitBreakerService.initialize();

logger.info('Initializing Advanced Services...');
// All other services are auto-initialized on first use

// Update metrics periodically
setInterval(async () => {
  try {
    await updateDatabaseMetrics(dbPool);
  } catch (error) {
    logger.error('Failed to update metrics:', error);
  }
}, 30000); // Every 30 seconds

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    logger.info(`Server running on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
