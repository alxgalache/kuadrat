---
name: Stripe Connect master plan exists
description: A canonical reference doc for the entire Stripe Connect initiative lives in the repo at docs/stripe_connect/master_plan.md
type: project
---

**Fact:** The repo contains a comprehensive Stripe Connect master plan at `docs/stripe_connect/master_plan.md` that captures every decision, the full schema, the 4-change OpenSpec roadmap, the V2 API recipes, the wallet split design, the fiscal regime mapping (REBU vs estándar), and the public branding rules.

**Why:** During the `/opsx:explore @docs/stripe_connect/init.md` exploration in 2026-04-08, the conversation went deep across many rounds and the user warned that auto-compact could erase context. The master plan was created on disk as a deliberate mitigation so future conversations could reload the canonical context losslessly.

**How to apply:**
- ANY task related to Stripe Connect (cuentas conectadas, monedero/wallet, payouts, transfers, autofactura, REBU, gestoría export, fiscal report) → **read `docs/stripe_connect/master_plan.md` first** before proposing or implementing anything.
- The master plan is the source of truth. If a current observation conflicts with it, the code wins — but verify and update the plan.
- The 4 changes are: `stripe-connect-accounts` (#1), `stripe-connect-manual-payouts` (#2), `stripe-connect-events-wallet` (#3), `stripe-connect-fiscal-report` (#4). They are independent and ordered.
- The plan includes a §13 changelog — if you make significant updates, append an entry there.
- The plan was written in Spanish (the project language); section headings are in Spanish too.
- Public branding rule (already a separate memory): never use "Kuadrat" in user-facing content; use "140d Galería de Arte". The master plan repeats this rule in §1.
