---
paths:
  - "client/hooks/useAgoraVideoEffect.js"
  - "client/components/events/{VideoEffectsMenu,VideoEffectsOptions}.js"
  - "client/lib/virtualBackgrounds.js"
  - "client/public/fondos-virtuales/**"
---

## Agora Virtual Backgrounds (client-only)

Background blur / image replacement over the local camera in Agora rooms. **Frontend only** — no API, DB, or env vars involved; the processed video is published straight to the channel, so no signalling and no LiveKit impact.

* **Where:** `client/hooks/useAgoraVideoEffect.js` (processor lifecycle) + `client/components/events/VideoEffectsMenu.js` (panel), mounted next to the Camera toggle in `AgoraHostControls` (host, both modes) and `MeetingSelfControls` (meeting attendees). Broadcast attendees never get it — they don't publish video.
* **Adding a background:** drop a file in `client/public/fondos-virtuales/` (16:9, 1280×720 recommended, even width×height, JPG/WEBP, <300 KB) and add its `{ file, label }` entry to `client/lib/virtualBackgrounds.js`. Order there is the display order; an empty catalog is valid (panel shows only blur).
* **Lifecycle rules:** `agora-extension-virtual-background` (~2.1 MB, WASM inlined) is loaded via dynamic `import()` on the **first panel open**, never at mount. `setOptions()` must always run **before** `enable()` (otherwise the SDK applies blur degree 1). "Ninguno" only `disable()`s — the processor stays initialized. The processor is reconciled against `camTrackVersion` from `useAgoraRoom`, which ticks whenever the camera track is created or destroyed; `unpipe()` + `release()` happen when the track goes away. Never applied to screen share or the whiteboard.
* **Degradation:** the control is hidden on mobile (vendor advises against it), replaced by an es-ES notice when `checkCompatibility()` is false, and auto-disabled on `processor.onoverload` — the persisted preference (`localStorage`, key in `client/lib/constants.js`) is not overwritten in that case.
* **CSP:** no changes needed; `'unsafe-eval'` in `script-src` (already present) is what lets the WASM compile.
