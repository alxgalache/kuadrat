## MODIFIED Requirements

### Requirement: Admin can manually finish a draw
The admin draw management system SHALL provide an endpoint and UI button to manually transition a draw's status to `finished`.

#### Scenario: Admin finishes an active draw
- **WHEN** an admin sends `POST /api/admin/draws/:id/finish` for a draw with status `active`
- **THEN** the system changes the draw status to `finished`, broadcasts `draw_ended` via Socket.IO, and returns success

#### Scenario: Admin finishes a non-active draw
- **WHEN** an admin sends `POST /api/admin/draws/:id/finish` for a draw with status other than `active`
- **THEN** the system returns a 400 error with message "El sorteo debe estar activo para finalizarlo"

#### Scenario: Admin UI finish button
- **WHEN** an admin views the detail page of an active draw
- **THEN** a "Finalizar sorteo" button is displayed that triggers the finish endpoint

### Requirement: Scheduler broadcasts on draw end
The scheduler SHALL emit a Socket.IO `draw_ended` event when it automatically finishes an active draw that has passed its end datetime.

#### Scenario: Auto-finish with socket broadcast
- **WHEN** the scheduler detects an active draw past its `end_datetime`
- **THEN** after calling `drawService.endDraw()`, it calls `drawSocket.broadcastDrawEnded(draw.id)`
