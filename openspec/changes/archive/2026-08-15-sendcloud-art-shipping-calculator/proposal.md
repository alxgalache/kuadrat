# Sendcloud: autenticación OAuth2 y calculadora de envíos para obras de arte

## Why

Los envíos de la galería (`art`) se tarifican hoy a mano: el admin inventa un precio y lo teclea en `shipping_zones.cost`. No hay ninguna relación entre ese número y lo que Correos o UPS cobran realmente, así que cada obra nueva es una estimación a ojo que o bien pierde dinero o bien espanta al comprador. Sendcloud ya está integrado para la tienda (`others`) y su endpoint `POST /v3/shipping-options` devuelve la tarifa exacta para un paquete concreto: basta con exponerla al admin y dejar que el guardado escriba las zonas.

Antes de construir nada encima, la integración actual tiene que estar sana. Al probar la API en vivo contra la cuenta de producción aparecieron tres defectos que ya están afectando a compradores reales:

1. **El seguro rompe el cálculo de envío — hoy en latente, mañana en activo.** `additional_insured_price` se envía como objeto `{value, currency}`; la v3 exige un **entero**, y responde `HTTP 400 "Input should be a valid integer"` (un decimal como `350.50` falla igual). Ahora mismo no se manifiesta: `insurance_type` no se escribe desde ningún formulario — `SendcloudConfigSection.js` no lo toca, aunque el validador Zod y el controlador lo acepten — así que toda fila conserva el `DEFAULT 'none'` y el campo nunca llega a adjuntarse. Deja de ser latente en cuanto algo asegure de verdad, que es exactamente lo que hace la calculadora: por eso esta corrección es requisito del bloque 2, no simple higiene.
2. **Se ofrece un envío falso de 0 €.** `sendcloud:letter` (carta de buzón) cotiza `total: "0"`, y el filtro `if (!quote?.price?.total?.value)` no lo descarta porque la cadena `"0"` es *truthy* en JavaScript. En un paquete grande (150×100×20 cm, 25 kg) es la **única** opción que sobrevive: el comprador ve "envío gratis" con un producto que no cabe en un buzón.
3. **La credencial se escribe en los logs.** `sendcloudApiClient.js:50-58` contiene un bloque `// TODO: Remove after debugging` que emite en `logger.info` un cURL completo con la cabecera `Authorization` en claro, en cada petición y también en producción.

Además, la autenticación por Basic Auth ha dejado de ser la vía recomendada: Sendcloud ofrece OAuth2 (`client_credentials`) y la cuenta del proyecto **ya lo tiene habilitado** (verificado en vivo: `expires_in: 3599`, `scope: api`, sin `refresh_token`). Y cuatro campos del payload que el código usa están marcados como DEPRECATED en la documentación de la v3.

## What Changes

### Bloque 1 — Saneamiento de la integración Sendcloud (previo, independiente)

- **Autenticación OAuth2** con gestor de token en memoria: se pide en el primer uso, se renueva 60 s antes de `expires_in`, y una única promesa en vuelo evita la estampida cuando varias peticiones concurren. No hay `refresh_token`: se vuelve a pedir el token entero.
- **Reintento ante fallo de autenticación:** un `401`/`403` invalida el token cacheado y reintenta la petición **una sola vez** con token nuevo. Si vuelve a fallar, se cae a Basic Auth y se registra un warning (modo `auto`, por defecto).
- **Nuevo `SENDCLOUD_AUTH_MODE`** (`auto` | `oauth2` | `basic`, por defecto `auto`) para poder forzar cualquiera de los dos sin tocar código.
- **BREAKING (interno):** `additional_insured_price` pasa a entero redondeado y acotado al rango que Sendcloud tarifica (2–5000 €). Corrige el `HTTP 400`.
- **BREAKING (visible para el comprador): todo envío pasa a ir asegurado por el valor de su mercancía**, también los de la tienda (`other`), donde el valor asegurado es el `totalValue` del bulto que ya calcula `parcelGrouper.js`. `insurance_type` e `insurance_fixed_amount` dejan de leerse en ambos flujos. Hoy **ningún** envío de la tienda viaja asegurado; a partir de este cambio, todos — y el precio de envío en el carrito sube en consecuencia.
- **Paridad entre lo cotizado y lo anunciado:** `createShipments()` nunca envía `additional_insured_price`, así que un paquete se anunciaría sin cobertura después de que el comprador pagase la prima. Se añade el campo al anuncio del envío. Ojo a la asimetría de la API: **entero** en `shipping-options`, **objeto `{value, currency}`** en `shipments`.
- Migración de los campos deprecados: `from_country_code`/`from_postal_code`/`to_country_code`/`to_postal_code` → `from_address`/`to_address` (que además admiten `city` y `address_line_1`, mejorando la precisión de la tarifa), y `to_service_point_id` → `to_service_point`.
- **Se descartan las opciones sin tarifa real:** total ausente, no numérico o `<= 0` (elimina `sendcloud:letter`), y las que traen `quotes: []`.
- **Se elimina el bloque de log de depuración** que filtra la cabecera `Authorization`.

### Bloque 2 — Calculadora de envíos para obras (`art`)

- **Tres columnas nuevas en `art`:** `outside_dimensions` (TEXT, formato `LxWxH`, idéntico a `dimensions`), `outside_weight` (INTEGER, gramos, idéntico a `weight`) y `packaging_cost` (REAL, euros, como `price`, por defecto 0). **No aparecen** en el formulario de alta/edición de producto ni en ninguna otra pantalla: solo en la calculadora.
- **Nueva pantalla de admin `/admin/calculadora-envios`** ("Calculadora envíos" en el menú de admin de `Navbar.js`, escritorio y móvil), con listado de obras `art`, filtros por título y por artista (debounce, a partir de 3 caracteres) y, por fila, tres inputs (dimensiones externas, peso externo, coste de embalaje) precargados con lo que hay en base de datos y un botón **"Guardar y calcular envío"**. Las dimensiones y el peso externos son **obligatorios** para cotizar: no hay respaldo silencioso a las medidas de la obra, porque el transportista factura el peso volumétrico del bulto y un sustituto plausible congelaría un precio equivocado.
- **Al pulsar el botón** se guardan los tres campos y se cotiza contra Sendcloud, agrupando el resultado en **cuatro bloques de zona**: península, Baleares, Canarias y Ceuta/Melilla. Cada bloque muestra las opciones con su desglose (envío + seguro + fuel/service fee = total Sendcloud), el IVA del 21 % y el embalaje, y el **precio final = total × 1,21 + `packaging_cost`**.
- **La obra siempre viaja asegurada por su precio:** `additional_insured_price` es siempre `art.price`, sin consultar `insurance_type` del artista — esa configuración no la escribe ningún formulario, así que ramificar sobre ella sería ramificar sobre una constante.
- **Se pueden marcar varias opciones por bloque** — el criterio es que más opciones para el comprador es mejor. Al guardar, la API crea (o reutiliza) el `shipping_methods` de cada código de Sendcloud y escribe un `shipping_zones` por opción, específico de esa obra, con el precio final y las filas `shipping_zones_postal_codes` de las provincias del grupo. Lo que se guarda es el conjunto marcado en ese momento: regenerar sustituye lo anterior de ese bloque de forma acotada, sin tocar los demás bloques ni las zonas creadas a mano.
- **Columnas nuevas de trazabilidad:** `shipping_methods.sendcloud_option_code` / `sendcloud_carrier_code`, y en `shipping_zones` el origen (`source`), el grupo (`zone_group`), el código de Sendcloud y el desglose congelado (`base_cost`, `packaging_cost_snapshot`, `calculated_at`).
- **El checkout de `art` no cambia de camino:** sigue leyendo las zonas por el proveedor legacy (`SENDCLOUD_ENABLED_ART=false`). La calculadora solo cambia *de dónde sale el número* que el admin guardaba a mano.

### Lo que se documenta y no se "arregla"

El caso que no se conseguía reproducir — `quotes: []` en Ceuta y Canarias — **no es un fallo del payload**. Las pruebas en vivo lo dejan claro: a Ceuta/Melilla las únicas opciones sin tarifa son las de **UPS**, porque van con contrato propio (`contract.id 164438, "140d Galería de Arte"`) y Sendcloud no tiene tarifario para territorio extra-aduanero; `quote_error` viene a `null`, la opción existe pero sin precio. Correos y Correos Express sí cotizan. A Canarias, UPS y `correos_express:paq24` desaparecen de la lista entera y el seguro sube de 2,10 € a 5,25 €. La calculadora mostrará esas opciones **como informativas y no seleccionables**, con el motivo explicado, en vez de esconderlas.

### Por qué Baleares es su propia zona

Las pruebas en vivo muestran que península y Baleares **no comparten tarifa**: `correos:standard` cuesta 6,38 € a Madrid y 8,48 € a Palma, y cada destino tiene opciones que el otro no tiene (`correos_express:baleares_express` solo hacia Palma; `paq24`/`epaq24` solo hacia la península). Agruparlos en una sola zona obligaría a guardar un único `cost` para dos tarifas distintas, perdiendo dinero en cada venta insular o cobrando de más al comprador peninsular. Por eso los grupos son cuatro y no tres, cada uno con la tarifa real de su territorio.

## Capabilities

### New Capabilities
- `art-shipping-calculator`: pantalla de admin, campos de embalaje en `art`, cotización agrupada en cuatro zonas, y generación automática de métodos y zonas de envío a partir de las opciones elegidas.

### Modified Capabilities
- `sendcloud-provider`: la autenticación pasa de Basic Auth a OAuth2 con reintento, renovación y fallback; el payload de `POST /v3/shipping-options` abandona los campos deprecados; `additional_insured_price` pasa a entero; se descartan las opciones sin tarifa real; desaparece el log que filtraba la credencial.
- `sendcloud-checkout-shipping`: el comprador deja de ver la opción fantasma de 0 €, todo envío de la tienda pasa a ir asegurado por el valor de su mercancía, y el seguro cotizado es el que se declara al transportista.

## Impact

**Base de datos** (`api/config/database.js`, todo vía `CREATE TABLE` idempotente + `safeAlter`):
`art` (+3 columnas), `shipping_methods` (+2), `shipping_zones` (+5).

**Backend:**
- Nuevo: `api/services/shipping/sendcloudAuth.js`, `api/services/shipping/artShippingCalculator.js`, `api/controllers/artShippingCalculatorController.js`, `api/routes/admin/artShippingRoutes.js`, `api/validators/artShippingSchemas.js`, `api/utils/spainShippingZones.js`.
- Modificado: `sendcloudApiClient.js` (auth, reintento, borrado del log), `sendcloudProvider.js` (payload v3, seguro entero, filtrado de opciones), `config/env.js` (`SENDCLOUD_AUTH_MODE`), `routes/admin/index.js`.

**Frontend:**
- Nuevo: `client/app/admin/calculadora-envios/page.js` y sus componentes.
- Modificado: `client/components/Navbar.js` (entrada de menú), `client/lib/api.js`, `client/lib/constants.js`.

**Configuración:** `SENDCLOUD_AUTH_MODE` en `api/.env.example` y en los compose. `SENDCLOUD_ENABLED_ART` debe quedar en `false` (hoy está en `true` en `api/.env` y `api/.env.local` por unas pruebas, lo que desvía el checkout de arte a Sendcloud en vivo).

**Externo:** llamadas reales a `POST /v3/shipping-options` desde la pantalla de admin (4 por obra, una por zona: `28001`, `07001`, `35001`, `51001`) y a `https://account.sendcloud.com/oauth2/token`.

**Riesgo:** OAuth2 está en beta con despliegue gradual — de ahí el fallback automático a Basic. Dos cambios alteran **lo que paga el comprador en el carrito**: desaparece la opción de 0 € (y un paquete que solo cabía en ella pasa a no tener envío disponible, que es la verdad), y el seguro obligatorio encarece todo envío de la tienda — sobre el paquete de prueba, 2,10 € en península y 5,25 € a Canarias; para artículos de tienda, de menor valor, será menos. Conviene comunicarlo antes de desplegar.

**Límite conocido:** Sendcloud tarifica el seguro hasta 5000 € y por encima **recorta en silencio** (verificado: 8000 € y 25000 € cobran la misma prima que 5000 €). No se esperan obras por encima de ese techo, así que se asume; la pantalla lo indicará si alguna lo supera.
