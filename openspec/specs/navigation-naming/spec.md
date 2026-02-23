# Spec: Navigation Naming

## Purpose
Defines the naming conventions for navbar labels and URL paths for the three main content sections: Tienda (shop/gallery), Eventos (auctions), and Live (streaming).

---

## Requirements

### Requirement: Navbar shows updated section labels
The navigation bar SHALL display "Tienda", "Eventos", and "Live" as the visible labels for the three main content sections, replacing the previous labels "Más", "Subastas", and "Espacios" respectively.

#### Scenario: Navbar renders Tienda label
- **WHEN** any page is loaded and the navbar is rendered
- **THEN** the link previously labelled "Más" SHALL display the label "Tienda"

#### Scenario: Navbar renders Eventos label
- **WHEN** any page is loaded and the navbar is rendered
- **THEN** the link previously labelled "Subastas" SHALL display the label "Eventos"

#### Scenario: Navbar renders Live label
- **WHEN** any page is loaded and the navbar is rendered
- **THEN** the link previously labelled "Espacios" SHALL display the label "Live"

---

### Requirement: Client URL paths match new section names
The client-side URL paths for the three renamed sections SHALL be updated to reflect the new names: `/tienda` (or existing shop path), `/eventos`, and `/live`.

#### Scenario: Tienda link navigates to correct path
- **WHEN** the user clicks the "Tienda" navbar link
- **THEN** the browser SHALL navigate to the path that previously served the "Más" / gallery section

#### Scenario: Eventos link navigates to /eventos
- **WHEN** the user clicks the "Eventos" navbar link
- **THEN** the browser SHALL navigate to `/eventos`

#### Scenario: Live link navigates to /live
- **WHEN** the user clicks the "Live" navbar link
- **THEN** the browser SHALL navigate to `/live`

---

### Requirement: Next.js App Router directories match new URL paths
The Next.js App Router directory structure SHALL reflect the new URL paths so that navigating to `/eventos` and `/live` renders the correct pages.

#### Scenario: /eventos resolves to the auctions section
- **WHEN** a user visits `/eventos` in the browser
- **THEN** the Next.js App Router SHALL serve the page previously at `/subastas`

#### Scenario: /live resolves to the streaming section
- **WHEN** a user visits `/live` in the browser
- **THEN** the Next.js App Router SHALL serve the page previously at `/espacios`

#### Scenario: Old paths do not serve content
- **WHEN** a user visits `/subastas` or `/espacios`
- **THEN** the application SHALL return a 404 (no redirect is required; old paths are not publicly advertised)

---

### Requirement: All internal links use new paths
Every internal `<Link>`, `router.push`, or `href` reference in the client codebase that previously pointed to `/subastas`, `/espacios`, or the old shop path SHALL be updated to point to the corresponding new path.

#### Scenario: Internal Eventos links resolve correctly
- **WHEN** any component renders an internal link to the auctions section
- **THEN** the `href` attribute SHALL equal `/eventos`

#### Scenario: Internal Live links resolve correctly
- **WHEN** any component renders an internal link to the streaming section
- **THEN** the `href` attribute SHALL equal `/live`

---

### Requirement: SEO metadata reflects new paths
Page-level SEO metadata (canonical URLs, Open Graph `og:url`, sitemap entries) for pages under the renamed routes SHALL reference the new paths and not the old ones.

#### Scenario: Eventos page canonical URL uses new path
- **WHEN** the `/eventos` page is rendered
- **THEN** the canonical URL and any `og:url` meta tag SHALL reference `/eventos`, not `/subastas`

#### Scenario: Live page canonical URL uses new path
- **WHEN** the `/live` page is rendered
- **THEN** the canonical URL and any `og:url` meta tag SHALL reference `/live`, not `/espacios`
