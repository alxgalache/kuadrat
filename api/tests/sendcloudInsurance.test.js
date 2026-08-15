/**
 * Tests for the "every shipment is insured" rule
 * (openspec change: sendcloud-art-shipping-calculator, block 1).
 *
 * Two things went wrong here before and both were invisible until a real
 * request was made:
 *   - `additional_insured_price` was sent as `{ value, currency }` to
 *     `POST /v3/shipping-options`, which answers HTTP 400 "Input should be a
 *     valid integer";
 *   - it was attached only when the seller had `insurance_type` set, a column
 *     no form writes, so in practice nothing was ever insured.
 *
 * The provider is exercised with the HTTP client mocked, so the assertions are
 * on the exact body that would go over the wire.
 */

jest.mock('../services/shipping/sendcloudApiClient', () => ({
  post: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  getBinary: jest.fn(),
}))

jest.mock('../config/database', () => ({
  db: { execute: jest.fn() },
}))

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}))

const sendcloud = require('../services/shipping/sendcloudApiClient')
const { db } = require('../config/database')
const sendcloudProvider = require('../services/shipping/sendcloudProvider')
const {
  insuredValueFor,
  hasUsableRate,
  INSURED_VALUE_MIN,
  INSURED_VALUE_MAX,
} = require('../services/shipping/sendcloudPricing')

// A seller configuration row, with the insurance columns settable per test.
function sellerConfig(overrides = {}) {
  return {
    user_id: 7,
    sender_name: 'Galería',
    sender_address_1: 'Calle Feria 1',
    sender_city: 'Sevilla',
    sender_postal_code: '41005',
    sender_country: 'ES',
    require_signature: 0,
    fragile_goods: 0,
    first_mile: 'dropoff',
    last_mile: 'home_delivery',
    insurance_type: 'none',
    insurance_fixed_amount: null,
    preferred_carriers: null,
    excluded_carriers: null,
    ...overrides,
  }
}

function option(code, total) {
  return {
    code,
    name: code,
    carrier: { name: 'Correos', code: 'correos' },
    quotes: total === null ? [] : [{ price: { total: { value: total, currency: 'EUR' } } }],
  }
}

beforeEach(() => {
  db.execute.mockReset()
  sendcloud.post.mockReset()
})

describe('insuredValueFor', () => {
  it('returns an integer', () => {
    expect(insuredValueFor(350.5)).toBe(351)
    expect(Number.isInteger(insuredValueFor(1234.49))).toBe(true)
  })

  it('clamps below the minimum Sendcloud prices', () => {
    expect(insuredValueFor(0)).toBe(INSURED_VALUE_MIN)
    expect(insuredValueFor(1)).toBe(INSURED_VALUE_MIN)
    expect(insuredValueFor(null)).toBe(INSURED_VALUE_MIN)
    expect(insuredValueFor(undefined)).toBe(INSURED_VALUE_MIN)
  })

  it('clamps above the ceiling Sendcloud prices', () => {
    // Above 5000 the API does not error, it silently charges the 5000 premium.
    expect(insuredValueFor(5001)).toBe(INSURED_VALUE_MAX)
    expect(insuredValueFor(25000)).toBe(INSURED_VALUE_MAX)
  })
})

describe('hasUsableRate', () => {
  it('rejects the string "0" that sendcloud:letter quotes', () => {
    expect(hasUsableRate(option('sendcloud:letter', '0'))).toBe(false)
  })

  it('rejects an option with an empty quotes array', () => {
    expect(hasUsableRate(option('ups:standard', null))).toBe(false)
  })

  it('rejects a missing or non-numeric total', () => {
    expect(hasUsableRate({ code: 'x', quotes: [{ price: {} }] })).toBe(false)
    expect(hasUsableRate({ code: 'x', quotes: [{ price: { total: { value: 'gratis' } } }] })).toBe(false)
  })

  it('accepts a positive numeric total', () => {
    expect(hasUsableRate(option('correos:standard', '6.38'))).toBe(true)
  })
})

describe('getDeliveryOptions request body', () => {
  const callWith = async (config, parcels) => {
    db.execute.mockResolvedValueOnce({ rows: [config] })
    sendcloud.post.mockResolvedValueOnce({ data: [option('correos:standard', '6.38')] })
    await sendcloudProvider.getDeliveryOptions({
      sellerId: 7,
      parcels,
      buyerAddress: { country: 'ES', postalCode: '28001' },
    })
    return sendcloud.post.mock.calls[0][1].body
  }

  it.each([['none'], ['full_value'], ['fixed']])(
    'attaches the parcel value as an integer whatever insurance_type is (%s)',
    async (insuranceType) => {
      const body = await callWith(
        sellerConfig({ insurance_type: insuranceType, insurance_fixed_amount: 99 }),
        [{ weight: 5000, dimensions: '60x60x5', totalValue: 350.5 }]
      )

      expect(body.parcels[0].additional_insured_price).toBe(351)
      expect(typeof body.parcels[0].additional_insured_price).toBe('number')
    }
  )

  it('insures every parcel of a multi-parcel request', async () => {
    const body = await callWith(sellerConfig(), [
      { weight: 1000, totalValue: 40 },
      { weight: 2000, totalValue: 120 },
    ])

    expect(body.parcels.map(p => p.additional_insured_price)).toEqual([40, 120])
  })

  it('clamps the insured value into the range Sendcloud prices', async () => {
    const body = await callWith(sellerConfig(), [
      { weight: 1000, totalValue: 0.5 },
      { weight: 1000, totalValue: 9000 },
    ])

    expect(body.parcels.map(p => p.additional_insured_price)).toEqual([
      INSURED_VALUE_MIN,
      INSURED_VALUE_MAX,
    ])
  })

  it('sends the non-deprecated address objects and none of the flat fields', async () => {
    const body = await callWith(sellerConfig(), [{ weight: 1000, totalValue: 100 }])

    expect(body.from_address).toEqual({
      country_code: 'ES',
      postal_code: '41005',
      city: 'Sevilla',
      address_line_1: 'Calle Feria 1',
    })
    expect(body.to_address).toEqual({ country_code: 'ES', postal_code: '28001' })

    for (const deprecated of [
      'from_country_code',
      'from_postal_code',
      'to_country_code',
      'to_postal_code',
      'to_service_point_id',
    ]) {
      expect(body).not.toHaveProperty(deprecated)
    }
  })
})

describe('getDeliveryOptions filtering', () => {
  it('drops the 0 € mailbox letter and the options with no quotes', async () => {
    db.execute.mockResolvedValueOnce({ rows: [sellerConfig()] })
    sendcloud.post.mockResolvedValueOnce({
      data: [
        option('sendcloud:letter', '0'),
        option('ups:standard', null),
        option('correos:standard', '6.38'),
      ],
    })

    const options = await sendcloudProvider.getDeliveryOptions({
      sellerId: 7,
      parcels: [{ weight: 25000, dimensions: '150x100x20', totalValue: 500 }],
      buyerAddress: { country: 'ES', postalCode: '28001' },
    })

    expect(options.map(o => o.id)).toEqual(['correos:standard'])
  })

  it('returns nothing rather than a free option when everything is filtered out', async () => {
    db.execute.mockResolvedValueOnce({ rows: [sellerConfig()] })
    sendcloud.post.mockResolvedValueOnce({ data: [option('sendcloud:letter', '0')] })

    const options = await sendcloudProvider.getDeliveryOptions({
      sellerId: 7,
      parcels: [{ weight: 25000, dimensions: '150x100x20', totalValue: 500 }],
      buyerAddress: { country: 'ES', postalCode: '28001' },
    })

    expect(options).toEqual([])
  })
})

describe('createShipments insurance parity', () => {
  it('announces the parcel with the insured value it was quoted with', async () => {
    db.execute.mockResolvedValueOnce({ rows: [sellerConfig()] })
    sendcloud.post.mockResolvedValueOnce({ data: { id: 'ship_1', parcels: [{ id: 42 }] } })

    await sendcloudProvider.createShipments({
      order: {
        id: 1000,
        buyerName: 'Comprador',
        buyerEmail: 'c@example.com',
        buyerPhone: '600000000',
        deliveryAddress: { addressLine1: 'Calle 1', postalCode: '28001', city: 'Madrid', country: 'ES' },
      },
      itemGroups: [{
        sellerId: 7,
        shippingOptionCode: 'correos:standard',
        parcels: [{ weight: 5000, dimensions: '60x60x5', totalValue: 350.5, items: [] }],
      }],
    })

    const body = sendcloud.post.mock.calls[0][1].body

    // Object form here, integer form in shipping-options: the asymmetry is
    // Sendcloud's and copying one shape to the other endpoint breaks it.
    expect(body.parcels[0].additional_insured_price).toEqual({
      value: '351.00',
      currency: 'EUR',
    })
  })

  it('uses the to_service_point object rather than the deprecated id field', async () => {
    db.execute.mockResolvedValueOnce({ rows: [sellerConfig()] })
    sendcloud.post.mockResolvedValueOnce({ data: { id: 'ship_1', parcels: [{ id: 42 }] } })

    await sendcloudProvider.createShipments({
      order: {
        id: 1001,
        buyerName: 'Comprador',
        deliveryAddress: { addressLine1: 'Calle 1', postalCode: '28001', city: 'Madrid', country: 'ES' },
      },
      itemGroups: [{
        sellerId: 7,
        shippingOptionCode: 'correos:standard',
        servicePointId: 12345,
        parcels: [{ weight: 5000, totalValue: 100, items: [] }],
      }],
    })

    const body = sendcloud.post.mock.calls[0][1].body

    expect(body.to_service_point).toEqual({ id: 12345 })
    expect(body).not.toHaveProperty('to_service_point_id')
    expect(body.to_address).not.toHaveProperty('to_service_point')
  })
})
