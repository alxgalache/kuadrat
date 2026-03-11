## MODIFIED Requirements

### Requirement: Host Stream Conclusion
The system SHALL provide the event host with a control to end the live stream directly from the event detail or live room page. 
The system SHALL ensure that viewers who are actively watching the stream when the event ends see a "Stream Ended" notification modal, regardless of the currently active view component (`EventLiveRoom`, etc.).

#### Scenario: Host ends the stream
- **WHEN** the host clicks the "End stream" button and confirms the action in the resulting modal
- **THEN** the stream is terminated via the backend API and the host is redirected to the event detail page

#### Scenario: Viewers notified of stream end while in LiveKit room
- **WHEN** the host ends the stream while a viewer is actively watching in the LiveKit room view
- **THEN** the viewer's socket connection receives the `event_ended` event
- **THEN** the viewer receives a notification modal stating the stream has ended, rendered above the current stream view
- **WHEN** the viewer accepts or closes the modal
- **THEN** the viewer is redirected back to the static event detail page