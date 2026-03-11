## Context

The "Live" section of the Kuadrat frontend allows users to attend live art events and auctions. Currently, there are several UX/UI pain points in the event detail page (`@client/app/live/[slug]/EventDetail.js`) and its associated stream viewer. These include chat usability, visual issues with icons, layout problems on mobile landscape mode, lack of in-page controls for the host to end the stream, and a lack of reactivity for users waiting for a stream to start.

## Goals / Non-Goals

**Goals:**
- Improve chat input by adding a dedicated "Send" button alongside the text input.
- Replace or fix the "Raise hand" icon so it is clear and recognizable.
- Optimize the video stream layout for mobile landscape screens, prioritizing the host's video.
- Empower the host to conclude the stream directly from the event detail page, providing a graceful exit for all viewers.
- Provide a seamless transition for waiting users by automatically starting the stream when the host initiates it.

**Non-Goals:**
- Changes to the backend event or LiveKit room lifecycle logic (we will reuse existing API/socket logic where possible).
- Redesigning the entire live event experience.
- Introducing dark mode or new Tailwind components that deviate from the minimalist UI blocks constraint.

## Decisions

**1. Chat Input Layout:**
- We will use flexbox utility classes to place the input field and the new "Send" button in the same row. The `onKeyDown` event handler will remain to support sending via the "Enter" key.

**2. "Raise Hand" Icon Fix:**
- We will investigate the current SVG/icon used for the "Raise hand" button. If the current icon is visually defective due to paths or viewBox issues, we will replace it with a standard, simplified SVG icon that adheres to the minimalist aesthetic.

**3. Mobile Landscape Layout:**
- We will apply Tailwind CSS responsive classes (e.g., `landscape:` modifier if available, or custom media queries) to the participant grid container in `EventLiveRoom.js`. The height of the participant list will be capped (e.g., using `max-h-[30vh]`) to ensure the main screen share or host video takes up the majority of the screen space.

**4. Stream Conclusion by Host:**
- We will add an "End stream" button in the host's view on `EventDetail.js` or `EventLiveRoom.js`.
- Clicking this button will open a confirmation modal.
- Upon confirmation, the frontend will call the existing API endpoint used by the admin dashboard (`@client/app/admin/espacios/page.js`) to terminate the event/stream.
- The host will be redirected to the event detail page.
- We will leverage the existing socket connection (`useEventSocket` or LiveKit disconnect event) to notify viewers that the stream has ended. Viewers will see a modal informing them of the conclusion, and upon acknowledgment, they will be redirected/reverted to the event detail view.

**5. Auto-start for Waiting Users:**
- Users on the event detail page before the event starts are currently in a waiting state.
- We will listen for a real-time event (e.g., `event_started` via `useEventSocket`) or rely on LiveKit room state changes.
- When the event is marked as started, a state variable (`isLive` or similar) will update, causing React to render the stream component automatically without a page reload.

## Risks / Trade-offs

- [Risk] Mobile landscape layout adjustments might affect tablets or larger screens unexpectedly. → Mitigation: Carefully scope the CSS changes using standard Tailwind breakpoints (`max-md`, `landscape`) and test on different screen sizes using browser developer tools.
- [Risk] The API to end the event might be restricted to admin roles only. → Mitigation: We must verify if the host (who may be an author but not a superadmin) has permission to hit the endpoint. If not, the backend permissions or a specific endpoint for the host to end their own event might be needed.
- [Risk] Unclear socket events for auto-start or stream end. → Mitigation: Verify existing socket events in `api/socket/eventSocket.js`. If missing, we may need to emit new socket events from the backend when an event's status changes.