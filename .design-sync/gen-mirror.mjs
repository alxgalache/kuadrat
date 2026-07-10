// Generates a .jsx mirror of the scoped Kuadrat components so the design-sync
// package-shape synth-entry can discover and bundle them. Kuadrat ships plain
// `.js` files with `export default function <Name>` — but synth-entry only
// walks .jsx/.tsx and re-exports via `export *` (which skips defaults), and
// esbuild's classic JSX transform needs React in scope. So for each component
// we copy the real source verbatim, prepend `import React` when absent, and
// append a named `export { <Name> }`. Real sources are never modified.
//
// Run: node .design-sync/gen-mirror.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DS_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(DS_DIR)
const CLIENT = join(ROOT, 'client')
const MIRROR = join(DS_DIR, '.cache', 'src')
const MANIFEST = join(DS_DIR, 'components.json')

const components = JSON.parse(readFileSync(MANIFEST, 'utf8'))

// Fresh mirror each run so a removed component leaves no stale .jsx behind.
rmSync(MIRROR, { recursive: true, force: true })
mkdirSync(MIRROR, { recursive: true })

const hasReactImport = (s) => /(^|\n)\s*import\s+(?:React\b|\*\s+as\s+React\b)/.test(s)

// Add a named export equal to the configured component name, aliasing the real
// default binding when it differs (e.g. Notification's default fn is
// NotificationContainer). The real binding name is captured so the alias is valid.
function namedExportLine(src, name) {
  // export default function/class <ident>
  let m = src.match(/export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/)
  if (m) return m[1] === name ? `export { ${name} };` : `export { ${m[1]} as ${name} };`
  // export default <ident>  (a bare identifier, possibly end of statement)
  m = src.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m)
  if (m) return m[1] === name ? `export { ${name} };` : `export { ${m[1]} as ${name} };`
  return null // anonymous/wrapped default — needs manual handling
}

const ok = []
const failed = []
for (const c of components) {
  const realPath = join(CLIENT, c.src)
  let src
  try {
    src = readFileSync(realPath, 'utf8')
  } catch {
    failed.push(`${c.name}: source not found at ${c.src}`)
    continue
  }
  const line = namedExportLine(src, c.name)
  if (!line) {
    failed.push(`${c.name}: could not derive a named export (anonymous/wrapped default) — needs manual mirror`)
    continue
  }
  let out = src
  if (!hasReactImport(out)) out = `import React from 'react'\n` + out
  out = out.replace(/\s*$/, '') + `\n\n// --- design-sync: named export for synth-entry re-export ---\n${line}\n`

  // Mirror path preserves the real sub-structure under components/ so that
  // cross-component `@/components/<path>` imports resolve to the mirror.
  const relUnderComponents = c.src.replace(/^components\//, '')
  const mirrorPath = join(MIRROR, dirname(relUnderComponents), `${c.name}.jsx`)
  mkdirSync(dirname(mirrorPath), { recursive: true })
  writeFileSync(mirrorPath, out)
  ok.push(`${c.name} -> ${resolve(mirrorPath).replace(ROOT + '/', '')}`)
}

console.log(`mirrored ${ok.length}/${components.length} components into ${MIRROR.replace(ROOT + '/', '')}`)
for (const l of ok) console.log('  ✓ ' + l)
if (failed.length) {
  console.log('\nFAILED:')
  for (const l of failed) console.log('  ✗ ' + l)
  process.exit(1)
}
