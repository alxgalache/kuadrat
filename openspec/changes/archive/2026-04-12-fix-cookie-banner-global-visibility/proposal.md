## Why

El banner de consentimiento de cookies (`CookieBanner`) solo se muestra en la página de inicio (`/`) porque está importado únicamente en `client/app/page.js`. Si un usuario accede directamente a cualquier otra ruta (por ejemplo `/galeria`, `/subastas`) sin haber aceptado las cookies, el banner no aparece, incumpliendo la normativa de consentimiento de cookies. Además, el enlace "Política de Cookies" dentro del banner apunta a `#` (sin destino real), por lo que se necesita crear la página legal correspondiente.

## What Changes

- Mover la renderización de `CookieBanner` desde `client/app/page.js` al layout raíz (`client/app/layout.js`) para que se muestre en todas las páginas de la aplicación mientras el usuario no haya aceptado las cookies.
- Eliminar la importación y uso de `CookieBanner` en `client/app/page.js`.
- Crear una nueva página legal en `client/app/legal/politica-de-cookies/page.js` con el contenido de la política de cookies, siguiendo el mismo estilo y estructura de las páginas legales existentes (como `terminos-y-condiciones`).
- Actualizar el enlace "Política de Cookies" en el componente `CookieBanner` para que apunte a `/legal/politica-de-cookies` usando `next/link`.

## Capabilities

### New Capabilities

- `cookie-policy-page`: Página legal estática de Política de Cookies accesible en `/legal/politica-de-cookies`, con estructura y estilo coherente con las demás páginas legales existentes.

### Modified Capabilities

_(Sin cambios en capabilities existentes a nivel de spec — los cambios son de implementación/ubicación del componente existente.)_

## Impact

- **Frontend:**
  - `client/app/layout.js` — se añade `CookieBanner` como componente global (client component wrapper necesario ya que layout.js es un Server Component).
  - `client/app/page.js` — se elimina la importación y uso de `CookieBanner`.
  - `client/components/CookieBanner.js` — se actualiza el enlace `href="#"` a `/legal/politica-de-cookies` usando `next/link`.
  - `client/app/legal/politica-de-cookies/page.js` — nueva página legal (Server Component).
- **Backend:** Sin cambios.
- **Dependencias:** Ninguna nueva.
