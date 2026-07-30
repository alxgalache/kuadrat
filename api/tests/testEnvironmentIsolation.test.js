/**
 * Guards for the test environment itself (openspec change test-env-isolation).
 *
 * These assert the three properties the rest of the suite silently depends on:
 * the database is local, importing the app has no side effects, and no email
 * can leave the process. If one of them regresses, this file fails loudly
 * instead of the regression being discovered as junk rows in preproduction.
 */

const config = require('../config/env');
const { app, server } = require('./helpers/app');
const emailService = require('../services/emailService');

describe('test environment isolation', () => {
  describe('database', () => {
    it('points at a local SQLite file, never a remote Turso instance', () => {
      expect(config.turso.databaseUrl).toMatch(/^file:/);
      expect(config.turso.databaseUrl).not.toMatch(/^(libsql|wss|https):/);
    });

    it('runs in test mode', () => {
      expect(config.isTest).toBe(true);
      expect(process.env.NODE_ENV).toBe('test');
    });
  });

  describe('application import', () => {
    it('builds the app without opening a listening port', () => {
      expect(app).toBeDefined();
      expect(server.listening).toBe(false);
    });

    it('does not register the auction scheduler on the app', () => {
      // server.js sets nothing on the app for schedulers, but startAuctionScheduler
      // receives the app; a scheduler running would mean server.js was executed.
      expect(require.cache[require.resolve('../server.js')]).toBeUndefined();
    });
  });

  describe('email', () => {
    beforeEach(() => {
      emailService.__clearOutbox();
    });

    it('uses the inert transport', () => {
      expect(config.emailTransport).toBe('noop');
    });

    it('records the message in the outbox instead of contacting a provider', async () => {
      const info = await emailService.sendAccountActivatedEmail({
        email: 'destinatario@example.invalid',
        fullName: 'Persona de Prueba',
      });

      expect(info.messageId).toMatch(/^noop-/);

      const outbox = emailService.__getOutbox();
      expect(outbox).toHaveLength(1);
      expect(outbox[0].to).toBe('destinatario@example.invalid');
      expect(outbox[0].subject).toEqual(expect.any(String));
    });

    it('clears the outbox on demand', async () => {
      await emailService.sendAccountActivatedEmail({
        email: 'otro@example.invalid',
        fullName: 'Otra Persona',
      });
      expect(emailService.__getOutbox()).toHaveLength(1);

      emailService.__clearOutbox();
      expect(emailService.__getOutbox()).toHaveLength(0);
    });
  });
});
