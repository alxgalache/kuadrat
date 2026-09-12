# admin-event-access

> Affected layers: backend (`api/`) and frontend (`client/`). **No DB schema change.** Co-presenter eligibility and controls are specified in `agora-broadcast-cohost`.

## MODIFIED Requirements

### Requirement: Admin joins as a participant, not as host

The admin SHALL receive the following streaming role:

- In Agora `broadcast` mode, while their user still holds `role = 'admin'`: the `publisher` role **as co-presenter**, with `coHost: true` in the token response (capability `agora-broadcast-cohost`).
- In Agora `meeting` mode: the `publisher` role, like every other attendee there.
- Under LiveKit: a viewer token.

A staff attendee whose user no longer holds `role = 'admin'` SHALL fall back to the role an ordinary attendee would get.

In every mode the admin SHALL NOT occupy `agoraService.HOST_UID` or `agoraService.HOST_SCREEN_UID`. The admin SHALL NOT receive host controls: ending the stream, promoting or demoting participants, screen sharing, whiteboard, video quality or chat moderation. As co-presenter they only get microphone, camera, speaker selection and the camera layout switch.

`getHostToken` and `POST /api/events/:id/screen-token` SHALL keep requiring `req.user.id === event.host_user_id`; being an admin SHALL NOT satisfy either.

#### Scenario: Admin in a broadcast Agora event
- **WHEN** an admin joins an Agora event whose `interaction_mode` is `broadcast`
- **THEN** the issued RTC token SHALL carry the `publisher` role and the response SHALL include `coHost: true`
- **AND** the assigned uid SHALL come from `ensureAttendeeUid`, not `HOST_UID`

#### Scenario: Former admin with a stored staff session
- **WHEN** a staff attendee whose user is no longer an admin requests a token for a `broadcast` Agora event
- **THEN** the issued RTC token SHALL carry the `subscriber` role and the response SHALL include `coHost: false`

#### Scenario: Admin in a meeting Agora event
- **WHEN** an admin joins an Agora event whose `interaction_mode` is `meeting`
- **THEN** the issued RTC token SHALL carry the `publisher` role, like every other attendee in that mode

#### Scenario: Admin does not get host controls
- **WHEN** an admin is inside a `broadcast` event they do not host
- **THEN** the client SHALL render only the co-presenter controls (microphone, camera, speakers, layout)
- **AND** SHALL NOT render ending the stream, promoting participants, screen sharing, whiteboard or video quality

#### Scenario: Host token stays restricted
- **WHEN** an admin who is not the host calls `POST /api/events/:id/host-token` or `POST /api/events/:id/screen-token`
- **THEN** the API SHALL return 403

#### Scenario: Admin who is also the host is unaffected
- **WHEN** the admin is the event's `host_user_id`
- **THEN** the existing host flow SHALL apply unchanged
