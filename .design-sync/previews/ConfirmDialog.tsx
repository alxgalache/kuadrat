import React from 'react'
import { ConfirmDialog } from 'kuadrat-client'

// Modal confirmation dialog. Rendered open inside a single-story card (see the
// cfg.overrides viewport). `type` switches the icon + accent color.

export const Eliminar = () => (
  <ConfirmDialog
    open
    onClose={() => {}}
    onConfirm={() => {}}
    title="¿Eliminar esta obra?"
    message="Esta acción no se puede deshacer. La obra dejará de estar visible en la galería."
    confirmText="Eliminar"
    cancelText="Cancelar"
    type="danger"
  />
)

export const Advertencia = () => (
  <ConfirmDialog
    open
    onClose={() => {}}
    onConfirm={() => {}}
    title="Tienes cambios sin guardar"
    message="Si sales ahora perderás los cambios realizados en esta publicación."
    confirmText="Salir igualmente"
    cancelText="Seguir editando"
    type="warning"
  />
)
