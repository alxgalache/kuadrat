/**
 * El readiness check tiene que decir la verdad cuando la base de datos falla
 * (openspec change: production-load-hardening, hallazgo H4).
 *
 * `/health` responde 200 en cuanto el proceso acepta peticiones y eso está
 * bien: es una prueba de vida para el healthcheck de Docker, cuya única
 * pregunta es si hay que reiniciar el contenedor. El problema es que un monitor
 * externo apuntado ahí informaría de un sitio sano mientras la galería no puede
 * listar una sola obra, porque Turso es remoto y puede caerse por su cuenta sin
 * que el proceso se entere.
 *
 * De ahí `/health/ready`, y de ahí este test: un endpoint de salud que devuelve
 * 200 pase lo que pase es peor que no tener ninguno, porque genera confianza
 * infundada. Lo que se asegura aquí es justamente el camino de fallo.
 */

const request = require('supertest')
const { app } = require('./helpers/app')
const { db } = require('../config/database')

describe('GET /health (liveness)', () => {
  it('responde 200 sin tocar la base de datos', async () => {
    const spy = jest.spyOn(db, 'execute')
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })
})

describe('GET /health/ready (readiness)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('responde 200 y detalla la comprobación cuando la base de datos responde', async () => {
    const res = await request(app).get('/health/ready')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
    expect(res.body.checks.database.ok).toBe(true)
    expect(typeof res.body.checks.database.ms).toBe('number')
  })

  it('responde 503 cuando la base de datos no está accesible', async () => {
    jest.spyOn(db, 'execute').mockRejectedValueOnce(new Error('connect ECONNREFUSED'))

    const res = await request(app).get('/health/ready')

    expect(res.status).toBe(503)
    expect(res.body.success).toBe(false)
    expect(res.body.status).toBe('degraded')
    expect(res.body.checks.database.ok).toBe(false)
  })

  it('no filtra detalles internos del error', async () => {
    // El endpoint es público. Un mensaje de la capa de base de datos puede
    // llevar hostnames o estructura interna, así que se normaliza a una
    // etiqueta fija.
    jest.spyOn(db, 'execute').mockRejectedValueOnce(
      new Error('connect ECONNREFUSED libsql://kuadrat-privado.turso.io:443'),
    )

    const res = await request(app).get('/health/ready')

    expect(res.body.checks.database.error).toBe('unreachable')
    expect(JSON.stringify(res.body)).not.toContain('turso.io')
  })

  it('no se queda colgado si la base de datos no contesta', async () => {
    // Una base de datos que acepta la conexión pero nunca responde es el peor
    // caso para un monitor: sin timeout propio, la petición se queda abierta y
    // el monitor la interpreta como caída de red en lugar de como degradación.
    jest.spyOn(db, 'execute').mockImplementationOnce(() => new Promise(() => {}))

    const res = await request(app).get('/health/ready')

    expect(res.status).toBe(503)
    expect(res.body.checks.database.error).toBe('timeout')
  }, 10000)

  it('nunca se cachea', async () => {
    const res = await request(app).get('/health/ready')
    expect(res.headers['cache-control']).toContain('no-store')
  })
})
