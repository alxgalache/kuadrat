// Punto de entrada del chunk diferido de Session Replay (ver el final de
// `instrumentation-client.js`).
//
// Existe para que ese chunk contenga Replay y NADA MÁS. Un
// `import('@sentry/nextjs')` obliga al empaquetador a materializar el espacio de
// nombres completo del SDK —feedback, replay de canvas, profiler,
// ErrorBoundary…—: medido, 105 KB gzip descargados tras la carga, cuando rrweb
// solo son ~35–40. Con una reexportación con nombre, el árbol se sacude y el
// chunk lleva únicamente lo que `replayIntegration` necesita y el bundle inicial
// no tenía ya. Se reexporta desde el paquete público, no desde una ruta interna
// del SDK, para que una actualización de Sentry no lo rompa.
export { replayIntegration } from '@sentry/nextjs'
