'use client'

import { useState } from 'react'
import InlineConfirm from '@/components/events/InlineConfirm'
import { ControlIconButton, ControlsRow, ControlsSheet } from '@/components/events/CompactControls'
import { LIVE_ROOM_COPY } from '@/lib/constants'

/**
 * Controles del host en la sala compacta: una PRESENTACIÓN más de
 * `useHostMediaControls`, instanciado una sola vez en AgoraLiveRoom (igual que
 * `AgoraHostControls` y `HostConsole`). Aquí no se enumera ni se cambia nada por
 * cuenta propia.
 *
 * Fila: micrófono, cámara, pantalla (solo si el navegador puede compartirla),
 * pizarra (si está disponible), «Más» y «Finalizar». Lo demás, en la hoja.
 *
 * @param {object} props
 * @param {object} props.room - useAgoraRoom
 * @param {object} props.hostControls - useHostMediaControls
 * @param {string} props.endLabel - «Finalizar stream» | «Finalizar evento»
 * @param {object} props.whiteboard - { available, active, everyoneWrites, onToggle, onEveryoneWritesChange, showEveryoneWrites }
 * @param {{mode, onSelect}|null} [props.hostView] - Consola móvil habilitada en el evento
 */
export default function CompactHostControls({ room, hostControls, endLabel, whiteboard, hostView = null }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const {
    devices, videoEffect, deviceError, isEnding,
    toggleMic, toggleCamera, toggleScreenShare, selectDevice, endEvent,
    videoQuality, selectVideoQuality, screenShareSupported, speakerSelectionSupported,
  } = hostControls

  const handleEnd = async () => {
    const ok = await endEvent()
    if (!ok) setConfirmOpen(false)
  }

  return (
    <>
      <ControlsRow
        error={deviceError || videoEffect.message}
        trailing={(
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={endLabel}
            className="min-h-11 flex-shrink-0 rounded-md bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-500 [touch-action:manipulation]"
          >
            {LIVE_ROOM_COPY.end}
          </button>
        )}
      >
        <ControlIconButton kind="mic" label={LIVE_ROOM_COPY.mic} active={room.micEnabled} onClick={toggleMic} />
        <ControlIconButton kind="camera" label={LIVE_ROOM_COPY.camera} active={room.camEnabled} onClick={toggleCamera} />
        {screenShareSupported && (
          <ControlIconButton kind="screen" label={LIVE_ROOM_COPY.screen} active={room.screenEnabled} onClick={toggleScreenShare} />
        )}
        {whiteboard?.available && (
          <ControlIconButton kind="whiteboard" label={LIVE_ROOM_COPY.whiteboard} active={whiteboard.active} onClick={whiteboard.onToggle} />
        )}
        <ControlIconButton kind="more" label={LIVE_ROOM_COPY.moreOptions} onClick={() => setSheetOpen(true)} />
      </ControlsRow>

      <ControlsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        devices={devices}
        onSelectDevice={selectDevice}
        speakerSupported={speakerSelectionSupported}
        screenUnsupported={!screenShareSupported}
        quality={selectVideoQuality ? { value: videoQuality, onSelect: selectVideoQuality } : null}
        effects={videoEffect.supported ? { videoEffect, camEnabled: room.camEnabled } : null}
        everyoneWrites={whiteboard?.available && whiteboard.showEveryoneWrites && whiteboard.active
          ? { value: whiteboard.everyoneWrites, onChange: whiteboard.onEveryoneWritesChange }
          : null}
        hostView={hostView}
      />

      <InlineConfirm
        open={confirmOpen}
        title={endLabel}
        message={LIVE_ROOM_COPY.endConfirm}
        confirmText={isEnding ? LIVE_ROOM_COPY.ending : LIVE_ROOM_COPY.end}
        busy={isEnding}
        onConfirm={handleEnd}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
