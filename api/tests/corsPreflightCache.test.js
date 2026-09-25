/**
 * Los preflights CORS se pueden cachear en el navegador
 * (openspec change: critical-path-performance, capacidad api-preflight-avoidance).
 *
 * Toda petición autenticada lleva `Authorization`, y ese encabezado exige un
 * preflight OPTIONS antes de cada una. Sin `Access-Control-Max-Age` el navegador
 * guarda el permiso cinco segundos, así que el panel de vendedor o de
 * administración paga un viaje de ida y vuelta extra en casi cada llamada. Con
 * 7200 (el tope de Chrome) lo reutiliza durante dos horas para la misma URL.
 *
 * Lo que se asegura aquí es que la cabecera llega, y que añadirla no ha abierto
 * la API a orígenes que antes no estaban permitidos.
 */

const request = require('supertest')
const { app } = require('./helpers/app')
const config = require('../config/env')

describe('Preflight CORS', () => {
  it('permite el origen del cliente y declara Access-Control-Max-Age: 7200', async () => {
    const res = await request(app)
      .options('/api/art')
      .set('Origin', config.clientUrl)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization')

    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(config.clientUrl)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    expect(res.headers['access-control-max-age']).toBe('7200')
  })

  it('no autoriza a un origen distinto', async () => {
    const res = await request(app)
      .options('/api/art')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization')

    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example')
  })
})
