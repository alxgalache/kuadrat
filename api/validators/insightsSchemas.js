const { z } = require('zod');

/**
 * POST /api/insights/events
 *
 * Endpoint PÚBLICO: lo llama el navegador de cualquier visitante, así que todo
 * lo que llega es hostil por defecto. La validación es estricta a propósito y
 * `.strip()` descarta cualquier campo no declarado — sin eso, un cliente podría
 * colar claves arbitrarias hasta el `custom_data` que se manda a Meta.
 *
 * Lo que este esquema NO acepta, y es deliberado:
 *  - Ningún dato personal (email, teléfono, nombre). Los del comprador los saca
 *    la API de la base de datos en el evento Purchase; aceptarlos del cliente
 *    convertiría el endpoint en un buzón para inyectar identidades ajenas.
 *  - El nombre del evento se valida contra la lista blanca en el controlador.
 */
const trackEventSchema = z.object({
  body: z.object({
    eventName: z.string().min(1, 'eventName es obligatorio').max(40),
    // Generado por el navegador; es la clave con la que Meta deduplica el
    // evento del píxel y el del servidor. Sin él, doble conteo.
    eventId: z.string().min(1, 'eventId es obligatorio').max(100),
    eventSourceUrl: z.string().url().max(2000).optional(),
    // Solo presente en Purchase: la API reconstruye el evento desde el pedido.
    orderId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
    // Identificadores de emparejamiento de Meta. Llegan en el cuerpo y no como
    // cookies porque la API vive en otro subdominio: mandarlas como cookies
    // exigiría CORS con credenciales, y `_fbp`/`_fbc` no son HttpOnly, así que
    // el cliente puede leerlas y adjuntarlas sin complicar la configuración.
    // Cuando el píxel está bloqueado no existen y el cliente envía los suyos.
    fbp: z.string().max(120).optional(),
    fbc: z.string().max(500).optional(),
    customData: z.object({
      value: z.number().nonnegative().optional(),
      currency: z.string().length(3).optional(),
      content_type: z.string().max(20).optional(),
      content_name: z.string().max(200).optional(),
      content_category: z.string().max(100).optional(),
      content_ids: z.array(z.string().max(60)).max(50).optional(),
      num_items: z.number().int().nonnegative().optional(),
      contents: z.array(z.object({
        id: z.string().max(60),
        quantity: z.number().int().nonnegative(),
        item_price: z.number().nonnegative(),
      }).strip()).max(50).optional(),
    }).strip().optional(),
  }).strip(),
});

module.exports = { trackEventSchema };
