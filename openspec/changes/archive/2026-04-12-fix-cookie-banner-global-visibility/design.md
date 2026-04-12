## Context

Actualmente, el componente `CookieBanner` se importa y renderiza únicamente en `client/app/page.js` (la página de inicio). Esto significa que si un usuario accede a la aplicación por primera vez a través de cualquier ruta distinta a `/`, no verá el banner de consentimiento de cookies.

El layout raíz (`client/app/layout.js`) es un Server Component que contiene los providers globales (Auth, Cart, Notification) y un `LayoutWrapper` (Client Component) que gestiona la visibilidad de Navbar/Footer según la ruta. El `CookieBanner` es un Client Component (usa `useState`, `useEffect` y `localStorage`).

Las páginas legales existentes (`terminos-y-condiciones`, `politica-de-privacidad`, `normas-eventos`) siguen un patrón consistente: Server Components con metadata estática, logo enlazado a `/`, y contenido estructurado con secciones numeradas usando TailwindCSS.

## Goals / Non-Goals

**Goals:**

- El banner de cookies DEBE ser visible en todas las páginas de la aplicación mientras el usuario no haya aceptado el consentimiento.
- Crear la página `/legal/politica-de-cookies` con contenido apropiado.
- El enlace "Política de Cookies" del banner DEBE navegar a la nueva página legal.

**Non-Goals:**

- No se implementa una gestión granular de preferencias de cookies (aceptar/rechazar por categoría).
- No se modifica la lógica de consentimiento existente (localStorage con TTL de 30 días).
- No se añade banner de cookies en modo dark.

## Decisions

### 1. Ubicación del CookieBanner — Root Layout

**Decisión:** Añadir `CookieBanner` dentro de `client/app/layout.js`, después del componente `BannerNotification` y antes del cierre de `TestAccessGate`.

**Alternativa considerada:** Añadirlo dentro de `LayoutWrapper`. Descartada porque `LayoutWrapper` oculta su contenido en rutas `/legal/*` y `/user-activation`, y el banner de cookies debe ser visible también en esas páginas (especialmente la página de política de cookies).

**Rationale:** El root layout es el único punto que envuelve todas las páginas de la app. Como `CookieBanner` es un Client Component y `layout.js` es un Server Component, no hay conflicto: Next.js permite renderizar Client Components dentro de Server Components como children.

### 2. Enlace con `next/link` en vez de `<a href>`

**Decisión:** Reemplazar `<a href="#">` por `<Link href="/legal/politica-de-cookies">` del módulo `next/link` en `CookieBanner.js`.

**Rationale:** Mantiene la navegación client-side (SPA) y evita recargas completas de página. El estado del banner (gestionado por useState) se preserva durante la navegación.

### 3. Estructura de la página de Política de Cookies

**Decisión:** Crear `client/app/legal/politica-de-cookies/page.js` como Server Component con metadata estática, siguiendo exactamente el mismo patrón de diseño y estructura de `terminos-y-condiciones/page.js`.

**Rationale:** Coherencia visual con las demás páginas legales. Al ser contenido estático, no necesita ser Client Component.

## Risks / Trade-offs

- **[Riesgo] El banner se renderiza en el root layout incluso en rutas donde no se muestra Navbar/Footer (páginas legales, activación de usuario):** → Aceptable. El banner de cookies DEBE aparecer en todas las páginas por requisitos legales, independientemente de si tienen Navbar o no. El componente ya se auto-oculta si el usuario ha aceptado.

- **[Riesgo] Doble renderizado en la home durante la migración:** → Se elimina la importación de `CookieBanner` de `page.js` al mismo tiempo que se añade en `layout.js`, evitando duplicados.
