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

// Writers keep the full editing toolbar but lose the Netless apps panel
// (Code editor, Countdown...) — irrelevant for our use case; image insertion
// is offered through our own overlay control instead
const WRITER_UI_CONFIG = {
  toolbar: { apps: { enable: false } },
}

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const IMAGE_MAX_BYTES = 10 * 1024 * 1024

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
 * @param {Function} [props.onUploadImage] - async (file) => url. Uploads a
 *   device image to the backend; the returned URL feeds insertImage.
 */
export default function WhiteboardPanel({ appIdentifier, region, uuid, roomToken, uid, writable, displayName = '', onUploadImage = null }) {
  const containerRef = useRef(null)
  const appRef = useRef(null)
  const fileInputRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [imagePanelOpen, setImagePanelOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState('')

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
        appRef.current = fastboard
        ui = mount(app, containerRef.current, { config: writable ? WRITER_UI_CONFIG : READER_UI_CONFIG })
        setLoading(false)
      } catch (err) {
        if (!cancelled) console.error('Error montando la pizarra:', err)
      }
    })()

    return () => {
      cancelled = true
      appRef.current = null
      try { ui?.destroy() } catch { /* already gone */ }
      try { app?.destroy() } catch { /* already gone */ }
    }
  }, [appIdentifier, region, uuid, roomToken, uid, writable, displayName])

  const insertImage = async (url) => {
    const app = appRef.current
    if (!app) throw new Error('whiteboard not ready')
    await app.insertImage(url)
  }

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setImageError('')
    if (!IMAGE_MIME_TYPES.includes(file.type)) {
      setImageError('Solo se permiten imágenes PNG, JPG o WEBP')
      return
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImageError('La imagen no puede superar los 10MB')
      return
    }
    setImageBusy(true)
    try {
      const data = await onUploadImage(file)
      await insertImage(data?.url || data)
      setImagePanelOpen(false)
    } catch (err) {
      console.error('Error subiendo la imagen a la pizarra:', err)
      setImageError(err?.message || 'No se pudo subir la imagen')
    } finally {
      setImageBusy(false)
    }
  }

  const handleInsertFromUrl = async () => {
    const url = imageUrl.trim()
    setImageError('')
    if (!/^https?:\/\/.+/i.test(url)) {
      setImageError('Introduce una URL válida (http/https)')
      return
    }
    setImageBusy(true)
    try {
      await insertImage(url)
      setImageUrl('')
      setImagePanelOpen(false)
    } catch (err) {
      console.error('Error insertando la imagen:', err)
      setImageError('No se pudo insertar la imagen')
    } finally {
      setImageBusy(false)
    }
  }

  return (
    <div className="w-full h-full bg-white relative">
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <p className="text-sm text-gray-500">Cargando pizarra...</p>
        </div>
      )}

      {/* Insert image control — writers only (top-left corner, clear of the
          fastboard toolbar on the left-center and the zoom control bottom-right) */}
      {writable && !loading && (
        <div className="absolute top-2 left-2 z-10">
          <button
            type="button"
            onClick={() => { setImagePanelOpen((v) => !v); setImageError('') }}
            className="inline-flex items-center gap-x-1.5 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow ring-1 ring-gray-200 hover:bg-gray-50"
            title="Insertar imagen en la pizarra"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            Imagen
          </button>

          {imagePanelOpen && (
            <div className="mt-1.5 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg space-y-2">
              {onUploadImage && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageBusy}
                  className="w-full rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {imageBusy ? 'Procesando...' : 'Subir desde el dispositivo'}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileSelected}
                className="hidden"
              />
              <div className="flex gap-x-1.5">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="URL de la imagen..."
                  className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleInsertFromUrl}
                  disabled={imageBusy || !imageUrl.trim()}
                  className="flex-shrink-0 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  Insertar
                </button>
              </div>
              {imageError && <p className="text-xs text-red-600">{imageError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
