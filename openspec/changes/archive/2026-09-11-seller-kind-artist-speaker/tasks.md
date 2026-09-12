## 1. Esquema y capacidades

- [x] 1.1 Añadir `seller_kind TEXT NOT NULL DEFAULT 'artist' CHECK(seller_kind IN ('artist','speaker'))` al `CREATE TABLE users` de `api/config/database.js`, con comentario que explique que sólo se lee cuando `role = 'seller'` (sin punto y coma ni `\n` dentro del comentario)
- [x] 1.2 Añadir `sessions_invalidated_at DATETIME DEFAULT NULL` al mismo `CREATE TABLE`, documentando que es el corte de sesión general y por qué no reutiliza `password_changed_at`
- [x] 1.3 Añadir los dos `safeAlter('ALTER TABLE users ADD COLUMN ...')` correspondientes, sin `CHECK` (precedente `stripe_connect_status`)
- [x] 1.4 Crear `api/utils/sellerCapabilities.js` con `SELLER_KINDS`, `isSpeaker(user)`, `canPublishProducts(user)`, `canManageShipments(user)`, `canHaveSendcloudConfig(user)`
- [x] 1.5 Crear `client/lib/sellerCapabilities.js` con los mismos predicados, y añadir a `client/lib/constants.js` las etiquetas es-ES `SELLER_KIND_LABELS` («Artista» / «Ponente») y los textos de error `SELLER_KIND_ERRORS`

## 2. Autenticación y permisos en el servidor

- [x] 2.1 Añadir `seller_kind` al objeto curado que devuelven las dos estrategias de `api/config/passport.js` (local y JWT), sin consulta adicional
- [x] 2.2 Añadir `isJwtIssuedBeforeSessionCutoff(iat, ...cutoffs)` a `api/utils/passwordSecurity.js`, reutilizando `parseSqlUtcDate` y la comparación estricta en segundos; conservar `isJwtIssuedBeforePasswordChange` exportada
- [x] 2.3 Sustituir la comprobación de la estrategia JWT por la nueva función, pasándole `password_changed_at` y `sessions_invalidated_at`
- [x] 2.4 Añadir `requireArtistSeller` a `api/middleware/authorization.js` (403, `title: 'SELLER_KIND_FORBIDDEN'`), con el comentario que explique por qué es un middleware con nombre y no un `if` por controlador
- [x] 2.5 Aplicar `requireArtistSeller` en `api/routes/artRoutes.js`, `api/routes/othersRoutes.js` y `api/routes/productsRoutes.js` (`/seller/me`, `POST /`, `DELETE /:id`)
- [x] 2.6 Aplicar `requireArtistSeller` en `api/routes/sellerRoutes.js` a `/products`, `/products/:id/visibility`, `/others/:id/variations`, `/orders` y `/orders/*`; verificar que `/wallet`, `/withdrawals`, `/paid-events`, `/profile`, `/commission-rates` y `/stripe-connect/*` quedan SIN el middleware
- [x] 2.7 Añadir `seller_kind` a los objetos `user` que devuelven `login` y `setPassword` en `api/controllers/authController.js`
- [x] 2.8 Añadir `seller_kind` al objeto `user` que devuelven `startImpersonation` y `stopImpersonation` en `api/controllers/impersonationController.js` (leerlo en los dos `SELECT` de esas funciones)

## 3. Alta y edición del tipo por el admin

- [x] 3.1 Añadir `sellerKind` (enum `'artist' | 'speaker'`, opcional) a `createAuthorSchema`/`updateAuthorSchema` en `api/validators/authorSchemas.js`; crear el schema de alta si no existe
- [x] 3.2 Persistir `seller_kind` en el `INSERT` de `POST /api/admin/authors` (`api/routes/admin/authorRoutes.js`), con `'artist'` por defecto al omitirse
- [x] 3.3 Devolver `seller_kind` en `GET /api/admin/authors`, `GET /api/admin/authors/:id` y en las respuestas de creación y actualización
- [x] 3.4 Crear `api/services/sellerKindService.js` con `sellerKindChangeBlockers(sellerId, { toKind })` que devuelva los bloqueos: producto vivo, subasta abierta, sorteo abierto, ítem de pedido sin cerrar (sólo al degradar) y evento `status = 'active'` (en ambas direcciones), cada uno con su recuento y su texto es-ES
- [x] 3.5 En `PUT /api/admin/authors/:id`: leer el `seller_kind` actual, detectar si el valor cambia, y si cambia invocar los bloqueos antes de cualquier escritura; responder 409 con `title: 'SELLER_KIND_CHANGE_BLOCKED'` y la lista
- [x] 3.6 Escribir `seller_kind` y `sessions_invalidated_at = CURRENT_TIMESTAMP` **en el mismo `UPDATE`**, y sólo cuando el valor cambia; registrar el cambio con `logger.info` incluyendo admin, vendedor, valor anterior y nuevo
- [x] 3.7 Rechazar con 400 la creación y la actualización de configuración Sendcloud para un ponente en `api/controllers/sendcloudConfigController.js`; no borrar ninguna fila existente
- [x] 3.8 Filtrar `listAuthorsForAnnounce` y `announceAuthor` de `api/controllers/marketingController.js` a `seller_kind = 'artist'`

## 4. Cliente: sesión, menú y guardas

- [x] 4.1 Componer una única lista `sellerMenuItems` en `client/components/Navbar.js` a partir de `seller_kind` y `SENDCLOUD_ENABLED`, y recorrerla desde el bloque de escritorio y el de móvil (hoy duplicados)
- [x] 4.2 Añadir la entrada «Monedero» → `/seller/monedero` a esa lista, presente para los dos tipos; ocultar «Artículos», «Mis envíos» y «Pedidos» al ponente
- [x] 4.3 Añadir la propiedad `requireSellerKind` a `client/components/AuthGuard.js`, con el mismo comportamiento de redirección que `requireRole`
- [x] 4.4 Declarar `requireSellerKind="artist"` en `client/app/seller/products/page.js`, `client/app/seller/publish/page.js` y `client/app/seller/pedidos/page.js`

## 5. Cliente: separación del monedero

- [x] 5.1 Extraer `client/components/seller/SellerWallet.js` desde `client/app/orders/page.js`: `StripeConnectBanner`, carga de `sellerAPI.getWallet()`, las dos bolsas, el total, la línea de comisiones, el botón de cobro y el diálogo de confirmación con su estado
- [x] 5.2 Crear `client/app/seller/monedero/page.js` que monte `<SellerWallet />` bajo `AuthGuard requireRole="seller"`, más su `layout.js` con `robots: { index: false, follow: false }` si no lo hereda
- [x] 5.3 Eliminar de `client/app/orders/page.js` el banner, el estado de monedero, la llamada a `getWallet`, el bloque de saldo, el botón de cobro y su diálogo
- [x] 5.4 Cambiar el `<h1>` de `/orders` de «Monedero» a «Pedidos» y ajustar el subtítulo para que hable de pedidos — la página ya tenía un SEGUNDO `<h1>` («Gestión de pedidos», con su subtítulo «Consulta los pedidos que contienen tus productos») debajo del bloque de monedero, así que al retirar éste queda el encabezado correcto sin inventar copia nueva
- [x] 5.5 Comprobar que `/orders` ya no llama a `sellerAPI.getWallet()` (hoy lo hace sin condicionar por rol, lo que produce un 403 en la sesión de un comprador)

## 6. Cliente: panel de administración

- [x] 6.1 Añadir el selector «Tipo de usuario» («Artista» / «Ponente») a `client/app/admin/autores/nuevo/page.js`, con su texto de ayuda, y enviarlo en `adminAPI.authors.create`
- [x] 6.2 Mostrar el tipo como columna o etiqueta en `client/app/admin/autores/page.js`
- [x] 6.3 Mostrar el tipo en la ficha `client/app/admin/authors/[id]/page.js`, dejando el resto de la pantalla sin cambios
- [x] 6.4 Añadir el selector de tipo a `client/app/admin/authors/[id]/edit/page.js` y ocultar `<SendcloudConfigSection>` cuando el autor es ponente (incluida la rama de guardado que llama a `createSendcloudConfig`/`updateSendcloudConfig`)
- [x] 6.5 Añadir el diálogo de confirmación previo al guardado cuando el selector de tipo ha cambiado, advirtiendo del cierre de sesión del vendedor y del cambio de secciones
- [x] 6.6 Mostrar en pantalla el 409 `SELLER_KIND_CHANGE_BLOCKED` con su lista de bloqueos, en lugar del error genérico
- [x] 6.7 Filtrar a artistas el desplegable de vendedores de `client/app/admin/envios-seller/page.js`
- [x] 6.8 Mostrar el tipo junto al nombre en los selectores de host de `client/app/admin/espacios/nuevo/page.js` y `client/app/admin/espacios/[id]/page.js`, sin filtrar ninguno de los dos tipos
- [x] 6.9 Añadir a `client/lib/api.js` lo que falte para las llamadas anteriores (campo `seller_kind` en create/update de autores) — nada que añadir: `adminAPI.authors.create/update` serializan el objeto entero, y `apiRequest` ya expone el cuerpo del error en `error.response`, de donde sale `blockers`

## 7. Tests de API

- [x] 7.1 `api/tests/sellerKind.test.js`: la columna existe con su valor por defecto; el alta persiste el tipo; el valor fuera del enum se rechaza con 400
- [x] 7.2 `requireArtistSeller`: 403 para un ponente en `POST /api/art`, `POST /api/others`, `GET /api/seller/products` y `GET /api/seller/orders`; 200 para un artista en las mismas rutas
- [x] 7.3 Bloqueos de degradación: un caso por cada uno de los cinco bloqueos, más el caso limpio que sí degrada, más la promoción sin bloqueos
- [x] 7.4 Evento `status = 'active'`: bloquea el cambio en las dos direcciones y no escribe ninguna de las dos columnas
- [x] 7.5 Corte de sesión: cambiar el tipo escribe `sessions_invalidated_at` en el mismo `UPDATE`; guardar el mismo tipo no lo escribe; un JWT anterior al corte devuelve 401 y uno posterior autentica
- [x] 7.6 Ampliar `api/tests/passwordChangeInvalidation.test.js` (o añadir casos junto a él) con el barrido de zonas horarias sobre `sessions_invalidated_at`, igualando lo que ya se prueba para `password_changed_at`
- [x] 7.7 Sendcloud: crear y actualizar configuración de un ponente devuelve 400; la fila de un artista degradado sobrevive y sigue siendo legible
- [x] 7.8 Marketing: el selector de anuncio no lista ponentes y el disparo directo sobre uno se rechaza
- [x] 7.9 Ejecutar `npm test` desde `api/` y comprobar que `testEnvironmentIsolation.test.js` sigue verde

## 8. Verificación manual y documentación

- [x] 8.1 Crear un ponente de prueba y comprobar su menú (Perfil, Monedero) en escritorio y en móvil
- [x] 8.2 Comprobar que `/seller/publish`, `/seller/products` y `/seller/pedidos` redirigen para ese ponente
- [x] 8.3 Asignarle un evento de pago, simular la acreditación y comprobar que ve el saldo y puede solicitar el cobro desde `/seller/monedero`
- [x] 8.4 Comprobar que un artista existente encuentra su monedero en la nueva entrada de menú y que `/orders` conserva estadísticas y pedidos con el título «Pedidos»
- [x] 8.5 Degradar un artista con obra y comprobar el 409 **con su listado en pantalla**; promocionar el ponente de prueba y comprobar que reaparecen todas sus secciones y la configuración Sendcloud — verificado a mano por el admin con su propia sesión (la mitad de servidor ya estaba cubierta por `sellerKind.test.js`)
- [x] 8.6 Suplantar un ponente desde `/admin/autores` y comprobar que el menú es el suyo, no el de un artista — verificado a mano por el admin con su propia sesión
- [x] 8.7 Documentar la capacidad en `CLAUDE.md`: la columna, el reparto `CHECK`/`safeAlter`, el corte de sesión en dos columnas, la regla de bloqueo y el punto ciego del cliente sin runner de tests
