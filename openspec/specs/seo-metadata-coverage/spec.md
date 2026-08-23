# seo-metadata-coverage

## Purpose

Every indexable public route declares its own title, description, canonical URL, Open Graph and Twitter Card — and none declares information that is false or inherited from another section. The defects this closes are concrete: `/tienda` had neither title nor description of its own, and `/eventos` presented itself to search engines as «Subastas de Arte» while also hosting the draws.

Canonicals are absolute, prefer the slug form over the numeric id, and carry no filter or tracking parameters, so two routes never claim the same address by accident. Social images must be fetchable from outside: `CDN_BASE_URL` was documented only in `api/.env.example`, so the client fell back to the API origin in production. The exclusion of private, transactional and token-bearing routes is stated once and must agree in both directions — nothing in the sitemap may be disallowed in `robots.txt`.

> Layer affected: `client/app/layout.js`, `client/app/page.js`, `client/app/eventos/layout.js`, `client/app/tienda/layout.js`, the per-route `generateMetadata` functions, `client/lib/serverApi.js`, `client/.env.example` and the deployment compose files.

## Requirements

### Requirement: Every indexable public route declares its own metadata

Every route reachable by an unauthenticated visitor and not disallowed in `robots.txt` SHALL declare a title, a description and a canonical URL, either on the page itself or on the nearest enclosing layout.

A route SHALL NOT rely on the root layout's default title as its own.

#### Scenario: The store listing has its own identity

- **WHEN** `/tienda` is rendered
- **THEN** its title and description SHALL describe the store, and SHALL NOT be the root layout's default title

#### Scenario: The home page declares itself

- **WHEN** `/` is rendered
- **THEN** it SHALL declare a canonical URL of the site root and a description of the gallery

#### Scenario: No indexable route is left undeclared

- **WHEN** the set of indexable public routes is enumerated
- **THEN** each one SHALL resolve to a non-empty title, a non-empty description and a canonical URL

---

### Requirement: Declared metadata matches the page's actual content

No route SHALL declare a title or description that describes a different section of the site.

#### Scenario: The events hub is not described as auctions only

- **WHEN** `/eventos` is rendered
- **THEN** its title and description SHALL describe the hub of auctions and draws, and SHALL NOT present the route as covering auctions alone

#### Scenario: Renamed sections carry their current names

- **WHEN** any metadata, structured data or discovery file names a public section
- **THEN** it SHALL use the current names and paths (`/tienda`, `/eventos`, `/live`) and SHALL NOT use the superseded ones (`/galeria/mas`, `/subastas`, `/espacios`)

---

### Requirement: Canonical URLs are absolute, unique and parameter-free

Canonical URLs SHALL resolve against the configured site origin and SHALL point at the route's preferred address.

For routes addressable both by numeric id and by slug, the canonical SHALL be the slug form whenever a slug exists.

Canonical URLs SHALL NOT carry filter, pagination or tracking query parameters.

#### Scenario: An artwork reachable by id

- **WHEN** an artwork with a slug is requested at its numeric-id URL
- **THEN** the canonical SHALL be the slug URL

#### Scenario: A filtered listing

- **WHEN** the gallery listing is rendered with an author filter in the query string
- **THEN** the canonical SHALL be the unfiltered listing URL

#### Scenario: Two routes never claim the same canonical

- **WHEN** the canonical URLs of all indexable routes are collected
- **THEN** no two distinct routes SHALL declare the same canonical, except where one is deliberately consolidating into the other

---

### Requirement: Social preview metadata is complete and resolvable

Every indexable route SHALL declare Open Graph title, description, URL and type, and a Twitter card.

Where the route has a representative image, that image SHALL be declared with an absolute URL served from the public origin or the CDN, never from an origin only reachable inside the internal network.

The image declared SHALL suit the shape of a social card, which is landscape, rather than the shape the same image happens to have on the site's own layout. On artist pages this inverts the site's own preference: the landscape variant (`profile_img_mobile`, uploaded for the artist modal's mobile band) SHALL be preferred over the vertical portrait (`profile_img`), which SHALL be used only as a fallback for artists who have no landscape variant. `hide_profile_img_mobile` SHALL NOT be consulted — it governs the modal's layout, not the file's suitability.

#### Scenario: An artwork's social preview

- **WHEN** an artwork detail page declares an Open Graph image
- **THEN** the URL SHALL be absolute and SHALL be fetchable by an external client

#### Scenario: A route with no representative image

- **WHEN** a route has no image of its own
- **THEN** it SHALL inherit the site's default social image rather than declaring a broken or empty one

#### Scenario: An artist's social preview uses the landscape variant

- **WHEN** an artist page declares its Open Graph image and the artist has a `profile_img_mobile`
- **THEN** that landscape variant SHALL be the declared image, and the Twitter card SHALL be `summary_large_image`

#### Scenario: An artist with a single image

- **WHEN** an artist page declares its Open Graph image and the artist has no `profile_img_mobile`
- **THEN** the main portrait SHALL be the declared image, and the Twitter card SHALL be `summary`

#### Scenario: Open Graph type is one the framework accepts

- **WHEN** any page declares an Open Graph type
- **THEN** it SHALL be one of the types the framework validates against, and rendering the page SHALL NOT fail
- **AND** the fact that a page represents a purchasable item SHALL be expressed through its structured data rather than through a non-standard Open Graph type

---

### Requirement: Image URLs used in metadata and structured data are CDN-aware and configured

The server-side image URL helpers SHALL build absolute URLs from the configured CDN base when one is set, and fall back to the public API origin otherwise.

The CDN configuration variable read by the client SHALL be documented in the client environment example and supplied to the client service in every deployment compose file.

#### Scenario: The CDN is configured

- **WHEN** the client's CDN base variable is set
- **THEN** metadata and structured-data image URLs SHALL be built from it

#### Scenario: The CDN is not configured

- **WHEN** the variable is unset
- **THEN** image URLs SHALL fall back to the public API origin and SHALL remain externally fetchable

#### Scenario: The variable is discoverable

- **WHEN** an operator reads the client environment example
- **THEN** the CDN variable SHALL be present and documented there

---

### Requirement: Non-indexable routes are excluded consistently

Routes serving private, transactional or single-use content SHALL be excluded from indexing both by `robots.txt` and by their own robots metadata, and SHALL NOT appear in the sitemap.

#### Scenario: A token-bearing route

- **WHEN** an order-token, password-reset or account-activation route is rendered
- **THEN** it SHALL declare `noindex` in its own metadata in addition to being disallowed in `robots.txt`

#### Scenario: Payment outcome routes

- **WHEN** a payment result route is rendered
- **THEN** it SHALL declare `noindex`

#### Scenario: The exclusion lists agree

- **WHEN** the sitemap and the `robots.txt` disallow list are compared
- **THEN** no URL present in the sitemap SHALL be disallowed in `robots.txt`
