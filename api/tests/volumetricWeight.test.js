/**
 * Volumetric weight for the co-packed store parcel
 * (openspec change: sendcloud-store-shipping-accuracy, bloque 3).
 *
 * Carriers bill the greater of real and volumetric weight. Sendcloud applies
 * that rule to the `dimensions` it receives — measured live, a 1,2 kg parcel
 * declared as 60x60x60 cm was quoted as 36 kg and its price went from 5,06 € to
 * 39,48 € — but the co-packed parcel sends none, so until now it was priced on
 * real weight alone. That the catalogue did not lose money by it was a
 * coincidence: `El Límite` measures 30x30x4, whose volumetric weight at
 * Sendcloud's divisor of 6000 is exactly its 600 g real weight.
 *
 * The invariant these tests defend is the one that is easy to undo by being
 * helpful: the aggregated parcel carries a volume-adjusted weight and NO
 * dimensions, while an individual parcel carries real weight AND real
 * dimensions. Sending both on one parcel bills the volume twice.
 */

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}))

const logger = require('../config/logger')
const { volumetricGrams, parcelWeightGrams, VOLUMETRIC_DIVISOR } = require('../utils/volumetricWeight')
const { groupIntoParcels } = require('../services/shipping/parcelGrouper')

function storeItem(overrides = {}) {
  return {
    productId: 1,
    productType: 'other',
    quantity: 1,
    weight: 600,
    dimensions: '30x30x4',
    price: 20,
    canCopack: 1,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// --- the formula -----------------------------------------------------------

describe('volumetricGrams', () => {
  test('uses the 5000 divisor, not the 6000 Sendcloud applies', () => {
    expect(VOLUMETRIC_DIVISOR).toBe(5000)
    // 30 × 30 × 4 = 3600 cm³ → 3600/5000 kg → 720 g
    expect(volumetricGrams('30x30x4')).toBe(720)
  })

  test('a large light box weighs far more than its contents', () => {
    // 60 × 60 × 60 = 216000 cm³ → 43,2 kg
    expect(volumetricGrams('60x60x60')).toBe(43200)
  })

  test('an absent or malformed value contributes nothing', () => {
    expect(volumetricGrams(null)).toBe(0)
    expect(volumetricGrams('')).toBe(0)
    expect(volumetricGrams('30x30')).toBe(0)
    expect(volumetricGrams('30x30x0')).toBe(0)
    expect(volumetricGrams('grande')).toBe(0)
    expect(volumetricGrams({ length: 30 })).toBe(0)
  })
})

// --- the max ---------------------------------------------------------------

describe('parcelWeightGrams takes the greater of the two', () => {
  test('a bulky product is weighed by its volume', () => {
    const { weight, realWeight, volumetricWeight } = parcelWeightGrams([
      storeItem({ quantity: 2 }),
    ])

    expect(realWeight).toBe(1200)
    expect(volumetricWeight).toBe(1440)
    // Before this change the parcel was quoted at 1200 g.
    expect(weight).toBe(1440)
  })

  test('a dense product is weighed by its real weight', () => {
    // A 2 kg brick of 10x10x10 has a volumetric weight of only 200 g.
    const { weight, realWeight, volumetricWeight } = parcelWeightGrams([
      storeItem({ weight: 2000, dimensions: '10x10x10' }),
    ])

    expect(volumetricWeight).toBe(200)
    expect(realWeight).toBe(2000)
    expect(weight).toBe(2000)
  })

  test('both sides are multiplied by quantity before comparing', () => {
    // One unit: real 600 wins over volumetric 500. Ten units: 6000 vs 5000.
    const one = parcelWeightGrams([storeItem({ weight: 600, dimensions: '25x25x4' })])
    const ten = parcelWeightGrams([storeItem({ weight: 600, dimensions: '25x25x4', quantity: 10 })])

    expect(one.weight).toBe(600)
    expect(ten.weight).toBe(6000)
  })

  test('items without dimensions contribute only their real weight', () => {
    const { weight, volumetricWeight } = parcelWeightGrams([
      storeItem({ dimensions: null, weight: 900 }),
    ])

    expect(volumetricWeight).toBe(0)
    expect(weight).toBe(900)
  })

  test('the volume of several different products is summed', () => {
    const { volumetricWeight } = parcelWeightGrams([
      storeItem({ productId: 1, dimensions: '30x30x4' }),   // 720
      storeItem({ productId: 2, dimensions: '20x20x10' }),  // 800
    ])

    expect(volumetricWeight).toBe(1520)
  })
})

// --- where it is applied, and where it must not be -------------------------

describe('grouping applies the volume only where the box is unknown', () => {
  test('the aggregated parcel carries the volumetric weight and no dimensions', () => {
    const [parcel] = groupIntoParcels([storeItem({ quantity: 2 })])

    expect(parcel.weight).toBe(1440)
    // Load-bearing: the weight is already volume-adjusted, and Sendcloud would
    // apply its own volumetric calculation to any dimensions it received.
    expect(parcel.dimensions).toBeNull()
  })

  test('a non-co-packable parcel keeps real weight AND real dimensions', () => {
    const parcels = groupIntoParcels([storeItem({ canCopack: 0, quantity: 2 })])

    expect(parcels).toHaveLength(2)
    for (const parcel of parcels) {
      expect(parcel.weight).toBe(600)
      expect(parcel.dimensions).toBe('30x30x4')
    }
  })

  test('an art parcel keeps real weight AND real dimensions', () => {
    const [parcel] = groupIntoParcels([
      { productId: 9, productType: 'art', quantity: 1, weight: 2000, dimensions: '40x40x5', price: 350 },
    ])

    expect(parcel.weight).toBe(2000)
    expect(parcel.dimensions).toBe('40x40x5')
  })

  test('a co-packable item without dimensions is reported', () => {
    groupIntoParcels([storeItem({ dimensions: null })])

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 1 }),
      expect.stringContaining('no dimensions')
    )
  })
})
