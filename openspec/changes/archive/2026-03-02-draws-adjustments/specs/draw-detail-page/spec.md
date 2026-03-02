## MODIFIED Requirements

### Requirement: Draw metadata display
The draw detail page SHALL display draw-specific metadata above the entry button: the draw price (formatted as EUR), edition information, minimum number of participants, and current number of participants. Edition and minimum participants values SHALL be read from the draw data returned by the API (fields `units` and `min_participants`), not hardcoded. If `units` equals 1, the text SHALL display "Edición única". If `units` is greater than 1, the text SHALL display "Edición de {units} unidades". The minimum participants text SHALL always display "Mínimo {min_participants} participantes".

#### Scenario: Single-unit draw shows "Edición única"
- **WHEN** the draw detail page is rendered for a draw with `units = 1`
- **THEN** the page SHALL display "Edición única" instead of "Edición de 1 unidades"

#### Scenario: Multi-unit draw shows edition count
- **WHEN** the draw detail page is rendered for a draw with `units = 5`
- **THEN** the page SHALL display "Edición de 5 unidades"

#### Scenario: Minimum participants from database
- **WHEN** the draw detail page is rendered for a draw with `min_participants = 50`
- **THEN** the page SHALL display "Mínimo 50 participantes"

#### Scenario: Draw at capacity shows full indicator
- **WHEN** the current participation count equals max_participations
- **THEN** the metadata SHALL indicate the draw is full (e.g., "Participantes: 100/100 - Completo")
