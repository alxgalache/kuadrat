// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { SENTRY_ENABLED, SENTRY_TRACES_SAMPLE_RATE } from "./lib/sentryEnv";

Sentry.init({
  dsn: "https://053a88f0de66024cc2190230b04d7686@o4510473239330816.ingest.de.sentry.io/4510562852798544",

  // Off in development (transport only — the SDK stays initialized so
  // onRequestError keeps working the same way in every environment).
  // See client/lib/sentryEnv.js.
  enabled: SENTRY_ENABLED,

  // Define how likely traces are sampled. Override with
  // NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE; defaults to 0.1.
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // --- Ruido de escáneres de exploits contra el protocolo RSC ---
  //
  // Este invariante lo lanza Next.js, no nuestro código, y su propio mensaje
  // lo dice: "This is a bug in Next.js". Ocurre cuando llega un POST con
  // semántica de React Server Components (cabecera `Next-Action`, cuerpo
  // multipart del protocolo Flight) a una ruta que no existe: Next resuelve un
  // 404, intenta renderizar `/_not-found` y al ir a serializar la respuesta se
  // encuentra con que el contexto pide una carga RSC mientras el renderizador
  // ha producido texto plano. Revienta ahí, fuera de cualquier código nuestro,
  // y `onRequestError` lo manda a Sentry como excepción no capturada.
  //
  // Quien produce esas peticiones son escáneres de internet buscando la RCE
  // del protocolo Flight (CVE-2025-55182 / CVE-2025-66478). Están parcheadas
  // desde Next 16.0.7 y aquí corre una versión posterior, así que el intento
  // no llega a nada: el coste real era la cuota de Sentry. El issue
  // 140D-CLIENT-1V es un ejemplar.
  //
  // La primera línea de defensa NO es esta, es el bloque `default_server` de
  // deploy/nginx/140d.art.conf, que corta en seco cualquier Host que no sea
  // uno de los nuestros —así llegó el ataque del 19/08/2026, por la IP
  // desnuda—. Esto cubre el resto: quien se moleste en usar el dominio real.
  //
  // El patrón va ANCLADO y con el texto completo a propósito. `InvariantError`
  // es una clase que Next usa para MUCHAS comprobaciones internas, y filtrar
  // por el nombre de la clase escondería fallos de verdad. Lo que se descarta
  // es exactamente un mensaje, y si Next cambiara su redacción el filtro
  // dejaría de casar y los eventos volverían a verse — que es el modo de fallo
  // correcto para un silenciador.
  ignoreErrors: [
    /^Invariant: Expected RSC response, got /,
  ],
});
