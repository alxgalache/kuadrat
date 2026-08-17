'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { META_PIXEL_ID } from '@/lib/constants'
import { useCookieConsent } from '@/contexts/CookieConsentContext'
import { META_PIXEL_ENABLED, trackPageView, setPixelConsent, flushPendingEvents } from '@/lib/metaPixel'

/**
 * Meta Pixel: snippet base + PageView en cada navegación, **solo con
 * consentimiento publicitario**.
 *
 * - Sin `adsAllowed` no se renderiza nada: ni el script, ni el `<noscript>`.
 *   La cookie de Meta no llega a crearse, que es distinto de crearla y no
 *   usarla. Consecuencia buscada del `<noscript>` condicionado: un navegador
 *   sin JavaScript no puede otorgar consentimiento, así que tampoco se le
 *   rastrea — el píxel sin script era precisamente el agujero por el que se
 *   colaba el seguimiento sin permiso.
 *
 * - `strategy="afterInteractive"` y no `beforeInteractive`. Lo segundo exige
 *   que el script esté en el HTML inicial, y el consentimiento vive en
 *   `localStorage`, que solo se puede leer ya en el cliente: no hay forma de
 *   decidir en el servidor si inyectarlo. El coste es que `window.fbq` aparece
 *   después de la hidratación, y por eso `lib/metaPixel.js` guarda en un búfer
 *   los eventos de esa ventana y los reenvía en `flushPendingEvents()`.
 *
 * - Solo se usa `usePathname()`, nunca `useSearchParams()`: este componente
 *   vive en el layout raíz y `useSearchParams()` obligaría a renderizado
 *   dinámico a todo el árbol, tirando por tierra el ISR de las fichas de
 *   producto (ver "Production Load Hardening" en CLAUDE.md).
 */
export default function MetaPixel() {
  const pathname = usePathname()
  const { adsAllowed } = useCookieConsent()
  // META_PIXEL_ENABLED cubre id + entorno (ver lib/metaPixel.js); aquí solo se
  // añade el consentimiento, que es lo único que cambia en caliente.
  const enabled = META_PIXEL_ENABLED && adsAllowed

  // Última ruta cuyo PageView ya se contabilizó. No es un simple "¿es el primer
  // render?" porque el consentimiento puede llegar en mitad de la sesión: en
  // ese momento el snippet se monta y emite su propio PageView de la ruta
  // actual, así que hay que anclarse a ella y no volver a contarla.
  const lastTrackedPathRef = useRef(null)

  useEffect(() => {
    setPixelConsent(enabled)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      // Al revocar, se olvida el ancla para que un nuevo consentimiento vuelva
      // a partir de cero en lugar de emitir un PageView de más.
      lastTrackedPathRef.current = null
      return
    }

    // Segundo intento de vaciar el búfer, además del `onReady` del <Script>.
    // Es idempotente (si está vacío no hace nada) y evita que los eventos se
    // queden atrapados si `onReady` no llegara a dispararse.
    flushPendingEvents()

    if (lastTrackedPathRef.current === null) {
      // El snippet base ya emite el PageView de la ruta en la que se monta.
      lastTrackedPathRef.current = pathname
      return
    }

    if (lastTrackedPathRef.current !== pathname) {
      lastTrackedPathRef.current = pathname
      trackPageView()
    }
  }, [pathname, enabled])

  if (!enabled) return null

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive" onReady={flushPendingEvents}>
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  )
}
