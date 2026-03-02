## ADDED Requirements

### Requirement: Draws FAQ section on FAQ page
The FAQ page (`/preguntas-frecuentes`) SHALL include a dedicated section for draws (sorteos) alongside the existing general and auctions FAQ entries. The page SHALL organize FAQs into clearly labeled sections: general questions, auctions ("Subastas"), and draws ("Sorteos").

#### Scenario: Draws FAQ section is visible
- **WHEN** a user navigates to `/preguntas-frecuentes`
- **THEN** the page SHALL display a "Sorteos" section with at least one FAQ entry explaining how draws work

#### Scenario: Auctions section remains separate
- **WHEN** the FAQ page is rendered
- **THEN** the existing auction FAQ entry ("¿Qué son las subastas de 140d?") SHALL appear under a "Subastas" section, separate from the draws section

---

### Requirement: Draws FAQ content
The draws FAQ section SHALL include an entry with question "¿Qué son los sorteos de 140d?" and an answer that explains: what draws are (random selection for art acquisition at a fixed price), how participation works (registration with email verification and payment authorization), that participants are only charged if selected as winners, and that each person can participate only once per draw.

#### Scenario: Draws FAQ answer covers key topics
- **WHEN** the draws FAQ entry is expanded
- **THEN** the answer SHALL explain: (1) draws are a random selection mechanism for acquiring art at a fixed price, (2) registration requires email verification and payment card authorization, (3) only selected winners are charged, (4) each person can only participate once per draw

#### Scenario: FAQ text is in Spanish
- **WHEN** the draws FAQ content is displayed
- **THEN** all text SHALL be in Spanish (es-ES locale)
