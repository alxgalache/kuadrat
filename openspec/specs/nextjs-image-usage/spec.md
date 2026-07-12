## Requirements

### Requirement: Use Next.js Image component for all images
Every image rendered in the frontend SHALL use `<Image>` from `next/image` instead of the native HTML `<img>` element. Files SHALL import `Image` from `'next/image'` before using it.

#### Scenario: Component uses img element
- **WHEN** a component or page currently renders a `<img>` element
- **THEN** the `<img>` MUST be replaced with `<Image>` from `next/image`
- **THEN** an `import Image from 'next/image'` statement MUST be present at the top of the file

#### Scenario: File already imports next/image but uses img
- **WHEN** a file already imports `Image` from `next/image` but still renders a `<img>` element
- **THEN** the `<img>` element MUST be replaced with the imported `<Image>` component

### Requirement: Explicit dimensions for fixed-size images
Images with a known, fixed pixel size (icons, small thumbnails) SHALL use explicit `width` and `height` numeric props matching the rendered pixel dimensions.

#### Scenario: Icon with fixed Tailwind size class
- **WHEN** an image is an icon rendered at a fixed size (e.g., `h-3.5 w-3.5`, `h-4 w-4`)
- **THEN** `<Image>` SHALL receive `width` and `height` props in pixels matching those dimensions
- **THEN** no `fill` prop SHALL be present

### Requirement: Fill layout for fluid/responsive images
Images that fill a parent container whose size is defined by CSS SHALL use the `fill` prop. The parent container MUST have `position: relative` (Tailwind: `relative`) and a defined height or aspect ratio.

#### Scenario: Product image inside aspect-ratio container
- **WHEN** an image lives inside a container with a Tailwind `aspect-*` or explicit `h-*` class
- **THEN** `<Image>` SHALL use the `fill` prop
- **THEN** the parent container SHALL have `className` including `relative`
- **THEN** `<Image>` SHALL include `className="object-cover"` (or the equivalent object-fit style)

#### Scenario: Parent container lacks relative positioning
- **WHEN** a `fill` image is added to a container without `position: relative`
- **THEN** the container MUST have `relative` added to its `className` to prevent layout collapse

### Requirement: sizes attribute on fill images
All `fill` images SHALL include a `sizes` attribute that accurately describes the image's rendered width relative to the viewport, enabling the browser to download the appropriate source size.

#### Scenario: Full-width or hero image
- **WHEN** an image occupies the full container width on all breakpoints
- **THEN** `sizes="100vw"` SHALL be provided

#### Scenario: Grid item image
- **WHEN** an image appears as a grid cell (e.g., product card, author card)
- **THEN** `sizes` SHALL reflect the responsive breakpoints (e.g., `"(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`)

### Requirement: Priority flag for LCP images
The primary above-the-fold image on pages where it is the Largest Contentful Paint element SHALL use the `priority` prop to disable lazy loading and preload the image.

#### Scenario: Hero image on product or event detail page
- **WHEN** a detail page (product, auction, draw, event, author) renders its primary image above the fold
- **THEN** `<Image>` SHALL include `priority` prop

#### Scenario: Home page hero
- **WHEN** the home page renders its first visible image
- **THEN** `<Image>` SHALL include `priority` prop

### Requirement: Preserved alt text
All `<Image>` elements SHALL carry the same descriptive `alt` attribute that was present on the replaced `<img>` element. Empty alt (`alt=""`) is only acceptable for purely decorative images.

#### Scenario: Migrated image with existing alt text
- **WHEN** an `<img>` element is replaced with `<Image>`
- **THEN** the `alt` prop value SHALL be identical to what was on the original `<img>`

### Requirement: Image optimizer active in development
The Next.js image optimizer SHALL be enabled in all environments, including local development — `next.config.js` SHALL NOT set `images.unoptimized` for development. Because the optimizer fetches the source image from the Next server (which inside the dev Docker network cannot reach `http://localhost:3001`), API-served image URL helpers (`getArtImageUrl`, `getOthersImageUrl`, `getAuthorImageUrl` in `client/lib/api.js`) SHALL return same-origin relative paths under a dev-only proxy prefix (`/img-proxy/...`) when running in development without a configured CDN, and `next.config.js` SHALL define a development-only rewrite from that prefix to the internal API base URL (`INTERNAL_API_URL`, defaulting to `http://localhost:3001/api`). Every external hostname rendered through `next/image` (including the `ui-avatars.com` fallback avatars) SHALL be listed in `images.remotePatterns`. Production and staging behavior SHALL remain unchanged: helpers keep returning absolute CDN/API URLs covered by `remotePatterns`.

#### Scenario: Grid images optimized in local development
- **WHEN** a product grid renders in local development (Docker or `next dev` on the host)
- **THEN** product images are requested through `/_next/image` and served resized according to the `sizes` attribute, instead of downloading the full-resolution original

#### Scenario: Dev image proxy resolves through the internal API URL
- **WHEN** the Next dev server receives a request for `/img-proxy/art/images/<basename>` or `/img-proxy/others/images/<basename>`
- **THEN** the request is rewritten to the corresponding path under `INTERNAL_API_URL` (falling back to `http://localhost:3001/api` when unset) and the image bytes are returned

#### Scenario: Fallback avatar host allowed by the optimizer
- **WHEN** a page renders the `ui-avatars.com` fallback avatar through `next/image` (author has no profile image)
- **THEN** the optimizer serves it successfully instead of rejecting the hostname

#### Scenario: Production URLs unchanged
- **WHEN** the client is built for production or staging
- **THEN** `getArtImageUrl` / `getOthersImageUrl` return the same absolute CDN or API URLs as before, and no `/img-proxy` rewrite is applied
