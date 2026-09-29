/**
 * Preproduction password gate (openspec change: live-event-access-hardening).
 *
 * The browser used to keep a bare `'true'` for 30 days, so changing
 * TEST_ACCESS_PASSWORD revoked nobody who had entered with the old one. The
 * token now carries a fingerprint of the password in force and /check
 * recomputes it: a password change revokes every outstanding token at once.
 *
 * The gate is driven by editing `config` directly (it is a plain object read
 * on every request); nothing here reaches the network.
 */

const request = require('supertest')
const { app } = require('./helpers/app')
const config = require('../config/env')

const original = { hidden: config.webAppHidden, password: config.testAccessPassword }

afterEach(() => {
  config.webAppHidden = original.hidden
  config.testAccessPassword = original.password
})

const gateOn = (password = 'contraseña-A') => {
  config.webAppHidden = 'true'
  config.testAccessPassword = password
}

const verify = (password) => request(app).post('/api/test-access/verify').send({ password })
const check = (token) => request(app).post('/api/test-access/check').send({ token })

describe('POST /api/test-access/verify', () => {
  test('the right password returns a token', async () => {
    gateOn()
    const res = await verify('contraseña-A')
    expect(res.statusCode).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.token).not.toContain('contraseña-A')
  })

  test('a wrong password → 401 and no token', async () => {
    gateOn()
    const res = await verify('otra')
    expect(res.statusCode).toBe(401)
    expect(res.body.token).toBeUndefined()
  })
})

describe('POST /api/test-access/check', () => {
  test('a token issued for the password in force is accepted', async () => {
    gateOn()
    const { body } = await verify('contraseña-A')
    expect((await check(body.token)).statusCode).toBe(200)
  })

  test('changing the password revokes the token', async () => {
    gateOn('contraseña-A')
    const { body } = await verify('contraseña-A')
    config.testAccessPassword = 'contraseña-B'
    expect((await check(body.token)).statusCode).toBe(401)
  })

  test('a tampered token → 401', async () => {
    gateOn()
    const { body } = await verify('contraseña-A')
    const [payload, signature] = body.token.split('.')
    const forged = Buffer.from(JSON.stringify({ fp: 'x', exp: Date.now() + 1e9 })).toString('base64url')
    expect((await check(`${forged}.${signature}`)).statusCode).toBe(401)
    expect((await check(`${payload}.AAAA`)).statusCode).toBe(401)
    expect((await check('basura')).statusCode).toBe(401)
    expect((await check(undefined)).statusCode).toBe(401)
  })

  test('an expired token → 401', async () => {
    gateOn()
    const realNow = Date.now
    const { body } = await verify('contraseña-A')
    try {
      Date.now = () => realNow() + 31 * 24 * 60 * 60 * 1000
      expect((await check(body.token)).statusCode).toBe(401)
    } finally {
      Date.now = realNow
    }
  })
})

describe('gate disabled', () => {
  test('both routes behave as if they did not exist', async () => {
    config.webAppHidden = ''
    config.testAccessPassword = 'contraseña-A'
    expect((await verify('contraseña-A')).statusCode).toBe(404)
    expect((await check('x')).statusCode).toBe(404)
  })
})
