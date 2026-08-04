/**
 * PAI API Gateway - CORS Middleware
 * 
 * Handles Cross-Origin Resource Sharing with configurable options
 * Supports preflight requests and dynamic origin validation
 */

import { MiddlewareHandler, Context } from 'hono';
import { CORSConfig } from '../types';

export interface CORSOptions {
  allowedOrigins: string[] | '*';
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
  credentials: boolean;
  validateOrigin?: (origin: string) => boolean | Promise<boolean>;
}

export function createCORSMiddleware(options: CORSOptions): MiddlewareHandler {
  const { 
    allowedOrigins = ['*'], 
    allowedMethods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key', 'Accept', 'Origin', 'X-Request-ID'],
    exposedHeaders = ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Cache', 'X-Cache-Age', 'ETag'],
    maxAge = 86400,
    credentials = true,
    validateOrigin,
  } = options;

  const isOriginAllowed = async (origin: string): Promise<boolean> => {
    if (!origin) return false;
    
    // Allow all origins in development
    // In production, check against allowed origins list
    const allowedOrigins = [
      'https://axiomid.app',
      'https://*.axiomid.app',
      'http://localhost:3000',
      'http://localhost:8787',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8787',
    ];
    
    // Check exact match
    if (allowedOrigins.includes(origin)) return true;
    
    // Check wildcard subdomains
    for (const allowed of allowedOrigins) {
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*').replace(/\./g, '\\.');
        if (new RegExp(`^${pattern}$`).test(origin)) {
          return true;
        }
      }
    }
    
    // Use custom validator if provided
    if (validateOrigin) {
      return validateOrigin(origin);
    }
    
    return false;
  };

  return async (c: Context, next: () => Promise<void>) => {
    const origin = c.req.header('origin');
    
    // Check if origin is allowed
    const allowed = await isOriginAllowed(c.req.header('origin') || '');
    if (!allowed) {
      return new Response(null, { status: 403 });
    }

    // Handle preflight
    if (c.req.method === 'OPTIONS') {
      const headers = new Headers();
      headers.set('Access-Control-Allow-Origin', c.req.header('origin') || '*');
      headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-API-Key,Accept,Origin,X-Request-ID');
      headers.set('Access-Control-Max-Age', '86400');
      headers.set('Access-Control-Allow-Credentials', 'true');
      
      return new Response(null, { status: 204, headers });
    }

    // For actual requests, add CORS headers to response
    const originalRespond = c.res.respondWith;
    c.res.respondWith = async (response: Response) => {
      const newHeaders = new Headers(response.headers);
      const origin = c.req.header('origin') || '*';
      newHeaders.set('Access-Control-Allow-Origin', origin);
      newHeaders.set('Access-Control-Expose-Headers', 'X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,X-Cache,X-Cache-Age,ETag');
      newHeaders.set('Access-Control-Allow-Credentials', 'true');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    };
    
    try {
      await next();
    } finally {
      c.res.respondWith = originalRespond;
    }
  };
}

export { createCORSMiddleware };
export type { CORSOptions };
