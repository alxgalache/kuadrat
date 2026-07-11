# seller-wallet (MODIFIED)

## MODIFIED Requirements

### Requirement: Wallet split into two VAT buckets
The seller wallet SHALL be split into two columns reflecting the fiscal regime of the underlying sale:
- `available_withdrawal_art_rebu REAL NOT NULL DEFAULT 0` — credits originating from `art_order_items` whose snapshotted `vat_regime` is `'art_rebu'`.
- `available_withdrawal_standard_vat REAL NOT NULL DEFAULT 0` — credits originating from `other_order_items`, `event_attendees` and `art_order_items` whose snapshotted `vat_regime` is `'standard_vat'` (art sold by sellers invoicing at the standard rate, e.g. via a cooperative).

The bucket for an art item SHALL be chosen from `COALESCE(vat_regime, 'art_rebu')` on the item row — never from the seller's current `tax_vat_art` — so credits and later debits/withdrawals always agree. Debits (order cancellation / refund flows) SHALL target the same bucket the item credited. The legacy `available_withdrawal` column is retained as deprecated, set to 0 for all users after the migration, and is not written to by any new code path.

#### Scenario: Confirmation scheduler credits the correct bucket
- **GIVEN** an art order item with `vat_regime = 'art_rebu'` that crosses the auto-confirmation threshold
- **WHEN** the confirmation scheduler runs
- **THEN** `users.available_withdrawal_art_rebu` is incremented by `(price - commission)` for the seller of that item
- **AND** `users.available_withdrawal_standard_vat` is unchanged
- **AND** the legacy `available_withdrawal` column is unchanged

#### Scenario: Standard-regime art item credits the standard bucket
- **GIVEN** an art order item with `vat_regime = 'standard_vat'` (cooperative artist)
- **WHEN** the item is confirmed (by seller, by buyer, or by the auto-confirmation scheduler)
- **THEN** `users.available_withdrawal_standard_vat` is incremented by `(price - commission)`
- **AND** `users.available_withdrawal_art_rebu` is unchanged

#### Scenario: Manual status change credits the correct bucket
- **GIVEN** an admin marks an `other_order_items` row as confirmed via `PATCH /api/orders/:orderId/items/:itemId/status`
- **WHEN** the handler runs
- **THEN** `users.available_withdrawal_standard_vat` is incremented for the seller
- **AND** `users.available_withdrawal_art_rebu` is unchanged

#### Scenario: Cancellation debits the bucket the item credited
- **GIVEN** a confirmed art order item with `vat_regime = 'standard_vat'` whose earning was credited to the standard bucket
- **WHEN** the order (or the item) is cancelled/refunded through the debit flows
- **THEN** the amount is debited from `available_withdrawal_standard_vat`
- **AND** `available_withdrawal_art_rebu` is unchanged

### Requirement: Seller dashboard surfaces both balances
The seller dashboard (Monedero) SHALL display both balances with their regime labels in es-ES ("Arte (REBU)" and "Productos y servicios (21%)") plus a combined total. When the wallet endpoint reports `artVatRegime = 'standard_vat'` for the seller, the standard bucket SHALL additionally display a note in es-ES indicating that the seller's artworks accrue there (e.g. "Incluye tus obras de arte (IVA 21%)"), since their new art sales no longer feed the REBU bucket.

#### Scenario: Seller with credits in both buckets
- **GIVEN** a seller with `available_withdrawal_art_rebu = 120` and `available_withdrawal_standard_vat = 80`
- **WHEN** the seller opens their dashboard
- **THEN** they see the REBU bucket at "120.00 €", the standard bucket at "80.00 €", and a combined total "200.00 €"

#### Scenario: Cooperative artist sees the art note on the standard bucket
- **GIVEN** a seller whose `tax_vat_art` is `21` (wallet returns `artVatRegime = 'standard_vat'`)
- **WHEN** the seller opens their dashboard
- **THEN** the standard bucket shows the note that their artworks are included there
- **AND** the REBU bucket keeps showing any legacy REBU balance

#### Scenario: Author artist sees no extra note
- **GIVEN** a seller whose `tax_vat_art` is `10`
- **WHEN** the seller opens their dashboard
- **THEN** the buckets render exactly as before this change, with no additional note
