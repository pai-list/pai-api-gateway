/**
 * AIP DID Verification Middleware
 * 
 * Verifies AIP DID-based authentication using Ed25519 signatures
 * instead of traditional API keys or Bearer tokens.
 * Implements AIP (Axiom Identity Protocol) authentication.
 */

import { MiddlewareHandler, Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export interface AIPAuthOptions {
  excludePaths: string[];
  didResolver: (did: string) => Promise<{ publicKey: string; metadata: Record<string, unknown> } | null>;
  timestampSkewMs?: number;
  nonceStore?: Map<string, number>;
}

interface AIPAuthPayload {
  agentAxiomID: string;
  timestamp: string;
  nonce: string;
  // ... other fields
}

interface AIPAuthHeaders {
  authorization: string; // "DID did:axiomid:pi:..."
  'x-signature': string; // base64 Ed25519 signature
  'x-timestamp': string; // ISO timestamp
  'x-nonce': string; // unique nonce
  'x-agent-did'?: string; // alternative header for agent DID
}

const nonceStore = new Map<string, number>();

function checkNonce(nonce: string): boolean {
  const now = Date.now();
  const expiry = nonceStore.get(nonce);
  
  if (expiry && expiry > Date.now()) {
    return false;
  }
  
  nonceStore.set(nonce, Date.now() + 300000); // 5 min TTL
  return true;
}

function createCanonicalPayload(payload: Record<string, unknown>): Uint8Array {
  const { signature, ...payloadWithoutSig } = payload;
  const sortedKeys = Object.keys(payloadWithoutSig).sort();
  const canonical = sortedKeys.map(key => `${key}:${JSON.stringify(payloadWithoutSig[key])}`).join(',');
  return new TextEncoder().encode(canonical);
}

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

function createCanonicalPayload(payload: Record<string, unknown>): Uint8Array {
  const { signature, ...payloadWithoutSig } = payload;
  const sortedKeys = Object.keys(payloadWithoutSig).sort();
  const canonical = sortedKeys.map(key => `${key}:${JSON.stringify(payloadWithoutSig[key])}`).join(',');
  return new TextEncoder().encode(canonical);
}

function checkNonce(nonce: string): boolean {
  const now = Date.now();
  const expiry = nonceStore.get(nonce);
  
  if (expiry && expiry > now) {
    return false;
  }
  
  nonceStore.set(nonce, Date.now() + 300000); // 5 min TTL
  return true;
}

export function createAIPAuthMiddleware(options: AIPAuthOptions) {
  const { 
    excludePaths = [], 
    didResolver, 
    timestampSkewMs = 300000, // 5 minutes
    nonceStore: customNonceStore 
  } = options;

  const store = customNonceStore || new Map<string, number>();
  
  const checkNonce = (nonce: string): boolean => {
    const now = Date.now();
    const expiry = store.get(nonce);
    if (expiry && expiry > Date.now()) return false;
    store.set(nonce, Date.now() + 300000);
    return true;
  };

  return async (c: Context, next: () => Promise<void>) => {
    const path = new URL(c.req.url).pathname;
    
    // Skip auth for excluded paths
    if (excludePaths.some(p => matchPath(p, new URL(c.req.url).pathname))) {
      return next();
    }

    // Extract AIP auth headers
    const authHeader = c.req.header('authorization');
    const signature = c.req.header('x-signature');
    const timestamp = c.req.header('x-timestamp');
    const nonce = c.req.header('x-nonce');
    const agentDID = c.req.header('x-agent-did') || c.req.header('authorization')?.replace('DID ', '');

    // Validate headers
    if (!authHeader?.startsWith('DID ')) {
      throw new HTTPException(401, { message: 'Missing or invalid Authorization header. Expected: "DID did:axiomid:pi:..."' });
    }
    
    if (!signature) {
      throw new HTTPException(401, { message: 'Missing X-Signature header (Ed25519 signature)' });
    }
    
    if (!timestamp) {
      throw new HTTPException(400, { message: 'Missing X-Timestamp header (ISO timestamp)' });
    }
    
    if (!nonce) {
      throw new HTTPException(400, { message: 'Missing X-Nonce header (unique nonce)' });
    }

    const agentDID = authHeader.replace('DID ', '').trim();
    
    // Validate DID format
    if (!agentDID.startsWith('did:axiomid:pi:')) {
      throw new HTTPException(400, { message: 'Invalid DID format. Expected: did:axiomid:pi:<uid>' });
    }

    // 1. Verify timestamp skew
    const now = Date.now();
    const requestTime = new Date(timestamp).getTime();
    if (isNaN(requestTime) || Math.abs(Date.now() - requestTime) > 300000) { // 5 min
      throw new HTTPException(401, { message: 'Timestamp skew exceeds 5 minutes' });
    }

    // 2. Check nonce (replay protection)
    if (!checkNonce(nonce)) {
      throw new HTTPException(401, { message: 'Nonce already used or expired' });
    }

    // 3. Resolve DID to get public key
    const didDoc = await resolveDID(agentDID);
    if (!didDoc || !didDoc.publicKey) {
      throw new HTTPException(404, { message: 'DID not found or no public key' });
    }

    // 4. Verify Ed25519 signature
    const canonicalPayload = createCanonicalPayload({ agentDID, timestamp, nonce });
    const isValid = await verifyEd25519Signature(didDoc.publicKey, canonicalPayload, signature);
    
    if (!isValid) {
      throw new HTTPException(401, { message: 'Invalid Ed25519 signature' });
    }

    // 3. Attach agent context
    c.set('agentDID', agentDID);
    c.set('agentPublicKey', didDoc.publicKey);
    c.set('agentMetadata', didDoc.metadata || {});

    await next();
  };
}

// Helper functions
function matchPath(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('*')) {
    return path.startsWith(pattern.slice(0, -1));
  }
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(path);
}

async function resolveDID(did: string): Promise<{ publicKey: string; metadata: Record<string, unknown> } | null> {
  // In production: resolve from TrustChain/DID Registry
  // For now, return mock
  if (did.startsWith('did:axiomid:pi:')) {
    return {
      publicKey: 'mock_public_key_base64',
      metadata: { trustScore: 85, capabilities: ['pi-transfer', 'text-analysis'] }
    };
  }
  return null;
}

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

function createCanonicalPayload(payload: Record<string, unknown>): Uint8Array {
  const { signature, ...payloadWithoutSig } = payload;
  const sortedKeys = Object.keys(payloadWithoutSig).sort();
  const canonical = sortedKeys.map(key => `${key}:${JSON.stringify(payloadWithoutSig[key])}`).join(',');
  return new TextEncoder().encode(canonical);
}

function matchPath(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('*')) {
    return path.startsWith(pattern.slice(0, -1));
  }
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(path);
}

export { createAIPAuthMiddleware };