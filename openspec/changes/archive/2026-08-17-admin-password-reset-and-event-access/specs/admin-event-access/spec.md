## ADDED Requirements

### Requirement: Admin event access endpoint

The system SHALL provide `POST /api/events/:id/admin-access`, requiring a valid JWT whose `role` is `admin`, which returns `{ attendeeId, accessToken }` for the calling admin on that event without any registration, OTP verification or payment.

The endpoint SHALL find-or-create a row in `event_attendees` for the admin, keyed on `(event_id, email)` where the email is the admin's `users.email`, with:
- `first_name` / `last_name` derived from the admin's `users.full_name`
- `is_staff = 1`
- `email_verified = 1` — the JWT already proves the identity
- `status = 'registered'`, never `'paid'`

It SHALL issue a fresh access token on every call and store only its SHA-256 in `access_token_hash`, matching how `verifyAttendeePassword` treats returning attendees. The plaintext token exists only in the response.

The endpoint SHALL NOT set `amount_paid`, and SHALL NOT grant host privileges.

#### Scenario: Admin obtains access to a free event
- **WHEN** an admin calls `POST /api/events/:id/admin-access` on a free event
- **THEN** the API SHALL return 200 with `attendeeId` and `accessToken`
- **AND** an `event_attendees` row SHALL exist with `is_staff = 1` and `status = 'registered'`

#### Scenario: Admin obtains access to a paid event without paying
- **WHEN** an admin calls the endpoint on an event whose `access_type` is `paid`
- **THEN** the API SHALL return 200
- **AND** no Stripe PaymentIntent SHALL be created
- **AND** `amount_paid` SHALL remain NULL

#### Scenario: Repeated calls reuse the same attendee row
- **WHEN** an admin calls the endpoint twice for the same event
- **THEN** exactly one `event_attendees` row SHALL exist for that admin and event
- **AND** the second call SHALL return a new `accessToken` that supersedes the first

#### Scenario: Non-admin is refused
- **WHEN** an authenticated seller or buyer calls the endpoint
- **THEN** the API SHALL return 403
- **AND** no `event_attendees` row SHALL be created

#### Scenario: Unauthenticated request is refused
- **WHEN** the endpoint is called without a JWT
- **THEN** the API SHALL return 401

#### Scenario: Event does not exist
- **WHEN** an admin calls the endpoint with an unknown event id
- **THEN** the API SHALL return 404

### Requirement: Staff attendees bypass the payment gate on token issuance

`getViewerToken`, `renewToken`, `getWhiteboardToken` and `getVideoToken` SHALL skip the `status IN ('paid','joined')` check when the resolved attendee has `is_staff = 1`. Every other check — event exists, event active, room available, email ban, IP ban — SHALL apply unchanged.

#### Scenario: Staff attendee gets a viewer token on a paid event
- **WHEN** the admin's attendee session is presented to `POST /api/events/:id/token` for a paid, active event
- **THEN** the API SHALL return streaming credentials
- **AND** SHALL NOT answer "Se requiere pago para acceder"

#### Scenario: Non-staff attendee still needs to pay
- **WHEN** an ordinary attendee with `status = 'registered'` requests a viewer token for a paid event
- **THEN** the API SHALL return 403 exactly as today

#### Scenario: Bans still apply to staff
- **WHEN** an admin's attendee email or IP appears in `event_bans` for that event
- **THEN** the token request SHALL still be refused

#### Scenario: Inactive event still refuses
- **WHEN** an admin requests a viewer token for an event whose status is not `active`
- **THEN** the API SHALL return 400

### Requirement: Admin joins as a participant, not as host

The admin SHALL receive the same streaming role an ordinary attendee would: `subscriber` in Agora `broadcast` mode, `publisher` in Agora `meeting` mode, and a viewer token under LiveKit. The admin SHALL NOT occupy `agoraService.HOST_UID` and SHALL NOT receive host moderation controls.

`getHostToken` SHALL keep requiring `req.user.id === event.host_user_id`; being an admin SHALL NOT satisfy it.

#### Scenario: Admin in a broadcast Agora event
- **WHEN** an admin joins an Agora event whose `interaction_mode` is `broadcast`
- **THEN** the issued RTC token SHALL carry the `subscriber` role
- **AND** the assigned uid SHALL come from `ensureAttendeeUid`, not `HOST_UID`

#### Scenario: Admin in a meeting Agora event
- **WHEN** an admin joins an Agora event whose `interaction_mode` is `meeting`
- **THEN** the issued RTC token SHALL carry the `publisher` role, like every other attendee in that mode

#### Scenario: Admin does not get host controls
- **WHEN** an admin is inside an event they do not host
- **THEN** the client SHALL render the attendee interface
- **AND** SHALL NOT render host controls such as ending the stream or promoting participants

#### Scenario: Host token stays restricted
- **WHEN** an admin who is not the host calls `POST /api/events/:id/host-token`
- **THEN** the API SHALL return 403

#### Scenario: Admin who is also the host is unaffected
- **WHEN** the admin is the event's `host_user_id`
- **THEN** the existing host flow SHALL apply unchanged

### Requirement: Staff attendees are excluded from counts, credits and payouts

`event_attendees` SHALL carry an `is_staff INTEGER NOT NULL DEFAULT 0` column. Rows with `is_staff = 1` SHALL be excluded from:

1. `eventService.getAttendeeCount` — the public "N asistentes" figure
2. `eventCreditScheduler.loadUncreditedAttendees` — host wallet crediting
3. The seller payout detail query in `stripeConnectPayoutsController.js`
4. The seller's per-event revenue listing in `sellerRoutes.js`
5. `invoiceService.generateEventAttendeeInvoice`, which SHALL refuse a staff attendee outright

`eventService.listAttendees`, used by the admin panel, SHALL NOT filter them out — knowing the admin was present is useful there.

#### Scenario: Public attendee count ignores the admin
- **WHEN** an event has 5 ordinary attendees and 1 staff attendee
- **THEN** `getAttendeeCount` SHALL return 5

#### Scenario: Host wallet credit ignores the admin
- **WHEN** the event credit scheduler processes a paid event the admin attended
- **THEN** no credit line SHALL be produced for the staff attendee
- **AND** the host's credited total SHALL match the ordinary attendees only

#### Scenario: Seller payout detail ignores the admin
- **WHEN** an artist views the payout detail for an event the admin attended
- **THEN** no 0 € line SHALL appear for the admin

#### Scenario: Seller revenue listing ignores the admin
- **WHEN** an artist views their per-event revenue
- **THEN** the attendee count and total SHALL exclude the staff attendee

#### Scenario: Invoice generation refuses a staff attendee
- **WHEN** `generateEventAttendeeInvoice` is called with a staff attendee id
- **THEN** it SHALL throw a 400 error
- **AND** no invoice number from series P SHALL be consumed

#### Scenario: Admin attendee list still shows staff
- **WHEN** an admin views the attendee list for an event
- **THEN** the staff attendee SHALL appear, distinguishable by `is_staff`

### Requirement: Admin shortcut on the event page

`client/app/live/[slug]/EventDetail.js` SHALL, for a user whose role is `admin` and who is not the event's host and has no stored attendee session, render an "Entrar como administrador" button in place of the "Acceder" button that opens `EventAccessModal`.

Activating it SHALL call the admin access endpoint, store the returned session under `event_attendee_{eventId}` in `localStorage` exactly as the registration modal does, and set `hasAccess`, so that every downstream behaviour — auto-connect, chat, video token, presence — proceeds unchanged.

The button SHALL be visible whatever the event's `access_type` and for both `live` and `video` formats.

#### Scenario: Admin sees the shortcut on a paid event
- **WHEN** an admin without a stored session opens a paid, upcoming event they do not host
- **THEN** the page SHALL show "Entrar como administrador"
- **AND** SHALL NOT show the price-gated "Acceder" button as the only option

#### Scenario: Admin enters an active event
- **WHEN** the admin activates the shortcut on an active live event
- **THEN** the session SHALL be stored under `event_attendee_{eventId}`
- **AND** the page SHALL connect to the room as a viewer without opening `EventAccessModal`

#### Scenario: Admin enters an active video event
- **WHEN** the admin activates the shortcut on an active `video` format event
- **THEN** the synchronized player and chat SHALL render
- **AND** a signed video token SHALL be obtained using the stored attendee session

#### Scenario: Admin with an existing session
- **WHEN** an admin already holds a stored attendee session for the event
- **THEN** the normal "Ya tienes acceso" state SHALL render and the shortcut SHALL NOT be shown

#### Scenario: Admin who hosts the event
- **WHEN** the admin is the event's host
- **THEN** the existing host state SHALL render and the shortcut SHALL NOT be shown

#### Scenario: Ordinary visitor never sees the shortcut
- **WHEN** an anonymous visitor, a buyer or a seller opens the event page
- **THEN** the shortcut SHALL NOT be rendered
