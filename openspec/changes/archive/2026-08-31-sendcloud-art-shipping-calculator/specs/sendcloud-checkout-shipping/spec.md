## ADDED Requirements

### Requirement: Buyer never sees a shipping option without a real rate

The checkout SHALL only offer shipping options whose Sendcloud quote carries a positive numeric total. An option that would ship the parcel for a displayed price of zero SHALL NOT be offered, regardless of whether it is the only option left.

#### Scenario: Mailbox letter option is not offered
- **WHEN** Sendcloud returns `sendcloud:letter` with a quote total of `"0"`
- **THEN** the option SHALL NOT appear in the buyer's shipping step

#### Scenario: Zero-priced option is not rescued by string coercion
- **WHEN** an option's quote total is the string `"0"`
- **THEN** the filtering SHALL treat it as no rate, comparing the parsed number rather than the truthiness of the string

#### Scenario: Oversized parcel with no valid option
- **WHEN** every returned option is filtered out because the parcel exceeds the carriers' limits
- **THEN** the seller group SHALL report that no delivery option is available, and SHALL NOT present a zero-cost fallback

### Requirement: Every shipment is insured for the value of its goods

Shipping options for `other` products SHALL always be quoted with insurance covering the value of the goods in the parcel, with no configuration able to disable it. This matches the treatment of `art` products: every shipment travels insured.

#### Scenario: Insurance always attached
- **WHEN** a buyer reaches the shipping step for a parcel of `other` products
- **THEN** the request to Sendcloud SHALL include `additional_insured_price` set to the parcel's total goods value, regardless of the seller's `user_sendcloud_configuration`

#### Scenario: Multi-item parcel insured for the sum of its contents
- **WHEN** a parcel groups several items, or several units of one item
- **THEN** the insured value SHALL be the sum of each item's price multiplied by its quantity

#### Scenario: Insurance appears in the quoted price the buyer pays
- **WHEN** an option is quoted for an insured parcel
- **THEN** the quoted total SHALL include the `insurance_price` breakdown item returned by Sendcloud, and that total SHALL be the amount charged to the buyer

#### Scenario: Shipping costs rise for store products
- **WHEN** the same parcel is quoted before and after this change
- **THEN** the quoted price SHALL be higher by the insurance premium, which is the accepted consequence of insuring every shipment

### Requirement: The buyer is never charged for insurance the parcel does not carry

When a buyer pays a quoted price that includes an insurance premium, the parcel announced to the carrier SHALL carry that same insured amount.

#### Scenario: Quoted insurance is announced
- **WHEN** an order is paid and its shipments are announced to Sendcloud
- **THEN** each announced parcel SHALL declare the insured value that was used to quote it

#### Scenario: Uninsured announcement is a defect
- **WHEN** a parcel is announced without `additional_insured_price` although its quote included an `insurance_price` item
- **THEN** this SHALL be treated as a defect, since the goods would travel uninsured after the buyer paid for coverage
