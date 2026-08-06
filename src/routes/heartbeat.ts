/**
 * Agent Heartbeat Routes
 * 
 * Handles agent heartbeat signals for distributed agent liveness tracking.
 * Implements pi-heartbeat.md specification.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { createRateLimitMiddleware } from '../middleware/rate-limit';

const heartbeatRoutes = new Hono();

// Heartbeat schema per pi-heartbeat.md spec
const HeartbeatSchema = z.object({
  status: z.enum(['ok', 'busy', 'offline', 'maintenance']),
  agentAxiomID: z.string().regex(/^did:axiomid:pi:[a-zA-Z0-9_-]+$/),
  timestamp: z.string().datetime(),
  nonce: z.string().min(1),
  network: z.enum(['pi-network', 'pi-testnet']),
  capabilities: z.array(z.string()).optional(),
  lastAction: z.string().optional(),
  load: z.number().min(0).max(1).optional(),
  uptime: z.number().int().nonnegative().optional(),
  version: z.string().optional(),
  signature: z.string().min(1), // Ed25519 signature of canonical payload
});

// In-memory nonce store (in production: Cloudflare KV with TTL)
const nonceStore = new Map<string, number>();

// Rate limiter: max 12 requests per minute per agent (1 per 5 sec, but heartbeat is every 10 min)
const heartbeatRateLimit = createRateLimitMiddleware({
  maxRequests: 12,
  windowMs: 60000,
  keyGenerator: (c) => {
    const agentDID = c.req.header('authorization')?.replace('DID ', '') || 
                     c.req.header('x-agent-did') || 
                     'anonymous';
    return `heartbeat:${agentDID}`;
  },
});

// Helper: Verify Ed25519 signature
async function verifyEd25519Signature(
  publicKeyBase64: string,
  message: Uint8Array,
  signatureBase64: string
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0)),
      { name: 'Ed25519' },
      true,
      ['verify']
    );
    
    const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      signature,
      message
    );
  } catch {
    return false;
  }
}

// Helper: Get agent public key from DID (in production: resolve from TrustChain/DID Registry)
async function getAgentPublicKey(agentDID: string): Promise<string | null> {
  // In production: resolve from TrustChain/DID Registry
  // For now, return a mock key for testing
  if (agentDID.startsWith('did:axiomid:pi:')) {
    // Generate a deterministic mock key for testing
    const encoder = new TextEncoder();
    const data = encoder.encode(agentDID);
    const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    );
    const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    return btoa(String.fromCharCode(...new Uint8Array(spki)));
  }
  return null;
}

// Helper: Create canonical payload for signing (all fields except signature, sorted keys)
function createCanonicalPayload(payload: Record<string, unknown>): Uint8Array {
  const { signature, ...payloadWithoutSig } = payload;
  const sortedKeys = Object.keys(payloadWithoutSig).sort();
  const canonical = sortedKeys.map(key => `${key}:${JSON.stringify(payloadWithoutSig[key])}`).join(',');
  return new TextEncoder().encode(canonical);
}

// Check nonce (replay protection)
function checkNonce(nonce: string): boolean {
  const now = Date.now();
  const expiry = nonceStore.get(nonce);
  
  if (expiry && expiry > Date.now()) {
    return false; // Nonce already used
  }
  
  // Store with 300s TTL (5 minutes)
  nonceStore.set(nonce, Date.now() + 300000);
  return true;
}

// Cleanup expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiry] of nonceStore.entries()) {
    if (expiry < Date.now()) {
      nonceStore.delete(nonce);
    }
  }
}, 60000);

// POST /api/v1/agents/heartbeat - Agent heartbeat endpoint
const HeartbeatSchema = z.object({
  status: z.enum(['ok', 'busy', 'offline', 'maintenance']),
  agentAxiomID: z.string().regex(/^did:axiomid:pi:[a-zA-Z0-9_-]+$/),
  timestamp: z.string().datetime(),
  nonce: z.string().min(1),
  network: z.enum(['pi-network', 'pi-testnet']),
  capabilities: z.array(z.string()).optional(),
  lastAction: z.string().optional(),
  load: z.number().min(0).max(1).optional(),
  uptime: z.number().int().nonnegative().optional(),
  version: z.string().optional(),
  signature: z.string().min(1),
});

export const heartbeatRoutes = new Hono();

// POST /api/v1/agents/heartbeat
export const heartbeatRoutes = new Hono()
  .post('/heartbeat', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = HeartbeatSchema.parse(body);
      
      const { agentAxiomID, timestamp, nonce, signature, ...payload } = parsed;
      
      // 1. Verify timestamp skew (±5 minutes = 300 seconds)
      const now = Date.now();
      const requestTime = new Date(timestamp).getTime();
      if (Math.abs(now - requestTime) > 300000) { // 5 minutes = 300 seconds
        throw new HTTPException(401, { message: 'Timestamp skew exceeds 5 minutes' });
      }
      
      // 2. Check nonce (replay protection)
      if (!checkNonce(nonce)) {
        throw new HTTPException(401, { message: 'Nonce already used or expired' });
      }
      
      // 3. Get agent public key
      const publicKey = await getAgentPublicKey(payload.agentAxiomID as string);
      if (!publicKey) {
        throw new HTTPException(404, { message: 'Agent not found or public key not resolved' });
      }
      
      // 3. Verify Ed25519 signature
      const canonicalPayload = createCanonicalPayload(payload);
      const isValid = await verifyEd25519Signature(
        publicKey,
        canonicalPayload,
        signature
      );
      
      if (!isValid) {
        throw new HTTPException(401, { message: 'Invalid signature' });
      }
      
      // 4. Store heartbeat in KV/Durable Object (in production)
      // For now, just log and return success
      console.log(`[Heartbeat] Agent ${agentAxiomID} status: ${status}, capabilities: ${capabilities?.join(', ')}`);
      
      return c.json({
        success: true,
        nextHeartbeat: 600, // seconds (10 minutes)
        serverTime: new Date().toISOString(),
      }, 200);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, { message: `Validation error: ${error.errors.map(e => e.message).join(', ')}` });
      }
      if (error instanceof HTTPException) throw error;
      throw new Error(`Heartbeat processing failed: ${error.message}`);
    }
  })
  .get('/heartbeat/status/:agentDID', async (c) => {
    // Get agent status (in production: query from KV/Durable Object)
    const agentDID = c.req.param('agentDID');
    
    if (!agentDID.startsWith('did:axiomid:pi:')) {
      throw new HTTPException(400, { message: 'Invalid agent DID format' });
    }
    
    // Mock response - in production query KV/Durable Object
    return c.json({
      success: true,
      data: {
        agentDID,
        status: 'ok',
        lastHeartbeat: new Date(Date.now() - 300000).toISOString(),
        capabilities: ['pi-transfer', 'text-analysis'],
        network: 'pi-network',
        load: 0.23,
        uptime: 86400,
      }
    });
  });

export default heartbeatRoutes;