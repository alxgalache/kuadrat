import './globals.css'
// import ShippingBanner from '@/components/ShippingBanner'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { BannerNotificationProvider } from '@/contexts/BannerNotificationContext'
import NotificationContainer from '@/components/Notification'
import BannerNotification from '@/components/BannerNotification'
import TestAccessGate from '@/components/TestAccessGate'

const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'

export const metadata = {
  title: '140d - Galería de Arte',
  description: 'Una galería de arte en línea seleccionada que presenta obras de arte únicas de artistas talentosos',
  appleWebApp: {
    title: '140d.art',
    statusBarStyle: 'default',
  },
  manifest: '/manifest.json',
  ...(WEB_APP_HIDDEN
    ? {
        robots: {
          index: false,
          follow: false,
        },
      }
    : {}),
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col">
        <NotificationProvider>
          <BannerNotificationProvider>
            <AuthProvider>
              <CartProvider>
                <TestAccessGate gateEnabled={WEB_APP_HIDDEN}>
                  {/* <ShippingBanner /> */}
                  <Navbar />
                  <main className="flex-grow">{children}</main>
                  <Footer />
                  <NotificationContainer />
                  <BannerNotification />
                </TestAccessGate>
              </CartProvider>
            </AuthProvider>
          </BannerNotificationProvider>
        </NotificationProvider>
      </body>
    </html>
  )
}
