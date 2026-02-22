# Monorepo Project: "Kuadrat" - A Minimalist Online Art Gallery

## Project Overview

Kuadrat is a minimalist online marketplace for art, functioning as a virtual art gallery. Artists (Sellers) list their work and art enthusiasts (Buyers) purchase it. The dealer takes a commission on each sale. The project includes a RESTful API backend, NextJS frontend, real-time auctions, and live events/streaming, all managed within a dockerized monorepo.

## Technology Stack

* **Backend:** Express.js on Node.js 20
* **Database:** Turso (libsql/client, SQLite-compatible)
* **Frontend:** Next.js 16, React 19, JavaScript (no TypeScript), TailwindCSS, App Router
* **Auth:** Passport.js (passport-local + passport-jwt), JWT tokens
* **Payments:** Stripe (primary), Revolut (legacy support)
* **Real-time:** Socket.IO for auctions and event notifications
* **Streaming:** LiveKit for live events with guest access
* **Email:** Nodemailer with SMTP
* **Logging:** Pino (structured JSON in production, pretty in development)
* **Validation:** Zod schemas for API request validation
* **Containerization:** Docker and Docker Compose
* **Monitoring:** Sentry (client + server)

## Design Philosophy

* **Extreme Minimalism:** TailwindCSS components and UI Blocks, no modifications
* **Focus on Art:** Only images are the artworks themselves
* **Light Theme Only:** No dark mode
* **All Spanish UI text** (es-ES locale)

## Architecture

### Backend (`api/`)

```
api/
├── config/
│   ├── database.js      — DB schema (single source of truth, idempotent)
│   ├── env.js           — Centralized env config with validation
│   ├── logger.js        — Pino logger (JSON prod, pretty dev)
│   ├── passport.js      — JWT + Local auth strategies
│   └── shutdown.js      — Graceful shutdown handler
├── controllers/
│   ├── ordersController.js    — Order CRUD (largest controller)
│   ├── orders/index.js        — Re-export for future splitting
│   ├── paymentsController.js  — Revolut payment flow
│   ├── stripePaymentsController.js — Stripe payment flow
│   ├── artController.js       — Art product CRUD
│   ├── othersController.js    — Other products CRUD
│   ├── auctionController.js   — Public auction endpoints
│   ├── auctionAdminController.js — Admin auction management
│   ├── eventController.js     — Public event endpoints
│   ├── eventAdminController.js — Admin event management
│   ├── authController.js      — Login, register, password reset
│   ├── usersController.js     — User/author profiles
│   └── shippingController.js  — Shipping methods and zones
├── middleware/
│   ├── errorHandler.js    — ApiError class + global handler
│   ├── authorization.js   — JWT auth + role checks
│   ├── adminAuth.js       — Admin-only middleware
│   ├── rateLimiter.js     — 4-tier rate limiting (uses config/env.js)
│   ├── securityMiddleware.js — Prototype pollution, command injection, UA filter
│   ├── validate.js        — Zod schema validation middleware
│   ├── cache.js           — ETag + Cache-Control header middleware
│   └── timeout.js         — Request timeout middleware
├── routes/
│   ├── admin/             — Split admin routes (authenticate + adminAuth applied at index)
│   │   ├── index.js       — Main router, mounts sub-routes
│   │   ├── authorRoutes.js
│   │   ├── productRoutes.js
│   │   ├── orderRoutes.js
│   │   ├── shippingRoutes.js
│   │   ├── auctionRoutes.js
│   │   ├── eventRoutes.js
│   │   └── othersRoutes.js
│   ├── authRoutes.js, artRoutes.js, othersRoutes.js, ...
│   └── sellerRoutes.js, shippingRoutes.js, ...
├── services/
│   ├── emailService.js    — All email templates and sending
│   ├── email/index.js     — Re-export for future splitting
│   ├── stripeService.js   — Stripe API wrapper
│   ├── auctionService.js  — Auction business logic
│   ├── eventService.js    — Event CRUD + LiveKit
│   ├── livekitService.js  — LiveKit token generation
│   └── revolutService.js  — Revolut payment integration (legacy)
├── validators/            — Zod request validation schemas
│   ├── authSchemas.js
│   ├── orderSchemas.js
│   ├── productSchemas.js
│   ├── shippingSchemas.js
│   ├── auctionSchemas.js
│   └── eventSchemas.js
├── utils/
│   ├── transaction.js     — Turso batch/transaction wrapper
│   ├── response.js        — Standardized API response helpers
│   ├── htmlEscape.js      — HTML sanitization
│   └── paymentHelpers.js  — Currency conversion, VAT
├── socket/
│   ├── auctionSocket.js   — Real-time auction events
│   └── eventSocket.js     — Real-time event notifications
├── scheduler/
│   └── auctionScheduler.js — Cron job (every 30s) for auction lifecycle
└── server.js              — Express + Socket.IO + middleware stack
```

### Frontend (`client/`)

```
client/
├── app/                   — Next.js App Router pages
│   ├── admin/             — Admin dashboard (AuthGuard wrapper)
│   ├── galeria/           — Art gallery + product detail
│   ├── subastas/          — Auction pages
│   ├── espacios/          — Events/streaming pages
│   ├── orders/            — Customer order history
│   ├── seller/            — Seller dashboard
│   └── layout.js          — Root layout with providers
├── components/
│   ├── ErrorBoundary.js   — React error boundary with retry
│   ├── ShoppingCartDrawer.js — Cart checkout flow (3 steps)
│   ├── BidModal.js        — Auction bidding interface (9 phases)
│   ├── EventLiveRoom.js   — LiveKit video integration
│   ├── Navbar.js, AuthGuard.js, Notification.js, ...
│   └── cart/, auction/, events/ — Future sub-component directories
├── contexts/
│   ├── CartContext.js      — Cart state (useMemo/useCallback optimized)
│   ├── AuthContext.js      — User auth state
│   ├── NotificationContext.js
│   └── BannerNotificationContext.js
├── hooks/
│   ├── useDebounce.js     — Generic debounce hook
│   ├── usePostalCodeValidation.js — Shared postal validation
│   ├── useAuctionSocket.js — Socket.IO for auctions
│   ├── useEventSocket.js  — Socket.IO for events
│   └── useGalleryAuthors.js, useGalleryProducts.js
├── lib/
│   ├── api.js             — Centralized API client (1064 lines)
│   ├── api/index.js       — Re-export for future splitting
│   ├── constants.js       — App-wide constants (debounce, animation, cart)
│   ├── serverApi.js       — Server-side API calls
│   └── stripe.js          — Stripe.js promise loader
└── next.config.js         — Sentry, CSP headers, standalone output
```

## Key Patterns

### Backend Patterns

* **Structured Logging:** All files use `const logger = require('../config/logger')` (Pino). No `console.log` in production code.
* **Centralized Config:** All env vars accessed via `const config = require('../config/env')`. Validates required vars at startup.
* **Request Validation:** Zod schemas in `api/validators/`, applied via `validate()` middleware in routes.
* **Response Helpers:** `sendSuccess()`, `sendPaginated()`, `sendCreated()` from `api/utils/response.js`.
* **Error Handling:** `ApiError` class thrown in controllers, caught by global `errorHandler` middleware.
* **Transactions:** `createBatch()` from `api/utils/transaction.js` for atomic multi-table operations.
* **Caching:** `cacheControl()` middleware on public GET endpoints (art, others, authors).
* **Rate Limiting:** 4-tier via `config.rateLimit.*` (general, auth, sensitive, paymentVerification).
* **Graceful Shutdown:** SIGTERM/SIGINT handlers close HTTP, Socket.IO, log sequence.
* **Response Compression:** gzip via `compression` middleware (early in stack).

### Frontend Patterns

* **Performance:** CartContext uses `useMemo`/`useCallback` on all exposed functions.
* **Error Boundaries:** `<ErrorBoundary>` component for graceful failure handling.
* **Shared Hooks:** `useDebounce`, `usePostalCodeValidation` avoid duplicate logic.
* **Constants:** Magic numbers extracted to `lib/constants.js`.
* **API Client:** Centralized `lib/api.js` with request deduplication and global 401/429 handling.

## Database Schema Management

The database schema is defined in `api/config/database.js`. This file is the **single source of truth**.

**Key rules:**
* `initializeDatabase()` runs on every startup (idempotent via `IF NOT EXISTS`).
* Schema changes: update the `CREATE TABLE` statement directly, never add `ALTER TABLE` blocks.
* 25 tables, 30+ indexes (including performance indexes on orders, products, auctions, events).
* Orders auto-increment starts at 1000 (for fresh DBs).
* Postal codes imported from `api/migrations/ES.csv` (only when empty).

## Postal Code References (Polymorphic Pivot Tables)

Three pivot tables use a **polymorphic reference pattern**:
* `ref_type` — `'postal_code'` | `'province'` | `'country'`
* `postal_code_id` — set only when `ref_type = 'postal_code'`
* `ref_value` — province name or country code otherwise

## Environment Variables

All environment variables are validated at startup via `api/config/env.js`. See `api/.env.example` for full documentation. Key groups:
* **Application:** PORT, NODE_ENV, LOG_LEVEL, CLIENT_URL
* **Database:** TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
* **Auth:** JWT_SECRET, JWT_EXPIRES_IN
* **Email:** SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
* **Payments:** STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYMENT_PROVIDER
* **LiveKit:** LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
* **Rate Limiting:** GENERAL_RATE_LIMIT_*, AUTH_RATE_LIMIT_*, etc.
* **Business:** TAX_VAT_ES, DEALER_COMMISSION
