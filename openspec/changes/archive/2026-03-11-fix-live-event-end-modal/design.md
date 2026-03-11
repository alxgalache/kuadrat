## Context

In `EventDetail.js`, when a user is actively viewing a LiveKit stream, the component returns early to render the `EventLiveRoom`. As a result, when the host ends the stream and the `eventEnded` socket notification triggers `setStreamEndedModalOpen(true)`, the actual `ConfirmDialog` component (which is placed in the final fallback `return` of the page) is never rendered. This leaves the user in a broken state, stuck in the live room view without any notification or redirection.

## Goals / Non-Goals

**Goals:**
- Ensure the "Stream Ended" modal is rendered and visible to the viewer regardless of which view (`EventLiveRoom`, `EventVideoPlayer`, or fallback) they are currently seeing.

**Non-Goals:**
- Refactoring the entire layout of `EventDetail.js` or the socket logic. We will only fix the modal rendering placement.

## Decisions

**1. Lift Modals Above Conditional Returns:**
Instead of having multiple early `return` statements that only include the specific sub-component (like `EventLiveRoom` or `EventVideoPlayer`), we will wrap the main content in a helper function or restructure the JSX so that global modals (`EventAccessModal`, `ConfirmDialog` for stream ending, and `AuthorModal`) are always rendered at the root level of the component's final output, alongside the specific active view.

An alternative is to duplicate the `ConfirmDialog` into the `EventLiveRoom` return block, but lifting the modals to the root is cleaner and prevents future bugs with other modals.

## Risks / Trade-offs

- Refactoring the `return` structure of `EventDetail.js` must be done carefully to avoid breaking the layout (e.g., ensuring `bg-white` and other wrapper classes are applied correctly to the root).