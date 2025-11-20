// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import orderRoutes from '../../src/routes/orders';
import advancedOrderRoutes from '../../src/routes/advanced-orders';

describe('Order API Integration Tests', () => {
  const fastify = Fastify();
  let authToken: string;

  beforeAll(async () => {
    await fastify.register(orderRoutes, { prefix: '/api/v1/orders' });
    await fastify.register(advancedOrderRoutes, { prefix: '/api/v1/advanced-orders' });
    await fastify.ready();

    // Create test user and get token
    authToken = 'test-token';
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('POST /api/v1/orders', () => {
    it('should create market order', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          symbol: 'BTC-USD',
          side: 'BUY',
          type: 'MARKET',
          quantity: 0.1,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('orderId');
      expect(body.symbol).toBe('BTC-USD');
      expect(body.type).toBe('MARKET');
    });

    it('should create limit order', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          symbol: 'ETH-USD',
          side: 'SELL',
          type: 'LIMIT',
          quantity: 1,
          price: 3500,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('LIMIT');
      expect(body.price).toBe(3500);
    });

    it('should reject invalid order quantity', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          symbol: 'BTC-USD',
          side: 'BUY',
          type: 'MARKET',
          quantity: -1,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/advanced-orders/stop-loss', () => {
    it('should create stop-loss order', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/advanced-orders/stop-loss',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          symbol: 'BTC-USD',
          side: 'SELL',
          quantity: 0.5,
          stopPrice: 48000,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('STOP_LOSS');
      expect(body.stopPrice).toBe(48000);
    });
  });

  describe('POST /api/v1/advanced-orders/trailing-stop', () => {
    it('should create trailing stop order', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/advanced-orders/trailing-stop',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          symbol: 'ETH-USD',
          side: 'SELL',
          quantity: 2,
          trailPercent: 5,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('TRAILING_STOP');
      expect(body.trailPercent).toBe(5);
    });
  });

  describe('POST /api/v1/advanced-orders/iceberg', () => {
    it('should create iceberg order', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/advanced-orders/iceberg',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          symbol: 'BTC-USD',
          side: 'BUY',
          quantity: 10,
          price: 49000,
          displayQuantity: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('ICEBERG');
      expect(body.displayQuantity).toBe(1);
    });
  });

  describe('GET /api/v1/orders', () => {
    it('should list user orders', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/orders',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.orders)).toBe(true);
    });
  });

  describe('DELETE /api/v1/orders/:orderId', () => {
    it('should cancel order', async () => {
      // Create order first
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          symbol: 'BTC-USD',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 0.1,
          price: 45000,
        },
      });

      const { orderId } = JSON.parse(createResponse.body);

      // Cancel order
      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/v1/orders/${orderId}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('CANCELLED');
    });
  });
});
