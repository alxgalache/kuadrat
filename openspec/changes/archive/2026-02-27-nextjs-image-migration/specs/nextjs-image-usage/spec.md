## ADDED Requirements

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
