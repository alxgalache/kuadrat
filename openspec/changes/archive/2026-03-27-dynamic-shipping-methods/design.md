## Context

The `sendcloudApiClient.js` already handles auth and HTTP calls to Sendcloud. The admin routes are mounted under `/api/admin/` with auth middleware applied in `routes/admin/index.js`.

## Goals / Non-Goals

**Goals:**
- Expose shipping methods from Sendcloud's API via a new admin endpoint.
- Replace static carrier list with dynamic shipping method list in the seller config form.
- Clean up the now-unnecessary Next.js Route Handler and env var.

**Non-Goals:**
- Migrating existing stored carrier codes to shipping method codes.
- Caching the Sendcloud response (can be added later if needed).
- Changing the DB column names (`preferred_carriers`/`excluded_carriers`).

## Decisions

### 1. Backend endpoint proxies to Sendcloud

Create `GET /api/admin/shipping-methods` in a new controller. It calls `sendcloudApiClient.request('POST', 'shipping-options', { body: { from_country_code: 'ES', to_country_code: 'ES' } })`, extracts `data[].code` and `data[].name`, and returns the simplified list.

### 2. Frontend calls backend instead of Next.js Route Handler

`SendcloudConfigSection` calls `adminAPI.getShippingMethods()` (which hits the new Express endpoint) instead of `fetch('/api/carriers')`. This keeps auth consistent and avoids duplicating Sendcloud credentials.

### 3. Remove Next.js Route Handler and env var

Delete `client/app/api/carriers/route.js` and remove `SENDCLOUD_CARRIER_OPTIONS` from `client/.env.example` and `client/.env.local`.

## Risks / Trade-offs

- **[Risk] Sendcloud API latency on form load** → Acceptable for admin page. Can add caching later if needed.
- **[Risk] Sendcloud API down** → Form still loads, just without shipping method checkboxes. Show a warning.
