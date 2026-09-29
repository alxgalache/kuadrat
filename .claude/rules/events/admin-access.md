---
paths:
  - "api/services/{eventService,invoiceService}.js"
  - "api/controllers/{eventController,eventAdminController,stripeConnectPayoutsController}.js"
  - "api/scheduler/eventCreditScheduler.js"
  - "api/routes/sellerRoutes.js"
  - "api/socket/eventSocket.js"
---

## Admin access to Live events (`event_attendees.is_staff`)

`POST /api/events/:id/admin-access` (JWT, `role === 'admin'`) find-or-creates a **real attendee row** for the admin and returns the same `{ attendeeId, accessToken }` the registration modal produces — no registration, no OTP, no payment.

* **A real row, not a bypass in `getViewerToken`.** That identity is re-derived by `getViewerToken`, `renewToken`, `getWhiteboardToken`, `uploadWhiteboardImage`, `getVideoToken`, `report-spam` and the authenticated Socket.IO room. Special-casing the admin in each would be seven places that must agree.
* **`status` stays `'registered'`, never `'paid'` with `amount_paid = 0`** — a paid state matching no payment is a lie in a table the invoicing and payout queries read. The exemption lives in `requiresPayment(event, attendee)` in `eventService.js`: the single predicate behind all five payment gates **and** the authenticated Socket.IO room, which used to carry its own copy without the exemption.
* **The admin is a participant, not a host.** In Agora `broadcast` they are the **co-presenter** (`publisher` on their own attendee uid — see «Interviews in Agora broadcast events», `.claude/rules/agora/interviews-cohost.md`); in meeting mode they are `publisher` like everyone there. Never `HOST_UID` or `HOST_SCREEN_UID`. `getHostToken` and `screen-token` still require `req.user.id === event.host_user_id`.
* **`is_staff = 1` is excluded from five queries**, and a sixth refuses outright: `getAttendeeCount` (public figure), `eventCreditScheduler.loadUncreditedAttendees` (host wallet), the payout detail in `stripeConnectPayoutsController`, the seller revenue listing in `sellerRoutes`, and `invoiceService.generateEventAttendeeInvoice` (a 0 € invoice would burn a number from series P, and invoice numbers are not recycled). **`listAttendees` deliberately does NOT filter** — the admin panel should show who was in the room. Any new query over `event_attendees` has to make this choice consciously.
* **Known ceiling:** in Agora `meeting` mode the admin consumes one of the 16 slots. That limit is the vendor's and `is_staff` does not dodge it.
