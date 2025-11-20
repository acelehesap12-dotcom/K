import { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from './logger.js';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    super(400, message, code);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Unauthorized', code: string = 'AUTH_ERROR') {
    super(401, message, code);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Forbidden', code: string = 'FORBIDDEN') {
    super(403, message, code);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Not found', code: string = 'NOT_FOUND') {
    super(404, message, code);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource already exists', code: string = 'CONFLICT') {
    super(409, message, code);
    this.name = 'ConflictError';
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error', code: string = 'INTERNAL_ERROR') {
    super(500, message, code);
    this.name = 'InternalServerError';
  }
}

/**
 * Global error handler for Fastify
 */
export async function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  logger.error({
    error: error.message,
    stack: error.stack,
    method: request.method,
    url: request.url,
    query: request.query,
  });

  if (error instanceof ApiError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // JWT errors
  if (error.name === 'UnauthorizedError') {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Database errors
  if (error.message.includes('duplicate key')) {
    return reply.code(409).send({
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: 'Resource already exists',
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Default error response
  return reply.code(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Validate required fields in request
 */
export function validateRequired(
  data: Record<string, any>,
  requiredFields: string[],
): void {
  const missing = requiredFields.filter((field) => !data[field]);
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain digit');
  }
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain special character (!@#$%^&*)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate quantity and price
 */
export function validateOrderParameters(quantity: number, price: number | null): void {
  if (quantity <= 0) {
    throw new ValidationError('Quantity must be positive');
  }

  if (price !== null && price <= 0) {
    throw new ValidationError('Price must be positive');
  }
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .substring(0, 1000)
    .trim();
}

/**
 * Rate limit check
 */
export async function checkRateLimit(
  key: string,
  limit: number = 100,
  windowMs: number = 60000,
  redisClient?: any,
): Promise<boolean> {
  if (!redisClient) return true;

  try {
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, Math.ceil(windowMs / 1000));
    }
    return count <= limit;
  } catch (error) {
    logger.error('Rate limit check failed:', error);
    return true; // Allow on error
  }
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  fn: (req: FastifyRequest, reply: FastifyReply) => Promise<any>,
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(req, reply);
    } catch (error) {
      throw error;
    }
  };
}
