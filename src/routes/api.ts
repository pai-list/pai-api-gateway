/**
 * API Routes - Main API Router
 * 
 * Combines all protected API routes under /api/v1
 */

import { Hono } from 'hono';
import { authRoutes } from './auth';
import { usersRoutes } from './users';
import { skillsRoutes } from './skills';
import { paymentsRoutes } from './payments';

const apiRoutes = new Hono();

// Public auth routes
apiRoutes.route('/auth', authRoutes);

// Protected routes (require auth middleware)
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

const protectedRoutes = new Hono();
protectedRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('authorization');
  const apiKey = c.req.header('x-api-key');
  
  if (!authHeader && !apiKey) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  
  // In production, validate JWT or API key
  c.set('user', { id: 'test-user', tier: 'pro' });
  await next();
});

protectedRoutes.route('/users', usersRoutes);
protectedRoutes.route('/skills', skillsRoutes);
protectedRoutes.route('/payments', paymentsRoutes);

apiRoutes.route('/', protectedRoutes);

export { apiRoutes };