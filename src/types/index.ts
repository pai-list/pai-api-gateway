/**
 * PAI API Gateway - Type Definitions
 * 
 * Core types for the API Gateway including request/response types,
 * JWT payload, rate limiting, and cache types.
 */

// JWT Token Payload
export interface JWTPayload {
  iss: string;          // Issuer
  aud: string;          // Audience
  sub: string;          // Subject (user ID)
  iat: number;          // Issued at
  exp: number;          // Expiration
  scope?: string[];     // Scopes/permissions
  role?: string;        // User role
  apiKeyId?: string;    // API key identifier
}

// Rate Limiting Types
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

export interface RateLimitKey {
  identifier: string;     // API key, IP, or user ID
  endpoint?: string;      // Specific endpoint or '*'
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
}

// Cache Types
export interface CacheConfig {
  ttlSeconds: number;
  maxSize?: number;
  staleWhileRevalidate?: number;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
}

// Rate Limiting Types
export interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per second
}

// Rate Limit Configuration by Tier
export const RATE_LIMIT_TIERS = {
  free: { rpm: 60, rph: 1000, burst: 10 },
  basic: { rpm: 120, rph: 5000, burst: 20 },
  pro: { rpm: 300, rph: 20000, burst: 50 },
  enterprise: { rpm: 1000, rph: 100000, burst: 200 },
} as const;

export type Tier = keyof typeof RATE_LIMIT_TIERS;

// JWT Configuration
export interface JWTConfig {
  issuer: string;
  audience: string;
  secret: string;
  algorithm: 'HS256' | 'RS256' | 'ES256';
  expiresIn: string; // e.g., '1h', '24h', '7d'
}

// API Key Types
export interface APIKey {
  id: string;
  name: string;
  prefix: string; // e.g., 'pai_'
  keyHash: string; // bcrypt hash
  tier: Tier;
  scopes: string[];
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  revoked: boolean;
  metadata?: Record<string, any>;
}

// Request/Response Types
export interface APIRequest extends Request {
  cf?: {
    country?: string;
    city?: string;
    continent?: string;
    latitude?: string;
    longitude?: string;
    postalCode?: string;
    metroCode?: string;
    region?: string;
    regionCode?: string;
    timezone?: string;
  };
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: ResponseMeta;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
  statusCode: number;
  requestId: string;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  version: string;
  rateLimit?: RateLimitInfo;
  cache?: CacheInfo;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface CacheInfo {
  hit: boolean;
  age?: number;
  etag?: string;
}

// Health Check Types
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  uptime: number;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  latencyMs?: number;
}

// Configuration Types
export interface GatewayConfig {
  upstream: UpstreamConfig;
  rateLimiting: RateLimitGlobalConfig;
  cache: CacheGlobalConfig;
  auth: AuthConfig;
  cors: CORSConfig;
  logging: LoggingConfig;
}

export interface UpstreamConfig {
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  healthCheckPath: string;
}

export interface RateLimitGlobalConfig {
  enabled: boolean;
  defaultTier: Tier;
  keyPrefix: string;
  excludePaths: string[];
}

export interface CacheGlobalConfig {
  enabled: boolean;
  defaultTTL: number;
  maxSize: number;
  cacheableMethods: string[];
  cacheableStatusCodes: number[];
  varyHeaders: string[];
}

export interface AuthConfig {
  jwt: JWTConfig;
  apiKeyHeader: string;
  jwtHeader: string;
  excludePaths: string[];
}

export interface CORSConfig {
  enabled: boolean;
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
  credentials: boolean;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  includeRequestBody: boolean;
  includeResponseBody: boolean;
  excludePaths: string[];
}

// Error Types
export class GatewayError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class ValidationError extends GatewayError {
  constructor(message: string, public details?: Record<string, any>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends GatewayError {
  constructor(message: string = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends GatewayError {
  constructor(message: string = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends GatewayError {
  constructor(public retryAfter: number) {
    super('RATE_LIMITED', 'Rate limit exceeded', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class UpstreamError extends GatewayError {
  constructor(message: string, public upstreamStatus: number) {
    super('UPSTREAM_ERROR', message, 502);
    this.name = 'UpstreamError';
  }
}

export class TimeoutError extends GatewayError {
  constructor(timeoutMs: number) {
    super('TIMEOUT', `Request timeout after ${timeoutMs}ms`, 504);
    this.name = 'TimeoutError';
  }
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Middleware Context
export interface MiddlewareContext {
  requestId: string;
  startTime: number;
  user?: JWTPayload;
  apiKey?: APIKey;
  rateLimitInfo?: RateLimitInfo;
  cacheInfo?: CacheInfo;
}

// Route Handler Type
export type RouteHandler = (request: Request, context: MiddlewareContext) => Promise<Response>;

// Cloudflare Worker Environment
export interface Env {
  // KV Namespaces
  PASSPORTS?: KVNamespace;
  CACHE?: KVNamespace;
  RATE_LIMIT?: KVNamespace;
  API_KEYS?: KVNamespace;
  
  // Durable Objects
  RATE_LIMIT_DO?: DurableObjectNamespace;
  TRUSTCHAIN_DO?: DurableObjectNamespace;
  
  // R2 Buckets
  R2_BUCKET?: R2Bucket;
  
  // D1 Databases
  D1_DB?: D1Database;
  
  // Vectorize
  VECTORIZEDB?: VectorizeIndex;
  
  // Workers AI
  AI?: any;
  
  // Secrets
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  SOVEREIGN_KEY_SALT: string;
  PI_API_KEY: string;
  PI_WEBHOOK_SECRET: string;
  
  // Config
  ENVIRONMENT: 'development' | 'staging' | 'production';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

export { Tier } from './index';