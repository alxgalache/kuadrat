## Why

The current live events experience in the frontend requires several UX/UI improvements to enhance user interaction, stream management, and responsiveness. These improvements aim to solve existing usability issues such as awkward chat input, unreadable icons, excessive participant layout size on mobile landscape views, lack of host controls to conclude the stream directly from the event detail page, and manual reload requirements for waiting users when an event starts. This change is needed now to provide a polished and seamless live event experience for both hosts and viewers.

## What Changes

- Add a "Send" button to the chat input on the event detail page, positioning it to the right of the input field while retaining the "Enter to send" functionality.
- Fix and improve the rendering of the "Raise hand" icon to make its shape clear and distinct.
- Optimize the layout of the video stream for mobile devices in fullscreen landscape mode by reducing the height and size of the participants' bottom section, ensuring the host's video or screen share remains properly visible.
- Add an "End stream" button available only to the host on the event detail page, which opens a confirmation modal and triggers the stream conclusion process.
- Redirect the host to the event details page upon successfully ending the stream.
- Display a modal to all viewers when the stream ends, informing them of the conclusion and redirecting them to the event details page upon acceptance or dismissal.
- Implement an auto-start behavior for waiting participants on the event details page, dynamically loading the stream content as soon as the event begins without requiring a manual page reload.

## Capabilities

### New Capabilities
- `live-events-ux-improvements`: Covers frontend UX and UI enhancements for live events, including chat modifications, icon fixes, responsive participant layouts, host stream control, and auto-joining behavior.

### Modified Capabilities

## Impact

- Frontend Event Detail Page (`@client/app/live/[slug]/EventDetail.js`)
- Frontend Chat Component
- Frontend Stream Layout/Video Component
- API and socket integration on the frontend for detecting stream start/end events dynamically.