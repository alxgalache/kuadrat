# Kuadrat (140d) design-sync — repo notes

## Shape: Next.js app via the package (synth-entry) shape — OFF the converter's happy path

`client/` is a **Next.js 16 App Router application**, not a packaged component library: plain `.js` (no TypeScript, no `.d.ts`), no `dist/` of importable components, built by `next build` into `.next/`. There is therefore no dist entry and no shipped types. We bundle it via the package shape's **synth-entry** mode (`[NO_DIST] synthesizing from src files`) over a generated `.jsx` mirror. All of the scaffolding below exists to make that work and is reproducible.

## Why a `.jsx` mirror (`gen-mirror.mjs` + `components.json`)

synth-entry discovery only walks `.jsx`/`.tsx` (`SRC_IMPL_RX`) and re-exports via `export *` (which **skips default exports**); esbuild's classic JSX transform also needs `React` in scope. Kuadrat components are `.js` with `export default function <Name>`. So `gen-mirror.mjs` copies each scoped component (listed in `.design-sync/components.json`, `{name, src}` where `src` is client-relative) to `.design-sync/.cache/src/<realdir>/<Name>.jsx`, **prepending `import React from 'react'`** (when absent) and **appending `export { <Name> }`**. Real sources are never modified. Mirror structure preserves the real path under `components/` so `@/components/<path>` cross-imports resolve to mirrors.
- Run after editing `components.json`: `node .design-sync/gen-mirror.mjs`
- `cfg.srcDir` points at the mirror root (absolute), so discovery = exactly the mirrored set. No `componentSrcMap` scoping needed.
- gen-mirror only handles `export default function/class <Name>` and `export default <Ident>`. A component with an anonymous/wrapped default (`export default memo(() => …)`) will be reported FAILED — give it a hand-written mirror or rename.

## Deps: scratch install (client/node_modules is root-owned + empty)

`client/node_modules` is a root-owned empty dir (Docker volume mount) — `npm ci` there is **permission denied**. Deps are installed into a scratch dir we own:
`npm i --prefix .design-sync/.cache/deps react@^19.2.4 react-dom@^19.2.4 @headlessui/react@^2.2.9 @heroicons/react@^2.2.0 react-select@^5.10.2 tailwindcss@^3.4.19 postcss autoprefixer`
- `--node-modules .design-sync/.cache/deps/node_modules`
- **Symlink required** so `PKG_DIR` (= `NODE_MODULES/kuadrat-client`) resolves to the real package: `ln -sfn /home/axgalache/projects/kuadrat/client .design-sync/.cache/deps/node_modules/kuadrat-client`. Without it `realpathSync(PKG_DIR)` throws. With it, `pkgJson`/version come from the real `client/package.json`.
- react/react-dom are externalized by the converter's reactShim, but kept in scratch for vendoring (`_vendor/`).

## Next.js stubs + bundler tsconfig

esbuild bundles standalone, so Next runtime primitives are stubbed (`.design-sync/stubs/`): `next/link`→`<a>`, `next/image`→`<img>`, `next/navigation`→inert hooks, `next/script`→null. Routed via `.design-sync/tsconfig.bundle.json` (`cfg.tsconfig`, absolute target paths). **Path order matters**: `@/components/*` and `@/contexts/*` precede `@/*` so component/context imports hit the mirror/stubs, not raw `.js`. Plain-JS `@/lib/*` resolves to the real files (no JSX → fine). Context stubs live in `stubs/contexts/` (add as components that read contexts are scoped in — see Re-sync risks).

## process.env shim (NEXT_PUBLIC reads at module load)

`lib/constants.js` (and others) read `process.env.NEXT_PUBLIC_*` at module top-level; the browser has no `process`, which throws and aborts the IIFE (`[BUNDLE_EXPORT]` + `ReferenceError: process is not defined`). Fix: `.design-sync/stubs/process-shim.js` sets `globalThis.process = { env: {} }`, loaded **first** via `cfg.extraEntries` (extraEntries are emitted before the main entry, so it runs before any component). NEXT_PUBLIC flags then read as undefined = the code's fail-safe defaults.

## Styling: compiled Tailwind (`cfg.cssEntry`) + Inter via remote @import

No static CSS in the repo (Tailwind compiles at `next build`). We compile it ourselves:
`.design-sync/.cache/deps/node_modules/.bin/tailwindcss -c .design-sync/tailwind.build.config.cjs -i .design-sync/tw-input.css -o client/.ds-cache/tailwind.css`
- `tailwind.build.config.cjs` scans the real `client/components/**` + `client/app/**` so exactly the used utilities emit.
- `tw-input.css` = repo `globals.css` with the Inter `@import` kept as line 1.
- Output MUST live under `client/` — `cfg.cssEntry` is bounded to `PKG_DIR` (= client via symlink). We use `client/.ds-cache/tailwind.css` (gitignored).
- These components emit no component CSS, so `cssEntry` becomes the whole `_ds_bundle.css`; the leading `@import` is therefore at a valid top position → Inter loads at runtime (`[FONT_REMOTE]`, not `[FONT_MISSING]`).
- **Re-run the Tailwind compile whenever the scoped component set changes** (new classes used) before the build.

## Render check uses system Chrome

No `~/.cache/ms-playwright`, but `/usr/bin/google-chrome` exists. `playwright` is installed in `.ds-sync` WITHOUT its browser (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). Always run validate/capture with `DS_CHROMIUM_PATH=/usr/bin/google-chrome`.

## Build / validate commands (from repo root)

```sh
node .design-sync/gen-mirror.mjs
.design-sync/.cache/deps/node_modules/.bin/tailwindcss -c .design-sync/tailwind.build.config.cjs -i .design-sync/tw-input.css -o client/.ds-cache/tailwind.css
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules /home/axgalache/projects/kuadrat/.design-sync/.cache/deps/node_modules --out ./ds-bundle
DS_CHROMIUM_PATH=/usr/bin/google-chrome node .ds-sync/package-validate.mjs ./ds-bundle
```
(No `--entry` — its presence switches off synth mode.)

## Probe result (2026-06-29)

StatusBadge, Breadcrumbs, ConfirmDialog built + rendered clean (exit 0). StatusBadge authored preview renders the real component with correct Tailwind colors + Inter + Spanish accents. Feasibility confirmed.

## Known render warns
- `[FONT_REMOTE] "Inter"` — expected; Inter loads from Google Fonts at runtime. Not a warn to chase.

## Re-sync risks / watch-list
- **Context stubs are partial.** `stubs/contexts/` only stubs what scoped components have needed so far. Adding a component that reads a new context (`useCart`, `useAuth`, `useNotification`, `useBannerNotification`) needs a matching stub hook returning sane defaults, plus a `@/contexts/<X>` entry in `tsconfig.bundle.json`. Symptom otherwise: JSX-in-`.js` parse error (real context file pulled in) or a context/provider runtime error.
- **Scratch deps are pinned by semver range, not the lockfile** (client lockfile install is blocked by root ownership). A major bump in @headlessui/@heroicons/react-select could drift from production. Re-pin if behavior diverges.
- **Committed vs generated.** Hand-authored inputs are committed: `stubs/` (Next.js + context + lib-api stubs, the process shim), `tw-input.css`, `tsconfig.bundle.json`, `tailwind.build.config.cjs`, `gen-mirror.mjs`, `components.json`, `previews/`, `config.json`, `conventions.md`. Generated/installed are gitignored: `.cache/{src,deps,review,previews}`, `.design-sync/node_modules`, `client/.ds-cache/`, `ds-bundle/`, `.ds-sync/`. **On a fresh clone**: re-run the scratch dep install, recreate the `kuadrat-client` symlink, re-run `gen-mirror.mjs` + the Tailwind compile before building.
- **`npm i` into `.cache/deps` prunes the `kuadrat-client` symlink** (npm treats it as extraneous). Recreate it after ANY scratch install, not just on fresh clone, or the build fails with `realpathSync(PKG_DIR)` ENOENT / `kuadrat-client@0.0.0`.
- **Config paths are ABSOLUTE** (`/home/axgalache/projects/kuadrat/...`) to sidestep the synth-mode PKG_DIR base. They are machine/checkout-path specific — a clone at a different path must update `config.json` (srcDir, tsconfig, cssEntry, extraEntries) and `tsconfig.bundle.json` paths.
- **`@/lib/api` is pinned to the `stubs/lib-api.js` stub** in `tsconfig.bundle.json` because both `lib/api.js` AND `lib/api/` (a dir) exist and the path plugin's `''` ext grabs the directory (`Cannot read file ... is a directory`). Any other `@/<x>` that is a directory needs the same exact-path pin. The stub also rewrites image helpers to picsum placeholders.
- **Local `/public` images resolve to `https://140d.art<path>`** (next-image stub) so brand assets (logo, dice icon) load in the renderer. If those assets move or the origin goes down, they break — re-point or inline.
- **`process` shim assumes empty env is safe.** Components that branch hard on a NEXT_PUBLIC flag render in their fail-safe (flag-unset) state.
- **Context stubs return SAMPLE data** for `Notification`/`BannerNotification` (so their previews show content). That's a neutralized preview tied to the real component reading context — if those components change their context shape, update the stubs.
- The extra `window.Kuadrat` export (26 total vs 25 components) is the `__dsMainNs` marker from `extraEntries` (the process shim) — not a component; harmless.

## Final sync (2026-06-29)
25 components synced to project `d316ba5a-13c9-4f2d-a1a8-4a39aff0fe8e` ("140d Design System"). 16 authored rich previews (all graded good), 9 render their real component without an authored preview. CookieBanner was dropped from the curated set (it `return null`s unconditionally — disabled in the app).
