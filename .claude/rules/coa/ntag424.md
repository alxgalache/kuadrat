---
paths:
  - "api/controllers/{coaController,coaAdminController}.js"
  - "api/routes/coaRoutes.js"
  - "api/routes/admin/coaRoutes.js"
  - "api/services/ntag424Service.js"
  - "client/app/{coa,admin/coa}/**"
  - "client/components/coa/**"
  - "scripts/nfc-personalization/**"
  - "docs/guia_ntag424_galeria.md"
---

## Certificates of Authenticity (NTAG 424 DNA)

Each artwork ships with a paper Certificate of Authenticity carrying a NTAG 424 DNA sticker. A tap with any phone resolves to a unique-per-read URL that the backend verifies cryptographically (PICC encrypted + truncated CMAC, SDM mode), proving authenticity and protecting against replay.

* **Public endpoint:** `GET /api/coa/verify?picc=<32hex>&cmac=<16hex>` → `{ status: ok | malformed | invalid_cmac | unknown_tag | revoked | replay }`. No auth, dedicated rate limit (`coaVerifyLimiter`).
* **Admin endpoints:** `GET /api/admin/coa/tags` (paginated list), `GET /api/admin/coa/tags/:uid` (detail + last N `verification_events`), `PATCH /api/admin/coa/tags/:uid/status` (revoke / lost / damaged with audit notes).
* **Public page:** `client/app/coa/page.js` (Server Component, `force-dynamic`). Calls the backend via `INTERNAL_API_URL` and renders success or failure with es-ES messages from `client/lib/constants.js`.
* **Tables:** `nfc_tags` (one row per **physical sticker**, FK to `art` with `ON DELETE RESTRICT`) and `verification_events` (audit log of every tap, including failed attempts; IPs stored as HMAC-SHA256).
* **Limited editions:** an artwork with `edition_size > 1` gets one sticker (one `nfc_tags` row) per copy, all sharing `art_id` — the schema always allowed it (PK is `uid`; `art_id` is not unique). `nfc_tags.edition_number` holds the copy number (NULL for unique works) and `serial_label` becomes `GAL-<year>-<artId>-<n>/<N>`. The paper certificate is a single shared design ("Edición limitada de N ejemplares") that the artist numbers by hand; the operator records the same number when personalizing. Each sticker keeps its own derived keys, anti-replay counter and `status`, so copies are revocable one by one. `/coa` shows "Edición Limitada. Ejemplar n de N".
* **Personalization scripts:** `scripts/nfc-personalization/` — separate Node.js subproject, ESM, **runs OUTSIDE Docker** (needs USB access to the ACR1552U reader). Uses the `ntag424` library (AGPL, internal use only) for the NTAG protocol; uses the same key derivation as the backend (`AES-CMAC(MASTER_KEY, label||UID||SYSTEM_ID)`). The "one active tag per artwork" guard is enforced there (not in the DB): it allows up to `edition_size` active tags and rejects a duplicate copy number.
* **Reference:** `docs/guia_ntag424_galeria.md` for the deep technical context.
