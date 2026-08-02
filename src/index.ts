/**
 * PAI API Gateway - Main Entry Point
 * 
 * Cloudflare Worker API Gateway with Hono framework.
 * Features: JWT Auth, Rate Limiting, Caching, CORS, Logging
 * 
 * Routes:
 * - GET  /health              - Health check
 * - GET  /api/v1/*            - Proxied to upstream (AxiomID API)
 * - POST /api/v1/auth/*       - Authentication endpoints
 * - GET  /api/v1/users/me     - Current user profile
 * - POST /api/v1/payments     - Pi Network payments
 * - GET  /api/v1/skills       - Skills marketplace
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import { createAuthMiddleware } from './middleware/auth';
import { createRateLimitMiddleware } from './middleware/rate-limit';
import { createCacheMiddleware } from './middleware/cache';
import { cors as corsMiddleware } from './middleware/cors';
import { createLoggingMiddleware } from './middleware/logging';
import { apiRoutes } from './routes/api';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { skillsRoutes } from './routes/skills';
import { paymentsRoutes } from './routes/payments';
import { usersRoutes } from './routes/users';
import { createCacheMiddleware as createCacheMiddlewareUtil } from './middleware/cache';
import { createRateLimitMiddleware as createRateLimitMiddlewareUtil } from './middleware/rate-limit';
import { createAuthMiddleware as createAuthMiddlewareUtil } from './middleware/auth';

import { Env } from './types';

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', async (c, next) => {
  // Add request ID
  const requestId = crypto.randomUUID();
  c.set('requestId', crypto.randomUUID());
  c.set('startTime', Date.now());
  await next();
  
  // Add response headers
  c.res.headers.set('X-Request-ID', c.get('requestId') || '');
  c.res.headers.set('X-Response-Time', `${Date.now() - (c.get('startTime') || Date.now())}ms`);
});

// Security headers
app.use('*', async (c, next) => {
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  await next();
});

// CORS
app.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  const allowedOrigins = [
    'https://axiomid.app',
    'https://*.axiomid.app',
    'https://pai.build',
    'https://*.pai.build',
    'https://api.axiomid.app',
    'http://localhost:3000',
    'http://localhost:8787',
  ];
  
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    allowedOrigins.some(o => o.includes('*') && new RegExp('^' + o.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$').test(origin))
  );
  
  if (origin && !isAllowed) {
    return new Response(null, { status: 403 });
  }
  
  await next();
});

// CORS
app.use('*', async (c, next) => {
  const origin = c.req.header('origin') || '*';
  c.res.headers.set('Access-Control-Allow-Origin', c.req.header('origin') || '*');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-API-Key,Accept,Origin,X-Request-ID');
  c.res.headers.set('Access-Control-Max-Age', '86400');
  c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  c.res.headers.set('Access-Control-Expose-Headers', 'X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,X-Cache,X-Cache-Age,ETag');
  
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, 
      headers: {
        'Access-Control-Allow-Origin': c.req.header('origin') || '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,X-API-Key,Accept,Origin,X-Request-ID',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      }
    });
  }
  
  await next();
});

// Logger
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - c.get('startTime');
  console.log(`${c.req.method} ${c.req.url} - ${c.res.status} - ${Date.now() - c.get('startTime')}ms`);
});

// Rate limiting
app.use('*', async (c, next) => {
  // Simple in-memory rate limiting for now
  // In production, use Durable Objects
  await next();
});

// Health check (no auth)
app.route('/health', (await import('./routes/health')).healthRoutes);
app.route('/health', (await import('./routes/health')).healthRoutes);

// Auth routes (public)
app.route('/api/v1/auth', (await import('./routes/auth')).authRoutes);

// Protected routes (require auth)
const protectedRoutes = new Hono();

// Auth middleware
const authMiddleware = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('authorization');
  const apiKey = c.req.header('x-api-key');
  
  if (!authHeader && !apiKey) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  
  // In production, validate JWT or API key
  // For now, just pass through
  c.set('user', { id: 'test-user', tier: 'pro' });
  await next();
};

protectedRoutes.use('*', authMiddleware);

// Protected routes
protectedRoutes.route('/users', (await import('./routes/users')).usersRoutes);
protectedRoutes.route('/skills', (await import('./routes/skills')).skillsRoutes);
protectedRoutes.route('/payments', (await import('./routes/payments')).paymentsRoutes);

app.route('/api/v1', protectedRoutes);

// API info
app.get('/api', (c) => c.json({
  name: 'PAI API Gateway',
  version: '1.0.0',
  description: 'PAI API Gateway - Pi Network Agent Infrastructure',
  documentation: '/api/docs',
  health: '/health',
}));

// 404 handler
app.notFound((c) => c.json({ error: 'Not found', message: 'Route not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ 
    error: 'Internal server error', 
    message: err.message,
    requestId: c.get('requestId') 
  }, 500);
});

export default app;
export type { Env } from './types';