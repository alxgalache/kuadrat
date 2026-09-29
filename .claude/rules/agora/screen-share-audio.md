---
paths:
  - "client/hooks/{useAgoraRoom,useHostMediaControls}.js"
  - "client/components/AgoraLiveRoom.js"
  - "client/components/events/{CoHostControls,HostConsole,CompactHostControls}.js"
---

## Agora Screen Share Audio (`'disable'` hides the checkbox)

**`AgoraRTC.createScreenVideoTrack(config, 'disable')` calls `getDisplayMedia` with no audio request, and then Chrome shows no «Compartir audio» checkbox in ANY tab of its picker** — tab, window or screen. Every screen share in every Agora room was silent from c933796 until `agora-event-recording`, and it read as a Windows limitation because a test page on the same machine offered the checkbox. Verified in the installed 4.24.6 bundle: `screenAudio: supportShareAudio && withAudio !== 'disable' ? config || true : undefined`.

* **Both paths go through `createScreenTracks` in `useAgoraRoom`**, which passes `AGORA_SCREEN_AUDIO_CONFIG` as the second argument (an object makes the SDK request audio as `'auto'`) and merges `AGORA_SCREEN_CAPTURE_OPTIONS` into the video config. The SDK returns `[video, audio]` when the person ticks the checkbox and the bare video track otherwise; the helper normalises both, and the audio track is published, unpublished and closed together with the video (`screenAudioTrackRef`) — on the second client in `broadcast`, beside the microphone in `meeting` (one client may publish several audio tracks; the SDK mixes them).
* **`restrictOwnAudio: true` is what makes system audio usable** (Chrome 141+, ignored elsewhere): it removes the capturing page's own playback from the captured audio. Without it, sharing the whole screen with system audio sends the other participants' voices, which play in the presenter's room page, straight back into the channel. Sharing a *tab* never needed it.
* **`AEC`/`AGC`/`ANS` are off**: it is programme audio, not a voice — the call chain would clip and pump it.
* **`systemAudio: 'include'` / `windowAudio: 'system'`** are hints `getDisplayMedia` receives through the video config; they make Chrome offer system audio on the screen and window tabs.
* **Platforms:** Windows — tab and system audio. macOS — tab audio always; system audio only with Chrome 141+ on macOS 14.2+. Safari — never. Linux — out of scope by decision (depends on the system's audio stack). Where the host cannot share audio, the co-presenter can (see «Interviews», `.claude/rules/agora/interviews-cohost.md`).
* **`'enable'` was rejected**: it makes audio mandatory and the call fails without it; `'auto'` keeps a silent share possible exactly as before.
* **Known blind spot:** no automated test — the client has no runner, and what the picker offers depends on OS and browser version. Verified by hand per `openspec/changes/archive/2026-09-27-agora-event-recording/tasks.md` §14.9–14.12.
