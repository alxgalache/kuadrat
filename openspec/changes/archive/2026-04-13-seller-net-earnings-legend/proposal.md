## Why

Sellers have no visibility into how much they'll actually earn from a sale after commissions and taxes. When setting a price for their product, they must mentally calculate the gallery commission and applicable VAT to understand their net income. This creates uncertainty and friction, especially given the two different fiscal regimes (REBU for art, general for others). Showing the net amount in real-time while they set the price improves transparency and trust.

## What Changes

- Add two new client environment variables (`NEXT_PUBLIC_TAX_VAT_ES`, `NEXT_PUBLIC_TAX_VAT_ART_ES`) to expose VAT rates to the frontend.
- Add one new API environment variable (`TAX_VAT_ART_ES`) for the reduced art VAT rate (the general rate `TAX_VAT_ES` already exists).
- Add a dynamic legend below the price input in the seller publish form that calculates and displays the seller's net earnings in real-time, using different formulas for art (REBU) and others (general regime).
- Propagate the new client env vars through Docker and docker-compose infrastructure files.

## Capabilities

### New Capabilities
- `seller-net-earnings-preview`: Real-time net earnings calculation and display below the price input in the seller publish form, with per-product-type fiscal logic (REBU for art, general regime for others).

### Modified Capabilities
_(none — no existing spec-level behavior changes)_

## Impact

- **Frontend:** `client/app/seller/publish/page.js` — new computed legend below price input.
- **Environment:** New env vars in `client/.env.example`, `api/.env.example`, `api/config/env.js`, Docker files (`client/Dockerfile.staging`, `client/Dockerfile.prod`), and docker-compose files (`docker-compose.m1.yml`, `docker-compose.pre2.yml`, `docker-compose.prod.yml`).
- **No backend logic changes** — this is purely a frontend display feature. The new API env var is added for consistency and future use, but no controller/service code changes.
