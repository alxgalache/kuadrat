const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'
const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'

// Rutas que ningún rastreador debe indexar: paneles privados, historial de
// pedidos, resultados de pago y todo lo que lleva un credencial en la ruta.
//
// Se define UNA vez porque cada grupo de agente tiene que repetirla entera. En
// robots.txt un grupo específico SUSTITUYE al grupo `*` para ese agente, no se
// suma a él: un `User-agent: GPTBot` + `Allow: /` sin estas exclusiones abriría
// /admin, /orders y las rutas con token justo a los rastreadores que se
// pretendía dirigir. Copiarla a mano en once sitios es cómo se desincroniza.
const DISALLOWED_PATHS = [
  '/admin/',
  '/admin',
  '/seller/',
  '/seller',
  '/orders/',
  '/orders',
  // Página de acceso de artistas, no un listado de autores.
  '/autores',
  '/user-activation/',
  '/restablecer-password/',
  '/pago-cancelado',
  '/pago-fallido',
  '/pedido/',
  '/pedido-completado',
  '/order-confirmation',
  // Verificación de certificado: URL única por lectura de sticker NFC, sin
  // valor de indexación y con parámetros que no deben quedar cacheados.
  '/coa',
]

// Rastreadores de motores generativos y de respuesta, declarados de forma
// explícita. Se permiten todos (decisión del operador: máxima presencia en
// herramientas de IA), pero con la MISMA lista de exclusión que el resto.
//
// La lista mezcla a propósito dos familias que conviene no confundir:
//   - Los que citan y enlazan (OAI-SearchBot, Claude-SearchBot, PerplexityBot,
//     Bingbot) — son los que traen visitas.
//   - Los que recopilan para entrenamiento (GPTBot, ClaudeBot, CCBot,
//     Google-Extended, Applebot-Extended) — no traen visita directa, pero son
//     los que hacen que el modelo conozca la galería.
// Cambiar de política es cambiar `allow` por `disallow` en los segundos.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  'Bingbot',
]

export default function robots() {
  if (WEB_APP_HIDDEN) {
    // Preproducción. Un único grupo cerrado para todos: emitir aquí los grupos
    // permisivos de IA sería abrir el entorno oculto precisamente a los
    // rastreadores más agresivos.
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOWED_PATHS,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOWED_PATHS,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
