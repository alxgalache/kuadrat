// Stub for @/contexts/BannerNotificationContext (design-sync bundle only).
// Returns a sample banner so the BannerNotification preview renders content.
export function useBannerNotification() {
  return {
    banner: { id: 1, type: 'info', message: 'Envío gratuito en pedidos superiores a 100 €.' },
    showBanner() {},
    dismissBanner() {},
  }
}
export function BannerNotificationProvider({ children }) {
  return children
}
export default { useBannerNotification, BannerNotificationProvider }
