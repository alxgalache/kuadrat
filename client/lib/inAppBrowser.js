// Navegadores internos de las apps (Instagram, Facebook, Messenger, Threads,
// TikTok, LinkedIn) y salida al navegador real (event-identity-provider-verification).
//
// Google bloquea su inicio de sesión dentro de las vistas web de las apps
// (403 disallowed_useragent). La tarjeta «Continuar con Google» no se oculta:
// dentro de una app abre NUESTRA URL de inicio en el navegador real con el
// enlace de salida de cada app y plataforma, y la verificación entera (cookie,
// Google y vuelta) ocurre allí.
//
// Los enlaces de salida no son oficiales y Meta los cambia: si uno deja de
// funcionar, la tarjeta muestra instrucciones a los 2 s. Repetir la matriz de
// docs/verificacion-proveedores/04-pruebas-manuales.md (bloque C) tras cada
// actualización grande de Instagram o Facebook.
//
// Único lugar con los tokens de user agent de las apps. El filtro de ruido de
// `instrumentation-client.js` es otro asunto y no lo usa.

const IOS = /iPhone|iPad|iPod/i
const ANDROID = /Android/i

/**
 * ¿Es el navegador interno de una app?
 * @returns {{ app: string, platform: 'ios'|'android'|null } | null}
 */
export function detectInAppBrowser(userAgent) {
  const ua = String(userAgent || '')
  const platform = IOS.test(ua) ? 'ios' : ANDROID.test(ua) ? 'android' : null

  // Orden deliberado: Messenger y Threads también pueden llevar tokens de
  // Facebook, así que se miran antes.
  let app = null
  if (/Instagram/.test(ua)) app = 'instagram'
  else if (/MessengerForiOS|Orca-Android/.test(ua)) app = 'messenger'
  else if (/Barcelona/.test(ua)) app = 'threads'
  else if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) app = 'facebook'
  else if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) app = 'tiktok'
  else if (/LinkedInApp/.test(ua)) app = 'linkedin'
  else if (platform === 'android' && /; wv\)/.test(ua)) app = 'android-webview'

  return app ? { app, platform } : null
}

/**
 * El enlace que abre `url` en el navegador real desde la app detectada, o
 * null si no hay ninguno conocido (iOS TikTok, por ejemplo): entonces se
 * muestran directamente las instrucciones.
 *
 * Android: un intent sin paquete, que abre el navegador por defecto. Sin
 * `S.browser_fallback_url`: si la app no lo resolviera, ese respaldo cargaría
 * la URL dentro de la propia vista web, que es justo la pantalla de bloqueo
 * de Google.
 */
export function externalBrowserUrl(url, detected) {
  if (!detected) return null
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  // Los dos esquemas de salida solo saben abrir https (en local, http, no hay salida).
  if (parsed.protocol !== 'https:') return null
  const hostPath = `${parsed.host}${parsed.pathname}${parsed.search}`

  if (detected.platform === 'android') {
    return `intent://${hostPath}#Intent;scheme=https;end`
  }
  if (detected.platform === 'ios') {
    if (detected.app === 'instagram') return `instagram://extbrowser/?url=${encodeURIComponent(url)}`
    if (['facebook', 'messenger', 'threads', 'linkedin'].includes(detected.app)) {
      return `x-safari-https://${hostPath}`
    }
  }
  return null
}

/**
 * Dispara el enlace de salida. Debe llamarse dentro del mismo manejador del
 * toque, sin ningún `await` antes: las apps solo lo aceptan como gesto del
 * usuario. `x-safari-https` funciona en Facebook con `window.open`; el resto,
 * como navegación.
 */
export function openInExternalBrowser(escapeUrl) {
  if (escapeUrl.startsWith('x-safari-')) {
    window.open(escapeUrl, '_blank')
  } else {
    window.location.href = escapeUrl
  }
}
