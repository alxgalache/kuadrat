# entity-content-pages

## Purpose

The answer surfaces a generative engine can cite: `/sobre-140d` (what 140d is), `/galeria/artistas` (the public artist index) and `/guias/*` (direct-answer guides). Before this, no page listed the artists at all — their detail pages were reachable only by filtering the listing, leaving them orphaned of internal links — and there was no single document stating what the gallery is.

All three are server-rendered, in Spanish, and structured for extraction: one `<h1>`, no skipped heading levels, and an opening paragraph that answers the page's question without needing the rest of the page. The constraint that runs through every requirement here is that **only confirmed facts are published** — no invented founding date, artist count or address, and no guide claiming a commitment the legal pages do not make.

> Layer affected: `client/app/sobre-140d/`, `client/app/galeria/artistas/`, `client/app/guias/`.

## Requirements

### Requirement: An entity page describes the gallery

The site SHALL publish an entity page at `/sobre-140d` that describes what the gallery is, how it works for buyers and for artists, how artworks are authenticated, and how to get in touch.

The page SHALL be server-rendered, SHALL be written in Spanish (es-ES), and SHALL emit `AboutPage` structured data referencing the site's `Organization` node.

#### Scenario: The page is readable without JavaScript

- **WHEN** an agent requests `/sobre-140d` and executes no JavaScript
- **THEN** the response SHALL contain the full text of the page

#### Scenario: The page answers the identity question directly

- **WHEN** the page is read
- **THEN** its opening paragraph SHALL state what 140d is in a single self-contained sentence that does not depend on surrounding context to be understood

#### Scenario: Only confirmed facts

- **WHEN** the page states a fact about the gallery's location, founding, size or operation
- **THEN** that fact SHALL be confirmed by the gallery operator, and no placeholder or invented figure SHALL be published

---

### Requirement: A public artist index lists every visible artist

The site SHALL publish an artist index at `/galeria/artistas` listing every artist marked visible, each entry carrying the artist's name, a link to their detail page, and their location and biography excerpt when available.

The page SHALL be server-rendered and SHALL emit an `ItemList` of `Person` entries.

#### Scenario: Artists are reachable by link

- **WHEN** the index is requested and no JavaScript is executed
- **THEN** the response SHALL contain an `<a href>` to each visible artist's detail page

#### Scenario: Hidden artists are excluded

- **WHEN** an artist is not marked visible
- **THEN** they SHALL NOT appear in the index

#### Scenario: The index is linked from the site

- **WHEN** the gallery listing and the site footer are rendered
- **THEN** at least one of them SHALL link to the artist index, so it is not an orphan page

#### Scenario: Contact details are not exposed

- **WHEN** the index is rendered
- **THEN** it SHALL NOT expose artists' account email addresses

---

### Requirement: Guide pages answer common questions directly

The site SHALL publish guide pages under `/guias/`, each answering one question in Spanish, server-rendered, with a single `<h1>` stating the question or topic and a self-contained answer in its opening paragraph.

Each guide SHALL declare its own title, description and canonical URL, SHALL emit `Article` structured data, and SHALL link to the relevant part of the catalogue.

#### Scenario: A guide is readable without JavaScript

- **WHEN** an agent requests a guide route and executes no JavaScript
- **THEN** the response SHALL contain the guide's complete text

#### Scenario: The answer stands alone

- **WHEN** a guide's opening paragraph is extracted in isolation
- **THEN** it SHALL answer the guide's question without requiring the rest of the page

#### Scenario: Guides are discoverable

- **WHEN** the guides index is rendered
- **THEN** it SHALL link to every published guide, and each guide SHALL appear in the sitemap and in `llms.txt`

#### Scenario: A guide makes no legal or fiscal claim beyond the site's own terms

- **WHEN** a guide describes returns, taxation or authenticity
- **THEN** its statements SHALL be consistent with the published legal pages, and SHALL NOT introduce a commitment those pages do not make

---

### Requirement: Answer content is structured for extraction

Entity, guide and FAQ pages SHALL use a single `<h1>`, a descending heading hierarchy with no skipped levels, and question-shaped headings where the section answers a question.

#### Scenario: One h1 per page

- **WHEN** any entity, guide or FAQ page is rendered
- **THEN** the document SHALL contain exactly one `<h1>`

#### Scenario: No skipped heading levels

- **WHEN** the headings of such a page are read in document order
- **THEN** each heading level SHALL be at most one level deeper than the preceding heading
