import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/connection.js';
import { generateJWT, hashPassword, verifyPassword } from '../services/auth.js';
import { logger } from '../utils/logger.js';
import { publishEvent } from '../services/kafka.js';

export default async function authRoutes(fastify, opts) {
  // Register user
  fastify.post('/register', async (request, reply) => {
    const { email, username, password } = request.body;

    try {
      // Validate inputs
      if (!email || !username || !password) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      // Check if user exists
      const existing = await query(
        'SELECT id FROM exchange.users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existing.rows.length > 0) {
        return reply.code(409).send({ error: 'User already exists' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const result = await query(
        `INSERT INTO exchange.users (email, username, password_hash, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, username, created_at`,
        [email, username, passwordHash, 'active']
      );

      const user = result.rows[0];

      // Publish event
      await publishEvent('user-events', user.id, {
        userId: user.id,
        email: user.email,
        username: user.username,
        kycStatus: 'pending',
        createdAt: Date.now(),
      });

      const token = await generateJWT(user, fastify);

      reply.code(201).send({
        user,
        token,
      });
    } catch (error) {
      logger.error('Registration error:', error);
      reply.code(500).send({ error: 'Registration failed' });
    }
  });

  // Login user
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body;

    try {
      if (!email || !password) {
        return reply.code(400).send({ error: 'Missing email or password' });
      }

      // Find user
      const result = await query(
        'SELECT id, email, username, password_hash FROM exchange.users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const validPassword = await verifyPassword(password, user.password_hash);

      if (!validPassword) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Update last login
      await query(
        'UPDATE exchange.users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      const token = await generateJWT(user, fastify);

      reply.send({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
        token,
      });
    } catch (error) {
      logger.error('Login error:', error);
      reply.code(500).send({ error: 'Login failed' });
    }
  });

  // Verify token
  fastify.post('/verify', async (request, reply) => {
    try {
      await request.jwtVerify();
      reply.send({ valid: true, user: request.user });
    } catch (error) {
      reply.code(401).send({ valid: false, error: 'Invalid token' });
    }
  });
}
