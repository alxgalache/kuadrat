import './globals.css'
// import ShippingBanner from '@/components/ShippingBanner'
import Script from 'next/script'
import JsonLd from '@/components/JsonLd'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { CookieConsentProvider } from '@/contexts/CookieConsentContext'
import { BannerNotificationProvider } from '@/contexts/BannerNotificationContext'
import NotificationContainer from '@/components/Notification'
import BannerNotification from '@/components/BannerNotification'
import CookieBanner from '@/components/CookieBanner'
import NewsletterBanner from '@/components/NewsletterBanner'
import RateLimitHandler from '@/components/RateLimitHandler'
import TestAccessGate from '@/components/TestAccessGate'
import LayoutWrapper from '@/components/LayoutWrapper'
import MetaPixel from '@/components/MetaPixel'
import { CONSENT_BOOTSTRAP_SCRIPT } from '@/lib/cookieConsent'
import { IS_PROD } from '@/lib/env'

const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'
const IS_PUBLISHED = process.env.PUBLISHED_VISIBLE === 'true' || process.env.PUBLISHED_VISIBLE === '1'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

// Explicit viewport (Next.js would inject the same defaults, but iOS Safari
// computed a slightly zoomed-in first paint when horizontal overflow widened
// the layout viewport — see the html/body overflow-x rule in globals.css)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

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
    // `suppressHydrationWarning` cubre EXACTAMENTE un atributo: el
    // `data-cookie-consent` que el script de arranque escribe en <html> antes
    // de que React hidrate. El servidor no puede emitirlo —depende de
    // localStorage— así que React lo ve como una discrepancia y avisa. Solo
    // afecta a los atributos de este nodo, no a su contenido.
    <html lang="es" className="h-full" suppressHydrationWarning>
      <body className="h-full flex flex-col">
        {/* Script bloqueante, deliberadamente el primer nodo del body: corre
            antes de que el navegador pinte el banner de cookies —que ahora
            viaja renderizado en el HTML para no retrasar el LCP— y lo oculta
            por CSS si ya hay una decisión guardada. Ver lib/cookieConsent.js. */}
        <script
          id="cookie-consent-bootstrap"
          dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP_SCRIPT }}
        />
        {/* CookieConsentProvider envuelve todo el árbol: el píxel de Meta lee de
            él si puede cargarse, el banner escribe la decisión y el pie de
            página lo reabre para cambiarla. */}
        <CookieConsentProvider>
          <MetaPixel />
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
                    <CookieBanner />
                    <NewsletterBanner />
                  </TestAccessGate>
                </CartProvider>
              </AuthProvider>
            </BannerNotificationProvider>
          </NotificationProvider>
        </CookieConsentProvider>
        {/* Plausible Analytics — solo en producción (IS_PROD, ver lib/env.js).

            La instancia es AUTOALOJADA en analytics.140d.art: los datos de
            visita no se ceden a un tercero. Por eso la política de cookies la
            declara aparte del píxel de Meta y no bajo el mismo consentimiento.

            NO va detrás del banner, a propósito. El tracker no escribe cookie
            ni identificador persistente en el equipo del visitante, así que
            queda fuera del art. 22.2 LSSI. Condicionarlo a `adsAllowed`
            descartaría a todo el que elige «Solo las necesarias», que es
            exactamente el coste que se evita usando analítica sin cookies.

            El id `pa-…` lo emite NUESTRA instancia para el sitio 140d.art y va
            literal a propósito: es un valor de tiempo de compilación, así que
            una variable NEXT_PUBLIC_* exigiría la misma reconstrucción del
            cliente sin aportar ninguna flexibilidad —solo cuatro sitios más
            que mantener sincronizados—. Contrapartida: si la instancia se
            recrea desde cero, el id cambia y este <script> pasa a dar 404 sin
            ningún error visible. */}
        {IS_PROD && (
          <>
            {/* Stub de cola asíncrona: permite llamar a window.plausible()
                antes de que el script externo cargue. No hace falta para los
                pageviews —el propio script los emite—, pero sin él cualquier
                evento personalizado disparado en esa ventana se pierde de
                forma intermitente: un fallo que depende de la latencia y que
                por tanto no se reproduce en local. */}
            <Script
              id="plausible-init"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`,
              }}
            />
            <Script
              strategy="afterInteractive"
              src="https://analytics.140d.art/js/pa-JOgfdmGauUrT5eiOHnIDj.js"
            />
          </>
        )}
      </body>
    </html>
  )
}
