const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'
const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'

export default function robots() {
  if (WEB_APP_HIDDEN) {
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
        disallow: [
          '/admin/',
          '/admin',
          '/seller/',
          '/seller',
          '/orders/',
          '/orders',
          '/autores',
          '/user-activation/',
          '/pago-cancelado',
          '/pago-fallido',
          '/pedido/',
          '/pedido-completado',
          '/order-confirmation',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
