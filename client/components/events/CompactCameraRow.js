'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AgoraVideo from '@/components/events/AgoraVideo'
import LiveRoomSheet, { LiveRoomSheetRow } from '@/components/events/LiveRoomSheet'
import { LIVE_ROOM_CAMERA_TILE, LIVE_ROOM_COPY } from '@/lib/constants'

// Cuadrado relativo al alto del contenedor (`--room-h`, useLiveRoomViewport):
// 72 px en un iPhone SE, 86 en un iPhone 15, 103 en un Pixel 7.
const TILE_SIZE = `clamp(${LIVE_ROOM_CAMERA_TILE.minPx}px, calc(var(--room-h, 100dvh) * ${LIVE_ROOM_CAMERA_TILE.heightRatio}), ${LIVE_ROOM_CAMERA_TILE.maxPx}px)`
const PULSE_STYLE = { animation: 'speaking-pulse 1.5s ease-in-out infinite' }

function MicIcon({ active }) {
  return active ? (
    <svg className="size-3 flex-shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  ) : (
    <svg className="size-3 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  )
}

/**
 * Fila de cámaras de una reunión (`meeting`) en la sala compacta: cuadrados 1:1
 * con desplazamiento horizontal.
 *
 * 1:1 porque los asistentes publican 16:9 pero un móvil en vertical publica 9:16:
 * el recorte centrado a cuadrado es la única forma que conserva caras en ambos.
 *
 * SOLO LOS CUADRADOS VISIBLES MONTAN VÍDEO (más un cuadrado de margen), igual que
 * la banda del teatro: con 15 cámaras, pintarlas todas en un móvil es coste de
 * composición sin nadie mirando. No reduce lo que se recibe ni lo que factura
 * Agora — la suscripción no cambia (cambio futuro anotado).
 *
 * Tocar un cuadrado abre la hoja del participante: nombre, estado y, para el
 * host, «Silenciar micrófono».
 */
export default function CompactCameraRow({
  entries, selfIdentity, room, remoteByUid, speakingUids, localUid, viewerIsHost, onForceMute,
}) {
  const scrollerRef = useRef(null)
  const observerRef = useRef(null)
  const nodesRef = useRef(new Map())
  const [visibleIds, setVisibleIds] = useState(() => new Set())
  const [selectedIdentity, setSelectedIdentity] = useState(null)

  useEffect(() => {
    const root = scrollerRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((records) => {
      setVisibleIds((prev) => {
        let next = prev
        for (const record of records) {
          const id = record.target.dataset.identity
          if (record.isIntersecting && !next.has(id)) {
            if (next === prev) next = new Set(prev)
            next.add(id)
          } else if (!record.isIntersecting && next.has(id)) {
            if (next === prev) next = new Set(prev)
            next.delete(id)
          }
        }
        return next
      })
    }, { root, rootMargin: `0px ${LIVE_ROOM_CAMERA_TILE.maxPx}px` })
    observerRef.current = observer
    for (const node of nodesRef.current.values()) observer.observe(node)
    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [])

  // Una ref estable por identidad: un callback nuevo en cada render haría
  // observar y dejar de observar cada cuadrado en cada render.
  const refCache = useRef(new Map())
  const refFor = useCallback((identity) => {
    if (!refCache.current.has(identity)) {
      refCache.current.set(identity, (node) => {
        const previous = nodesRef.current.get(identity)
        if (previous) observerRef.current?.unobserve(previous)
        if (node) {
          nodesRef.current.set(identity, node)
          observerRef.current?.observe(node)
        } else {
          nodesRef.current.delete(identity)
          refCache.current.delete(identity)
        }
      })
    }
    return refCache.current.get(identity)
  }, [])

  const selected = useMemo(
    () => (selectedIdentity ? entries.find((p) => p.identity === selectedIdentity) || null : null),
    [entries, selectedIdentity]
  )

  const describe = (entry) => {
    const isLocal = entry.identity === selfIdentity
    const remoteUser = entry.agoraUid != null ? remoteByUid.get(Number(entry.agoraUid)) : null
    return {
      isLocal,
      videoTrack: isLocal ? (room.camEnabled ? room.camTrackRef.current : null) : (remoteUser?.videoTrack || null),
      micActive: isLocal ? room.micEnabled : !!remoteUser?.hasAudio,
      speaking: speakingUids.has(isLocal ? localUid : Number(entry.agoraUid)),
      name: isLocal ? `${entry.name} ${LIVE_ROOM_COPY.you}` : entry.name,
    }
  }

  const selectedInfo = selected ? describe(selected) : null
  const canForceMute = selected && viewerIsHost && !selectedInfo.isLocal && !selected.isHost && !selected.staff

  return (
    <div
      ref={scrollerRef}
      className="scrollbar-hide flex flex-shrink-0 gap-x-2 overflow-x-auto overscroll-x-contain border-b border-gray-200 bg-white p-2"
    >
      {entries.map((entry) => {
        const info = describe(entry)
        const mountVideo = !!info.videoTrack && visibleIds.has(entry.identity)
        return (
          <button
            key={entry.identity}
            ref={refFor(entry.identity)}
            data-identity={entry.identity}
            type="button"
            onClick={() => setSelectedIdentity(entry.identity)}
            aria-label={info.name}
            className={`relative flex-shrink-0 overflow-hidden rounded-lg bg-gray-900 transition-shadow duration-300 [touch-action:manipulation] ${info.speaking ? 'ring-2 ring-green-400' : ''}`}
            style={{ width: TILE_SIZE, height: TILE_SIZE, ...(info.speaking ? PULSE_STYLE : {}) }}
          >
            {mountVideo ? (
              <AgoraVideo track={info.videoTrack} className="h-full w-full" fit="cover" />
            ) : (
              <span className="flex h-full items-center justify-center">
                <span className="flex size-8 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-white">
                  {(entry.name || '?').charAt(0).toUpperCase()}
                </span>
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-x-1 bg-black/50 px-1 py-0.5">
              <span className="min-w-0 flex-1 truncate text-left text-[10px] text-white">{info.name}</span>
              <MicIcon active={info.micActive} />
            </span>
          </button>
        )
      })}

      <LiveRoomSheet open={!!selected} title={selectedInfo?.name || ''} onClose={() => setSelectedIdentity(null)}>
        {selected && (
          <>
            <p className="border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
              {selected.staff ? LIVE_ROOM_COPY.roleCoHost : (selectedInfo.micActive ? LIVE_ROOM_COPY.stateMicOn : LIVE_ROOM_COPY.stateMicOff)}
            </p>
            {canForceMute && (
              <LiveRoomSheetRow
                label={LIVE_ROOM_COPY.muteParticipant}
                danger
                onClick={() => { onForceMute(selected.identity); setSelectedIdentity(null) }}
              />
            )}
          </>
        )}
      </LiveRoomSheet>
    </div>
  )
}
