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

export const metadata = {
  title: '140d - Galería de Arte',
    description: 'Una galería de arte en línea seleccionada que presenta obras de arte únicas de artistas talentosos',
  appleWebApp: {
    title: '140d.art',
    statusBarStyle: 'default',
  },
  manifest: '/manifest.json',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col">
        <NotificationProvider>
          <BannerNotificationProvider>
            <AuthProvider>
              <CartProvider>
                {/* <ShippingBanner /> */}
                <Navbar />
                <main className="flex-grow">{children}</main>
                <Footer />
                <NotificationContainer />
                <BannerNotification />
              </CartProvider>
            </AuthProvider>
          </BannerNotificationProvider>
        </NotificationProvider>
      </body>
    </html>
  )
}
