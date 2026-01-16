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
import RateLimitHandler from '@/components/RateLimitHandler'
import TestAccessGate from '@/components/TestAccessGate'

const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'
const IS_PUBLISHED = process.env.PUBLISHED_VISIBLE === 'true' || process.env.PUBLISHED_VISIBLE === '1'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

export const metadata = {
  title: '140d - Galería de Arte',
  description: 'Una galería de arte en línea seleccionada que presenta obras de arte únicas de artistas talentosos',

  // Keywords for search engines
  keywords: ['galería de arte', 'arte online', 'comprar arte', 'artistas', 'obras de arte', '140d'],

  // Authors
  authors: [{ name: '140d' }],

  // Icons - Favicon and Apple Touch Icon
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },

  // Open Graph - Used by Facebook, WhatsApp, LinkedIn, Telegram, etc.
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: SITE_URL,
    siteName: '140d',
    title: '140d - Galería de Arte',
    description: 'Una galería de arte en línea seleccionada que presenta obras de arte únicas de artistas talentosos',
    images: [
      {
        url: `${SITE_URL}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: '140d - Galería de Arte',
      },
    ],
  },

  // Twitter Card - Used by Twitter/X
  twitter: {
    card: 'summary_large_image',
    title: '140d - Galería de Arte',
    description: 'Una galería de arte en línea seleccionada que presenta obras de arte únicas de artistas talentosos',
    images: [`${SITE_URL}/og-image.jpg`],
  },

  // Apple Web App
  appleWebApp: {
    title: '140d',
    statusBarStyle: 'default',
  },

  // Manifest
  manifest: '/manifest.json',

  // Robots (conditional based on WEB_APP_HIDDEN)
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
            <RateLimitHandler />
            <AuthProvider>
              <CartProvider>
                <TestAccessGate gateEnabled={WEB_APP_HIDDEN}>
                  {/* <ShippingBanner /> */}
                  {IS_PUBLISHED && <Navbar />}
                  <main className="flex-grow">{children}</main>
                  {IS_PUBLISHED && <Footer />}
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
