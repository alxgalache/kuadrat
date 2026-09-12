# Dos tipos de vendedor: Artista y Ponente

## Why

140d va a programar streams en directo, charlas con interacción, pases de documentales y cortos, y talleres o cursos online. Esa programación la sostienen **invitados que no venden obra ni producto físico**: hacen el evento, cobran su parte y se van. Hoy la aplicación no sabe expresar eso. Sólo existe un `role = 'seller'` y ese rol lo abre todo: publicar obra, publicar tienda, configurar Sendcloud, gestionar envíos y ser host de eventos.

El resultado, si no se cambia nada, es un panel lleno de secciones que ese invitado no puede usar: «Artículos» le pide subir una obra que nunca tendrá, «Mis envíos» lista paquetes que nunca existirán, y la ficha de admin le ofrece una «Configuración de envío Sendcloud» que no aplica. Un menú que miente sobre lo que el usuario puede hacer no es un problema estético: es la vía más corta a que alguien publique algo por error, a que soporte reciba preguntas que no debería recibir, y a que un formulario fiscal se rellene con datos que nadie va a usar.

Además hay un hallazgo previo que este cambio obliga a resolver: **el monedero del artista vive dentro de `/orders`**, la pantalla del menú «Pedidos». Esa pantalla se titula «Monedero» pero se alcanza por un menú llamado «Pedidos», y mezcla el saldo, el botón de cobro y el aviso de Stripe Connect con las estadísticas de venta y la lista de pedidos físicos. Ocultar «Pedidos» a un ponente —que es lo correcto, porque su lista de pedidos estará vacía siempre— le dejaría **sin forma de ver su saldo ni de solicitar el cobro de sus eventos**. Hay que separar las dos cosas antes de poder ocultar nada.

## What Changes

### El tipo de vendedor

- Nueva columna `users.seller_kind TEXT NOT NULL DEFAULT 'artist' CHECK(seller_kind IN ('artist','speaker'))`. Etiquetas es-ES: **«Artista»** y **«Ponente»**. `DEFAULT 'artist'` sin backfill: todas las cuentas existentes conservan exactamente el comportamiento de hoy.
- El admin elige el tipo al **crear** el autor (`POST /api/admin/authors`) y puede **cambiarlo** después (`PUT /api/admin/authors/:id`). Nadie más puede escribir esa columna.
- Un `speaker` conserva intacto todo lo que necesita para su actividad: perfil público, ser host de eventos (gratuitos y de pago), monedero, Stripe Connect, datos fiscales, facturación serie P, y la acreditación de ingresos por `eventCreditScheduler`.
- Un `speaker` pierde: publicar y gestionar obra (`art`), publicar y gestionar tienda (`others`), envíos Sendcloud del vendedor, y la configuración Sendcloud en la ficha de admin.

### El monedero se separa de los pedidos

- **Nueva ruta `/seller/monedero`** con el saldo en dos bolsas, el botón «Solicitar pago a 140d Galería de Arte» y el `StripeConnectBanner`. Accesible para **los dos tipos**.
- `/orders` conserva estadísticas y lista de pedidos, y su `<h1>` pasa de «Monedero» a «Pedidos», que es lo que su entrada de menú dice desde siempre.
- Menú del artista: Perfil · Artículos · Mis envíos · Monedero · Pedidos. Menú del ponente: Perfil · Monedero.

### El cambio de tipo es una operación con guardas

- **Degradar Artista → Ponente se rechaza** (409 `SELLER_KIND_CHANGE_BLOCKED`) mientras el vendedor tenga huella comercial viva: obra o producto no eliminado, subasta activa, sorteo activo, o ítems de pedido sin cerrar. La respuesta enumera qué lo impide, en es-ES, para que el admin lo resuelva y reintente. Nada se despublica ni se borra a espaldas de nadie.
- **Cualquier cambio de tipo invalida la sesión del vendedor.** Nueva columna `users.sessions_invalidated_at`, comparada en `api/config/passport.js` junto a `password_changed_at`. Sin esto el menú del artista seguiría mostrando «Artículos» hasta 7 días (el `user` del cliente sale de `localStorage` y sólo se refresca al hacer login).
- **Ningún cambio de tipo se acepta mientras el vendedor sea host de un evento con `status = 'active'`** — en ninguna de las dos direcciones. Invalidar la sesión de quien está retransmitiendo le tira el directo: le corta la renovación del token de host y le expulsa de su propia sala.
- Promocionar Ponente → Artista no tiene otros bloqueos: sólo concede.

### La prohibición se aplica en el servidor, no sólo en el menú

- Nuevo middleware `requireArtistSeller` en `api/middleware/authorization.js`, hermano de `requireSeller`, aplicado a todas las rutas de publicación y gestión de producto y de envíos de vendedor. Un menú oculto no es un permiso; el 403 sí.
- `AuthGuard` gana `requireSellerKind`, y las páginas `/seller/products`, `/seller/publish` y `/seller/pedidos` lo declaran.

### Puntos que el análisis descubrió y también se cierran

- **`/admin/envios-seller`** lista hoy todos los autores (`adminAPI.authors.getAll()`); pasará a listar sólo artistas — un ponente ahí es una fila que nunca tendrá envíos.
- **El selector de anuncio de marketing** (`GET /api/admin/marketing/authors`) alimenta un broadcast cuyo asunto es literalmente «Nuevo artista en 140d»; pasará a listar sólo artistas. Anunciar a un ponente necesita su propia plantilla y queda fuera de alcance.
- **La configuración Sendcloud** deja de crearse o actualizarse para un ponente (400). La fila existente **no se borra** al degradar: es histórico de envíos ya hechos.
- **El selector de host de eventos** (`/admin/espacios`) seguirá ofreciendo a los dos tipos, y mostrará el tipo junto al nombre.

## Capabilities

### New Capabilities

- `seller-account-kind`: la columna `users.seller_kind`, su edición por el admin (alta y modificación), las guardas del cambio de tipo, el conjunto de capacidades derivado de cada tipo, su aplicación en el servidor (`requireArtistSeller`) y en el cliente (`AuthGuard`, navbar).
- `seller-wallet-page`: la ruta `/seller/monedero` como único hogar del saldo, el botón de cobro y el aviso de Stripe Connect, alcanzable por los dos tipos de vendedor.

### Modified Capabilities

- `session-invalidation-on-password-change`: el corte de sesión deja de depender de una sola columna. `password_changed_at` y `sessions_invalidated_at` se comparan ambas contra el `iat` del JWT.
- `seller-wallet`: el saldo en dos bolsas se muestra en `/seller/monedero`, no en `/orders`.
- `orders-dashboard-stats`: `/orders` pierde el bloque de monedero y recupera el título «Pedidos»; las dos exigencias sobre «Monedero» pasan a describir `/seller/monedero`.
- `sendcloud-seller-config`: la sección no se muestra ni se acepta para un ponente.
- `admin-seller-shipments-page`: la pantalla lista sólo artistas.
- `new-author-announcement`: el selector de autores a anunciar lista sólo artistas.
- `admin-user-impersonation`: la sesión suplantada transporta el `seller_kind` del destino, para que el panel se pinte con las capacidades de quien se está suplantando.

## Impact

**Base de datos** (`api/config/database.js`): dos columnas nuevas en `users` (`seller_kind`, `sessions_invalidated_at`), en el `CREATE TABLE` y con su `safeAlter` correspondiente.

**API**: `api/middleware/authorization.js` (nuevo `requireArtistSeller`), `api/config/passport.js` (segundo corte de sesión), `api/utils/passwordSecurity.js` (corte generalizado), `api/routes/admin/authorRoutes.js` (alta, edición, guardas, invalidación), `api/validators/authorSchemas.js`, `api/routes/artRoutes.js`, `api/routes/othersRoutes.js`, `api/routes/productsRoutes.js`, `api/routes/sellerRoutes.js`, `api/controllers/sendcloudConfigController.js`, `api/controllers/marketingController.js`, `api/controllers/impersonationController.js`, `api/controllers/authController.js`.

**Cliente**: `client/components/Navbar.js`, `client/components/AuthGuard.js`, `client/contexts/AuthContext.js`, nueva `client/app/seller/monedero/page.js` y `client/components/seller/SellerWallet.js` (extraídos de `client/app/orders/page.js`), `client/app/admin/autores/nuevo/page.js`, `client/app/admin/autores/page.js`, `client/app/admin/authors/[id]/page.js`, `client/app/admin/authors/[id]/edit/page.js`, `client/app/admin/envios-seller/page.js`, `client/app/admin/espacios/*`, `client/lib/api.js`, `client/lib/constants.js`.

**Despliegue**: api y cliente deben desplegarse juntos — el cliente deja de pintar el monedero en `/orders` y la api empieza a rechazar publicaciones de ponentes.

**Sin impacto**: subastas, sorteos, CoA, calculadora de envíos, checkout, resolución de zonas de envío y facturación no cambian. Un ponente no tiene producto, así que queda fuera de esas rutas por construcción, no por una condición añadida.
