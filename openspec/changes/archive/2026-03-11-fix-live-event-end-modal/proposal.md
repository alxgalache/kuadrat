## Why

When an event host ends a live stream, the viewer receives a socket event (`event_ended`) which triggers the "Stream Ended" modal. However, if the user is currently viewing the active stream, the early `return` block in `EventDetail.js` (which renders the `EventLiveRoom`) prevents the modal from ever being displayed because the modal component is only rendered in the final, fallback `return` of the page. The user is therefore stuck on the stream view without notification.

## What Changes

- Move the rendering of `ConfirmDialog` (used for the `streamEndedModalOpen` state) up in the component tree or duplicate it so that it is included in all views (especially the active LiveKit room view).
- Ensure that `streamEndedModalOpen` is accessible across all render paths of the `EventDetail` component.

## Capabilities

### New Capabilities

### Modified Capabilities
- `live-events-ux-improvements`: Modifying the host stream conclusion requirement so that viewers actually see the notification modal during an active LiveKit room session instead of being blocked by early component returns.

## Impact

- Frontend Event Detail Page (`@client/app/live/[slug]/EventDetail.js`)