'use client'

// MUST be first: re-adds the legacy ReactDOM.render / unmountComponentAtNode that
// white-web-sdk (loaded transitively by @netless/fastboard) still calls but React 19
// removed. Without it the board renders but cannot bind its container / be drawn on.
import '@/lib/reactDomLegacyShim'
import { useEffect, useRef, useState } from 'react'
import { createFastboard, mount } from '@netless/fastboard'

// Read-only viewers get the bare canvas without editing chrome
const READER_UI_CONFIG = {
  toolbar: { enable: false },
  redo_undo: { enable: false },
  zoom_control: { enable: false },
  page_control: { enable: false },
}

/**
 * Shared interactive whiteboard (Agora Interactive Whiteboard via Fastboard).
 *
 * Mounted with the framework-agnostic `@netless/fastboard` (`createFastboard` +
 * `mount`, UI rendered by fastboard-ui's own bundled Svelte runtime). The React 19
 * fix itself lives in `@/lib/reactDomLegacyShim` (imported above): the real cause of
 * "binding container" / "render is not a function" is `white-web-sdk` calling the
 * legacy `ReactDOM.render` that React 19 removed — both the React wrapper and this
 * vanilla path hit it, so the shim re-adds it via `createRoot`.
 *
 * The parent (AgoraLiveRoom) remounts this component (key) when the credentials or
 * the role change; the effect also re-runs on any prop change.
 *
 * @param {object} props
 * @param {string} props.appIdentifier
 * @param {string} props.region
 * @param {string} props.uuid - Whiteboard room uuid
 * @param {string} props.roomToken - Per-role room token from the backend
 * @param {string} props.uid - Unique member id (our event identity)
 * @param {boolean} props.writable - true = writer role, false = reader
 * @param {string} [props.displayName] - Real user name shown next to the live
 *   cursor (window-manager resolves it as payload.nickName || memberId)
 */
export default function WhiteboardPanel({ appIdentifier, region, uuid, roomToken, uid, writable, displayName = '' }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let app = null
    let ui = null

    ;(async () => {
      try {
        const fastboard = await createFastboard({
          sdkConfig: { appIdentifier, region },
          joinRoom: {
            uid,
            uuid,
            roomToken,
            isWritable: !!writable,
            ...(displayName ? { userPayload: { nickName: displayName } } : {}),
          },
        })
        if (cancelled || !containerRef.current) {
          fastboard.destroy()
          return
        }
        app = fastboard
        ui = mount(app, containerRef.current, { config: writable ? undefined : READER_UI_CONFIG })
        setLoading(false)
      } catch (err) {
        if (!cancelled) console.error('Error montando la pizarra:', err)
      }
    })()

    return () => {
      cancelled = true
      try { ui?.destroy() } catch { /* already gone */ }
      try { app?.destroy() } catch { /* already gone */ }
    }
  }, [appIdentifier, region, uuid, roomToken, uid, writable, displayName])

  return (
    <div className="w-full h-full bg-white relative">
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <p className="text-sm text-gray-500">Cargando pizarra...</p>
        </div>
      )}
    </div>
  )
}
