/**
 * Cloudflare Worker: Vanity Subdomain → Passport Redirect
 *
 * Routes *.axiomid.app to axiomid.app/passport/[subdomain]
 * Example: amrikyy.axiomid.app → axiomid.app/passport/amrikyy
 * Apex domain (axiomid.app/*) passes through to Vercel origin.
 */

const PASSPORT_BASE = "https://axiomid.app/passport";
const VALID_SUBDOMAIN = /^[a-z0-9][a-z0-9-]{2,29}$/;

// Real proxied apps — must reach origin, never redirect.
// Source of truth: pai-docs/docs/protocols/edge-deployment.md (subdomain registry).
const PASSTHROUGH_SUBDOMAINS = new Set([
  // Consumer products
  "www", "gspace", "pai-website",
  // Protocol services (deployed or pending — origin decides, never passport)
  "aip", "auth", "earn", "jobs", "ppp", "mcp", "openid",
  "memory", "skills", "agdp", "docs", "pai-docs", "blog",
  // API / infrastructure behind own origin
  "api", "mail", "email",
]);

const RESERVED_SUBDOMAINS = new Set([
  "dashboard", "app", "status", "admin", "dev",
  "ftp", "ns1", "ns2", "smtp", "pop", "imap", "cdn", "assets",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const worker = {
  async fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
};

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const hostname = url.hostname;

  // Pass-through apex domain (axiomid.app) directly to origin (Vercel)
  if (hostname === "axiomid.app") {
    return fetch(request);
  }

  const parts = hostname.split(".");
  if (parts.length !== 3 || parts[1] !== "axiomid" || parts[2] !== "app") {
    // Non-matching subdomain: pass through to origin
    return fetch(request);
  }

  const subdomain = parts[0].toLowerCase();

  // Real proxied apps must reach their origin (Vercel) untouched
  if (PASSTHROUGH_SUBDOMAINS.has(subdomain)) {
    return fetch(request);
  }

  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return new Response(null, {
      status: 301,
      headers: { Location: "https://axiomid.app", ...CORS_HEADERS },
    });
  }

  if (!VALID_SUBDOMAIN.test(subdomain)) {
    return new Response("Invalid subdomain", { status: 400, headers: CORS_HEADERS });
  }

  return new Response(null, {
    status: 301,
    headers: { Location: `${PASSPORT_BASE}/${subdomain}`, ...CORS_HEADERS },
  });
}

export default worker;
