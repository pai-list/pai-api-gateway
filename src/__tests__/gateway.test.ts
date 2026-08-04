import { describe, it, expect } from 'vitest';
import app from '../index';

describe('PAI API Gateway Unit Tests', () => {
  it('GET /health returns healthy status', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('version', '1.0.0');
  });

  it('GET /health/live returns alive status', async () => {
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('alive', true);
  });

  it('GET /api returns gateway information', async () => {
    const res = await app.request('/api');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('name', 'PAI API Gateway');
    expect(body).toHaveProperty('version', '1.0.0');
    expect(body).toHaveProperty('health', '/health');
  });

  it('GET /unknown-route returns 404', async () => {
    const res = await app.request('/unknown-route');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toHaveProperty('error', 'Not found');
  });
});
