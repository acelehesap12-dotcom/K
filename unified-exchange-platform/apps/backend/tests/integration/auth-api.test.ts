// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import authRoutes from '../../src/routes/auth';

describe('Auth API Integration Tests', () => {
  const fastify = Fastify();

  beforeAll(async () => {
    await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register new user with valid data', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'newuser@test.com',
          password: 'StrongPass123!',
          name: 'Test User',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('userId');
      expect(body).toHaveProperty('token');
    });

    it('should reject weak password', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'weak@test.com',
          password: '123',
          name: 'Weak User',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject duplicate email', async () => {
      // First registration
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'duplicate@test.com',
          password: 'StrongPass123!',
          name: 'First User',
        },
      });

      // Duplicate registration
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'duplicate@test.com',
          password: 'AnotherPass123!',
          name: 'Second User',
        },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with correct credentials', async () => {
      // Register first
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'login@test.com',
          password: 'StrongPass123!',
          name: 'Login User',
        },
      });

      // Login
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'login@test.com',
          password: 'StrongPass123!',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('refreshToken');
    });

    it('should reject incorrect password', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'login@test.com',
          password: 'WrongPass123!',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user profile with valid token', async () => {
      // Register and login
      await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'profile@test.com',
          password: 'StrongPass123!',
          name: 'Profile User',
        },
      });

      const loginResponse = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'profile@test.com',
          password: 'StrongPass123!',
        },
      });

      const { token } = JSON.parse(loginResponse.body);

      // Get profile
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.email).toBe('profile@test.com');
    });

    it('should reject invalid token', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
