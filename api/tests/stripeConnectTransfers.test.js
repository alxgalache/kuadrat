/**
 * Unit tests for the Transfers V1 section of stripeConnectService
 * (Change #2: stripe-connect-manual-payouts).
 *
 * The Stripe SDK client is mocked so these tests run offline and do not
 * touch the real API.
 */

// Force Stripe Connect on so assertConnectEnabled() does not throw.
jest.mock('../config/env', () => ({
  stripe: {
    connect: {
      enabled: true,
      refreshUrl: 'https://example.test/refresh',
      returnUrl: 'https://example.test/return',
    },
  },
  nodeEnv: 'test',
}));

// Mock the database module so we don't need @libsql/client at test-time.
jest.mock('../config/database', () => ({
  db: { execute: jest.fn() },
  initializeDatabase: jest.fn(),
}));

// Mock the logger to avoid pino pretty-stream open handles.
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}));

jest.mock('../services/stripeClient', () => ({
  v2: { core: { accounts: {}, accountLinks: {} } },
  accounts: {},
  transfers: {
    create: jest.fn(),
    retrieve: jest.fn(),
    listReversals: jest.fn(),
  },
}));

const stripeClient = require('../services/stripeClient');
const {
  createTransfer,
  retrieveTransfer,
  listTransferReversals,
} = require('../services/stripeConnectService');

describe('stripeConnectService — Transfers V1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTransfer', () => {
    it('converts euros to cents and passes the expected payload and idempotency key', async () => {
      stripeClient.transfers.create.mockResolvedValue({ id: 'tr_test_123' });

      const withdrawal = {
        id: 42,
        user_id: 7,
        amount: 123.45,
        vat_regime: 'art_rebu',
      };
      const res = await createTransfer({
        withdrawal,
        connectedAccountId: 'acct_abc',
        itemsCount: 3,
      });

      expect(res).toEqual({ id: 'tr_test_123' });
      expect(stripeClient.transfers.create).toHaveBeenCalledTimes(1);

      const [payload, options] = stripeClient.transfers.create.mock.calls[0];
      expect(payload.amount).toBe(12345);
      expect(payload.currency).toBe('eur');
      expect(payload.destination).toBe('acct_abc');
      expect(payload.transfer_group).toBe('WITHDRAWAL_42');
      expect(payload.metadata).toEqual({
        withdrawal_id: '42',
        user_id: '7',
        vat_regime: 'art_rebu',
        items_count: '3',
        platform: 'kuadrat',
      });
      expect(payload.description).toContain('obras');
      expect(payload.description).toContain('W#42');
      expect(options).toEqual({ idempotencyKey: 'transfer_withdrawal_42_v1' });
    });

    it('uses "productos/servicios" wording for standard_vat', async () => {
      stripeClient.transfers.create.mockResolvedValue({ id: 'tr_test_456' });

      await createTransfer({
        withdrawal: { id: 10, user_id: 2, amount: 50, vat_regime: 'standard_vat' },
        connectedAccountId: 'acct_xyz',
        itemsCount: 1,
      });

      const [payload] = stripeClient.transfers.create.mock.calls[0];
      expect(payload.description).toContain('productos/servicios');
    });

    it('throws when amount is zero or negative', async () => {
      await expect(
        createTransfer({
          withdrawal: { id: 1, user_id: 1, amount: 0, vat_regime: 'art_rebu' },
          connectedAccountId: 'acct_abc',
          itemsCount: 1,
        })
      ).rejects.toThrow();
      expect(stripeClient.transfers.create).not.toHaveBeenCalled();
    });

    it('throws when connectedAccountId is missing', async () => {
      await expect(
        createTransfer({
          withdrawal: { id: 1, user_id: 1, amount: 10, vat_regime: 'art_rebu' },
          connectedAccountId: '',
          itemsCount: 1,
        })
      ).rejects.toThrow();
    });
  });

  describe('retrieveTransfer', () => {
    it('delegates to stripeClient.transfers.retrieve', async () => {
      stripeClient.transfers.retrieve.mockResolvedValue({ id: 'tr_test_123', amount: 12345 });
      const res = await retrieveTransfer('tr_test_123');
      expect(res.id).toBe('tr_test_123');
      expect(stripeClient.transfers.retrieve).toHaveBeenCalledWith('tr_test_123');
    });
  });

  describe('listTransferReversals', () => {
    it('delegates to stripeClient.transfers.listReversals', async () => {
      stripeClient.transfers.listReversals.mockResolvedValue({ data: [] });
      const res = await listTransferReversals('tr_test_123');
      expect(res.data).toEqual([]);
      expect(stripeClient.transfers.listReversals).toHaveBeenCalledWith('tr_test_123');
    });
  });
});
