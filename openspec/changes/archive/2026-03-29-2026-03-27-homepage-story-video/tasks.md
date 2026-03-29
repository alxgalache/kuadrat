## Tasks

- [ ] **Create `client/components/StoryVideo.js`** — Client component (`'use client'`). Receives `videos` prop (string array of filenames). Uses `useState` to pick a random video on mount. Renders `<video>` with: `autoPlay`, `muted`, `loop`, `playsInline`, no `controls`, `pointer-events: none`, `rounded-2xl`, `object-cover`, `aspect-[9/16]`, constrained to available height.
- [ ] **Modify `client/app/page.js`** — Import `fs` and `path` (Node.js). Read `/public/video/stories/` directory, filter `.mp4` files. In the published section: restructure to `flex flex-col lg:flex-row` two-column layout. Left column: existing heading + CTAs. Right column: `<StoryVideo videos={videoFiles} />`. Coming soon section unchanged.
