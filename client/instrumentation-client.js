// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { SENTRY_ENABLED, SENTRY_TRACES_SAMPLE_RATE } from "./lib/sentryEnv";
import { isAgoraInterruptedPlayback } from "./lib/sentryNoise";
import { afterLoadIdle } from "./lib/idle";

Sentry.init({
  dsn: "https://053a88f0de66024cc2190230b04d7686@o4510473239330816.ingest.de.sentry.io/4510562852798544",

  // Off in development (transport only — the SDK stays initialized so
  // onRouterTransitionStart and the replay integration keep working the same
  // way in every environment). See client/lib/sentryEnv.js.
  enabled: SENTRY_ENABLED,

  // Session Replay NO va aquí: se registra tras la carga, al final de este
  // fichero. Los dos ratios de abajo sí, porque la integración los lee al
  // registrarse.
  integrations: [],

  // Define how likely traces are sampled. Override with
  // NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE; defaults to 0.1.
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // --- Ruido de navegadores in-app (Instagram / Facebook en Android) ---
  //
  // Estos navegadores inyectan sus propios scripts de telemetría en la página
  // y los comunican con la app nativa a través del puente JS<->Java del
  // WebView (`@JavascriptInterface`). Cuando ese puente se rompe —el objeto
  // Java se ha recolectado, o su método lanza— el script inyectado lanza una
  // excepción que acaba en `window.onerror` o dentro de un listener que
  // nuestro SDK envuelve, y Sentry la atribuye a la página que la hospeda.
  //
  // No es un defecto nuestro y no tiene efecto observable para el usuario: lo
  // que falla es la propia instrumentación de Meta, no el render, la
  // navegación ni el formulario. Se descarta en el navegador, antes de
  // consumir cuota.
  ignoreErrors: [
    // "Error invoking postMessage: Java object is gone"
    // "Error invoking postMessage: Java exception was raised during method
    //  invocation"
    // El mensaje lo genera la capa de reflexión del WebView de Android, no
    // JavaScript. Nada de lo que servimos habla con un puente nativo (cero
    // usos de postMessage/Worker/MessageChannel en el cliente), así que esta
    // cadena no puede originarse en nuestro código. Cuando falla el
    // `postMessage` DEL NAVEGADOR el mensaje es otro —"Failed to execute
    // 'postMessage' on 'Window': …"— y por eso el patrón va ANCLADO: no debe
    // casar con un error que sólo mencione postMessage por dentro.
    /^Error invoking postMessage:/,
  ],

  denyUrls: [
    // Origen de los scripts inyectados por el navegador in-app
    // (`app://navigation_performance_logger_android` y familia).
    //
    // OJO con el lookahead, es lo único que hace este patrón seguro: el SDK de
    // Sentry para Next.js reescribe NUESTROS propios frames a `app:///_next/…`
    // —tres barras—, mientras que los scripts inyectados viven en
    // `app://<nombre>` —dos—. Sin `(?!\/)` este `denyUrls` descartaría todos
    // los eventos de la aplicación.
    /^app:\/\/(?!\/)/,
  ],

  // --- `play()` abortado dentro del SDK de Agora al cambiar de cámara en iOS ---
  //
  // Rechazo sin capturar del propio reproductor de vídeo de Agora: tras una
  // interrupción de audio de iOS reanuda el <video> con un `play()` que no
  // espera, y la sustitución de pista de `setDevice` lo aborta al instante.
  // Sin pila (un DOMException no la tiene), sin efecto visible y sin nada
  // nuestro en el camino. La explicación completa y las tres condiciones que lo
  // acotan están en lib/sentryNoise.js: no basta con `ignoreErrors`, porque el
  // mismo mensaje de WebKit también es el de cualquier AbortSignal abortado.
  beforeSend(event, hint) {
    if (isAgoraInterruptedPlayback(event, hint)) return null;
    return event;
  },
});

// --- Session Replay, fuera de la ruta crítica ---
//
// rrweb, el grabador de Replay, eran ~35–40 KB gzip del chunk principal de
// TODAS las páginas, descargados y evaluados antes del primer pintado para
// grabar sesiones que se muestrean al 10 %. Además traía uno de los avisos de
// «JavaScript antiguo» de PageSpeed (su parche de `Array.from`). Se registra
// tras el evento `load` y en reposo, con `addIntegration`.
//
// Lo que se pierde, y se acepta: un error ocurrido antes de ese momento llega a
// Sentry igual que siempre, pero sin grabación; y una sesión muestreada empieza
// a grabar después de cargar. La captura de errores, el tracing y
// `onRouterTransitionStart` siguen activos desde el primer instante.
//
// A través de `lib/sentryReplay.js` y no con `import("@sentry/nextjs")`: el
// import del paquete entero descargaba el SDK completo otra vez (105 KB gzip)
// para usar una sola función. Comprobado en la compilación de producción: rrweb
// no aparece en ningún chunk que referencie el HTML.
afterLoadIdle(() => {
  import("./lib/sentryReplay")
    .then(({ replayIntegration }) => {
      Sentry.addIntegration(replayIntegration());
    })
    .catch(() => {
      // Sin Replay la aplicación funciona igual; no hay nada que avisar.
    });
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
