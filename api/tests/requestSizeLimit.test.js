/**
 * Tope de tamaño por petición y su código de rechazo.
 *
 * Una artista no podía publicar un producto de la tienda: tres fotos de
 * 6–7 MB, cada una por debajo de los 10 MB que acepta multer, sumaban 18,4 MB
 * en un solo multipart, y el filtro global de `app.js` corta en 15 MB antes de
 * que multer llegue a verlas. La respuesta decía `Request too large` sin
 * código, y el formulario enseñaba «Solicitud a la API fallida».
 *
 * Lo que se asegura aquí:
 *   - el filtro mide la petición ENTERA y actúa antes de autenticar (por eso
 *     el rechazo llega sin token);
 *   - el rechazo lleva `REQUEST_TOO_LARGE` en `title`, que es lo que el cliente
 *     traduce a castellano (GLOBAL_API_ERRORS en client/lib/constants.js);
 *   - una petición justo por debajo del tope sigue su camino.
 *
 * El cliente espeja el tope en MAX_REQUEST_BYTES para avisar antes de enviar.
 * Ningún test de esta suite puede leer `client/`, así que el espejo se mantiene
 * por el comentario de las dos constantes, no por una aserción.
 */

const request = require('supertest')
const { app } = require('./helpers/app')
const { MAX_REQUEST_BYTES } = require('../middleware/securityMiddleware')

// Lo que añade el multipart alrededor del fichero (límites y cabeceras de la
// parte). Holgado a propósito: solo sirve para quedar a un lado u otro del tope.
const MULTIPART_MARGIN = 4096

describe('Tope de tamaño por petición', () => {
  it('es de 15 MB', () => {
    expect(MAX_REQUEST_BYTES).toBe(15 * 1024 * 1024)
  })

  it('rechaza con 413 y REQUEST_TOO_LARGE un producto cuyas imágenes suman más del tope, antes de autenticar', async () => {
    const res = await request(app)
      .post('/api/others')
      .attach('images', Buffer.alloc(MAX_REQUEST_BYTES + 1), { filename: 'foto.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(413)
    expect(res.body).toMatchObject({ success: false, status: 413, title: 'REQUEST_TOO_LARGE' })
    expect(typeof res.body.message).toBe('string')
  })

  it('deja pasar una petición por debajo del tope (la para la autenticación, no el filtro)', async () => {
    const res = await request(app)
      .post('/api/others')
      .attach('images', Buffer.alloc(MAX_REQUEST_BYTES - MULTIPART_MARGIN), { filename: 'foto.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(401)
  })
})
