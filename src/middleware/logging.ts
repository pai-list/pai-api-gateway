/**
 * PAI API Gateway - Logging Middleware
 * 
 * Structured JSON logging with request/response details,
 * timing, and correlation IDs.
 */

import { MiddlewareHandler, Context } from 'hono';
import { LoggingConfig } from '../types';

export interface LoggingMiddlewareOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  includeRequestBody: boolean;
  includeResponseBody: boolean;
  excludePaths: string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  userAgent?: string;
  ip?: string;
  country?: string;
  userId?: string;
  apiKeyId?: string;
  error?: string;
  requestBody?: any;
  responseBody?: any;
}

export function createLoggingMiddleware(options: LoggingMiddlewareOptions): MiddlewareHandler {
  const { 
    level = 'info', 
    format = 'json', 
    includeRequestBody = false, 
    includeResponseBody = false, 
    excludePaths = ['/health', '/favicon.ico', '/robots.txt'],
    logLevel = 'info'
  } = options;

  const shouldLog = (level: string): boolean => {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(logLevel);
  };

  const formatLog = (entry: LogEntry): string => {
    if (format === 'json') {
      return JSON.stringify(entry);
    }
    return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.method} ${entry.path} ${entry.statusCode} ${entry.latencyMs}ms`;
  };

  const shouldExclude = (path: string): boolean => {
    return excludePaths.some(p => matchPath(p, path));
  };

  return async (c, next) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const path = new URL(c.req.url).pathname;

    // Skip logging for excluded paths
    if (shouldExclude(new URL(c.req.url).pathname)) {
      return next();
    }

    // Generate request ID
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('startTime', Date.now());

    // Extract request info
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';
    const country = c.req.header('cf-ipcountry') || 'unknown';

    // Capture request body if enabled
    let requestBody: any = undefined;
    if (includeRequestBody && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      try {
        const clonedReq = c.req.clone();
        const contentType = c.req.header('content-type') || '';
        if (contentType.includes('application/json')) {
          requestBody = await clonedReq.json();
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          requestBody = await clonedReq.formData();
        } else {
          requestBody = await clonedReq.text();
        }
      } catch {
        // Ignore body parsing errors
      }
    }

    const startTime = Date.now();

    try {
      await next();

      const latencyMs = Date.now() - startTime;
      const statusCode = c.res.status;

      // Capture response body if enabled
      let responseBody: any = undefined;
      if (includeResponseBody) {
        try {
          const clonedRes = c.res.clone();
          const contentType = c.res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const clonedRes = c.res.clone();
            const body = await clonedRes.json();
            responseBody = body;
          }
        } catch {
          // Ignore
        }
      }

      // Extract user info from context
      const user = c.get('user');
      const apiKey = c.get('apiKey');

      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
        requestId: crypto.randomUUID(),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        statusCode: c.res.status,
        latencyMs: Date.now() - startTime,
        userAgent: c.req.header('user-agent'),
        ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
        country: c.req.header('cf-ipcountry'),
        userId: (c.get('user') as any)?.sub || (c.get('user') as any)?.id,
        apiKeyId: (c.get('apiKey') as any)?.id,
        requestBody,
        responseBody: undefined, // Don't log response body by default for privacy
      };

      // Determine log level based on status code
      let level: LogEntry['level'] = 'info';
      if (c.res.status >= 500) level = 'error';
      else if (c.res.status >= 400) level = 'warn';

      if (shouldLog(level)) {
        console.log(JSON.stringify({
          ...logEntry,
          level,
        }));
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        requestId: crypto.randomUUID(),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        statusCode: 500,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        stack: (error as Error).stack,
      }));

      throw error;
    }
  };
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

// Simple logger utility
export const logger = {
  debug: (message: string, meta?: Record<string, any>) => {
    console.log(JSON.stringify({ level: 'debug', timestamp: new Date().toISOString(), message, ...meta }));
  },
  info: (message: string, meta?: Record<string, any>) => {
    console.log(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), message, ...meta }));
  },
  warn: (message: string, meta?: Record<string, any>) => {
    console.warn(JSON.stringify({ level: 'warn', timestamp: new Date().toISOString(), message, ...meta }));
  },
  error: (message: string, meta?: Record<string, any>) => {
    console.error(JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), message, ...meta }));
  },
};