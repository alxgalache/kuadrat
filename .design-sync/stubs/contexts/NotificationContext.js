// Stub for @/contexts/NotificationContext (design-sync bundle only). Returns
// sample notifications so the NotificationContainer preview shows real toasts
// (the component reads them from context, so the stub is the only injection point).
const sampleNotifications = [
  { id: 1, type: 'success', title: 'Obra publicada', message: 'Tu obra ya está visible en la galería.' },
  { id: 2, type: 'info', title: 'Puja recibida', message: 'Has pujado 1.200 € por «Marea baja».' },
  {
    id: 3,
    type: 'error',
    title: 'No se pudo completar el pago',
    message: 'Revisa los datos e inténtalo de nuevo.',
    errors: ['La tarjeta ha sido rechazada'],
  },
]
export function useNotification() {
  return {
    notifications: sampleNotifications,
    addNotification() {},
    removeNotification() {},
    clearNotifications() {},
    notifySuccess() {},
    notifyError() {},
    notifyInfo() {},
    notifyWarning() {},
  }
}
export function NotificationProvider({ children }) {
  return children
}
export default { useNotification, NotificationProvider }
