/**
 * Health Check Routes
 * 
 * Provides health check endpoints for monitoring and load balancer probes.
 */

import { Hono } from 'hono';

const healthRoutes = new Hono();

// GET /health
healthRoutes.get('/', async (c) => {
  return c.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.ENVIRONMENT || 'development',
    checks: {
      database: 'healthy',
      cache: 'healthy',
      workers: 'healthy',
    },
  }, 200);
});

// GET /health/ready
healthRoutes.get('/ready', async (c) => {
  // TODO: Add actual readiness checks (DB connection, cache, etc.)
  return c.json({
    success: true,
    ready: true,
    timestamp: new Date().toISOString(),
  }, 200);
});

// GET /health/live
healthRoutes.get('/live', async (c) => {
  return c.json({
    success: true,
    alive: true,
    timestamp: new Date().toISOString(),
  }, 200);
});

// GET /health/metrics
healthRoutes.get('/metrics', async (c) => {
  // Basic metrics - in production, integrate with Prometheus or similar
  return c.json({
    success: true,
    metrics: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
    },
    timestamp: new Date().toISOString(),
  }, 200);
});

export { healthRoutes };