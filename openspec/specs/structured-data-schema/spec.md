# structured-data-schema

## Purpose

The coverage and shape of the schema.org JSON-LD emitted across the public surfaces. Artworks stop being generic `Product` nodes and become `VisualArtwork` + `Offer`, using columns that already exist on `art` and were going unused (`dimensions`, `type`, `edition_size`, `created_at`); artist pages, which emitted no structured data at all, gain a `Person` plus an `ItemList` of their works; listings and detail routes gain `ItemList` and `BreadcrumbList`.

All of it is built by one shared module (`client/lib/schema.js`) rather than by object literals inline in each page, and builders omit a property instead of emitting it empty. Three boundaries are stated as requirements because they are invisible when crossed: `Offer.availability` must reflect real availability (including quote mode, where the site cannot claim immediate purchase), the artist's account email is never published, and `outside_dimensions` / `outside_weight` never appear anywhere — they describe the shipping box, not the artwork.

> Layer affected: `client/lib/schema.js`, `client/app/layout.js`, and the public listing and detail routes that emit JSON-LD.

## Requirements

### Requirement: Structured data is built by a single shared module

All schema.org JSON-LD emitted by the client SHALL be produced by builder functions in one shared module (`client/lib/schema.js`). Page components SHALL NOT compose JSON-LD object literals inline.

Builder functions SHALL omit any property whose source value is null, undefined or an empty string, rather than emitting the property with an empty value.

#### Scenario: A page emits structured data

- **WHEN** any public page renders JSON-LD
- **THEN** the object SHALL come from a builder exported by the shared schema module

#### Scenario: Missing source data omits the property

- **WHEN** a builder receives a record whose optional field is null or empty
- **THEN** the resulting JSON-LD object SHALL NOT contain a key for that field

#### Scenario: Emitted JSON-LD is valid JSON

- **WHEN** any page emits a JSON-LD script
- **THEN** its content SHALL parse as JSON, and text originating from user or seller input SHALL be escaped so it cannot terminate the `<script>` element

---

### Requirement: Artworks are described as VisualArtwork

The artwork detail page SHALL emit a JSON-LD node of type `VisualArtwork` describing the piece, carrying `name`, `description`, `image`, `url`, and `creator` as a `Person` bearing the artist's name and their artist-page URL.

The node SHALL include, when the corresponding column is populated: `artMedium` from `art.type`, `width` and `height` as `QuantitativeValue` in centimetres parsed from `art.dimensions`, `dateCreated` from `art.created_at`, and `artEdition` from `art.edition_size` when it is greater than 1.

#### Scenario: An artwork with full technical data

- **WHEN** an artwork has `type`, `dimensions` in `LxW` or `LxWxH` centimetre form, and `edition_size` greater than 1
- **THEN** the emitted `VisualArtwork` SHALL carry `artMedium`, `width`, `height` and `artEdition`

#### Scenario: Unparseable dimensions

- **WHEN** `art.dimensions` does not match a recognised numeric pattern
- **THEN** the builder SHALL omit `width` and `height` entirely, and SHALL NOT emit a partial or guessed measurement

#### Scenario: Package dimensions are never published

- **WHEN** the artwork has `outside_dimensions` or `outside_weight` populated
- **THEN** those values SHALL NOT appear in any structured data, because they describe the shipping box and not the artwork

---

### Requirement: Artworks carry a purchasable Offer reflecting real availability

The artwork detail page SHALL emit an `Offer` associated with the artwork, carrying `price`, `priceCurrency` of `EUR`, `url`, `availability` and `seller`.

`availability` SHALL be `https://schema.org/SoldOut` when the edition is sold out, and `https://schema.org/InStock` otherwise. When the storefront is configured so the artwork cannot be bought, `availability` SHALL be `https://schema.org/PreOrder` and the offer SHALL NOT claim immediate purchase.

#### Scenario: A sold-out limited edition

- **WHEN** an artwork has `is_sold = 1`
- **THEN** `availability` SHALL be `SoldOut`

#### Scenario: A limited edition with copies left

- **WHEN** an artwork has `edition_size` greater than 1 and `is_sold = 0`
- **THEN** `availability` SHALL be `InStock`, and the offer SHALL NOT disclose the number of remaining copies

#### Scenario: The storefront is in quote mode

- **WHEN** the build has art purchasing disabled, so the page shows "Solicitar cotización" instead of a cart button
- **THEN** `availability` SHALL NOT be `InStock`

---

### Requirement: Artists are described as Person

Each artist detail page SHALL emit a JSON-LD `Person` node carrying `name`, `url`, and, when populated, `description` from the artist's biography, `image` from their profile image, and `address` from their location.

The page SHALL additionally emit an `ItemList` enumerating the artist's published works in display order, each entry pointing at the work's canonical URL.

#### Scenario: An artist page emits its entity

- **WHEN** an artist detail page is rendered
- **THEN** the HTML SHALL contain a `Person` node with at least `name` and `url`

#### Scenario: An artist with no biography

- **WHEN** the artist's `bio` is empty
- **THEN** the `Person` node SHALL omit `description` and SHALL still be emitted

#### Scenario: Artist contact details are not published

- **WHEN** a `Person` node is built for an artist
- **THEN** it SHALL NOT contain the artist's account email address

---

### Requirement: The organization is described as an art gallery

The root layout SHALL emit an `Organization` node specialised as an online art gallery, carrying `name`, `url`, `logo`, `description`, `sameAs` social profiles, `contactPoint`, `areaServed` and `inLanguage`.

The `WebSite` node SHALL declare a `SearchAction` pointing at the gallery listing's query parameter when site search is available.

#### Scenario: The organization node is present on every page

- **WHEN** any public page is rendered
- **THEN** the HTML SHALL contain exactly one `Organization` node and exactly one `WebSite` node

#### Scenario: No unverifiable claims

- **WHEN** the organization node is built
- **THEN** it SHALL NOT declare a founding date, postal address, VAT id or employee count that is not confirmed by the gallery operator

---

### Requirement: Listings and breadcrumbs are described

The gallery listing (`/galeria`), the store listing (`/tienda`) and the artist index SHALL each emit an `ItemList` of the items shown on the current page.

Every public detail route SHALL emit a `BreadcrumbList` describing its position in the site hierarchy.

Where the page also renders a visible breadcrumb, the two SHALL declare the same trail. Where it renders none, the structured trail SHALL still reflect the real hierarchy and SHALL NOT invent a level the site does not have. The structured data SHALL NOT be used to publish a navigation path that the page deliberately does not show.

#### Scenario: A listing emits its items

- **WHEN** the gallery listing renders its first page of results
- **THEN** the HTML SHALL contain an `ItemList` whose entries point at the canonical URL of each item shown

#### Scenario: Breadcrumb trail matches the visible breadcrumb

- **WHEN** a detail page renders both a visible breadcrumb and a `BreadcrumbList`
- **THEN** the positions, names and order SHALL be identical in both

#### Scenario: A page with no visible breadcrumb

- **WHEN** a detail page renders no visible breadcrumb
- **THEN** it MAY still emit a `BreadcrumbList` reflecting the site hierarchy, and doing so SHALL NOT require adding a visible breadcrumb to the page
