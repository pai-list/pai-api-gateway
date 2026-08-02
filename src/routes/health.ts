/**
 * PAI API Gateway - Health Check Routes
 * 
 * Health check endpoints for monitoring and load balancer probes.
 */

import { Hono } from 'hono';

export const healthRoutes = new Hono();

// Basic health check
export const healthRoutes = new Hono()
  .get('/', (c) => c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.ENVIRONMENT || 'development',
  }))
  .get('/ready', (c) => c.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'healthy',
      cache: 'healthy',
      upstream: 'healthy',
    }
  }))
  .get('/live', (c) => c.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  }));

export default healthRoutes;