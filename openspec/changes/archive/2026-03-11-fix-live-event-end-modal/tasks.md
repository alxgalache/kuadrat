## 1. Refactor EventDetail Modal Rendering

- [x] 1.1 In `@client/app/live/[slug]/EventDetail.js`, identify the early `return` block for "Active event with LiveKit room" and the final fallback `return` block.
- [x] 1.2 Extract the modals (`EventAccessModal`, `ConfirmDialog` for stream ending, and `AuthorModal`) from the final fallback `return` block and move them to a root-level fragment or wrapper so they are rendered alongside whichever view is currently active.
- [x] 1.3 Ensure the `ConfirmDialog` for stream ending uses the `streamEndedModalOpen` state correctly in the new root-level position.
- [x] 1.4 Verify that moving the modals does not break the layout structure (e.g., maintain `bg-white` and other container classes on the main views).