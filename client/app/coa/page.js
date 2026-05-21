import * as Sentry from '@sentry/nextjs';
import CoaSuccess from '@/components/coa/CoaSuccess';
import CoaFailure from '@/components/coa/CoaFailure';
import { PUBLIC_BRAND_NAME } from '@/lib/constants';

export const metadata = {
  title: `Certificado de Autenticidad — ${PUBLIC_BRAND_NAME}`,
  description: 'Verificación del certificado de autenticidad de una obra.',
  robots: { index: false, follow: false },
};

// Always render dynamically — every tap from the chip has a fresh PICC+CMAC.
export const dynamic = 'force-dynamic';

// Server-side base URL for the API. INTERNAL_API_URL lets us short-circuit
// through the Docker network (http://api:3001/api) and bypass nginx. When
// unset (local dev), fall back to the public API URL.
const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001/api';

async function verifyTag(picc, cmac) {
  // String-build the URL on purpose: `new URL('/coa/verify', base)` would
  // treat the leading slash as absolute and drop the `/api` segment of the
  // base. Concatenation keeps the full base path intact.
  const base = INTERNAL_API_URL.replace(/\/+$/, '');
  const query = new URLSearchParams({ picc, cmac }).toString();
  const fullUrl = `${base}/coa/verify?${query}`;
  const res = await fetch(fullUrl, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Backend returned ${res.status} for ${fullUrl}`);
  }
  return res.json();
}

export default async function CoaPage({ searchParams }) {
  const params = await searchParams;
  const picc = typeof params?.picc === 'string' ? params.picc : '';
  const cmac = typeof params?.cmac === 'string' ? params.cmac : '';

  if (!picc || !cmac) {
    return <CoaFailure status="malformed" />;
  }

  let result;
  try {
    result = await verifyTag(picc, cmac);
  } catch (err) {
    // Log to the client container's stdout so the failure is debuggable even
    // when Sentry is not configured (e.g. local dev). Don't log the picc/cmac
    // values directly — they contain the encrypted tag identifier.
    console.error('[coa] verifyTag failed:', err && err.message ? err.message : err);
    Sentry.captureException(err, { tags: { feature: 'coa-verify' } });
    return <CoaFailure status="malformed" />;
  }

  if (result && result.status === 'ok' && result.art) {
    return <CoaSuccess art={result.art} counter={result.counter} />;
  }

  const failureStatus =
    result && typeof result.status === 'string' ? result.status : 'malformed';
  return <CoaFailure status={failureStatus} />;
}
