/**
 * XML helpers shared by the product feeds (Google Merchant Center and Meta).
 * Both are RSS 2.0 documents in Google's `g:` namespace, which Meta accepts.
 */

// Escapes the five XML specials and drops the control characters XML 1.0
// forbids, which a description pasted from a word processor can carry.
function xmlText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// A `g:` element, or nothing at all when there is no value to declare.
const tag = (name, value) =>
  value === null || value === undefined || value === '' ? '' : `<g:${name}>${xmlText(value)}</g:${name}>`

module.exports = { xmlText, tag }
