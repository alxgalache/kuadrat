// Bundle-eval shim, loaded as the FIRST design-sync entry (cfg.extraEntries),
// so it runs before any component module. Kuadrat's source reads
// process.env.NEXT_PUBLIC_* at module load (e.g. lib/constants.js); the browser
// has no `process`, which would throw and abort the whole IIFE. An empty env
// makes those reads yield undefined, i.e. the code's fail-safe defaults.
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { env: {} }
} else if (!globalThis.process.env) {
  globalThis.process.env = {}
}
