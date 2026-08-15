/**
 * El renderizado del servidor no debe consumir el rate limit por IP
 * (openspec change: production-load-hardening, hallazgo H7).
 *
 * Next.js pide sus datos a la API durante el render. Esas peticiones no llevan
 * la IP de quien navega sino la del propio servidor, así que todas caen en la
 * misma cubeta de 1000 peticiones / 30 min: una avalancha con la caché de datos
 * fría la agotaría y las fichas empezarían a renderizarse como «no encontrado».
 *
 * La exención se apoya en `x-forwarded-for`, no en el rango de la IP, y esa
 * distinción es TODA la seguridad del mecanismo: nginx añade siempre la
 * cabecera (`proxy_add_x_forwarded_for` en deploy/nginx/*.conf), de modo que
 * cualquier petición venida de fuera la trae. Si sólo se mirase el rango
 * privado, bastaría con enviar `X-Forwarded-For: 10.0.0.1` para saltarse el
 * límite — que es justo el caso que asegura el último bloque.
 */

const { isInternalRequest } = require('../middleware/rateLimiter')

const req = (ip, headers = {}) => ({ ip, headers })

describe('isInternalRequest', () => {
  describe('exime al tráfico que nace dentro del despliegue', () => {
    // Sin x-forwarded-for: sólo puede haber entrado por la red interna, porque
    // el compose publica el puerto 3001 únicamente en 127.0.0.1.
    it.each([
      ['bridge de Docker', '172.18.0.4'],
      ['bridge de Docker, otro rango', '172.31.255.1'],
      ['loopback', '127.0.0.1'],
      ['loopback IPv6', '::1'],
      ['loopback mapeado a IPv6', '::ffff:127.0.0.1'],
      ['red privada 10/8', '10.0.3.7'],
      ['red privada 192.168/16', '192.168.1.20'],
    ])('%s → exento', (_, ip) => {
      expect(isInternalRequest(req(ip))).toBe(true)
    })
  })

  describe('no exime al tráfico público', () => {
    it.each([
      ['IP pública sin cabecera', '81.42.19.7'],
      ['IP pública fuera del rango 172.16/12', '172.32.0.1'],
      ['IP pública justo por debajo del rango', '172.15.255.254'],
    ])('%s → sujeto a límite', (_, ip) => {
      expect(isInternalRequest(req(ip))).toBe(false)
    })

    it('trata una IP ausente como pública', () => {
      expect(isInternalRequest(req(undefined))).toBe(false)
    })
  })

  describe('no se puede falsificar desde fuera', () => {
    // El atacante controla el valor de la cabecera, pero no su presencia: nginx
    // la añade siempre. Presencia de la cabecera ⇒ la petición vino de fuera,
    // sea cual sea la IP que aparente.
    it.each([
      ['fingiendo loopback', '127.0.0.1'],
      ['fingiendo el bridge de Docker', '172.18.0.4'],
      ['fingiendo red privada', '10.0.0.1'],
    ])('%s con x-forwarded-for → sujeto a límite', (_, ip) => {
      expect(isInternalRequest(req(ip, { 'x-forwarded-for': '81.42.19.7' }))).toBe(false)
    })

    it('una cadena de proxies encadenada tampoco exime', () => {
      const r = req('10.0.0.1', { 'x-forwarded-for': '10.0.0.1, 172.18.0.4' })
      expect(isInternalRequest(r)).toBe(false)
    })
  })
})
