/**
 * A shipping option's price is the sum of its parcels' quotes
 * (openspec change: sendcloud-store-shipping-accuracy, bloque 2).
 *
 * `POST /v3/shipping-options` returns ONE QUOTE PER PARCEL sent, not a list of
 * alternatives. Sendcloud says so in its own breakdown — with three parcels the
 * labels come back as `Label (1/3)`, `Label (2/3)`, `Label (3/3)` — and
 * `normalizeOption` used to read `quotes[0]`. Verified against the live API
 * before the fix: one, two and three identical parcels all quoted 4.35 €.
 *
 * The failure is invisible from the outside. The buyer is charged one label,
 * `createShipments()` later creates N, and the difference reaches nobody's
 * screen — it reaches the carrier's invoice.
 *
 * The regression that matters just as much is the other direction: with a
 * single parcel nothing may change, because that is every flow in production
 * today (the co-packed store cart, and the art shipping calculator, which
 * sends `parcels: [parcel]`).
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
const logger = require('../config/logger')
const sendcloudProvider = require('../services/shipping/sendcloudProvider')
const { quoteTotal, quoteLeadTime, hasUsableRate } = require('../services/shipping/sendcloudPricing')

function sellerConfig() {
  return {
    user_id: 7,
    sender_postal_code: '41005',
    sender_country: 'ES',
    sender_city: 'Sevilla',
    require_signature: 0,
    fragile_goods: 0,
    first_mile: '',
    last_mile: 'home_delivery',
    preferred_carriers: null,
    excluded_carriers: null,
  }
}

/**
 * A quote as Sendcloud shapes it: the total is a STRING, and the breakdown
 * carries the `(n/N)` label that gives the array's meaning away.
 */
function quote(total, index, count, leadTime = 48) {
  return {
    weight: { min: { value: '0.001', unit: 'kg' }, max: { value: '1.001', unit: 'kg' } },
    price: {
      breakdown: [{ price: { value: total, currency: 'EUR' }, label: `Label (${index}/${count})`, type: 'price_without_insurance' }],
      total: { value: total, currency: 'EUR' },
    },
    lead_time: leadTime,
  }
}

function option(quotes, code = 'correos:premium') {
  return {
    code,
    name: 'Correos Premium Entrega a Domicilio',
    carrier: { code: 'correos', name: 'Correos' },
    requirements: { is_service_point_required: false },
    quotes,
  }
}

function parcels(n) {
  return Array.from({ length: n }, () => ({ weight: 600, dimensions: null, totalValue: 20 }))
}

async function getOptions(rawOptions, parcelCount) {
  db.execute.mockResolvedValue({ rows: [sellerConfig()] })
  sendcloud.post.mockResolvedValue({ data: rawOptions })

  return sendcloudProvider.getDeliveryOptions({
    sellerId: 7,
    parcels: parcels(parcelCount),
    buyerAddress: { country: 'ES', postalCode: '28001' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

// --- the sum ---------------------------------------------------------------

describe('an option is priced by all of its parcel quotes', () => {
  test('three parcels of 4.35 € are quoted at 13.05 €, not 4.35 €', async () => {
    const opts = await getOptions(
      [option([quote('4.35', 1, 3), quote('4.35', 2, 3), quote('4.35', 3, 3)])],
      3
    )

    expect(opts).toHaveLength(1)
    expect(opts[0].price).toBe(13.05)
  })

  test('parcels with different rates are summed, not averaged or maxed', async () => {
    const opts = await getOptions(
      [option([quote('4.35', 1, 2), quote('7.20', 2, 2)])],
      2
    )

    expect(opts[0].price).toBe(11.55)
  })

  test('the sum has no floating-point tail', () => {
    // 4.35 * 3 is 13.049999999999999 in binary floating point.
    const total = quoteTotal(option([quote('4.35', 1, 3), quote('4.35', 2, 3), quote('4.35', 3, 3)]))
    expect(total).toBe(13.05)
  })
})

// --- the non-regression ----------------------------------------------------

describe('single-parcel pricing is unchanged', () => {
  test('one parcel is priced exactly at its only quote', async () => {
    const opts = await getOptions([option([quote('4.35', 1, 1)])], 1)

    expect(opts[0].price).toBe(4.35)
  })

  test('quoteTotal of a single quote equals parsing that quote directly', () => {
    // This is the property the art shipping calculator relies on: it sends
    // `parcels: [parcel]` and reads `quotes[0]` for its breakdown, so a change
    // in the meaning of quoteTotal must not move its number.
    const opt = option([quote('16.78', 1, 1)])
    expect(quoteTotal(opt)).toBe(parseFloat(opt.quotes[0].price.total.value))
  })
})

// --- lead time -------------------------------------------------------------

describe('lead time is the slowest parcel', () => {
  test('estimatedDays derives from the greatest lead_time, not the first', async () => {
    const opts = await getOptions(
      [option([quote('4.35', 1, 2, 24), quote('4.35', 2, 2, 72)])],
      2
    )

    // 72 h → 3 days. Reading quotes[0] would have promised 1 day.
    expect(opts[0].estimatedDays).toBe(3)
  })

  test('quoteLeadTime ignores non-numeric lead times', () => {
    const opt = option([quote('4.35', 1, 2, undefined), quote('4.35', 2, 2, 48)])
    expect(quoteLeadTime(opt)).toBe(48)
  })
})

// --- filtering -------------------------------------------------------------

describe('options without a chargeable rate stay filtered', () => {
  test('N parcels all quoting "0" sum to zero and the option is dropped', async () => {
    const opts = await getOptions(
      [option([quote('0', 1, 3), quote('0', 2, 3), quote('0', 3, 3)], 'sendcloud:letter')],
      3
    )

    expect(opts).toHaveLength(0)
  })

  test('hasUsableRate is true when the parcels sum above zero', () => {
    expect(hasUsableRate(option([quote('0', 1, 2), quote('4.35', 2, 2)]))).toBe(true)
  })

  test('an option with no quotes at all is dropped', async () => {
    const opts = await getOptions([option([])], 2)
    expect(opts).toHaveLength(0)
  })
})

// --- what actually goes over the wire --------------------------------------

describe('dimensions and a volume-adjusted weight are never sent together', () => {
  async function sentParcels(parcelList) {
    db.execute.mockResolvedValue({ rows: [sellerConfig()] })
    sendcloud.post.mockResolvedValue({ data: [] })

    await sendcloudProvider.getDeliveryOptions({
      sellerId: 7,
      parcels: parcelList,
      buyerAddress: { country: 'ES', postalCode: '28001' },
    })

    return sendcloud.post.mock.calls[0][1].body.parcels
  }

  test('the aggregated parcel goes out with weight only', async () => {
    // What `groupIntoParcels` produces for co-packable items: the volume is
    // already inside the weight, so declaring dimensions would bill it twice.
    const [parcel] = await sentParcels([{ weight: 1440, dimensions: null, totalValue: 40 }])

    expect(parcel.weight).toEqual({ value: '1.44', unit: 'kg' })
    expect(parcel.dimensions).toBeUndefined()
  })

  test('an individual parcel goes out with its real dimensions', async () => {
    const [parcel] = await sentParcels([{ weight: 600, dimensions: '30x30x4', totalValue: 20 }])

    expect(parcel.weight).toEqual({ value: '0.6', unit: 'kg' })
    expect(parcel.dimensions).toEqual({ length: '30', width: '30', height: '4', unit: 'cm' })
  })

  test('the insured value of each parcel is its own goods value', async () => {
    const parcels = await sentParcels([
      { weight: 600, dimensions: '30x30x4', totalValue: 20 },
      { weight: 600, dimensions: '30x30x4', totalValue: 20 },
    ])

    // A bare integer here — this endpoint rejects an object with HTTP 400.
    expect(parcels.map(p => p.additional_insured_price)).toEqual([20, 20])
  })
})

// --- the sanity check ------------------------------------------------------

describe('a quote count that does not match the parcels is reported', () => {
  test('a warning names the option and both counts', async () => {
    await getOptions([option([quote('4.35', 1, 1)])], 3)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ shippingOptionCode: 'correos:premium', quoteCount: 1, parcelCount: 3 }),
      expect.stringContaining('quote count')
    )
  })

  test('a matching count logs nothing', async () => {
    await getOptions([option([quote('4.35', 1, 2), quote('4.35', 2, 2)])], 2)

    expect(logger.warn).not.toHaveBeenCalled()
  })
})
