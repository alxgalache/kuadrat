---
name: Public brand name vs. internal project name
description: "Kuadrat" is internal/dev only — all user-facing text must use "140d Galería de Arte"
type: feedback
---

**Rule:** "Kuadrat" is the private/internal name of the project. Any content that will be seen by a human outside the dev team MUST use **"140d Galería de Arte"** instead.

**Why:** The user explicitly clarified this during the stripe-connect exploration conversation (2026-04-08). The project has distinct internal vs. public identities, and leaking the internal name to buyers/sellers/tax advisors/Stripe would be wrong.

**How to apply:**
- Use "140d Galería de Arte" (or short form "140d") in:
  - All UI strings (labels, buttons, headings, Spanish copy)
  - All email templates sent to buyers, sellers, admins, or gestoría
  - Invoice PDFs and fiscal documents
  - Stripe `statement_descriptor` (short form, uppercase, no accents → e.g. `140D GALERIA ARTE`)
  - Stripe transfer `description` field
  - Webhook payload descriptions
  - Any public documentation or reports (including the fiscal report for the gestoría)
  - Meta tags, OG tags, page titles, SEO content
  - Branding configured in the Stripe Dashboard (Connect settings, receipts, etc.)
- Keep "Kuadrat" in:
  - Source code (variable names, file names, class names)
  - Internal log messages
  - Git commit messages
  - CLAUDE.md and other internal dev docs
  - Package names (package.json `"name"` etc.)

When in doubt: if a non-developer will see the string, use "140d Galería de Arte".
