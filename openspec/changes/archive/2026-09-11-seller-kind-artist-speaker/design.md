## Context

Hoy `role = 'seller'` es un permiso único e indivisible. Concede publicar obra, publicar tienda, configurar Sendcloud, gestionar envíos y ser host de eventos, y no hay ninguna forma de conceder sólo la última. La programación de eventos multimedia que 140d va a impulsar necesita exactamente eso: invitados que hacen un directo, un taller o un pase de vídeo, cobran su parte y no tienen ni obra ni producto.

Cuatro hechos del código, verificados, condicionan todo el diseño:

1. **`req.user` es un objeto curado, no la fila.** `api/config/passport.js` hace `SELECT * FROM users WHERE id = ?` y luego construye a mano `{ id, email, role, full_name, created_at }`. Añadir un campo al objeto es gratis: la fila ya está cargada. Y como la estrategia relee la fila en **cada** petición, el servidor nunca ve un tipo obsoleto.
2. **El cliente sí.** `client/contexts/AuthContext.js` lee `user` de `localStorage` en su efecto de montaje y no lo vuelve a leer del servidor jamás; sólo se reescribe al hacer login, al activar la cuenta o al suplantar. No existe ningún `GET /api/auth/me`. Un `seller_kind` guardado ahí puede quedarse obsoleto hasta que caduque el JWT (`JWT_EXPIRES_IN`, 7 días).
3. **El monedero vive en `/orders`.** `client/app/orders/page.js` es una sola pantalla de 1126 líneas con el `<h1>Monedero</h1>` (línea 545), el `StripeConnectBanner`, `sellerAPI.getWallet()`, el botón `sellerAPI.createWithdrawal()` — y además las estadísticas y la lista de pedidos. `/seller/profile` **no** tiene monedero: sólo cabecera, «Panel de Stripe», bio, datos, «Mis eventos de pago» y contraseña.
4. **Los ingresos de eventos no son pedidos.** `getUserOrders` (`api/controllers/ordersController.js:819`) cruza únicamente `art_order_items` y `other_order_items` contra `seller_id`. El dinero de los asistentes vive en `event_attendees`, lo acredita `api/scheduler/eventCreditScheduler.js` en `available_withdrawal_standard_vat` usando `dealer_commission_other`, y se lista en `GET /api/seller/paid-events`, que la ficha de perfil ya pinta.

De (3) y (4) sale la consecuencia que ordena el trabajo: **no se puede ocultar «Pedidos» a un ponente sin sacar antes el monedero de ahí**, porque le dejaría sin ver su saldo y sin poder pedir su cobro.

## Goals / Non-Goals

**Goals:**

- Un tipo de vendedor persistido, editable sólo por el admin, que decide qué secciones existen para esa cuenta.
- Prohibición real en el servidor, no sólo un menú recortado.
- Cambio de tipo en las dos direcciones, con guardas que impidan dejar mercancía huérfana o cortar un directo.
- El monedero alcanzable por los dos tipos, en un único sitio.
- Cero cambio de comportamiento para las cuentas existentes en el momento del despliegue.

**Non-Goals:**

- No se toca el checkout, la resolución de zonas de envío, la facturación, las subastas, los sorteos ni el CoA. Un ponente queda fuera de esos caminos por no tener producto, no por una condición añadida.
- No se lleva el ingreso de eventos a `/orders`. Se descartó explícitamente: duplicaría el modelo de datos de esa pantalla y «Mis eventos de pago» ya lo cubre.
- No se crea una plantilla de marketing para anunciar ponentes.
- No se toca `role`. Un ponente sigue siendo `role = 'seller'`; el tipo es un eje independiente.
- No se añade un `GET /api/auth/me` ni un refresco periódico de sesión: el corte de sesión resuelve la obsolescencia de forma más simple y sin peticiones extra.

## Decisions

### 1. Una columna en `users`, no una tabla ni un rol nuevo

`users.seller_kind TEXT NOT NULL DEFAULT 'artist' CHECK(seller_kind IN ('artist','speaker'))`.

*Alternativa descartada — un `role` nuevo (`'streamer'`):* rompería las 20 comprobaciones `role !== 'seller'` y las consultas `WHERE role = 'seller'` repartidas por `stripeConnectController`, `stripeConnectPayoutsController`, `marketingController`, `usersController` y `authorRoutes`. Un ponente **es** un vendedor —cobra, factura, tiene cartera, sale en payouts— y cambiarle el rol le expulsaría de todo eso para luego tener que readmitirle sitio por sitio. El tipo es un segundo eje, no un valor más del primero.

*Alternativa descartada — tabla `seller_capabilities`:* una fila por vendedor con banderas. Da granularidad que nadie ha pedido y obliga a un `LEFT JOIN` cuyo `NULL` habría que interpretar — exactamente la trampa que documenta `allow_store_pickup` en `CLAUDE.md`. Dos valores en una columna `NOT NULL` no tienen ese problema.

*Sobre el `CHECK` y el `safeAlter`:* la columna se declara con su `CHECK` en el `CREATE TABLE` y **sin él** en el `ALTER TABLE ... ADD COLUMN`, igual que `stripe_connect_status` (`api/config/database.js:810`). Es el precedente del repositorio y refleja lo que SQLite permite. La garantía real del enum la da Zod en las dos rutas que escriben la columna.

*Sobre el valor en filas que no son vendedores:* toda fila de `users` tendrá `seller_kind`, incluidos compradores y admin, porque `ADD COLUMN` no sabe de roles. No significa nada ahí y ningún camino lo lee — la misma situación que `dealer_commission_art`, que existe en la fila de cada comprador.

### 2. El conjunto de capacidades se define una vez por lado

`api/utils/sellerCapabilities.js` y `client/lib/sellerCapabilities.js`, cada uno exportando un predicado con nombre (`canPublishProducts(user)`, `canManageShipments(user)`, …).

El repositorio ya pagó esta lección dos veces y las dos están escritas en `CLAUDE.md`: `zoneResolver` existe porque la predicción de tarifas estaba duplicada, y `ProductForm` comparaba `productCategory === 'others'` **en tres sitios** con un valor que el `<select>` no podía emitir — tres copias en línea es lo que dejó sobrevivir la errata. Un `seller_kind === 'speaker'` esparcido por doce pantallas y ocho rutas tendría el mismo destino.

### 3. `req.user` transporta el tipo; el middleware lo aplica

`passport.js` añade `seller_kind: user.seller_kind` al objeto curado. Sin consulta adicional — es la propiedad que el escenario correspondiente del spec de sesión ya exige preservar.

`api/middleware/authorization.js` gana `requireArtistSeller`, hermano de `requireSeller`, con `title: 'SELLER_KIND_FORBIDDEN'`. Es un middleware exportado y con nombre, no un `if` dentro de cada controlador, por la misma razón que `blockWhileImpersonating`: proteger un endpoint más es una línea, no una condición copiada que puede divergir.

Rutas que lo llevan:

| Fichero | Rutas |
|---|---|
| `api/routes/artRoutes.js` | `GET /seller/me`, `POST /`, `DELETE /:id` |
| `api/routes/othersRoutes.js` | `GET /seller/me`, `POST /`, `DELETE /:id` |
| `api/routes/productsRoutes.js` | `GET /seller/me`, `POST /`, `DELETE /:id` |
| `api/routes/sellerRoutes.js` | `/products`, `/products/:id/visibility`, `/others/:id/variations`, `/orders`, `/orders/*` |

`/api/seller/wallet`, `/withdrawals`, `/paid-events`, `/profile`, `/commission-rates` y `/stripe-connect/*` **no** lo llevan: son exactamente lo que un ponente necesita.

### 4. El corte de sesión es una columna nueva, no `password_changed_at`

`users.sessions_invalidated_at DATETIME DEFAULT NULL`, comparada en `passport.js` junto a la existente.

*Alternativa descartada — reescribir `password_changed_at`:* funcionaría a la primera y sería mentira. Esa columna afirma que la contraseña cambió; el flujo de reseteo y el correo al artista se apoyan en ella, y falsearla contamina una auditoría de seguridad para ahorrar una columna. Además, `api/tests/passwordChangeInvalidation.test.js` hace grep sobre `controllers/`, `routes/` y `services/` buscando escrituras de `password_hash` sin su sello: escribir el sello sin la contraseña no lo rompe, pero deja el fichero ilegible para el próximo que lo lea.

`api/utils/passwordSecurity.js` gana `isJwtIssuedBeforeSessionCutoff(iat, ...cutoffs)`, que reutiliza `parseSqlUtcDate` y la comparación estricta en segundos ya probadas. `isJwtIssuedBeforePasswordChange` se conserva exportada.

El valor se escribe **en el mismo `UPDATE`** que `seller_kind`, y sólo cuando el valor cambia de verdad. Guardar la ficha sin tocar el selector no expulsa a nadie: si cada guardado cerrara la sesión del artista, el admin no podría corregir una errata en una bio sin echarle.

### 5. El cambio de tipo se rechaza, nunca se arrastra

Una función `sellerKindChangeBlockers(sellerId, { toKind })` en `api/services/` devuelve la lista de impedimentos:

| Bloqueo | Consulta | Dirección |
|---|---|---|
| Obra o producto vivo | `art` / `others` con `seller_id = ?` y `removed = 0` | sólo degradación |
| Subasta abierta | `auction_arts` / `auction_others` → producto del vendedor, `auctions.status IN ('draft','scheduled','active')` | sólo degradación |
| Sorteo abierto | `draws.product_id/product_type` → producto del vendedor, `draws.status IN ('draft','scheduled','active')` | sólo degradación |
| Pedido sin cerrar | `art_order_items` / `other_order_items` del vendedor con `status` NULL o en `('paid','sent','arrived')` | sólo degradación |
| Directo en curso | `events.host_user_id = ?` y `events.status = 'active'` | **ambas** |

Los tres primeros bloqueos se solapan: una obra subastada es una fila de `art` con `removed = 0`, así que el primero ya la atrapa. Se consultan igual, porque el mensaje «tiene una subasta activa» le dice al admin qué hacer y «tiene 1 obra publicada» no; y porque el caso de borde en que la obra está `removed = 1` con la subasta viva existe y no debe colarse.

*Alternativa descartada — degradar y ocultar la obra (`visible = 0`):* despublica mercancía que puede estar en el carrito de un comprador, en una subasta en curso o en un sorteo con participantes que han autorizado un cargo. Y lo hace en silencio, en el mismo clic con el que el admin creía estar cambiando una etiqueta.

*Alternativa descartada — degradar y no tocar nada:* deja obra a la venta cuyo autor ya no tiene panel para gestionarla, marcarla como enviada ni hablar del pedido. Es un estado sin dueño y no hay ninguna pantalla que lo delate.

El bloqueo del directo aplica **en las dos direcciones** porque lo que hace daño no es la degradación sino el corte de sesión que la acompaña: a un host retransmitiendo le corta la renovación del token y le deja fuera de su propia sala, sin explicación, delante de su público.

### 6. El monedero se extrae a `/seller/monedero`

Se extrae `client/components/seller/SellerWallet.js` (banner + saldos + comisiones + botón + diálogo) de `client/app/orders/page.js` y se monta en la nueva `client/app/seller/monedero/page.js`, bajo `AuthGuard requireRole="seller"`. `/orders` conserva filtro, estadísticas y lista, y su `<h1>` pasa a «Pedidos».

*Alternativa descartada — pintar `<SellerWallet />` también en `/orders`:* dos botones «Solicitar pago» en la aplicación para la misma acción. El endpoint es idempotente (sólo manda un correo al admin), así que no rompe nada, pero deja al artista sin saber cuál es el bueno.

*Alternativa descartada — meter el monedero en «Perfil»:* no crea ruta ni menú nuevos, pero mueve el dinero del artista a un sitio donde no estaba y lo mezcla con la bio y la contraseña. `/seller/monedero` es una entrada de menú más y una pantalla que sólo habla de dinero.

Efecto secundario deseado: se cierra la incoherencia de que la entrada «Pedidos» abriera una pantalla titulada «Monedero».

### 7. El menú se compone de una lista, no de dos condicionales

`Navbar.js` tiene hoy el menú del vendedor **duplicado**: un bloque `<PopoverPanel>` para escritorio (líneas 285-314) y otro `<Dialog>` para móvil (líneas 565-594). Añadir la condición de tipo a los dos por separado es garantizar que algún día divergan y que la divergencia sólo se vea en un tamaño de pantalla. Se deriva una única lista `sellerMenuItems` y ambos la recorren.

### 8. La ficha de admin pide confirmación antes de cambiar el tipo

El diálogo advierte en es-ES de que el vendedor será desconectado y de que cambiarán sus secciones. Es la misma cortesía que ya se aplica al envío masivo de resets de contraseña, que anuncia que invalidará todos los enlaces vivos.

El diálogo se construye con el `ConfirmDialog` compartido: `/admin/authors/[id]/edit` es una pantalla normal, no la consola móvil del host, así que la prohibición de portales a `document.body` que documenta `CLAUDE.md` no aplica aquí.

## Risks / Trade-offs

- **El corte de sesión expulsa al vendedor sin previo aviso desde su punto de vista** → El bloqueo por evento `active` cubre el caso caro (un directo). Fuera de eso, el vendedor vuelve a entrar con su contraseña y encuentra su panel actualizado, que es el resultado buscado. El diálogo de confirmación se lo dice al admin antes de que ocurra.
- **Una obra huérfana sigue siendo posible si el admin la marca `removed = 1` para poder degradar** → Es una acción explícita del admin sobre una obra concreta, con su propia confirmación, no un efecto colateral de cambiar una etiqueta. La diferencia es toda la que hay entre las dos alternativas descartadas en la decisión 5.
- **El menú puede mostrar por un instante las entradas del tipo anterior** si el vendedor tenía la pestaña abierta cuando el admin cambió el tipo: el `user` de `localStorage` es lo que se pinta antes de que llegue el primer 401 → Inofensivo. Todo enlace de esas entradas lleva a una pantalla que el `AuthGuard` cierra y a un endpoint que el servidor rechaza con 403; y el primer `fetch` de la página devuelve 401 y limpia la sesión.
- **`/orders` cambia para los artistas actuales**, que llevan meses encontrando su saldo ahí → El menú gana «Monedero» justo encima de «Pedidos», y las dos pantallas quedan a un clic. Es el precio de que un ponente pueda cobrar.
- **`client/` sigue sin runner de tests**, así que el menú, el `AuthGuard` y la pantalla de monedero se verifican a mano → Mismo punto ciego que documentan `agora-host-mobile-console` y `sendcloud-store-shipping-accuracy`. La mitad de API —columna, validadores, middleware, bloqueos, corte de sesión— sí queda cubierta.
- **Un ponente conserva `dealer_commission_art` y `tax_vat_art` en su ficha**, campos que nunca se aplicarán a nada suyo → Se deja a propósito: la pantalla de edición muestra la misma información para los dos tipos salvo Sendcloud, y ocultar campos fiscales según el tipo multiplicaría las variantes de un formulario que ya es largo. Una promoción a artista los encuentra listos.

## Migration Plan

1. **Esquema.** `seller_kind` y `sessions_invalidated_at` en el `CREATE TABLE` de `users` y en sendos `safeAlter`. Sin backfill: `DEFAULT 'artist'` deja a todo el mundo como está y `NULL` en el corte de sesión no invalida nada.
2. **API primero es indiferente, pero el despliegue debe ser conjunto.** El cliente deja de pintar el monedero en `/orders` y la api empieza a devolver 403 a publicaciones de ponentes; como no hay ponentes hasta que el admin cree el primero, la ventana entre ambos despliegues es inocua, pero `deploy/deploy.sh` los mueve juntos de todas formas.
3. **Purga obligatoria de la caché de nginx** en el despliegue del cliente, como en cualquier otro: hay rutas nuevas y HTML cacheado que referencia chunks que la nueva build ya no tiene.
4. **Verificación posterior**, en este orden: crear un ponente de prueba → comprobar su menú (Perfil, Monedero) → comprobar 403 en `POST /api/art` con su token → asignarle un evento de pago → degradar un artista con obra y comprobar el 409 con su listado → promocionar al ponente de prueba y comprobar que reaparecen «Artículos», «Mis envíos», «Pedidos» y la sección Sendcloud.
5. **Rollback.** Revertir el código deja las dos columnas en la tabla sin lector: `seller_kind` vuelve a ser ignorado y todo vendedor recupera el panel completo. No hay dato que deshacer. Un `sessions_invalidated_at` ya escrito deja de comparse y esas sesiones vuelven a ser válidas.

## Open Questions

- **Anunciar un ponente por marketing.** Queda fuera: la plantilla y el asunto dicen «Nuevo artista» y el topic es *Nuevos autores*. Si la programación de eventos crece, hará falta su propia plantilla y probablemente su propio topic.
- **La ficha pública de un ponente.** `/galeria/autor/<slug>` sigue siendo alcanzable escribiendo la URL y mostrará una galería vacía. No se enlaza desde ningún sitio —`/galeria/artistas` y los filtros de autor consultan `category=art`, que exige tener obra— así que se deja como está. Si algún día los ponentes tienen presencia pública propia, será una ficha distinta, no ésta vacía.
