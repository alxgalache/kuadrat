/**
 * Frontend environment identity (build-time).
 *
 * NEXT_PUBLIC_APP_ENV is a dedicated variable embedded into the bundle during
 * `next build`. It exists because NODE_ENV cannot distinguish preprod from prod:
 * `next build` always forces NODE_ENV to 'production' and statically inlines it,
 * so both environments look identical. Use IS_PROD for any prod-only concern
 * (future Sentry env, robots, etc.).
 *
 * Fail-safe: when unset, behaves as production (current behavior preserved).
 * Preprod must explicitly opt in with NEXT_PUBLIC_APP_ENV=preprod.
 */
export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || 'production'
export const IS_PROD = APP_ENV === 'production'
