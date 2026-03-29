## Why

The published home page (`/`) currently shows only a heading and two links on a white background. Adding a vertical video in Instagram story format brings visual dynamism and showcases art-related content, reinforcing the gallery's identity without breaking the minimalist design.

## What Changes

- **Story video component**: New `StoryVideo.js` client component that receives a list of video filenames, picks one at random on each mount, and renders it as a muted, looping, auto-playing `<video>` with no controls and `rounded-2xl` corners.
- **Homepage layout**: The published section of `page.js` switches from a single-column layout to a responsive two-column layout (`flex-col lg:flex-row`). Text and CTAs remain on the left; the story video sits on the right. On mobile, the video stacks below the text.
- **Video selection**: `page.js` (server component) reads `/public/video/stories/` with `fs.readdirSync` and passes the `.mp4` filename list as a prop to the client component. Random selection happens client-side per visit.

## Layers Affected

- **Frontend only** — no backend, database, or dependency changes.

## Capabilities

### New Capabilities

- Random vertical video playback on the home page (autoplay, muted, loop, no controls)

### Modified Capabilities

- Home page layout becomes two-column on desktop, stacked on mobile

## Non-goals

- Video upload or management UI
- Video optimization/transcoding
- Hiding the video on mobile (may revisit after testing)
- Adding video to the "coming soon" page

## Impact

- **Files changed**:
  - `client/app/page.js` — layout restructure + fs read + StoryVideo import
  - `client/components/StoryVideo.js` — new client component (~25 lines)
- No API, database, or dependency changes.
- No new npm packages required.
