## 1. Mover CookieBanner al layout raíz

- [x] 1.1 Añadir la importación de `CookieBanner` en `client/app/layout.js` y renderizarlo dentro de `<TestAccessGate>`, después de `<BannerNotification />`.
- [x] 1.2 Eliminar la importación y el uso de `<CookieBanner />` de `client/app/page.js`.

## 2. Actualizar enlace de Política de Cookies en el banner

- [x] 2.1 En `client/components/CookieBanner.js`, reemplazar `<a href="#">` por `<Link href="/legal/politica-de-cookies">` usando `next/link` para la navegación client-side.

## 3. Crear página de Política de Cookies

- [x] 3.1 Crear `client/app/legal/politica-de-cookies/page.js` como Server Component con metadata (`title: 'Política de Cookies - 140d'`), siguiendo la misma estructura visual de `client/app/legal/terminos-y-condiciones/page.js` (logo, título, fecha, secciones numeradas con TailwindCSS). Contenido en español: qué son las cookies, tipos utilizados, finalidades, gestión/desactivación, y datos de contacto.

## 4. Verificación

- [x] 4.1 Verificar que el banner aparece en `/`, `/galeria` y `/legal/politica-de-cookies` cuando no hay consentimiento almacenado.
- [x] 4.2 Verificar que el enlace "Política de Cookies" navega correctamente a `/legal/politica-de-cookies`.
- [x] 4.3 Verificar que tras aceptar las cookies, el banner no se muestra en ninguna página.
