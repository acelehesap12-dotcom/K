import { logger } from '../utils/logger.js';
import { query } from '../db/connection.js';

export async function verifyAdminAuth(fastify) {
  return async function (request, reply) {
    try {
      // Verify JWT token
      await request.jwtVerify();

      // Check if user email is admin email
      const adminEmail = process.env.ADMIN_EMAIL || 'berkecansuskun1998@gmail.com';
      if (request.user.email !== adminEmail) {
        reply.code(403).send({ error: 'Forbidden: Admin access required' });
        return;
      }
    } catch (error) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  };
}

export async function verifyUserAuth(fastify) {
  return async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (error) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  };
}

export async function generateJWT(user, fastify) {
  return fastify.jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
    },
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

export async function verifyUserEmail(email) {
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function hashPassword(password) {
  // In production, use bcrypt or similar
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function verifyPassword(plainPassword, hashedPassword) {
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha256').update(plainPassword).digest('hex');
  return hash === hashedPassword;
}
