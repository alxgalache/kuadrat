/**
 * Cookie reading without a dependency. The API is token-based and has no
 * cookie-parser; the only cookies it reads are the two short-lived ones of the
 * event identity flow (change: event-identity-provider-verification). Writing
 * uses Express's own res.cookie / res.clearCookie.
 *
 * Malformed pairs are skipped and a bad percent-encoding keeps the raw value:
 * a cookie the browser mangled must read as "absent or wrong", never throw.
 */

/**
 * @param {string|undefined} header  the raw `Cookie` request header
 * @returns {Record<string, string>} name → value; the first occurrence wins
 */
function parseCookies(header) {
  const cookies = Object.create(null);
  if (typeof header !== 'string' || header === '') return cookies;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    if (!name || name in cookies) continue;
    let value = pair.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

module.exports = { parseCookies };
