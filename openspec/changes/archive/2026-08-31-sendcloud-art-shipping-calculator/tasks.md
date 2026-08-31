## 1. Bloque 1 — Saneamiento de la integración Sendcloud (desplegable por separado)

- [x] 1.1 Eliminar el bloque `// TODO: Remove after debugging` de `api/services/shipping/sendcloudApiClient.js:50-58`, que emite la cabecera `Authorization` en claro en `logger.info` en cada petición
- [x] 1.2 Añadir `SENDCLOUD_AUTH_MODE` a `api/config/env.js` como `config.sendcloud.authMode`, aceptando solo `auto` | `oauth2` | `basic`, por defecto `auto`, con fallo ruidoso en arranque ante cualquier otro valor
- [x] 1.3 Documentar `SENDCLOUD_AUTH_MODE` en `api/.env.example` junto al resto de variables de Sendcloud
- [x] 1.4 Crear `api/services/shipping/sendcloudAuth.js`: `getAccessToken()` contra `https://account.sendcloud.com/oauth2/token` con `grant_type=client_credentials&scope=api` (form-encoded, credenciales por Basic en la petición de token), caché en memoria con margen de 60 s sobre `expires_in`, promesa única en vuelo, `invalidate()` e `isSuppressed()` para la ventana de 5 minutos tras un fallback
- [x] 1.5 Añadir a `sendcloudAuth.js` el selector de cabecera según `authMode`: `Bearer` en `auto`/`oauth2`, `Basic` en `basic`
- [x] 1.6 Integrar la autenticación en `sendcloudApiClient.request()`: serializar el cuerpo una sola vez, reintentar exactamente una vez ante 401/403 con token nuevo, y en modo `auto` resolver por Basic tras el reintento fallido con `logger.warn` y activación de la supresión; ni 429 ni 5xx deben invalidar el token ni disparar fallback
- [x] 1.7 Aplicar la misma lógica de autenticación a `sendcloudApiClient.getBinary()` (descarga de etiquetas), que hoy construye su cabecera por separado
- [x] 1.8 Crear el helper compartido `insuredValueFor(goodsValue)` (`Math.round` + acotado a `[2, 5000]`), único punto de cálculo del valor asegurado para los dos flujos
- [x] 1.8b En `sendcloudProvider.buildParcels()`, adjuntar `additional_insured_price` **siempre**, con valor `insuredValueFor(parcel.totalValue)`, como número entero en lugar del objeto `{value, currency}` — corrige el `HTTP 400 "Input should be a valid integer"` y hace que todo envío de la tienda viaje asegurado
- [x] 1.8c Eliminar de `buildParcels()` las ramas basadas en `insurance_type` e `insurance_fixed_amount`; dejar las columnas en la tabla pero sin ningún lector
- [x] 1.8d En `sendcloudProvider.createShipments()`, añadir `additional_insured_price` al bulto anunciado con el mismo valor con que se cotizó, **en forma de objeto `{ value, currency }`** — la forma que exige `POST /v3/shipments`, distinta del entero que exige `shipping-options`. Sin esto el comprador paga una prima por un paquete anunciado sin cobertura
- [x] 1.8e Verificar en preproducción que el envío anunciado lleva el seguro declarado: anunciar un envío real, comprobar el campo en la respuesta y cancelarlo acto seguido
- [x] 1.9 En `sendcloudProvider.getDeliveryOptions()`, sustituir `from_country_code`/`from_postal_code`/`to_country_code`/`to_postal_code` por `from_address`/`to_address`, incluyendo `city` y `address_line_1` del vendedor cuando estén disponibles
- [x] 1.10 Sustituir `to_service_point_id` por el objeto `to_service_point` donde se use (revisar `sendcloudProvider.createShipments()` y `servicePointsController.js`)
- [x] 1.11 Extraer el predicado de tarifa utilizable a un helper compartido (total presente, numérico vía `parseFloat` y `> 0`, y `quotes` no vacío) y usarlo en el filtro de `getDeliveryOptions()`, sustituyendo el `if (!quote?.price?.total?.value)` que deja pasar la cadena `"0"`
- [x] 1.12 Verificar contra la API real: token OAuth2, cotización con seguro obligatorio (antes `400`, ahora `200`) y ausencia de `sendcloud:letter` en un paquete grande
- [x] 1.13 Añadir test de que `buildParcels()` adjunta `additional_insured_price` en todos los casos, con valor entero y acotado, y sea cual sea el `insurance_type` del vendedor

## 2. Esquema de base de datos

- [x] 2.1 Añadir a `CREATE TABLE art` en `api/config/database.js`: `outside_dimensions TEXT`, `outside_weight INTEGER`, `packaging_cost REAL NOT NULL DEFAULT 0`
- [x] 2.2 Añadir a `CREATE TABLE shipping_methods`: `sendcloud_option_code TEXT`, `sendcloud_carrier_code TEXT`
- [x] 2.3 Añadir a `CREATE TABLE shipping_zones`: `source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','sendcloud_calculator'))`, `zone_group TEXT`, `sendcloud_option_code TEXT`, `base_cost REAL`, `packaging_cost_snapshot REAL`, `calculated_at DATETIME`
- [x] 2.4 Añadir los `safeAlter` equivalentes para las tres tablas, de modo que una base existente reciba las columnas con sus valores por defecto sin tocar ninguna fila
- [x] 2.5 Crear índice sobre `shipping_zones (product_id, product_type, zone_group, source)` para que el borrado acotado de la regeneración no recorra la tabla
- [x] 2.6 Crear índice único sobre `shipping_methods (sendcloud_option_code)` filtrando nulos, para garantizar que el catálogo no se duplica
- [x] 2.7 Actualizar `DATABASE_SCHEMA.md` con las tres tablas modificadas

## 3. Utilidades y servicio de cálculo

- [x] 3.1 Crear `api/utils/spainShippingZones.js`: los cuatro grupos (`peninsula`, `baleares`, `canarias`, `ceuta_melilla`), sus CP representativos (`28001`, `07001`, `35001`, `51001`) y `getProvincesForGroup(group)` resolviendo por exclusión contra `postal_codes`, nunca contra una lista literal en código
- [x] 3.2 Añadir test que compruebe que los cuatro grupos particionan exactamente las 52 provincias de `ES.csv` (47 + 1 + 2 + 2), sin solapes ni huecos
- [x] 3.3 Crear `api/services/shipping/artShippingCalculator.js` con `quoteArtwork({ artId })`: carga obra + artista + `user_sendcloud_configuration` (solo para la dirección de origen), construye los cuatro payloads (uno por grupo) y los lanza con `Promise.allSettled`
- [x] 3.3b Fijar `additional_insured_price` siempre a `insuredValueFor(art.price)`, sin leer `insurance_type` ni `insurance_fixed_amount`; añadir test que verifique que el valor enviado es el precio de la obra sea cual sea el `insurance_type` del artista
- [x] 3.4 Rechazar la cotización con `ApiError` 400 y mensaje es-ES si falta `outside_dimensions` u `outside_weight`, sin llamar a Sendcloud y sin sustituirlos por `dimensions`/`weight` de la obra
- [x] 3.5 Implementar la clasificación de opciones en `eligible` / `no_rate` (`quotes: []`), descartando por completo las de total `<= 0`
- [x] 3.6 Implementar `computeFinalPrice(sendcloudTotal, packagingCost)` = `round(total × 1.21, 2) + packagingCost`, con la constante del 21 % local al módulo y explícitamente desacoplada de `TAX_VAT_ES` y de las columnas `tax_vat_*` del vendedor
- [x] 3.7 Implementar `applyZoneSelection({ artId, zoneGroup, selections })` con semántica de conjunto: crear o reutilizar un `shipping_methods` por `sendcloud_option_code`, borrar **todas** las zonas previas de `(artId, zoneGroup, source='sendcloud_calculator')` e insertar una zona por opción seleccionada con sus filas de provincia — todo dentro de un `createBatch()`
- [x] 3.8 Añadir test de selección múltiple: guardar tres opciones para un grupo deja tres zonas, y volver a guardar con dos deja exactamente esas dos (la tercera desaparece)
- [x] 3.9 Añadir test de aislamiento entre grupos: regenerar `baleares` no altera las zonas generadas de `peninsula`, `canarias` ni `ceuta_melilla`
- [x] 3.10 Añadir test de que una zona `source='manual'` de la misma obra sobrevive intacta a cualquier número de regeneraciones
- [x] 3.11 Añadir test de que las zonas generadas son visibles para `getAvailableShipping()` con una dirección de una provincia del grupo, que `applyProductPriority()` las prefiere sobre una zona genérica, y que varias opciones del mismo grupo se ofrecen como opciones distintas

## 4. API de administración

- [x] 4.1 Crear `api/validators/artShippingSchemas.js` con los esquemas Zod de los endpoints: `outside_dimensions` con `/^\d+x\d+x\d+$/` y `outside_weight` entero `> 0` **obligatorios** en la cotización, `packaging_cost` `>= 0`, `zone_group` restringido a los cuatro valores y `selections` como array (posiblemente vacío) de códigos de opción
- [x] 4.2 Crear `api/controllers/artShippingCalculatorController.js` con `listArtProducts` (`title`, `author`, `page`, `limit`; `LIKE` en SQL; `sendPaginated()`), `saveAndQuote` y `applyZoneSelection`
- [x] 4.3 En `saveAndQuote`, persistir los tres campos **antes** de llamar a Sendcloud, para que los valores sobrevivan a un fallo del proveedor
- [x] 4.4 Devolver `ApiError` 400 con mensaje es-ES cuando el artista no tenga fila en `user_sendcloud_configuration`
- [x] 4.5 Crear `api/routes/admin/artShippingRoutes.js` con `GET /products`, `PATCH /:artId/packaging`, `POST /:artId/quote` y `POST /:artId/zones`, aplicando `validate()` en cada ruta
- [x] 4.6 Montar el router en `api/routes/admin/index.js` bajo `/art-shipping` (hereda `authenticate` + `adminAuth`)
- [x] 4.7 Verificar que ningún endpoint de producto existente (`productValidation.js`, `ProductForm`, `adminProductEditController`) escribe ni devuelve las tres columnas nuevas
- [x] 4.8 Documentar los cuatro endpoints en `API_ENDPOINTS.md`

## 5. Pantalla de administración

- [x] 5.1 Añadir los métodos de la calculadora a `client/lib/api.js` siguiendo el patrón de los demás grupos de admin
- [x] 5.2 Añadir a `client/lib/constants.js` las etiquetas es-ES de los cuatro grupos de zona, los estados de opción y el mínimo de 3 caracteres del filtro
- [x] 5.3 Crear `client/app/admin/calculadora-envios/page.js` bajo `AuthGuard` de admin y envuelto en `<ErrorBoundary>`
- [x] 5.4 Implementar los filtros de título y artista con `useDebounce`, sin disparar petición por debajo de 3 caracteres pero sí al vaciar el campo
- [x] 5.5 Implementar la fila de producto: título, autor, precio, los tres inputs precargados y el botón "Guardar y calcular envío" con su estado de carga, deshabilitado mientras falten dimensiones o peso externos y con el motivo visible
- [x] 5.6 Implementar las sub-filas de resultados agrupadas en los cuatro bloques de zona, con el desglose de Sendcloud, el IVA del 21 %, el embalaje y el precio final
- [x] 5.6b Mostrar un aviso es-ES en las obras de precio superior a 5000 €, indicando que Sendcloud solo asegura hasta ese importe y que el resto necesita cobertura aparte
- [x] 5.7 Implementar la selección **múltiple** por bloque con casillas, precargando las opciones ya guardadas para esa obra y grupo
- [x] 5.8 Renderizar las opciones `no_rate` en gris y no seleccionables, con su explicación es-ES ("Sin tarifa disponible (contrato propio del vendedor)")
- [x] 5.9 Implementar el guardado por bloque con semántica de conjunto, incluido el caso de desmarcar todo, mostrando la selección ya generada y su `calculated_at` cuando exista
- [x] 5.10 Mostrar el error por bloque cuando una de las cuatro llamadas falle, sin perder los resultados de los otros grupos
- [x] 5.11 Añadir la entrada "Calculadora envíos" al menú de admin de `client/components/Navbar.js`, en el popover de escritorio y en el diálogo móvil

## 6. Configuración, verificación y cierre

- [x] 6.1 Poner `SENDCLOUD_ENABLED_ART=false` en `api/.env` y `api/.env.local` (hoy está en `true` por unas pruebas), de modo que el checkout de arte lea las zonas generadas
- [x] 6.2 Añadir `SENDCLOUD_AUTH_MODE` a `.env.example` de la raíz y a los ficheros compose que inyectan variables de la api
- [x] 6.3 Ejecutar `npm test` desde `api/` y confirmar que `testEnvironmentIsolation.test.js` sigue en verde y que ningún test alcanza la red
- [x] 6.4 Verificar el flujo completo en preproducción sobre una obra real: cotizar, marcar varias opciones en los cuatro grupos y comprobar que las zonas escritas producen en el carrito exactamente los precios que mostró la pantalla, con Baleares y península a su tarifa respectiva
- [x] 6.5 Actualizar `CLAUDE.md` con una sección sobre la calculadora: las tres columnas nuevas de `art`, los cuatro grupos de zona y por qué Baleares va aparte, la semántica de conjunto del guardado, la fórmula del precio final, el seguro obligatorio en ambos flujos con su asimetría de formato entre endpoints, y el modo de autenticación de Sendcloud
- [x] 6.6 Comunicar a los vendedores de tienda que los precios de envío suben por el seguro obligatorio, antes de desplegar el bloque 1
