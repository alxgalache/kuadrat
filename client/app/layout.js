import './globals.css'
// import ShippingBanner from '@/components/ShippingBanner'
import JsonLd from '@/components/JsonLd'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { BannerNotificationProvider } from '@/contexts/BannerNotificationContext'
import NotificationContainer from '@/components/Notification'
import BannerNotification from '@/components/BannerNotification'
import RateLimitHandler from '@/components/RateLimitHandler'
import TestAccessGate from '@/components/TestAccessGate'
import LayoutWrapper from '@/components/LayoutWrapper'

const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'
const IS_PUBLISHED = process.env.PUBLISHED_VISIBLE === 'true' || process.env.PUBLISHED_VISIBLE === '1'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

export const metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: '140d - Galería de Arte Online | Compra Arte Original',
    template: '%s | 140d',
  },
  description: 'Descubre y compra obras de arte originales directamente de artistas emergentes y consagrados. Galería de arte online con obras únicas, subastas en vivo y eventos culturales. Democratizamos el arte.',

  keywords: [
    'galería de arte online', 'comprar arte original', 'artistas emergentes',
    'arte contemporáneo', 'subastas de arte', 'eventos de arte', 'comprar cuadros online',
    'arte digital', 'ilustraciones originales', 'galería de arte España', '140d',
  ],

  authors: [{ name: '140d' }],
  creator: '140d',
  publisher: '140d Galería de Arte',

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

  alternates: {
    canonical: '/',
  },

  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: SITE_URL,
    siteName: '140d',
    title: '140d - Galería de Arte Online',
    description: 'Descubre y compra obras de arte originales directamente de artistas. Galería online, subastas en vivo y eventos culturales.',
    images: [
      {
        url: '/brand/og-image.jpg',
        width: 1200,
        height: 630,
        alt: '140d - Galería de Arte Online',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: '140d - Galería de Arte Online',
    description: 'Descubre y compra obras de arte originales directamente de artistas. Galería online, subastas en vivo y eventos culturales.',
    images: ['/brand/og-image.jpg'],
  },

  appleWebApp: {
    title: '140d',
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

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: '140d',
  alternateName: '140d Galería de Arte',
  url: SITE_URL,
  logo: `${SITE_URL}/brand/140d.png`,
  sameAs: [
    'https://www.facebook.com/140dart',
    'https://www.instagram.com/140dart',
    'https://x.com/140dart',
  ],
  description: 'Galería de arte online que democratiza el acceso al arte. Obras originales de artistas emergentes y consagrados.',
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'info@140d.art',
    contactType: 'customer service',
    availableLanguage: 'Spanish',
  },
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '140d',
  url: SITE_URL,
  inLanguage: 'es',
  description: 'Galería de arte online con obras originales, subastas en vivo y eventos culturales.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full flex flex-col">
        <JsonLd data={organizationSchema} />
        <JsonLd data={websiteSchema} />
        <NotificationProvider>
          <BannerNotificationProvider>
            <RateLimitHandler />
            <AuthProvider>
              <CartProvider>
                <TestAccessGate gateEnabled={WEB_APP_HIDDEN}>
                  {/* <ShippingBanner /> */}
                  <LayoutWrapper isPublished={IS_PUBLISHED}>
                    {children}
                  </LayoutWrapper>
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
