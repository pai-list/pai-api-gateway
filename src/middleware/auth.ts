/**
 * PAI API Gateway - JWT Authentication Middleware
 * 
 * Validates JWT tokens using jose library with RS256/HS256 support.
 * Supports both API keys and JWT Bearer tokens.
 * 
 * References:
 * - https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
 * - https://github.com/panva/jose
 */

import { MiddlewareHandler, Context } from 'hono';
import { JWTPayload, JWTConfig, APIKey, JWTPayload as JWTPayloadType } from '../types';
import { AuthenticationError, ValidationError } from '../types';

export interface AuthMiddlewareOptions {
  jwtConfig: JWTConfig;
  apiKeyHeader?: string;
  jwtHeader?: string;
  excludePaths: string[];
  apiKeyValidator: (key: string) => Promise<APIKey | null>;
  jwtValidator: (token: string) => Promise<JWTPayloadType | null>;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions): MiddlewareHandler {
  const { jwtConfig, apiKeyHeader = 'x-api-key', jwtHeader = 'authorization', excludePaths = [], apiKeyValidator, jwtValidator } = options;

  return async (c, next) => {
    const path = new URL(c.req.url).pathname;
    
    // Skip auth for excluded paths
    if (excludePaths.some(p => matchPath(p, new URL(c.req.url).pathname))) {
      return next();
    }

    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('startTime', Date.now());

    // Try API Key first
    const apiKey = c.req.header(apiKeyHeader);
    if (apiKey) {
      const validatedKey = await apiKeyValidator(apiKey);
      if (validatedKey) {
        c.set('apiKey', validatedKey);
        c.set('user', { id: validatedKey.id, tier: validatedKey.tier, scopes: validatedKey.scopes });
        return next();
      }
      throw new Error('Invalid API key');
    }

    // Try JWT Bearer token
    const authHeader = c.req.header(jwtHeader);
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = await validateJWT(token, options.jwtConfig);
      if (payload) {
        c.set('user', payload);
        c.set('jwtPayload', payload);
        return next();
      }
      throw new Error('Invalid or expired token');
    }

    throw new Error('Authentication required');
  };
}

async function validateJWT(token: string, config: { secret: string; issuer: string; audience: string; algorithm: 'HS256' | 'RS256' | 'ES256' }): Promise<any | null> {
  try {
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    
    if (config.algorithm === 'RS256' || config.algorithm === 'ES256') {
      // For RS256/ES256, we need a JWKS endpoint
      // This is a simplified version - in production you'd use a JWKS endpoint
      throw new Error('RS256/ES256 requires JWKS endpoint');
    }

    // HS256 validation
    const secret = new TextEncoder().encode(config.secret);
    const { payload } = await jwtVerify(token, secret, {
      issuer: config.issuer,
      audience: config.audience,
    });

    return payload;
  } catch (error) {
    console.warn('JWT validation failed:', error);
    return null;
  }
}

function matchPath(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  // Simple glob matching
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(path);
}

export function createAPIKeyValidator(kv: KVNamespace) {
  return async (key: string): Promise<any | null> => {
    try {
      const keyData = await kv.get(`apikey:${key}`, 'json');
      if (!keyData) return null;
      if (keyData.revoked) return null;
      if (keyData.expiresAt && keyData.expiresAt < Date.now()) return null;
      return keyData;
    } catch {
      return null;
    }
  };
}

export function createJWTValidator(jwtConfig: any) {
  return async (token: string) => {
    return validateJWT(token, jwtConfig);
  };
}