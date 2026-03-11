## 1. Chat & Icon Improvements

- [x] 1.1 Update the chat input layout in `@client/components/EventLiveRoom.js` (or the specific chat component used for events) to include a visible "Send" button next to the text input using flexbox.
- [x] 1.2 Ensure the "Enter" key `onKeyDown` functionality is maintained for sending chat messages.
- [x] 1.3 Replace or fix the paths of the "Raise hand" SVG icon in the event controls to ensure it renders clearly without visual artifacts.

## 2. Stream Layout & Styling

- [x] 2.1 Update the participant grid container in `@client/components/EventLiveRoom.js` with responsive classes (e.g., `landscape:` modifier or custom media query) to cap its height (`max-h-[30vh]`) on mobile devices in landscape mode.

## 3. Host Stream Control

- [x] 3.1 Review backend permissions to ensure the event host can call the endpoint to end their event, currently used by the admin dashboard (`@client/app/admin/espacios/page.js`).
- [x] 3.2 Add an "End stream" button to the host's view in `@client/app/live/[slug]/EventDetail.js` or `@client/components/EventLiveRoom.js`.
- [x] 3.3 Implement a confirmation modal that appears when the "End stream" button is clicked.
- [x] 3.4 Wire the confirmation modal to trigger the event termination API call and redirect the host back to the event detail page.
- [x] 3.5 Update the viewer experience to listen for a stream end event (via socket or LiveKit disconnection) and display a "Stream Ended" modal.
- [x] 3.6 Ensure viewers are redirected to the event detail page upon accepting or dismissing the "Stream Ended" modal.

## 4. Participant Auto-Start

- [x] 4.1 Update `@client/app/live/[slug]/EventDetail.js` to dynamically listen for the event start signal (via `useEventSocket` or similar real-time mechanism) while the user is on the waiting screen.
- [x] 4.2 Trigger an automatic state update to render the live stream component when the event starts, avoiding the need for a manual page refresh.
