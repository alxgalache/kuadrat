# 140d — building with this design system

140d is a **minimalist online art gallery** (es-ES). The aesthetic is deliberate: white surfaces, near-black text, **Inter**, generous whitespace, thin borders and subtle shadows — *the only rich imagery is the artwork itself*. Keep designs quiet so the art carries them. All user-facing copy is Spanish.

## Components & setup
Every component is exported on `window.Kuadrat.*` and is **self-contained — no provider/theme wrapper is needed**. A few read app state from React context (e.g. `Navbar` → auth/cart, `Notification` / `BannerNotification` → a notification queue); in this bundle those contexts are stubbed with inert sample data, so the components render standalone and show representative content. Compose them directly.

Images inside components (e.g. `ProductGrid`, `AuctionGridItem`, `ProductImageCarousel`, `CoaSuccess`) are produced from a basename via an internal helper that returns a placeholder photo here; pass realistic product/auction data and they fill in.

## Styling idiom — stock TailwindCSS (v3)
There is **no custom Tailwind preset and no `var(--token)` system** — style your own layout glue with standard Tailwind utility classes, matching the brand vocabulary the components already use:

| Role | Classes |
|---|---|
| Surface / text | `bg-white`, `text-gray-900`, muted `text-gray-500` / `text-gray-400`, hairline `border-gray-200` / `ring-1 ring-gray-300` |
| Type | Inter is the default `font-sans`; `text-xs`/`text-sm`/`text-base`, `font-medium` / `font-semibold` / `font-bold`, `tracking-tight` |
| Shape & depth | `rounded-md` / `rounded-lg` / `rounded-full`, `shadow-sm` / `shadow-xl` |
| Primary action | `bg-gray-900 text-white hover:bg-gray-700` (or `bg-black`) |
| Destructive / warning | `bg-red-600 hover:bg-red-500` / `bg-yellow-600 hover:bg-yellow-500`, both `text-white` |
| Status pills | `inline-flex items-center rounded-md px-2 py-1 text-xs font-medium` + `bg-green-100 text-green-800` (and `red`/`amber`/`orange` for revoked/lost/damaged) |
| Page & grid | container `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`; gallery grid `grid grid-cols-2 gap-4 sm:gap-8 lg:grid-cols-4` |

Favor the minimal end of every scale (small radii, `shadow-sm`, thin rings). Avoid gradients, heavy borders, and bright fills outside the status palette.

## Where the truth lives
- `styles.css` → imports `_ds_bundle.css` (the compiled Tailwind utilities) and the Inter web-font `@import`. Read it before introducing new classes.
- Per component: `components/<group>/<Name>/<Name>.prompt.md` (usage) and `<Name>.d.ts` (props).

## One idiomatic composition
```jsx
const { Navbar, Breadcrumbs, ProductGrid, Footer } = window.Kuadrat
const img = (b) => `/img/${b}.jpg`            // your image-URL builder
const products = [{ id: 1, name: 'Marea baja', slug: 'marea-baja', price: 480,
  seller_full_name: 'Lucía Fernández', thumbnail_basename: 'a1' }, /* … */]

<div className="min-h-screen bg-white text-gray-900">
  <Navbar />
  <Breadcrumbs items={[{ name: 'Galería', href: '/galeria' }, { name: 'Pinturas' }]} />
  <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <h1 className="mb-8 text-2xl font-semibold tracking-tight">Galería</h1>
    <ProductGrid products={products} getImageUrl={img} baseRoute="/galeria" isFading={false} />
  </main>
  <Footer />
</div>
```
