/**
 * The two money predicates shared by every Sendcloud quote path — the cart
 * (`sendcloudProvider`) and the art shipping calculator.
 *
 * They live together, and apart from their callers, because duplicating either
 * one produced a defect that reached buyers: an insured value of the wrong
 * shape returned HTTP 400, and a price filter written as a truthiness check let
 * a 0 € option through.
 */

// The range Sendcloud actually prices. Outside it the API does NOT error — it
// silently charges the boundary premium (verified: 1 € pays the 2 € minimum;
// 5001, 8000 and 25000 € all pay exactly the 5000 € premium). Clamping here is
// what keeps the number sent equal to the number priced, so the quote can be
// reconciled with the invoice.
const INSURED_VALUE_MIN = 2
const INSURED_VALUE_MAX = 5000

/**
 * The insured value to declare for goods worth `goodsValue` euros.
 *
 * `POST /v3/shipping-options` requires a plain integer here: an object or a
 * decimal is rejected with `HTTP 400 "Input should be a valid integer"`.
 * `POST /v3/shipments` wants the same amount as `{ value, currency }` instead —
 * the asymmetry is Sendcloud's, and this helper deliberately returns the raw
 * number so each caller wraps it as its own endpoint requires.
 *
 * @param {number} goodsValue - Value of the goods travelling in the parcel.
 * @returns {number} Integer within [2, 5000].
 */
function insuredValueFor(goodsValue) {
  const rounded = Math.round(Number(goodsValue) || 0)
  return Math.min(Math.max(rounded, INSURED_VALUE_MIN), INSURED_VALUE_MAX)
}

/**
 * The numeric total of a Sendcloud shipping option's first quote, or null when
 * the option carries no quote or a total that is not a number.
 *
 * @param {object} option - A raw shipping option from `POST /v3/shipping-options`.
 * @returns {number|null}
 */
function quoteTotal(option) {
  const quotes = option?.quotes
  if (!Array.isArray(quotes) || quotes.length === 0) return null

  const raw = quotes[0]?.price?.total?.value
  if (raw === undefined || raw === null) return null

  const parsed = parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Whether an option can actually be charged to a buyer.
 *
 * Note the comparison is on the PARSED number: Sendcloud returns the total as a
 * string, and `sendcloud:letter` (mailbox letter) quotes `"0"`, which is truthy
 * in JavaScript. On a large parcel it used to be the only surviving option, so
 * the buyer was offered free shipping for something that does not fit in a
 * letterbox.
 *
 * @param {object} option - A raw shipping option from `POST /v3/shipping-options`.
 * @returns {boolean}
 */
function hasUsableRate(option) {
  const total = quoteTotal(option)
  return total !== null && total > 0
}

module.exports = {
  insuredValueFor,
  quoteTotal,
  hasUsableRate,
  INSURED_VALUE_MIN,
  INSURED_VALUE_MAX,
}
