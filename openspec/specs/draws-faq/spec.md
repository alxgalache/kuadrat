# draws-faq

## Purpose

The public FAQ page (`/preguntas-frecuentes`), its section structure and its coverage. The page organizes its entries into labelled sections — general, auctions ("Subastas") and draws ("Sorteos") — rendered as real headings under a single `<h1>`, so each section and each entry can be extracted independently rather than read as one flat list.

Beyond the draws content it originally covered, the FAQ answers the questions buyers actually ask — shipping, returns, authenticity and the certificate, limited editions, payment — always consistent with the published legal pages, and emits a single `FAQPage` node matching the rendered entries one-to-one.

## Requirements

### Requirement: Draws FAQ section on FAQ page
The FAQ page (`/preguntas-frecuentes`) SHALL include a dedicated section for draws (sorteos) alongside the existing general and auctions FAQ entries. The page SHALL organize FAQs into clearly labeled sections: general questions, auctions ("Subastas"), and draws ("Sorteos").

Sections SHALL be rendered as real headings in the document, forming a descending hierarchy under the page's single `<h1>`, so that each section and its entries are extractable independently.

#### Scenario: Draws FAQ section is visible
- **WHEN** a user navigates to `/preguntas-frecuentes`
- **THEN** the page SHALL display a "Sorteos" section with at least one FAQ entry explaining how draws work

#### Scenario: Auctions section remains separate
- **WHEN** the FAQ page is rendered
- **THEN** the existing auction FAQ entry ("¿Qué son las subastas de 140d?") SHALL appear under a "Subastas" section, separate from the draws section

#### Scenario: Sections are headings, not styling
- **WHEN** the rendered FAQ page's heading outline is read
- **THEN** each section label SHALL appear as a heading element nested under the page's single `<h1>`, and SHALL NOT be rendered as unstructured text

#### Scenario: Every entry belongs to a section
- **WHEN** the FAQ page is rendered
- **THEN** every question SHALL appear under exactly one labelled section, with no entry outside the section structure

---

### Requirement: Draws FAQ content
The draws FAQ section SHALL include an entry with question "¿Qué son los sorteos de 140d?" and an answer that explains: what draws are (random selection for art acquisition at a fixed price), how participation works (registration with email verification and payment authorization), that participants are only charged if selected as winners, and that each person can participate only once per draw.

#### Scenario: Draws FAQ answer covers key topics
- **WHEN** the draws FAQ entry is expanded
- **THEN** the answer SHALL explain: (1) draws are a random selection mechanism for acquiring art at a fixed price, (2) registration requires email verification and payment card authorization, (3) only selected winners are charged, (4) each person can only participate once per draw

#### Scenario: FAQ text is in Spanish
- **WHEN** the draws FAQ content is displayed
- **THEN** all text SHALL be in Spanish (es-ES locale)

---

### Requirement: The FAQ covers the questions buyers actually ask

The FAQ page SHALL include sections answering, in addition to the existing general, auctions and draws content: shipping and delivery times, returns and cancellations, authenticity and the certificate of authenticity, limited editions, and payment and security.

Answers SHALL be consistent with the published legal pages and SHALL NOT state a commitment those pages do not make.

#### Scenario: Shipping is answered

- **WHEN** the FAQ page is rendered
- **THEN** it SHALL contain an entry explaining how shipping is quoted and what a buyer can expect regarding delivery

#### Scenario: Authenticity is answered

- **WHEN** the FAQ page is rendered
- **THEN** it SHALL contain an entry explaining that each artwork ships with a certificate of authenticity and that it can be verified

#### Scenario: Limited editions are answered

- **WHEN** the FAQ page is rendered
- **THEN** it SHALL contain an entry explaining what a limited edition means on the site

#### Scenario: Returns are answered consistently

- **WHEN** the returns entry is compared with the published terms and conditions
- **THEN** the two SHALL agree, and the FAQ SHALL NOT grant a right the terms do not

#### Scenario: All FAQ text is in Spanish

- **WHEN** any FAQ entry is displayed
- **THEN** its text SHALL be in Spanish (es-ES locale)

---

### Requirement: FAQ structured data matches the rendered questions

The FAQ page SHALL emit a single `FAQPage` node whose questions and answers correspond one-to-one with the entries rendered on the page.

#### Scenario: Structured data is complete

- **WHEN** the emitted `FAQPage` node is compared with the rendered entries
- **THEN** every rendered question SHALL be present in the structured data, and the structured data SHALL contain no question that is not rendered

#### Scenario: Answers match

- **WHEN** an entry's answer is compared between the rendered page and the structured data
- **THEN** the two SHALL carry the same text
