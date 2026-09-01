/**
 * The product-category predicate that decides whether weight and dimensions are
 * mandatory is evaluated against the values a category can actually hold
 * (openspec change: sendcloud-store-shipping-accuracy, bloque 5).
 *
 * `ProductForm` compared `productCategory === 'others'` in three separate
 * places. The `<select>` emits `'art'` and `'other'`, and `initialProductType`
 * carries the same pair, so all three were dead code that always evaluated
 * false — and every consequence was silent:
 *
 *   - the "can be packed with other products" checkbox never rendered, so
 *     `can_copack` could not be set by anyone, artist or admin;
 *   - `weightRequired` was false for a store product, so the form did not ask
 *     for the weight while the API rejected the submission without it;
 *   - the weight's label read "(opcional)" for the one field the whole Sendcloud
 *     price depends on.
 *
 * ── What this file can and cannot cover ─────────────────────────────────────
 *
 * The client half of that invariant is NOT asserted here, and cannot be: the
 * api container bind-mounts only `api/`, so `client/components/ProductForm.js`
 * does not exist at any path a test in this suite can read, and the repo has no
 * client test runner. A grep guarded by `existsSync` would skip in the only way
 * the suite is ever run, which is worse than no test at all. The client half
 * now rests on there being exactly ONE definition of each predicate
 * (`isStoreCategory`, `isWeightRequired`, `areDimensionsRequired`) instead of
 * three inline copies — that is what made the typo survivable in the first
 * place. See the change's design.md for the residual risk.
 *
 * What IS covered here is the server half, which is the one that actually
 * refuses a bad product: the same rule, in the validator shared by the four
 * creation and edit endpoints.
 */

const productValidation = require('../utils/productValidation')
const { isSendcloudEnabled } = require('../services/shipping/shippingProviderFactory')

const { validateCommonProductFields } = productValidation

// A product that is valid apart from the field under test.
function fields(overrides = {}) {
  return {
    name: 'Producto de prueba',
    description: 'x'.repeat(120),
    price: 20,
    weight: 600,
    dimensions: '30x30x4',
    ...overrides,
  }
}

function errorFields(errors) {
  return errors.map(e => e.field)
}

describe('the shared validator speaks the product types the callers pass', () => {
  test('it is called with `art` and `other`, the only two that exist', () => {
    // `isSendcloudEnabled` normalizes 'others' to 'other' but nothing else:
    // any other string silently answers false, which is exactly how a typo
    // turns a mandatory field into an optional one with no error anywhere.
    expect(isSendcloudEnabled('art')).toBe(false)
    expect(isSendcloudEnabled('other')).toBe(false)
    expect(isSendcloudEnabled('others')).toBe(false)
    expect(isSendcloudEnabled('nonsense')).toBe(false)
  })

  test('a well-formed store product passes', () => {
    expect(validateCommonProductFields(fields(), 'other')).toEqual([])
  })

  test('malformed dimensions are rejected whatever the product type', () => {
    // This rule does not depend on Sendcloud being enabled, so it holds under
    // the test environment's flags.
    expect(errorFields(validateCommonProductFields(fields({ dimensions: '30x30' }), 'other')))
      .toContain('dimensions')
    expect(errorFields(validateCommonProductFields(fields({ dimensions: 'grande' }), 'art')))
      .toContain('dimensions')
  })

  test('a negative weight is rejected whatever the product type', () => {
    expect(errorFields(validateCommonProductFields(fields({ weight: -5 }), 'other')))
      .toContain('weight')
    expect(errorFields(validateCommonProductFields(fields({ weight: -5 }), 'art')))
      .toContain('weight')
  })

  test('a zero weight passes the optional branch and is stored as NULL', () => {
    // `0` is falsy, so the optional branch skips it and `othersController`
    // writes `weight ? parseInt(...) : null` — a NULL. That is deliberate here:
    // the case is caught at quoting time instead, where `enrichItemsFromDB`
    // logs a warning naming the product, because the provider's
    // `parcel.weight || 1000` fallback would otherwise price it as a 1 kg
    // parcel with nothing on any screen to say so.
    expect(errorFields(validateCommonProductFields(fields({ weight: 0 }), 'other')))
      .not.toContain('weight')
  })
})

describe('weight and dimensions are mandatory when Sendcloud prices the type', () => {
  // `.env.test` disables Sendcloud for both types on purpose, so the mandatory
  // branch is exercised by doubling the flag rather than by changing the env.
  function withSendcloudEnabledFor(type, run) {
    const factory = require('../services/shipping/shippingProviderFactory')
    const original = factory.isSendcloudEnabled
    factory.isSendcloudEnabled = (t) => (t === 'others' ? 'other' : t) === type
    try {
      return run()
    } finally {
      factory.isSendcloudEnabled = original
    }
  }

  test('a store product with no weight is refused', () => {
    withSendcloudEnabledFor('other', () => {
      const errors = validateCommonProductFields(fields({ weight: '' }), 'other')
      expect(errorFields(errors)).toContain('weight')
    })
  })

  test('a store product with no dimensions is refused', () => {
    withSendcloudEnabledFor('other', () => {
      const errors = validateCommonProductFields(fields({ dimensions: '' }), 'other')
      expect(errorFields(errors)).toContain('dimensions')
    })
  })

  test('an art product with no dimensions is accepted', () => {
    // Art parcels carry their real dimensions and Sendcloud does the volumetric
    // arithmetic, so there is nothing here that needs them up front.
    withSendcloudEnabledFor('art', () => {
      const errors = validateCommonProductFields(fields({ dimensions: '' }), 'art')
      expect(errorFields(errors)).not.toContain('dimensions')
    })
  })

  test('with Sendcloud off, both fields stay optional', () => {
    const errors = validateCommonProductFields(fields({ weight: '', dimensions: '' }), 'other')
    expect(errorFields(errors)).not.toContain('weight')
    expect(errorFields(errors)).not.toContain('dimensions')
  })
})
