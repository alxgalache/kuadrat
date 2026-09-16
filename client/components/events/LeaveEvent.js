'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ConfirmDialog'
import InlineConfirm from '@/components/events/InlineConfirm'
import { LEAVE_EVENT_COPY } from '@/lib/constants'

const LeaveEventContext = createContext(null)

/**
 * Salir del evento (openspec/changes/live-event-mobile-layout, capacidad
 * live-event-leave): una sola confirmación para todo lo que saca de la sala —el
 * botón «Salir del evento» y el logo de la sala compacta—, que lleva a la página
 * de inicio solo tras «Confirmar».
 *
 * La navegación es de cliente (`router.push`): la sala se desmonta y sus
 * limpiezas abandonan el canal RTC, cierran el socket y retiran `data-live-room`
 * del documento.
 *
 * DÓNDE SE PINTA LA CONFIRMACIÓN, y por qué hay dos:
 * - Dentro de la sala compacta (`inShell`), la pinta `LiveRoomShell` como hija
 *   suya (`LeaveEventConfirm`), igual que el resto de su interfaz secundaria.
 * - En cualquier otro caso —escritorio, o la sala LiveKit, que no tiene
 *   disposición compacta— la pinta este proveedor con el `ConfirmDialog` común.
 *
 * @param {object} props
 * @param {'attendee'|'host'|'cohost'} props.role - Elige el mensaje: quien emite
 *   deja de emitir al salir, pero el evento sigue activo
 * @param {boolean} props.inShell - La sala se está mostrando en su contenedor compacto
 */
export function LeaveEventProvider({ role = 'attendee', inShell = false, children }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const request = useCallback(() => setOpen(true), [])
  const cancel = useCallback(() => {
    if (!leaving) setOpen(false)
  }, [leaving])
  const confirm = useCallback(() => {
    setLeaving(true)
    router.push('/')
  }, [router])

  const value = useMemo(
    () => ({ open, leaving, role, request, cancel, confirm }),
    [open, leaving, role, request, cancel, confirm]
  )

  return (
    <LeaveEventContext.Provider value={value}>
      {children}
      {!inShell && (
        <ConfirmDialog
          open={open}
          onClose={cancel}
          onConfirm={confirm}
          title={LEAVE_EVENT_COPY.title}
          message={LEAVE_EVENT_COPY.message[role] || LEAVE_EVENT_COPY.message.attendee}
          confirmText={leaving ? LEAVE_EVENT_COPY.leaving : LEAVE_EVENT_COPY.confirm}
          cancelText={LEAVE_EVENT_COPY.cancel}
          type="warning"
        />
      )}
    </LeaveEventContext.Provider>
  )
}

/** `null` fuera de un LeaveEventProvider. */
export function useLeaveEvent() {
  return useContext(LeaveEventContext)
}

/**
 * Confirmación de salida dentro del contenedor compacto (la pinta LiveRoomShell).
 * `InlineConfirm` es `absolute inset-0`: se coloca sobre el contenedor fijo.
 */
export function LeaveEventConfirm() {
  const leave = useLeaveEvent()
  if (!leave) return null
  return (
    <InlineConfirm
      open={leave.open}
      title={LEAVE_EVENT_COPY.title}
      message={LEAVE_EVENT_COPY.message[leave.role] || LEAVE_EVENT_COPY.message.attendee}
      confirmText={leave.leaving ? LEAVE_EVENT_COPY.leaving : LEAVE_EVENT_COPY.confirm}
      cancelText={LEAVE_EVENT_COPY.cancel}
      busy={leave.leaving}
      onConfirm={leave.confirm}
      onCancel={leave.cancel}
    />
  )
}

const VARIANTS = {
  // Cabecera de escritorio: botón secundario de Tailwind UI
  desktop: 'inline-flex items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50',
  // Barra superior de la sala compacta: 44 px de alto, sin caja
  compact: 'flex h-11 items-center gap-x-1 px-1 text-xs font-semibold text-gray-700 hover:text-gray-900 [touch-action:manipulation]',
  // Controles superpuestos sobre la escena en horizontal
  onDark: 'flex h-9 items-center gap-x-1 rounded-md bg-black/60 px-2 text-xs font-semibold text-white hover:bg-black/80 [touch-action:manipulation]',
}

/**
 * Botón «Salir del evento». No navega: abre la confirmación del proveedor.
 *
 * @param {object} props
 * @param {'desktop'|'compact'|'onDark'} [props.variant='desktop']
 */
export function LeaveEventButton({ variant = 'desktop' }) {
  const leave = useLeaveEvent()
  if (!leave) return null
  const short = variant !== 'desktop'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        leave.request()
      }}
      aria-label={short ? LEAVE_EVENT_COPY.button : undefined}
      className={VARIANTS[variant]}
    >
      <ArrowRightStartOnRectangleIcon aria-hidden="true" className={variant === 'desktop' ? 'size-5 -ml-0.5' : 'size-4'} />
      {short ? LEAVE_EVENT_COPY.buttonShort : LEAVE_EVENT_COPY.button}
    </button>
  )
}
