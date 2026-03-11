## ADDED Requirements

### Requirement: Chat Send Button
The system SHALL provide a visible "Send" button in the event chat input area alongside the text input field. The system SHALL retain the ability to send messages by pressing the "Enter" key.

#### Scenario: User sends message via button
- **WHEN** a user types a message in the chat input and clicks the "Send" button
- **THEN** the message is sent to the chat room and the input is cleared

#### Scenario: User sends message via Enter key
- **WHEN** a user types a message in the chat input and presses the "Enter" key
- **THEN** the message is sent to the chat room and the input is cleared

### Requirement: Clear Raise Hand Icon
The system SHALL display a clear, well-defined icon for the "Raise hand" functionality in the LiveKit room interface, without visual artifacts or blurriness.

#### Scenario: User views hand raising controls
- **WHEN** the user is participating in a live event with interactive controls
- **THEN** they see a visually distinct, correctly proportioned "Raise hand" icon

### Requirement: Mobile Landscape Stream Layout
The system SHALL cap the height of the participant list/grid in the live room when viewed on a mobile device in landscape mode, ensuring the primary host video or screen share occupies the majority of the viewport.

#### Scenario: Mobile user rotates device to landscape
- **WHEN** a user on a mobile device views the live stream and rotates the device to landscape mode
- **THEN** the bottom participant grid height is restricted and does not obstruct the main video feed

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

### Requirement: Participant Auto-Start
The system SHALL automatically transition a waiting participant to the active live stream view when the event starts, without requiring the participant to manually refresh the page.

#### Scenario: Event starts while user is waiting
- **WHEN** a user is on the event detail page for an event that has not yet started
- **AND** the host starts the event
- **THEN** the user's view automatically updates to display the live stream content
