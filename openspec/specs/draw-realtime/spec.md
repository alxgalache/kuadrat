## ADDED Requirements

### Requirement: Draw Socket.IO module
The system SHALL provide a Socket.IO module (`api/socket/drawSocket.js`) that manages real-time communication for draws, using rooms named `draw:<drawId>`.

#### Scenario: Client joins draw room
- **WHEN** a client emits `join-draw` with a valid draw ID
- **THEN** the server adds the client to room `draw:<drawId>`

#### Scenario: Client leaves draw room
- **WHEN** a client emits `leave-draw` with a draw ID
- **THEN** the server removes the client from room `draw:<drawId>`

#### Scenario: Server broadcasts draw ended
- **WHEN** `broadcastDrawEnded(drawId)` is called
- **THEN** all clients in room `draw:<drawId>` receive a `draw_ended` event with `{ drawId }`

### Requirement: Draw socket registration in server
The system SHALL register the draw socket module in `api/server.js` alongside the existing auction and event socket modules, making it accessible via `app.get('drawSocket')`.

#### Scenario: Draw socket available on app
- **WHEN** the server starts
- **THEN** `app.get('drawSocket')` returns the draw socket module with `broadcastDrawEnded` method

### Requirement: Scheduler broadcasts draw_ended event
The auction scheduler SHALL emit a `draw_ended` socket event when a draw is automatically finished by the scheduler.

#### Scenario: Draw auto-finished by scheduler
- **WHEN** the scheduler detects an active draw past its `end_datetime` and calls `drawService.endDraw()`
- **THEN** the scheduler also calls `drawSocket.broadcastDrawEnded(draw.id)` to notify connected clients

### Requirement: Frontend draw socket hook
The system SHALL provide a `useDrawSocket` hook (`client/hooks/useDrawSocket.js`) that connects to the socket, joins the draw room, listens for `draw_ended`, and provides `drawEnded` state and `timeRemaining` countdown.

#### Scenario: Hook initializes and joins room
- **WHEN** `useDrawSocket(drawId, endDatetime)` is called with a valid draw ID and end datetime
- **THEN** the hook connects to the Socket.IO server, emits `join-draw`, and starts a countdown if less than 12 hours remain

#### Scenario: Countdown updates every second
- **WHEN** the remaining time until `endDatetime` is less than 12 hours
- **THEN** the hook updates `timeRemaining` every second with `{ hours, minutes, seconds }`

#### Scenario: Countdown reaches zero
- **WHEN** `timeRemaining` reaches zero (client-side failsafe)
- **THEN** the hook sets `drawEnded` to `true` even if no `draw_ended` event was received from the server

#### Scenario: Server sends draw_ended event
- **WHEN** the hook receives a `draw_ended` event from the server
- **THEN** the hook sets `drawEnded` to `true` immediately

#### Scenario: Hook cleanup on unmount
- **WHEN** the component using the hook unmounts
- **THEN** the hook emits `leave-draw`, clears the countdown interval, and disconnects the socket listener

### Requirement: DrawDetail countdown display
`DrawDetail.js` SHALL display a countdown timer below the end date when less than 12 hours remain before the draw ends.

#### Scenario: More than 12 hours remaining
- **WHEN** the current time is more than 12 hours before `draw.end_datetime`
- **THEN** no countdown is displayed

#### Scenario: Less than 12 hours remaining
- **WHEN** the current time is less than 12 hours before `draw.end_datetime`
- **THEN** a countdown showing hours, minutes, and seconds is displayed below the end date

#### Scenario: Draw ends while viewing details
- **WHEN** the countdown reaches zero or a `draw_ended` event is received
- **THEN** the participation button is disabled and an informational message is shown indicating the draw has ended

### Requirement: DrawParticipationModal auto-close on draw end
`DrawParticipationModal.js` SHALL close automatically when the draw ends during registration, showing an error message.

#### Scenario: Draw ends while modal is open
- **WHEN** a user has the participation modal open and the draw ends (via socket event or countdown)
- **THEN** the modal closes immediately and the draw detail page shows an error message "El sorteo ha terminado"

#### Scenario: Draw ends before modal opens
- **WHEN** a user attempts to open the participation modal for a draw that has already ended
- **THEN** the modal does not open and the draw detail page shows the ended state
