## ADDED Requirements

### Requirement: Banner de cookies visible globalmente

El sistema SHALL mostrar el banner de consentimiento de cookies en TODAS las páginas de la aplicación mientras el usuario no haya aceptado o rechazado las cookies. El banner SHALL renderizarse desde el layout raíz (`layout.js`) en lugar de una página específica.

#### Scenario: Usuario accede por primera vez a la home

- **WHEN** un usuario sin consentimiento previo accede a `/`
- **THEN** el banner de cookies se muestra en la parte inferior de la pantalla

#### Scenario: Usuario accede por primera vez a una ruta distinta de la home

- **WHEN** un usuario sin consentimiento previo accede a `/galeria` (o cualquier otra ruta)
- **THEN** el banner de cookies se muestra en la parte inferior de la pantalla

#### Scenario: Usuario ya aceptó las cookies

- **WHEN** un usuario que ya aceptó las cookies accede a cualquier página
- **THEN** el banner de cookies NO se muestra

#### Scenario: Usuario rechazó las cookies en la sesión actual

- **WHEN** un usuario que rechazó las cookies navega a otra página sin cerrar el navegador
- **THEN** el banner de cookies NO se muestra hasta que se recargue la página o se abra una nueva sesión

### Requirement: Enlace a Política de Cookies funcional

El banner de cookies SHALL incluir un enlace funcional a la página de Política de Cookies en `/legal/politica-de-cookies`. El enlace SHALL utilizar `next/link` para navegación client-side.

#### Scenario: Usuario hace clic en el enlace de Política de Cookies

- **WHEN** el usuario hace clic en "Política de Cookies" dentro del banner
- **THEN** el sistema navega a `/legal/politica-de-cookies` sin recarga completa de página

### Requirement: Página de Política de Cookies

El sistema SHALL servir una página estática en `/legal/politica-de-cookies` con el contenido de la política de cookies del sitio. La página SHALL seguir la misma estructura visual y de maquetación que las demás páginas legales existentes (logo enlazado a `/`, título, fecha de actualización, secciones numeradas). Todo el texto SHALL estar en español (es-ES).

#### Scenario: Acceso directo a la página de política de cookies

- **WHEN** un usuario accede a `/legal/politica-de-cookies`
- **THEN** se muestra la página con el contenido completo de la política de cookies, incluyendo: qué son las cookies, qué cookies se usan, finalidad, cómo gestionar/desactivar cookies y datos de contacto

#### Scenario: Metadata de la página

- **WHEN** un motor de búsqueda o navegador solicita la página `/legal/politica-de-cookies`
- **THEN** la página SHALL devolver metadata con título "Política de Cookies - 140d"

### Requirement: Eliminación de CookieBanner de la home

El componente `CookieBanner` SHALL eliminarse de `client/app/page.js` para evitar duplicación, ya que se renderiza desde el layout raíz.

#### Scenario: La home no renderiza CookieBanner directamente

- **WHEN** se inspecciona el código de `client/app/page.js`
- **THEN** no existe ninguna importación ni uso de `CookieBanner` en ese archivo
