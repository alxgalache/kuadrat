# crawlable-content-rendering

## Purpose

The content of the four detail-page families that concentrate discovery traffic — artwork, artist, store product and event — travels inside the HTML the server returns, instead of being painted from `useEffect` after hydration. Classic search engines rendered that JavaScript on a second pass, at a cost in crawl budget; GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and CCBot do not execute JavaScript at all, so they saw no citable line of any artwork or artist.

Content is **moved, not duplicated**: the page resolves the record on the server and passes it to the existing interactive client component as a prop, which drops the initial fetch the browser used to repeat. Two properties are load-bearing and are stated as requirements rather than left to care: the converted pages must not render from `localStorage`, `window`, `Date.now()` or `Math.random()` (the `TestAccessGate` and `StoryVideo` lesson), and the ISR configuration these routes already carry must survive the conversion untouched.

> Layer affected: `client/app/galeria/p/[id]/`, `client/app/tienda/p/[id]/`, `client/app/galeria/autor/[authorSlug]/`, `client/app/tienda/autor/[authorSlug]/`, `client/app/live/[slug]/`.

## Requirements

### Requirement: Artwork detail content is present in the server-rendered HTML

The artwork detail route (`/galeria/p/[id]`) SHALL emit the artwork's name, full description, price, artist attribution and technical data inside the HTML document returned by the server, without requiring the client to execute JavaScript.

The page SHALL fetch the artwork on the server and pass it to the interactive client component as a prop. The client component SHALL NOT perform an initial fetch for data the server already resolved.

#### Scenario: A crawler that does not execute JavaScript reads the artwork

- **WHEN** an agent requests `/galeria/p/<slug>` and reads only the raw HTTP response body, executing no JavaScript
- **THEN** the response SHALL contain the artwork's name inside a single `<h1>`, its full description as text, its price, and the artist's name

#### Scenario: Technical data is rendered when present

- **WHEN** the artwork record has non-empty `dimensions`, `type` or `edition_size > 1`
- **THEN** the server-rendered HTML SHALL present each non-empty value as a labelled term/description pair in Spanish (técnica, dimensiones, edición)

#### Scenario: Absent optional fields render nothing

- **WHEN** the artwork record has `dimensions` NULL or empty
- **THEN** no empty label, placeholder or dash SHALL be rendered for that field

#### Scenario: Interactivity is preserved

- **WHEN** a visitor with JavaScript enabled loads the artwork detail page
- **THEN** the cart button, image carousel, artist modal, shipping selection and inquiry/quote modals SHALL behave exactly as before this change

#### Scenario: No duplicate initial request

- **WHEN** the artwork detail page is loaded with JavaScript enabled
- **THEN** the browser SHALL NOT issue a request to `GET /api/art/:id` to obtain the data already embedded in the HTML

#### Scenario: Unknown artwork

- **WHEN** the requested artwork does not exist, is not `approved`, is not `visible`, or is `removed`
- **THEN** the route SHALL return HTTP 404 with the application's not-found page, and SHALL NOT return a 200 with an empty shell

---

### Requirement: Artist detail content is present in the server-rendered HTML

Both artist detail routes (`/galeria/autor/[authorSlug]` and `/tienda/autor/[authorSlug]`) SHALL emit the artist's name, biography, location and the list of their published works inside the HTML document returned by the server.

#### Scenario: A crawler reads the artist's biography

- **WHEN** an agent requests an artist route and reads only the raw HTTP response body, executing no JavaScript
- **THEN** the response SHALL contain the artist's full name inside a single `<h1>` and the complete text of their biography

#### Scenario: The artist's works are listed as crawlable links

- **WHEN** the artist has published works
- **THEN** the server-rendered HTML SHALL contain an `<a href>` to each work's detail route, with the work's title as link text or as the `alt` of its image

#### Scenario: Artist without a biography

- **WHEN** the artist's `bio` is NULL or empty
- **THEN** the page SHALL render without a biography section and SHALL still render the name and the list of works

---

### Requirement: Store product and event detail content are present in the server-rendered HTML

The store product route (`/tienda/p/[id]`) and the event route (`/live/[slug]`) SHALL emit their name, description, price and, for events, date and modality inside the HTML document returned by the server.

#### Scenario: A crawler reads a store product

- **WHEN** an agent requests `/tienda/p/<slug>` and executes no JavaScript
- **THEN** the response SHALL contain the product name in a single `<h1>`, its full description and its price

#### Scenario: A crawler reads an event

- **WHEN** an agent requests `/live/<slug>` and executes no JavaScript
- **THEN** the response SHALL contain the event title in a single `<h1>`, its description, and its date and time in Spanish

#### Scenario: Private event surfaces stay out of the HTML

- **WHEN** an event page is server-rendered for an unauthenticated visitor
- **THEN** the HTML SHALL NOT contain streaming tokens, attendee access tokens, attendee identities or any host-only control

---

### Requirement: Server rendering does not introduce hydration mismatches

Content moved to the server SHALL render identically on the server and on the first client render.

Server-rendered page components SHALL NOT derive rendered output from `localStorage`, `sessionStorage`, `window`, `Date.now()`, `Math.random()` or any other value unavailable or non-deterministic at render time.

#### Scenario: No hydration warning on the converted routes

- **WHEN** any of the converted routes is loaded in a development build with React strict hydration checks active
- **THEN** the browser console SHALL report no hydration mismatch warning

#### Scenario: Client-only state is read in an effect

- **WHEN** a converted page needs a value from `localStorage` or `sessionStorage`
- **THEN** it SHALL read it inside `useEffect`, never inside a `useState` initializer or during render

---

### Requirement: Incremental static regeneration is preserved

The converted routes SHALL keep the caching configuration they already have: `revalidate = 300`, `generateStaticParams()` returning an empty array, and `dynamicParams = true`.

#### Scenario: Routes stay static in the build output

- **WHEN** `next build` completes
- **THEN** each converted route SHALL appear in the route table as ISR-capable and SHALL NOT be reported as fully dynamic

#### Scenario: The build does not depend on the API

- **WHEN** `next build` runs while the API is unreachable
- **THEN** the build SHALL complete successfully
