## ADDED Requirements

### Requirement: Synchronized Video-Format Event Playback — Initial Seek
The system SHALL calculate the correct playback position for video-format events (`events.format = 'video'`) using the server-persisted `events.video_started_at` plus a client-server clock offset derived from the server time attached to the event payload. The system SHALL seek the `<video>` element to that position and wait for the browser `seeked` event BEFORE starting playback and BEFORE making the video visually apparent (the `<video>` element SHALL remain with `opacity: 0` until the seek completes).

#### Scenario: Viewer joins an active video-format event 12 minutes after it started
- **GIVEN** a video-format event started by the admin at 22:30:00 server time
- **AND** the client clock matches the server clock (offset ≈ 0)
- **WHEN** a viewer loads `/live/<slug>` at 22:41:44 server time
- **THEN** the `<video>` element is rendered with `opacity: 0` behind a loading spinner
- **AND** the client fetches the event, reads `serverNow`, computes a clock offset, and calculates elapsed ≈ 704 s
- **AND** the client sets `video.currentTime = 704` and registers a one-shot `seeked` listener
- **AND** when the browser emits `seeked`, the client calls `video.play()` and reveals the element (`opacity: 1`)
- **AND** the viewer SEES the correct frame at ≈ 11:44 without first seeing any frame from position 0

#### Scenario: Viewer's local clock is off by several minutes
- **GIVEN** a video-format event started by the admin at 22:30:00 server time
- **AND** the viewer's device clock is wrong (e.g., 5 minutes ahead of the real world)
- **WHEN** the viewer joins
- **THEN** the client uses `serverTimeOffset = serverNow - clientNowAtResponse` (≈ −5 min)
- **AND** the elapsed time used for the seek is derived from `Date.now() + serverTimeOffset`, matching the server's elapsed value within the network round-trip
- **AND** the viewer sees the same frame as other viewers with correct clocks, within ±2 seconds

#### Scenario: `seeked` event does not fire within 15 seconds
- **GIVEN** a viewer has joined an active video-format event
- **AND** the browser has loaded the video metadata but never emits `seeked`
- **WHEN** 15 seconds elapse with `videoReady = true` and `seekReady = false`
- **THEN** the client increments the retry counter and calls `video.load()` to re-trigger the flow
- **AND** after three consecutive failed retries, the client surfaces the "No se pudo reproducir el vídeo" error state

### Requirement: Unmute re-synchronization
The system SHALL re-calculate the expected position and re-seek the `<video>` element if the drift between expected and actual position exceeds 1 second at the moment the user toggles unmute, and only then call `play()`.

#### Scenario: User unmutes a video that drifted 3 seconds during autoplay attempts
- **GIVEN** a video is playing muted and has drifted 3 s behind the server-computed position
- **WHEN** the user clicks the unmute overlay or the volume button
- **THEN** the client re-reads `serverTimeOffset`, computes `expected`, and assigns `video.currentTime = expected`
- **AND** unmutes the element
- **AND** calls `video.play()` (if paused)
- **AND** the audio SHALL resume at the server-computed position, not at the muted drift position

#### Scenario: User unmutes a video that was blocked by autoplay policy and stayed paused at position 0
- **GIVEN** the browser blocked the initial `play()` despite `muted=true` and the video stayed paused at its seeked position
- **WHEN** the user clicks the unmute overlay
- **THEN** the client re-seeks to `expected` if drift exceeds 1 second
- **AND** the user gesture allows `play()` to succeed
- **AND** the video begins playback at the server-computed position without replaying any frame already skipped

### Requirement: Cinema mode recovery after buffering
The system SHALL detect when the `<video>` element transitions from `waiting` (buffering) back to `playing`, recompute the server-expected position, and re-seek if the drift exceeds 1 second. The system SHALL NOT attempt to preserve the user's position across buffering — any content skipped during buffering is lost, matching a classic cinema screening model.

#### Scenario: Network throttles for 10 seconds during playback
- **GIVEN** a viewer is watching a video-format event
- **WHEN** the network slows and the browser emits `waiting` (buffer depleted)
- **AND** the network recovers 10 seconds later and the browser emits `playing`
- **THEN** the client computes `expected = getElapsedSeconds()` (≈ 10 s ahead of actual)
- **AND** reassigns `video.currentTime = expected`
- **AND** the viewer skips ahead to the server-synchronized position, not back to where buffering started

### Requirement: Periodic drift correction
The system SHALL run a periodic check every 10 seconds while the video is playing. If the absolute drift between the server-expected position and the actual `currentTime` exceeds 2 seconds, the system SHALL reassign `currentTime` to the expected value.

#### Scenario: Drift accumulates due to CPU throttling
- **GIVEN** a video has been playing for 2 minutes with a browser under heavy CPU load
- **AND** the accumulated drift is 3 seconds
- **WHEN** the 10-second periodic check runs
- **THEN** the system reassigns `currentTime` to the server-expected value
- **AND** the drift returns to ≈ 0

#### Scenario: No drift correction while paused
- **GIVEN** the video is paused (e.g., mid-autoplay-block)
- **WHEN** the 10-second periodic check runs
- **THEN** the system does NOT reassign `currentTime`

### Requirement: Video source change resets sync state
The system SHALL reset `videoReady`, `seekReady`, `videoError`, `videoEnded` and `retryCount` when the `<video>` source URL changes, so the full sync flow re-runs on the new source.

#### Scenario: Video token is refreshed mid-session
- **GIVEN** a viewer is watching a video served via a signed `vtoken` that has been refreshed, producing a new URL
- **WHEN** the `videoUrl` prop changes in `EventVideoPlayer`
- **THEN** the internal state is reset and the video is hidden (`opacity: 0`) until the new load + seek completes
- **AND** after `seeked`, playback resumes at the current server-computed position

### Requirement: Server time attached to public event payload
The system SHALL return a `serverNow` field (ISO 8601 UTC timestamp) on the response of `GET /api/events/:slug`, alongside the `event` object and `attendeeCount`. The field SHALL reflect the server's clock at the time the response is generated.

#### Scenario: Public event detail endpoint includes server time
- **WHEN** a client calls `GET /api/events/:slug` for any event (regardless of format or status)
- **THEN** the JSON response includes `serverNow` in ISO 8601 format
- **AND** `serverNow` is the server's current time at the instant of response generation
