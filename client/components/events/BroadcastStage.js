'use client'

import AgoraVideo from '@/components/events/AgoraVideo'
import {
  STAGE_LAYOUTS,
  STAGE_PIP_WIDTH_PCT,
  STAGE_CORNER_WIDTH_PCT,
  STAGE_WHITEBOARD_CORNER_OFFSET_PX,
} from '@/lib/constants'

const PULSE_STYLE = { animation: 'speaking-pulse 1.5s ease-in-out infinite' }
const EDGE_PX = 8 // right-2 / bottom margin of the floating tiles

/**
 * Stream type each remote camera should be received at: 1 (low, the 480 × 270
 * dual stream) while it is drawn small in the corner box — that is, while
 * there is content on stage — and 0 (high) otherwise. The shared screen never
 * appears here: it has no low stream.
 *
 * The picture-in-picture tile deliberately stays on the high stream: a 720p
 * host plus ANY second video already crosses into Full HD, so the low stream
 * would only make the co-presenter blurrier without saving anything.
 *
 * @param {number[]} remoteCameraUids - uids of the cameras this viewer receives
 * @param {boolean} hasContent - whiteboard or shared screen on stage
 * @returns {Object<number, 0|1>}
 */
export function stageStreamTypes(remoteCameraUids, hasContent) {
  const types = {}
  for (const uid of remoteCameraUids) types[uid] = hasContent ? 1 : 0
  return types
}

// Speaking ring drawn OVER the video: an inset ring on the tile itself would be
// painted under its child <video> and never be seen.
function SpeakingOverlay({ speaking }) {
  if (!speaking) return null
  return (
    <span
      className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-green-400"
      style={PULSE_STYLE}
    />
  )
}

function HalfTile({ camera }) {
  return (
    <div className="relative h-full w-1/2 overflow-hidden">
      <AgoraVideo track={camera.track} className="w-full h-full" fit="cover" mirror={camera.mirror} />
      <SpeakingOverlay speaking={camera.speaking} />
    </div>
  )
}

// One camera floating over the stage: the co-presenter in picture-in-picture,
// or the only camera on air while there is content.
function FloatingTile({ camera, widthPct, bottomPx }) {
  return (
    <div
      className={`absolute right-2 z-10 aspect-video overflow-hidden rounded-md bg-black shadow-lg transition-shadow duration-300 ${
        camera.speaking ? 'ring-2 ring-green-400' : 'ring-1 ring-white/20'
      }`}
      style={{ width: `${widthPct}%`, bottom: bottomPx, ...(camera.speaking ? PULSE_STYLE : {}) }}
    >
      <AgoraVideo track={camera.track} className="w-full h-full" fit="cover" mirror={camera.mirror} />
    </div>
  )
}

// Both cameras side by side in the corner, whatever layout was chosen: a
// picture-in-picture inside a picture-in-picture would be unreadable.
function CornerPair({ cameras, bottomPx }) {
  return (
    <div
      className="absolute right-2 z-10 flex aspect-video overflow-hidden rounded-md bg-black shadow-lg ring-1 ring-white/20"
      style={{ width: `${STAGE_CORNER_WIDTH_PCT}%`, bottom: bottomPx }}
    >
      {cameras.map((camera) => <HalfTile key={camera.key} camera={camera} />)}
    </div>
  )
}

/**
 * The stage of an Agora broadcast event, identical for host, co-presenter and
 * audience (spec agora-broadcast-stage):
 *
 *   no content, 0 cameras → placeholder
 *   no content, 1 camera  → that camera at 100 %, uncropped (as always)
 *   no content, 2 cameras → 'split': host left / co-presenter right, cropped
 *                           'pip':   host at 100 % + co-presenter bottom-right
 *   content (whiteboard or screen) → content at 100 % + cameras in the corner
 *
 * The parent resolves the sources; this component only lays them out.
 *
 * @param {object} props
 * @param {{key, track, speaking, mirror}} props.hostCamera - track null when off
 * @param {{key, track, speaking, mirror}} props.coHostCamera - track null when off/absent
 * @param {{kind:'whiteboard', element}|{kind:'screen', track}|null} props.content
 * @param {'split'|'pip'} props.layout - Shared layout chosen by the co-presenter
 * @param {boolean} props.theaterOpen
 * @param {React.ReactNode} props.placeholder - Shown with no camera and no content
 * @param {React.ReactNode} [props.theaterButton] - Top-right, never over a tile
 */
export default function BroadcastStage({
  hostCamera,
  coHostCamera,
  content,
  layout,
  theaterOpen,
  placeholder,
  theaterButton = null,
}) {
  // Host always first: left half, and left in the corner pair
  const cameras = [hostCamera, coHostCamera].filter((camera) => camera?.track)
  const isWhiteboard = content?.kind === 'whiteboard'
  const soloSpeaking = !content && cameras.length === 1 && cameras[0].speaking
  const cornerBottom = isWhiteboard ? STAGE_WHITEBOARD_CORNER_OFFSET_PX : EDGE_PX

  const frame = theaterOpen
    ? `relative flex-1 min-h-0 ${isWhiteboard ? 'bg-white' : 'bg-black'}`
    : `relative w-full aspect-video rounded-lg overflow-hidden ${isWhiteboard ? 'border border-gray-200 bg-white' : 'bg-black'}`

  return (
    <div
      className={`${frame} transition-shadow duration-300 ${soloSpeaking ? 'ring-2 ring-green-400' : ''}`}
      style={soloSpeaking ? PULSE_STYLE : undefined}
    >
      {/* Content layer: the FIRST child, at this position whatever the cameras
          do. Moving the whiteboard in the React tree destroys and rejoins its
          fastboard room, losing the writable session. `z-0` opens a stacking
          context so fastboard's own z-index:200 layers stay under the corner. */}
      {content && (
        <div className="absolute inset-0 z-0">
          {isWhiteboard
            ? content.element
            : <AgoraVideo track={content.track} className="w-full h-full" fit="contain" />}
        </div>
      )}

      {!content && cameras.length === 0 && placeholder}

      {!content && cameras.length === 1 && (
        <AgoraVideo track={cameras[0].track} className="w-full h-full" fit="contain" mirror={cameras[0].mirror} />
      )}

      {!content && cameras.length === 2 && layout === STAGE_LAYOUTS.PIP && (
        <>
          <AgoraVideo track={hostCamera.track} className="w-full h-full" fit="contain" mirror={hostCamera.mirror} />
          <FloatingTile camera={coHostCamera} widthPct={STAGE_PIP_WIDTH_PCT} bottomPx={EDGE_PX} />
        </>
      )}

      {!content && cameras.length === 2 && layout !== STAGE_LAYOUTS.PIP && (
        <div className="absolute inset-0 flex">
          <HalfTile camera={hostCamera} />
          <HalfTile camera={coHostCamera} />
        </div>
      )}

      {content && cameras.length === 1 && (
        <FloatingTile camera={cameras[0]} widthPct={STAGE_PIP_WIDTH_PCT} bottomPx={cornerBottom} />
      )}

      {content && cameras.length === 2 && (
        <CornerPair cameras={cameras} bottomPx={cornerBottom} />
      )}

      {theaterButton && (
        <div className="absolute top-2 right-2 z-20">{theaterButton}</div>
      )}
    </div>
  )
}
