# PAI API Gateway

> **PAI API Gateway** — Cloudflare Worker API Gateway for the Pi Network Agent Infrastructure (PAI)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pai-list/pai-api-gateway)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.x-orange.svg)](https://hono.dev/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-Ready-orange.svg)](https://developers.cloudflare.com/workers/)

## Overview

The **PAI API Gateway** is the central entry point for the **PAI (Pi + AI) Agent Infrastructure**. Built on **Cloudflare Workers** with **Hono**, it provides a unified, performant, and secure API gateway for the PAI ecosystem — connecting AI agents, Pi Network services, and the AxiomID identity layer.

### Key Features

| Feature | Description |
|---------|-------------|
| 🔐 **Authentication** | JWT + API Key auth, Pi Network OAuth, AxiomID integration |
| ⚡ **Rate Limiting** | Distributed token-bucket via Durable Objects |
| 💾 **Caching** | Multi-layer caching (Cloudflare Cache API + Workers KV) |
| 🛡️ **Security** | JWT/API Key auth, CORS, rate limiting, secure headers |
| 💾 **Caching** | Multi-layer (Cache API + Workers KV) with ETag support |
| 📊 **Observability** | Structured logging, request tracing, health checks |
| 💰 **Payments** | Pi Network payments via ACP (Agent Commerce Protocol) |
| 🔌 **Extensible** | Modular middleware & route architecture |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PAI API GATEWAY                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Clients   │  │  Cloudflare │  │   Upstream APIs       │
│  │ (Pi Browser,│──►│   Workers   │──►│ (AxiomID, Pi Network)│
│  │  Agents)    │  │  (Edge)     │  │                       │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │               │                │                   │
│         ▼               ▼                ▼                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Cloudflare Workers Runtime              │   │
│  ├─────────────┬─────────────┬─────────────┬────────────┤   │
│  │   Auth      │ Rate Limit  │   Cache     │  Logging   │   │
│  │   (JWT/API) │  (DO + KV)  │ (Cache API) │  (Struct.) │   │
│  └─────────────┴─────────────┴─────────────┴────────────┘   │
│                      │                        │              │
│         ┌────────────▼────────────▼────────────▼────────┐   │
│         │           Durable Objects + D1 + KV + R2        │   │
│         │  Rate Limiter  │  KV Cache  │  D1 SQL  │  R2   │   │
│         └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### 🔐 Authentication & Authorization
- **JWT Bearer Tokens** — RS256/HS256 validation via `jose`
- **API Keys** — Scoped keys with tiered rate limits
- **Pi Network OAuth** — Native Pi Browser authentication flow
- **AxiomID Integration** — DID-based identity verification

### ⚡ Rate Limiting
- **Token Bucket Algorithm** via Durable Objects (globally consistent)
- **Tiered Limits**: Free (60 RPM) → Basic (120) → Pro (300) → Enterprise (1000)
- Per-endpoint and per-user configurable limits
- Burst allowance with token bucket algorithm

### 💾 Caching
- **Cloudflare Cache API** for edge responses
- **Workers KV** for distributed cache with TTL
- ETag/If-None-Match support
- Stale-while-revalidate support
- Cache invalidation via API

### 💰 Payments (ACP)
- **Pi Network Payments** via Agent Commerce Protocol (ACP)
- Payment creation, approval, webhooks
- Escrow support for agent-to-agent transactions
- Pi Network webhook handling

### 🔍 Observability
- Structured JSON logging with request IDs
- Request/response latency tracking
- Health checks (`/health`, `/health/ready`, `/health/live`)
- Request/response latency headers

---

## Quick Start

### Prerequisites
- Node.js 20+
- Cloudflare account with Workers paid plan (for Durable Objects)
- `wrangler` CLI installed (`npm install -g wrangler`)

### Local Development

```bash
# Clone and install
git clone https://github.com/pai-list/pai-api-gateway.git
cd pai-api-gateway
npm install

# Copy environment template
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your values

# Start dev server
npm run dev

# Run tests
npm test

# Type check
npm run check
```

### Environment Variables

Create `.dev.vars` (local) or set via `wrangler secret put`:

```bash
# Required
JWT_SECRET=your_jwt_secret_here
JWT_ISSUER=pai-api-gateway
JWT_AUDIENCE=pai-api-users

# Pi Network
PI_CLIENT_ID=your_pi_client_id
PI_CLIENT_SECRET=your_pi_client_secret

# Database (D1)
DB=your_d1_database_binding

# Cache (KV)
CACHE_KV=your_kv_namespace_binding
RATE_LIMIT_KV=your_rate_limit_kv_binding

# Upstream
UPSTREAM_URL=https://api.axiomid.app
```

### Deployment

```bash
# Staging
npm run deploy:staging

# Production
npm run deploy:production
```

---

## API Reference

### Base URL
```
Production:  https://api.axiomid.app
Staging:     https://api-staging.axiomid.app
Local:       http://localhost:8787
```

### Authentication
| Method | Header | Description |
|--------|--------|-------------|
| JWT | `Authorization: Bearer <token>` | JWT Bearer token |
| API Key | `X-API-Key: <key>` | Scoped API key |

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | ✅ Public | Health check |
| `GET` | `/health/ready` | ✅ Public | Readiness probe |
| `GET` | `/health/live` | ✅ Public | Liveness probe |
| `POST` | `/api/v1/auth/login` | ✅ Public | User login |
| `POST` | `/api/v1/auth/register` | ✅ Public | User registration |
| `POST` | `/api/v1/auth/refresh` | ✅ Public | Refresh access token |
| `POST` | `/api/v1/auth/pi/callback` | ✅ Public | Pi OAuth callback |
| `GET` | `/api/v1/auth/pi/url` | ✅ Public | Pi OAuth URL |
| `GET` | `/api/v1/users/me` | 🔐 Required | Current user profile |
| `PUT` | `/api/v1/users/me` | 🔐 Required | Update profile |
| `GET` | `/api/v1/skills` | 🔐 Required | Search skills |
| `GET` | `/api/v1/skills/:id` | 🔐 Required | Get skill details |
| `POST` | `/api/v1/skills` | 🔐 Required | Install skill |
| `PUT` | `/api/v1/skills/:id` | 🔐 Required | Update skill |
| `DELETE` | `/api/v1/skills/:id` | 🔐 Required | Uninstall skill |
| `POST` | `/api/v1/payments` | 🔐 Required | Create payment |
| `GET` | `/api/v1/payments/:id` | 🔐 Required | Get payment status |
| `POST` | `/api/v1/payments/webhook` | 🔐 Pi webhook | Pi Network webhook |

### Authentication
```bash
# JWT Bearer Token
Authorization: Bearer <jwt_token>

# API Key
X-API-Key: pai_live_xxxxxxxxxxxxx
```

---

## Project Structure

```
pai-api-gateway/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── types.ts                 # TypeScript types & Env interface
│   ├── middleware/
│   │   ├── auth.ts              # JWT/API Key auth
│   │   ├── rate-limit.ts        # Rate limiting (DO + KV)
│   │   ├── cache.ts             # Cache middleware
│   │   ├── cors.ts              # CORS handling
│   │   ├── logging.ts           # Structured logging
│   ├── routes/
│   │   ├── api.ts               # Main API router
│   │   ├── auth.ts              # Auth endpoints
│   │   ├── health.ts            # Health checks
│   │   ├── api.ts               # Main API router
│   │   ├── auth.ts              # Auth endpoints
│   │   ├── health.ts            # Health checks
│   │   ├── skills.ts            # Skills marketplace
│   │   ├── payments.ts          # Pi Network payments
│   │   └── users.ts             # User management
│   ├── middleware/
│   │   ├── auth.ts              # JWT/API Key validation
│   │   ├── rate-limit.ts        # Rate limiting (DO + KV)
│   │   ├── cache.ts             # Response caching
│   │   ├── cors.ts              # CORS handling
│   │   ├── logging.ts           # Structured logging
│   ├── routes/
│   │   ├── api.ts               # Main API router
│   │   ├── auth.ts              # Auth endpoints
│   │   ├── health.ts            # Health checks
│   │   ├── skills.ts            # Skills marketplace
│   │   ├── payments.ts          # Pi Network payments
│   │   └── users.ts             # User management
│   ├── types.ts                 # TypeScript types & Env
│   └── index.ts                 # Worker entry point
├── wrangler.jsonc               # Cloudflare Workers config
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .dev.vars.example
```

---

## Deployment

### Prerequisites
1. Cloudflare account with Workers Paid plan (for Durable Objects)
2. `wrangler` CLI installed (`npm install -g wrangler`)
3. Cloudflare API token with Workers permissions

### Deploy to Staging
```bash
npm run deploy:staging
# or
wrangler deploy --env staging
```

### Deploy to Production
```bash
npm run deploy:production
# or
wrangler deploy --env production
```

### Custom Domain Setup
The `wrangler.jsonc` already includes the custom domain route:
```json
"routes": [
  { "pattern": "api.axiomid.app/*", "zone_name": "axiomid.app" }
]
```
After deployment, verify DNS in Cloudflare dashboard points to the Worker.

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Type check
npm run check

# Lint
npm run lint
```

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Hono** | Lightweight, fast, typed, Cloudflare-native |
| **Durable Objects** | Rate limiting (global consistency) |
| **Workers KV** | Distributed caching, rate limit storage |
| **D1** | Structured data (payments, users) |
| **R2** | Large object storage (archives, logs) |
| **Vectorize** | Semantic search for skills |
| **Workers AI** | Embeddings for semantic search |
| **Cloudflare Cache API** | Edge response caching |
| **Workers KV** | Distributed caching, rate limit counters |

---

## Security

- **Rate Limiting**: Token bucket via Durable Objects (global consistency)
- **JWT**: RS256/HS256 via `jose` library
- **API Keys**: Scoped, revocable, tiered limits
- **Pi Network OAuth**: Native Pi Browser integration
- **CSP Headers**: Strict CSP with nonce support
- **Security Headers**: HSTS, CSP, X-Frame-Options, etc.
- **CORS**: Configurable per environment

---

## Monitoring & Debugging

- **Health Checks**: `/health`, `/health/ready`, `/health/live`
- **Metrics**: `/health/metrics` (Prometheus-compatible)
- **Logs**: Structured JSON via `console.log` (Cloudflare Workers Logs)
- **Request Tracing**: `X-Request-ID` header propagation
- **Error Tracking**: Structured error responses with request IDs

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Style
- TypeScript strict mode
- ESLint + Prettier
- Conventional Commits
- 100% type coverage target

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/pai-list/pai-api-gateway/issues)
- **Discussions**: [GitHub Discussions](https://github.com/pai-list/pai-api-gateway/discussions)
- **Discord**: [PAI Community](https://discord.gg/pai-universe)
- **Docs**: [docs.axiomid.app](https://docs.axiomid.app)

---

## Related Repositories

| Repository | Description |
|------------|-------------|
| [pai-list/pai-memory](https://github.com/pai-list/pai-memory) | 7-layer agent memory |
| [pai-list/pai-agent-kit](https://github.com/pai-list/pai-agent-kit) | Agent framework |
| [pai-list/axiomid](https://github.com/pai-list/axiomid) | Identity primitive |
| [pai-list/pai-mcp](https://github.com/pai-list/pai-mcp) | MCP server |

---

**Built with ❤️ by the PAI Team**  
**Part of the [PAI Universe](https://github.com/pai-list)**

---

*Part of the PAI (Pi + AI) ecosystem — Building the agent economy on Pi Network.*