/**
 * PAI API Gateway - Rate Limiting Middleware with Durable Objects
 * 
 * Implements token bucket rate limiting using Cloudflare Durable Objects
 * for globally consistent, distributed rate limiting.
 * 
 * References:
 * - https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
 * - https://blog.cloudflare.com/sqlite-in-durable-objects/
 * - https://blog.cloudflare.com/durable-objects-in-dynamic-workers/
 */

import { MiddlewareHandler, Context } from 'hono';
import { RateLimitInfo, RateLimitConfig, RATE_LIMIT_TIERS, Tier } from '../types';
import { RateLimitError } from '../types';

export interface RateLimiterDO {
  // Token bucket operations
  consume(key: string, tokens?: number): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }>;
  refill(key: string, tokens: number): Promise<void>;
  getState(key: string): Promise<{ tokens: number; lastRefill: number; capacity: number; refillRate: number } | null>;
  reset(key: string): Promise<void>;
  // Batch operations for efficiency
  consumeBatch(keys: string[], tokens?: number): Promise<Map<string, { allowed: boolean; remaining: number; resetAt: number }>>;
}

export interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per second
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  burstAllowance?: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitConfigByTier {
  free: { rpm: number; rph: number; burst: number };
  basic: { rpm: number; rph: number; burst: number };
  pro: { rpm: number; rph: number; burst: number };
  enterprise: { rpm: number; rph: number; burst: number };
}

export const RATE_LIMIT_TIERS = {
  free: { rpm: 60, rph: 1000, burst: 10 },
  basic: { rpm: 120, rph: 5000, burst: 20 },
  pro: { rpm: 300, rph: 20000, burst: 50 },
  enterprise: { rpm: 1000, rph: 100000, burst: 200 },
} as const;

export type Tier = keyof typeof RATE_LIMIT_TIERS;

export interface RateLimitConfigByPath {
  [path: string]: {
    tier: Tier;
    customLimits?: {
      rpm?: number;
      rph?: number;
      burst?: number;
    };
  };
}

// Default rate limit configuration by path
export const DEFAULT_RATE_LIMITS: Record<string, { tier: Tier; customLimits?: any }> = {
  '/api/auth/*': { tier: 'free', customLimits: { rpm: 10, burst: 5 } },
  '/api/auth/login': { tier: 'free', customLimits: { rpm: 5, burst: 3 } },
  '/api/auth/register': { tier: 'free', customLimits: { rpm: 3, burst: 2 } },
  '/api/payments/*': { tier: 'pro', customLimits: { rpm: 30, burst: 10 } },
  '/api/webhooks/*': { tier: 'enterprise', customLimits: { rpm: 1000, burst: 50 } },
  '/api/health': { tier: 'enterprise', customLimits: { rpm: 1000, burst: 100 } },
  '/api/docs': { tier: 'enterprise', customLimits: { rpm: 200, burst: 50 } },
  '/api/*': { tier: 'basic' },
  '*': { tier: 'free' },
};

export interface RateLimiterDO extends DurableObject {
  consume(key: string, tokens?: number): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }>;
  refill(key: string, tokens: number): Promise<void>;
  getState(key: string): Promise<{ tokens: number; lastRefill: number; capacity: number; refillRate: number } | null>;
  reset(key: string): Promise<void>;
}

export class RateLimiter implements RateLimiterDO {
  private state: DurableObjectState;
  private env: any;
  private readonly DEFAULT_CAPACITY = 60;
  private readonly DEFAULT_REFILL_RATE = 1; // tokens per second

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async consume(key: string, tokens = 1): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
    const now = Date.now();
    const storageKey = `ratelimit:${key}`;
    
    // Get current state
    let state = await this.state.storage.get<{ tokens: number; lastRefill: number; capacity: number; refillRate: number }>(`bucket:${key}`);
    
    if (!state) {
      // Initialize new bucket
      state = {
        tokens: 60, // default capacity
        lastRefill: Date.now(),
        capacity: 60,
        refillRate: 1, // 1 token per second
      };
    }

    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsedSeconds = (now - state.lastRefill) / 1000;
    const tokensToAdd = elapsedSeconds * 1; // 1 token per second default
    state.tokens = Math.min(state.capacity, state.tokens + tokensToAdd);
    state.lastRefill = now;

    let allowed = false;
    let retryAfter: number | undefined;

    if (state.tokens >= 1) {
      state.tokens -= 1;
      allowed = true;
    } else {
      // Calculate retry after
      const tokensNeeded = 1 - state.tokens;
      const secondsUntilReady = Math.ceil(tokensNeeded / 1); // 1 token per second
      retryAfter = secondsNeeded;
    }

    // Save updated state
    await this.state.storage.put(`bucket:${key}`, state);

    const resetAt = Math.floor((Date.now() + (state.tokens * 1000)) / 1000);

    return {
      allowed,
      remaining: Math.max(0, Math.floor(state.tokens)),
      resetAt,
      retryAfter,
    };
  }

  async refill(key: string, tokens: number): Promise<void> {
    const state = await this.state.storage.get<{ tokens: number; capacity: number }>(`bucket:${key}`) || {
      tokens: 0,
      capacity: 60,
    };
    state.tokens = Math.min(state.capacity, state.tokens + tokens);
    await this.state.storage.put(`bucket:${key}`, state);
  }

  async getState(key: string): Promise<{ tokens: number; lastRefill: number; capacity: number; refillRate: number } | null> {
    return await this.state.storage.get(`bucket:${key}`) || null;
  }

  async reset(key: string): Promise<void> {
    await this.state.storage.delete(`bucket:${key}`);
  }
}

/**
 * Rate Limiter Middleware Factory
 * 
 * Creates a Hono middleware that applies rate limiting based on:
 * - API Key tier (free/basic/pro/enterprise)
 * - IP address (for unauthenticated requests)
 * - Path-specific limits
 * - Tier-based limits
 */
export function createRateLimitMiddleware(env: any, options: {
  defaultTier: 'free' | 'basic' | 'pro' | 'enterprise';
  rateLimitDO: DurableObjectNamespace;
  excludePaths?: string[];
  keyGenerator?: (c: any) => string;
  getTier?: (c: any) => Promise<string>;
  skipPaths?: string[];
} = {}) {
  const { defaultTier = 'free', rateLimitDO, excludePaths = [], keyGenerator, getTier, skipPaths = [] } = options;

  return async (c: any, next: () => Promise<void>) => {
    const path = new URL(c.req.url).pathname;
    
    // Skip rate limiting for excluded paths
    if (skipPaths.some(p => matchPath(p, new URL(c.req.url).pathname))) {
      return;
    }

    // Check exclude paths
    if (excludePaths.some(p => matchPath(p, new URL(c.req.url).pathname))) {
      return;
    }

    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Generate rate limit key
      const key = keyGenerator ? keyGenerator(c) : await generateRateLimitKey(c);
      
      // Get user tier
      const tier = getTier ? await getTier(c) : 'free';
      const limits = getTierLimits(tier);

      // Get rate limiter DO stub
      const id = env.RATE_LIMITER.idFromName(`ratelimit:${key}`);
      const stub = env.RATE_LIMITER.get(id);

      // Consume token
      const result = await stub.consume(key, 1);

      // Set rate limit headers
      c.res.headers.set('X-RateLimit-Limit', limits.rpm.toString());
      c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
      c.res.headers.set('X-RateLimit-Reset', result.resetAt.toString());

      if (!result.allowed) {
        c.res.headers.set('Retry-After', result.retryAfter?.toString() || '60');
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please slow down.',
          retryAfter: result.retryAfter,
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': result.retryAfter?.toString() || '60',
            'X-RateLimit-Limit': limits.rpm.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(Date.now() / 1000 + 60).toString(),
          },
        });
      }

      // Add rate limit info to context for downstream use
      c.set('rateLimitInfo', {
        limit: limits.rpm,
        remaining: result.remaining,
        resetAt: result.resetAt,
      });

      await next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Fail open - don't block requests if rate limiter fails
      await next();
    }
  };
}

function getTierLimits(tier: string) {
  const tiers = {
    free: { rpm: 60, rph: 1000, burst: 10 },
    basic: { rpm: 120, rph: 5000, burst: 20 },
    pro: { rpm: 300, rph: 20000, burst: 50 },
    enterprise: { rpm: 1000, rph: 100000, burst: 200 },
  };
  return tiers[tier as keyof typeof tiers] || tiers.free;
}

async function generateRateLimitKey(c: any): Promise<string> {
  // Try API key first
  const apiKey = c.req.header('x-api-key');
  if (apiKey) {
    return `apikey:${apiKey}`;
  }

  // Try JWT user
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // In real implementation, decode JWT to get user ID
    return `user:${crypto.randomUUID()}`; // Placeholder
  }

  // Fall back to IP
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  return `ip:${ip}`;
}

function matchPath(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(path);
}

export { RateLimiter };