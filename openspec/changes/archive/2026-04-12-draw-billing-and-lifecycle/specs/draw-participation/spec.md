## MODIFIED Requirements

### Requirement: Confirm payment stores stripe_customer_id
The draw payment confirmation flow SHALL pass and store the `stripe_customer_id` in `draw_authorised_payment_data` when confirming a SetupIntent.

#### Scenario: Frontend sends customerId during payment confirmation
- **WHEN** a participant confirms payment in `DrawParticipationModal.js`
- **THEN** the `handlePaymentSuccess` function calls `drawsAPI.confirmPayment(drawId, drawBuyerId, setupIntentId, stripeCustomerId)` including the `stripeCustomerId` obtained from the `setupStripePayment` step

#### Scenario: API client includes customerId in request body
- **WHEN** `drawsAPI.confirmPayment` is called with four parameters
- **THEN** the API client sends `{ setupIntentId, customerId }` in the request body to `POST /api/draws/:drawId/buyers/:buyerId/confirm-payment`

#### Scenario: Backend stores customerId in payment data
- **WHEN** the backend receives `customerId` in the confirm payment request body
- **THEN** the value is stored in `draw_authorised_payment_data.stripe_customer_id` for the corresponding draw buyer
