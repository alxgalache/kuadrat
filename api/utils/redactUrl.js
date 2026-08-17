/**
 * Strip bearer-like secrets out of a request URL before it reaches the logs.
 *
 * `pino-http` logs `req.url` for every request, and several routes carry a
 * credential as a path segment: the account activation link, the
 * admin-initiated password reset link, and the public order-tracking token.
 * Each of those segments IS the credential — anyone reading the log can use
 * it — so a log shipped to Sentry, a file on disk or a `docker logs` dump
 * hands out account and order access.
 *
 * Query strings get the same treatment for the signed video token, which
 * travels as `?vtoken=`.
 */

// A path segment that follows one of these is a secret, not an identifier.
const SECRET_PATH_PREFIXES = [
  'validate-setup-token',
  'validate-reset-token',
  'token',
];

const SECRET_QUERY_PARAMS = ['vtoken', 'token'];

const REDACTED = '[REDACTED]';

/**
 * @param {string} url - `req.url` (path plus optional query string)
 * @returns {string} the same URL with any credential segment replaced
 */
function redactUrl(url) {
  if (typeof url !== 'string' || !url) return url;

  const queryStart = url.indexOf('?');
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  const query = queryStart === -1 ? '' : url.slice(queryStart + 1);

  const segments = path.split('/');
  const redactedSegments = segments.map((segment, index) => {
    const previous = index > 0 ? segments[index - 1] : '';
    return SECRET_PATH_PREFIXES.includes(previous) && segment ? REDACTED : segment;
  });

  if (!query) return redactedSegments.join('/');

  const redactedQuery = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      return SECRET_QUERY_PARAMS.includes(key) ? `${key}=${REDACTED}` : pair;
    })
    .join('&');

  return `${redactedSegments.join('/')}?${redactedQuery}`;
}

module.exports = { redactUrl, REDACTED };
