/**
 * PAI API Gateway - Cache Middleware
 * 
 * Implements HTTP caching using Cloudflare Cache API and Workers KV
 * Supports ETag, Cache-Control, stale-while-revalidate, and cache invalidation
 * 
 * References:
 * - https://developers.cloudflare.com/workers/runtime-apis/cache/
 * - https://developers.cloudflare.com/kv/
 */

import { MiddlewareHandler, Context } from 'hono';
import { CacheConfig, CacheEntry, CacheInfo } from '../types';

export interface CacheMiddlewareOptions {
  cache: CacheNamespace;
  kv: KVNamespace;
  defaultTTL: number;
  maxSize: number;
  cacheableMethods: string[];
  cacheableStatusCodes: number[];
  varyHeaders: string[];
  excludePaths: string[];
  keyPrefix: string;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
  headers: Record<string, string>;
}

export function createCacheMiddleware(options: CacheMiddlewareOptions): MiddlewareHandler {
  const { 
    cache, 
    kv, 
    defaultTTL = 300, 
    maxSize = 100 * 1024 * 1024, // 100MB
    cacheableMethods = ['GET', 'HEAD'],
    cacheableStatusCodes = [200, 301, 302, 304, 404],
    varyHeaders = ['accept', 'accept-encoding', 'accept-language'],
    excludePaths = ['/api/auth/', '/api/payments/', '/api/webhooks/'],
    keyPrefix = 'cache:'
  } = options;

  return async (c, next) => {
    const path = new URL(c.req.url).pathname;
    
    // Skip caching for excluded paths
    if (excludePaths.some(p => matchPath(p, new URL(c.req.url).pathname))) {
      return next();
    }

    const method = c.req.method;
    
    // Only cache cacheable methods
    if (!cacheableMethods.includes(method)) {
      return next();
    }

    // Generate cache key
    const cacheKey = generateCacheKey(c.req.url, c.req.headers);
    
    // Try to get from cache first
    const cached = await getFromCache(cache, kv, cacheKey);
    
    if (cached) {
      // Check if stale but can serve stale-while-revalidate
      const age = Date.now() - cached.timestamp;
      const isFresh = age < cached.ttl * 1000;
      const canServeStale = age < (cached.ttl + 60) * 1000; // 60s stale-while-revalidate
      
      if (isFresh || canServeStale) {
        const response = new Response(cached.data, {
          status: cached.status,
          headers: {
            ...cached.headers,
            'X-Cache': isFresh ? 'HIT' : 'STALE',
            'X-Cache-Age': Math.floor(age / 1000).toString(),
            'X-Cache-ETag': cached.etag || '',
          },
        });
        
        // Add cache info to context
        const ctx = {
          hit: true,
          age: Math.floor(age / 1000),
          etag: cached.etag,
        };
        
        return new Response(cached.data, {
          status: cached.status,
          headers: new Headers(cached.headers),
        });
      }
    }

    // Not in cache or stale - proceed to origin
    const response = await next();
    
    // Check if response should be cached
    if (shouldCacheResponse(response, cacheableMethods, cacheableStatusCodes)) {
      await storeInCache(kv, cache, c.req.url, response, {
        ttl: 300, // 5 minutes default
        keyPrefix: 'cache:',
      });
    }
    
    return response;
  };
}

async function getFromCache(cache: CacheNamespace, kv: KVNamespace, key: string): Promise<any | null> {
  try {
    // Try Cloudflare Cache API first (for edge caching)
    try {
      const cached = await cache.match(key);
      if (cached) {
        const data = await cached.arrayBuffer();
        const headers = Object.fromEntries(cached.headers.entries());
        return {
          data,
          status: 200,
          headers,
          timestamp: Date.now(),
          ttl: 300,
          etag: cached.headers.get('etag'),
        };
      }
    } catch {
      // Cache API not available, fall back to KV
    }

    // Fallback to Workers KV
    const cached = await kv.get(`${key}:meta`, 'json');
    if (!cached) return null;
    
    const data = await kv.get(`${key}:data`, 'arrayBuffer');
    if (!data) return null;
    
    return {
      data,
      status: cached.status,
      headers: cached.headers,
      timestamp: cached.timestamp,
      ttl: cached.ttl,
      etag: cached.etag,
    };
  } catch {
    return null;
  }
}

async function storeInCache(kv: KVNamespace, cache: CacheNamespace, url: string, response: Response, options: { ttl: number; keyPrefix: string }): Promise<void> {
  try {
    const key = generateCacheKey(url, new Headers());
    const data = await response.arrayBuffer();
    const headers = Object.fromEntries(response.headers.entries());
    const etag = response.headers.get('etag') || generateETag(await response.clone().arrayBuffer());
    
    const cacheEntry = {
      data,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      timestamp: Date.now(),
      ttl: 300,
      etag,
    };

    // Store in Workers KV
    await Promise.all([
      kv.put(`${keyPrefix}${url}:meta`, JSON.stringify({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: Date.now(),
        ttl: 300,
        etag,
      })),
      kv.put(`${keyPrefix}:data`, data),
    ]);

    // Also try Cloudflare Cache API
    try {
      const cacheResponse = new Response(data, {
        status: response.status,
        headers: response.headers,
      });
      await cache.put(new Request(url), cacheResponse);
    } catch {
      // Cache API might not be available
    }
  } catch (error) {
    console.warn('Failed to store in cache:', error);
  }
}

function generateCacheKey(url: string, headers: Headers): string {
  const urlObj = new URL(url);
  const varyHeaders = ['accept', 'accept-encoding', 'accept-language', 'authorization'];
  const varyValues = varyHeaders.map(h => headers.get(h) || '').join('|');
  return `${urlObj.pathname}?${urlObj.search}|${varyValues}`;
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

function generateETag(data: ArrayBuffer): string {
  // Simple hash for ETag
  const hash = hashCode(new Uint8Array(data));
  return `W/"${hash.toString(16)}"`;
}

function hashCode(bytes: Uint8Array): number {
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) - hash) + bytes[i];
    hash |= 0;
  }
  return hash;
}

export { matchPath };