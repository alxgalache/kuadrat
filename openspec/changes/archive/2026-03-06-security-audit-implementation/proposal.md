## Why

The application currently has a critical race condition vulnerability in the product purchase flow: two concurrent buyers can both successfully create orders for the same unique art item because the `is_sold` check and order creation are not atomic. Additionally, a comprehensive security audit is needed to identify and close any client-side manipulation vectors (price tampering, parameter injection, unauthorized state changes) across the entire API surface.

## What Changes

- Implement optimistic locking or atomic inventory reservation in the `placeOrder` flow to prevent race conditions on `is_sold` for art items and stock for other products
- Audit and harden all API endpoints against client-side manipulation: price tampering, unauthorized field modification, SQL injection vectors, and parameter abuse
- Add server-side re-validation of critical fields (prices, quantities, product status) at every trust boundary, not just at payment intent creation
- Strengthen order creation to atomically check and reserve inventory within a single batch transaction
- Review and tighten Zod validation schemas to reject unexpected or dangerous fields across all endpoints

## Capabilities

### New Capabilities

- `concurrent-purchase-protection`: Atomic inventory reservation using Turso batch transactions to prevent race conditions when multiple users attempt to purchase the same product simultaneously. Covers both `art` (unique items with `is_sold`) and `others` (stock-based items) tables.
- `api-input-hardening`: Comprehensive server-side validation hardening across all API endpoints to prevent client-side manipulation attacks including price tampering, unauthorized status changes, parameter injection, and field abuse.

### Modified Capabilities

_None — no existing spec-level requirements are changing._

## Impact

- **Backend controllers**: `ordersController.js` (placeOrder flow), `stripePaymentsController.js` (payment confirmation), `paymentsController.js` (Revolut confirmation)
- **Backend utils**: `transaction.js` (may need conditional batch support)
- **Backend validators**: `orderSchemas.js` and potentially other Zod schemas across `api/validators/`
- **Backend middleware**: Potential additions to `securityMiddleware.js` for stricter field filtering
- **Database**: `api/config/database.js` — potential schema additions (e.g., version/lock columns on `art` and `others` tables)
- **No frontend changes expected** — all fixes are server-side hardening
- **No breaking API changes** — responses remain the same; only server-side enforcement changes
