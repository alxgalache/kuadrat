/**
 * Zod schemas for the Stripe Connect manual-payouts admin endpoints
 * (Change #2: stripe-connect-manual-payouts).
 *
 * Two VAT regimes are supported:
 *
 *   - `art_rebu`     → REBU 10% (art sales)
 *   - `standard_vat` → 21% (other products, events)
 *
 * A payout is always mono-regime: the admin picks one, previews the totals,
 * receives a short-lived `confirmation_token`, and then replays it to
 * `/execute` so we block double-clicks and cross-admin races.
 */
const { z } = require('zod');

const vatRegimeEnum = z.enum(['art_rebu', 'standard_vat']);

/**
 * Body schema for `POST /api/admin/payouts/:sellerId/preview`.
 *
 * `item_ids` and `event_attendee_ids` are optional — when both are omitted the
 * controller pays out *all* eligible items for the chosen regime; when present,
 * they restrict the payout to the given subset (admin manually deselected a
 * few items). `event_attendee_ids` is only meaningful for `standard_vat`
 * (Change #3: stripe-connect-events-wallet).
 */
const previewPayoutSchema = z.object({
  body: z.object({
    vat_regime: vatRegimeEnum,
    item_ids: z.array(z.number().int().positive()).optional(),
    event_attendee_ids: z.array(z.string().min(1)).optional(),
  }).strip(),
});

/**
 * Body schema for `POST /api/admin/payouts/:sellerId/execute`.
 *
 * `confirmation_token` is what the preview step returned. Without it (or
 * with a stale/unknown one) the controller refuses to execute.
 */
const executePayoutSchema = z.object({
  body: z.object({
    vat_regime: vatRegimeEnum,
    item_ids: z.array(z.number().int().positive()).optional(),
    event_attendee_ids: z.array(z.string().min(1)).optional(),
    confirmation_token: z.string().min(1, 'El token de confirmación es obligatorio'),
  }).strip(),
});

/**
 * Body schema for `POST /api/admin/payouts/withdrawals/:withdrawalId/mark-reversed`.
 *
 * Used when an admin reverses a transfer manually from the Stripe Dashboard
 * and we need the local row to reflect that state.
 */
const markReversedSchema = z.object({
  body: z.object({
    reversal_amount: z.number().positive('El importe debe ser mayor que cero'),
    reversal_reason: z.string().min(1, 'La razón de la reversión es obligatoria').max(500),
  }).strip(),
});

module.exports = {
  previewPayoutSchema,
  executePayoutSchema,
  markReversedSchema,
  vatRegimeEnum,
};
