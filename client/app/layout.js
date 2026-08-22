import './globals.css'
// import ShippingBanner from '@/components/ShippingBanner'
import Script from 'next/script'
import JsonLd from '@/components/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/schema'
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
import { buildOpenGraph, buildTwitter } from '@/lib/metadata'

const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'
const IS_PUBLISHED = process.env.PUBLISHED_VISIBLE === 'true' || process.env.PUBLISHED_VISIBLE === '1'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

// Explicit viewport (Next.js would inject the same defaults, but iOS Safari
// computed a slightly zoomed-in first paint when horizontal overflow widened
// the layout viewport — see the html/body overflow-x rule in globals.css)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Tiñe la barra del navegador en móvil. `manifest.json` ya declaraba
  // `theme_color: #ffffff`, pero el manifest sólo gobierna la aplicación
  // instalada: en una visita normal el color sale de ESTA etiqueta, y sin ella
  // Android pintaba su gris por defecto. Blanco porque el sitio es de tema
  // claro únicamente, así que la barra continúa la página en vez de cortarla.
  themeColor: '#ffffff',
}

export const metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: '140d | Galería de arte online: obra original de artistas emergentes',
    template: '%s | 140d',
  },
  // 140 caracteres. Google corta la descripción alrededor de los 155-160 y esta
  // es la POR DEFECTO: la hereda toda ruta que no declare la suya, así que si se
  // pasa de largo el recorte se propaga a varias páginas a la vez. La versión
  // anterior medía 238 y perdía sus últimas cuatro palabras en cada una.
  description:
    'Galería de arte online española de arte contemporáneo emergente. ' +
    'Obra original certificada, envío a toda España y directos con los artistas.',

  // `keywords` no pesa en el ranking de Google desde hace años. Se conserva
  // porque sí lo leen algunos rastreadores de IA y agregadores como señal de
  // tema, que es justo el objetivo GEO. No se rellena de sinónimos: una lista
  // larga y genérica describe peor que una corta y exacta.
  keywords: [
    'galería de arte online', 'comprar arte original', 'arte contemporáneo español',
    'artistas emergentes', 'arte joven', 'comprar cuadros online',
    'obra original certificada', 'ediciones limitadas', 'subastas de arte online',
    'galería de arte España', '140d',
  ],

  authors: [{ name: '140d' }],
  creator: '140d',
  publisher: '140d Galería de Arte',

  // Declarar `icons` aquí ANULA la convención de fichero de Next para `icon` y
  // `apple-icon` (app/icon*.*, app/apple-icon.*): esos ficheros dejan de emitir
  // su <link> aunque sigan existiendo. Por eso se borraron; si algún día se
  // quita este bloque, la convención se reactiva y cualquier app/icon* vuelve a
  // ser el favicon real. `app/favicon.ico` es la excepción: Next lo emite
  // siempre, así que /favicon.ico aparece dos veces en el <head>.
  //
  // Los tres iconos de pestaña son la pastilla redondeada con las esquinas a
  // alfa 0. `apple-touch-icon` y los del manifest van aparte y deben seguir
  // siendo cuadrados y opacos: iOS aplana la transparencia sobre negro y los
  // `maskable` tienen que llenar el lienzo. Se regeneran desde el maestro
  // public/brand/favicon-master-512.png — procedimiento en docs/favicon.md.
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

  // Estos dos bloques ya no son los valores «heredados» por el resto del sitio:
  // Next SUSTITUYE `openGraph` y `twitter` en cuanto un hijo los declara, nunca
  // los fusiona. La herencia real la da `lib/metadata.js`, que cada ruta invoca.
  // Ver el comentario extenso de ese fichero.
  openGraph: buildOpenGraph({
    title: '140d - Galería de arte online',
    description: 'Obra original de artistas contemporáneos emergentes, con certificado de autenticidad y envío a toda España.',
    path: '/',
  }),

  twitter: buildTwitter({
    title: '140d - Galería de arte online',
    description: 'Obra original de artistas contemporáneos emergentes, con certificado de autenticidad y envío a toda España.',
  }),

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

// Los dos nodos raíz. Antes eran literales aquí mismo; ahora salen de
// lib/schema.js, que es el único sitio donde se decide qué se publica sobre la
// galería y qué no. Los hechos vienen de lib/siteInfo.js — todos confirmados
// por el operador.
const organizationSchema = buildOrganization()
const websiteSchema = buildWebSite()

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
