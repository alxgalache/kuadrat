## Context

Sendcloud entra en el proyecto por dos caminos que hoy comparten un único cliente HTTP (`api/services/shipping/sendcloudApiClient.js`) y un único proveedor (`sendcloudProvider.js`). Todas las llamadas salen de ocho puntos, todos dentro de `sendcloudProvider.js`, lo que hace que migrar la autenticación sea una operación localizada.

El estado de partida se estableció ejecutando peticiones reales contra la cuenta de producción durante el análisis. Los datos concretos que sustentan las decisiones de abajo:

| Destino (desde 41005) | Opciones | Notas |
|---|---|---|
| Madrid 28001 | 11 | `correos:standard` 6,38 € · `ups:standard` 10,40 € |
| Palma 07001 | 10 | `correos:standard` **8,48 €** · aparece `correos_express:baleares_express` |
| Ceuta 51005 | 9 | UPS presente pero con `quotes: []` · `correos:standard` 8,48 € |
| Melilla 52001 | 9 | idéntico a Ceuta en precio |
| Las Palmas 35001 | 6 | sin UPS ni `paq24` · `export_documents: true` · seguro 5,25 € |

Paquete de prueba: 60×60×5 cm, 5 kg, `additional_insured_price: 350`.

Tres hallazgos condicionan el diseño:

1. **Península y Baleares no comparten tarifa.** `correos:standard` cuesta 6,38 € a Madrid y 8,48 € a Palma — 2,10 € de diferencia sobre el mismo paquete. Además, cada destino tiene opciones que el otro no tiene: `correos_express:baleares_express` solo existe hacia Palma; `correos_express:paq24` y `epaq24` solo hacia la península. Son dos mercados de transporte distintos, no dos variantes del mismo.
2. **`quotes: []` no significa "error".** Es una opción real, anunciable, para la que Sendcloud no publica tarifa porque va con contrato propio del vendedor. `quote_error` viene a `null`, así que no hay ningún mensaje que mostrar: hay que explicarlo desde el lado del cliente.
3. **El cliente HTTP actual tiene dos defectos que producen números incorrectos**, no solo feos: el seguro como objeto devuelve `HTTP 400`, y `sendcloud:letter` pasa el filtro de precio por una coerción de cadena.

Restricciones del proyecto que acotan el diseño: JavaScript sin TypeScript, `api/config/database.js` como única fuente del esquema y siempre idempotente, textos de UI en es-ES, Tailwind sin componentes propios, y `config/env.js` como único lector de `process.env`.

## Goals / Non-Goals

**Goals:**

- Autenticar contra Sendcloud con OAuth2, con renovación automática, un reintento ante fallo de autenticación y degradación a Basic Auth sin intervención humana.
- Eliminar del payload de `POST /v3/shipping-options` todo campo marcado como deprecado y corregir el tipo de `additional_insured_price`.
- Que ninguna opción sin tarifa real llegue nunca a un comprador.
- Que **todo** envío viaje asegurado por el valor de su mercancía, sea `art` u `other`, y que el seguro cotizado sea el seguro efectivamente declarado al transportista.
- Dar al admin una pantalla donde, por obra, obtenga la tarifa real de Sendcloud para las cuatro zonas de España y la convierta en `shipping_methods` + `shipping_zones` con un clic.
- Que cada zona lleve **su** tarifa real, sin promediar ni redondear al alza entre territorios con precios distintos.
- Que el precio guardado sea reproducible y auditable: quedan almacenados el importe base de Sendcloud, el embalaje aplicado y el instante del cálculo.

**Non-Goals:**

- **No** se cambia el camino del checkout para `art`: sigue leyendo zonas por el proveedor legacy. La calculadora sustituye al teclado del admin, no al motor de precios del carrito.
- **No** se crean etiquetas ni envíos desde la calculadora. Solo se cotiza.
- **No** se recalcula nada de forma automática ni programada. El precio se congela hasta que el admin vuelva a pulsar el botón.
- **No** se tocan las zonas creadas a mano ni las zonas de productos `other`. Del flujo de `others` en el carrito solo se tocan las correcciones del bloque 1 y el seguro, que pasa a aplicarse siempre.
- **No** se retiran las columnas `insurance_type` e `insurance_fixed_amount` de `user_sendcloud_configuration`, aunque tras este cambio nadie las lea. Borrar columnas es una operación aparte y no urgente.
- **No** se migra `GET /v2/service-points` a la v3 ni se toca el flujo de pickups: fuera del alcance, y la v2 no está deprecada.
- **No** se exponen los tres campos nuevos de `art` en el formulario de producto ni en la ficha pública.

## Decisions

### D1 — Gestor de token OAuth2 en memoria, por proceso

`api/services/shipping/sendcloudAuth.js` mantiene `{ accessToken, expiresAt }` en una variable de módulo, junto a una `inFlightPromise` para que N peticiones concurrentes que encuentran el token caducado provoquen **una sola** llamada al endpoint de token. Se renueva cuando `Date.now() > expiresAt - 60_000`.

`expires_in` es 3599 s y la respuesta **no incluye `refresh_token`** (verificado), así que "refrescar" es siempre volver a pedir un token con `client_credentials`. No hay flujo de refresco que implementar.

*Alternativas descartadas:* persistir el token en la base de datos o en Redis, para compartirlo entre réplicas. Innecesario — el endpoint de token no está tarificado de forma que importe y cada réplica pide uno cada hora; añadir estado compartido introduce un modo de fallo (token corrupto compartido) a cambio de nada. Tampoco un scheduler que renueve proactivamente: acopla el ciclo de vida del token al arranque del proceso y falla en silencio si el cron muere; el `lazy` con margen de 60 s no tiene ese problema.

### D2 — `SENDCLOUD_AUTH_MODE` con tres valores y `auto` por defecto

- `oauth2`: solo OAuth2. Un fallo de autenticación es un error.
- `basic`: solo Basic Auth. Es la vía de escape si Sendcloud retira el beta.
- `auto` (por defecto): intenta OAuth2; si tras el reintento con token nuevo sigue habiendo `401`/`403`, resuelve **esa petición** por Basic Auth, deja un `logger.warn` y marca el token como no utilizable durante 5 minutos para no reintentar OAuth2 en cada llamada.

El fallback se limita a `401`/`403`. Un `429` o un `5xx` **no** disparan fallback: no son problemas de credencial y cambiar de método de autenticación no los arreglaría.

*Alternativa descartada:* un único booleano `SENDCLOUD_USE_OAUTH2`. Deja sin expresar el caso "quiero OAuth2 pero no quiero que caiga a Basic en silencio", que es exactamente lo que se querrá una vez el beta se estabilice.

### D3 — El reintento vive en el cliente HTTP, no en cada llamada

`sendcloudApiClient.request()` recibe un parámetro interno `isRetry`. Ante `401`/`403` con `isRetry` falso: invalida el token, lo vuelve a pedir y repite la petición una vez. Con `isRetry` verdadero: aplica la política de D2. Así los ocho puntos de llamada de `sendcloudProvider.js` no cambian ni una línea por este motivo.

Cuidado con el cuerpo de la petición: se serializa una sola vez y se reutiliza en el reintento, para no arriesgar una divergencia entre ambos intentos.

### D4 — Cuatro zonas fijas, derivadas de `postal_codes` y no de una lista en código

`api/utils/spainShippingZones.js` define los grupos por *exclusión*, consultando `postal_codes`:

| Grupo | Provincias | CP representativo |
|---|---|---|
| `peninsula` | el resto de provincias ES (47) | `28001` |
| `baleares` | `Baleares` (1) | `07001` |
| `canarias` | `Las Palmas`, `Santa Cruz de Tenerife` (2) | `35001` |
| `ceuta_melilla` | `Ceuta`, `Melilla` (2) | `51001` |

Contrastado contra `api/migrations/ES.csv`: 47 + 1 + 2 + 2 = **52**, el total exacto de provincias del CSV, sin solapes ni huecos. Derivar `peninsula` por exclusión mantiene el grupo sincronizado si algún día cambia el CSV; una lista literal de 47 cadenas acentuadas en el código se desincroniza y falla en silencio (una zona sin la provincia correcta simplemente deja de ofrecer envío a esa provincia, sin error).

*Alternativa descartada:* un input de código postal de destino, con deducción del grupo por prefijo. Obliga al admin a repetir la operación cuatro veces por obra y hace que un CP mal tecleado escriba el grupo de provincias equivocado sin ninguna señal.

### D5 — Baleares es su propio grupo, con su propia tarifa

Es la consecuencia directa del hallazgo (1). Meter península y Baleares en una sola zona obligaría a guardar un único `cost` para dos tarifas que difieren en 2,10 €, y cualquier resolución de ese conflicto es mala: aplicar el importe peninsular hace que la galería **pierda** dinero en cada venta insular, y aplicar el balear hace que el comprador peninsular pague de más por un envío más barato.

Separarlos elimina el conflicto en lugar de arbitrarlo. Cada grupo se cotiza con un solo CP representativo, cada zona guarda la tarifa real de su territorio, y de paso las opciones exclusivas de cada mercado (`baleares_express` en Palma, `paq24`/`epaq24` en la península) dejan de ser un problema: aparecen en el grupo donde existen y no hay que inventar qué hacer con ellas.

Un efecto secundario que conviene notar: con esta división ya no existe el concepto de "opción con cobertura parcial". Cada grupo se resuelve contra un único destino, así que una opción está en el grupo o no está, y no hay estado intermedio que representar ni en el modelo ni en la UI.

Siguen siendo **4 peticiones por obra**, una por grupo. Ceuta y Melilla dan precios idénticos en las pruebas, así que un solo CP representa al par; si algún día divergen, partir ese grupo es la misma operación que se hace aquí con Baleares.

### D6 — Un `shipping_methods` por código de Sendcloud; el precio vive en `shipping_zones`

`shipping_methods` pasa a ser un catálogo global de ~11 filas (una por opción de Sendcloud), identificado por la nueva columna `sendcloud_option_code`. `shipping_zones` guarda lo específico: obra, zona, precio.

Encaja con el esquema existente sin forzarlo. `shipping_zones` ya tiene `product_id` + `product_type`, y `getAvailableShipping()` ya implementa `applyProductPriority()`: si existe una zona específica de la obra, descarta las genéricas. Las zonas generadas entran por esa puerta ya abierta y el checkout no necesita ni una línea nueva.

Este reparto es además lo que hace barata la decisión D7 (varias opciones por zona): N opciones elegidas para un grupo son N filas de `shipping_zones` apuntando a N métodos del catálogo, sin duplicar nada.

*Alternativa descartada:* un método por obra y opción (`"Correos Estandar — Retrato nº3"`). Multiplica `shipping_methods` por el catálogo entero y rompe la semántica de la tabla, que describe *modalidades de envío*, no productos.

### D7 — Selección múltiple por zona: el conjunto elegido reemplaza al anterior

El admin puede marcar **varias** opciones dentro de cada grupo — el criterio del proyecto es que más opciones para el comprador es mejor. En el checkout eso se traduce en varias modalidades de envío entre las que elegir, que es exactamente lo que `getAvailableShipping()` ya sabe presentar.

La semántica del guardado es **de conjunto, no incremental**: lo que se guarda para un grupo es la selección completa que muestra la pantalla en ese momento. Guardar borra las zonas generadas previas de ese grupo e inserta las nuevas, todo dentro de un `createBatch()` de `api/utils/transaction.js`, para que no exista un instante en que la obra se quede sin envío para ese territorio.

Que el borrado sea por grupo y no por opción es deliberado: la alternativa (borrar solo la opción concreta) convierte "desmarcar" en una operación distinta de "guardar", y obliga a la UI a llevar un diario de altas y bajas. Con el reemplazo de conjunto, desmarcar y guardar es todo lo que hace falta.

### D8 — Regeneración: borrado acotado por `(product, zone_group, source)`

Las tres condiciones son necesarias, y la de `source` es la que protege el trabajo existente: sin ella, una regeneración destruiría las zonas que el admin creó a mano para esa obra, que es precisamente lo que este cambio no debe tirar. Las zonas manuales de la misma obra sobreviven a cualquier número de recálculos.

### D9 — El precio final: `round(total_sendcloud × 1,21, 2) + packaging_cost`

En ese orden y con el redondeo a dos decimales aplicado **antes** de sumar el embalaje, tal como se especificó: el IVA grava el servicio de transporte y el embalaje se añade después. Con `correos:standard` a Ceuta (8,48 €) y 5,00 € de embalaje: `8,48 × 1,21 = 10,26` → `10,26 + 5,00 = 15,26 €`.

`shipping_zones.cost` guarda el **precio final** (15,26), que es lo que el checkout ya sabe leer y mostrar sin cambios. `base_cost` (8,48) y `packaging_cost_snapshot` (5,00) quedan al lado para poder reconstruir el cálculo meses después, cuando `art.packaging_cost` ya haya cambiado.

El 21 % se toma de una constante del módulo de la calculadora, **no** de `TAX_VAT_ES` ni de las columnas `tax_vat_*` del vendedor: esos son el IVA del *artículo* y su régimen fiscal (REBU / cooperativa), un eje independiente del IVA del *transporte*, que es siempre el general.

### D10 — Todo envío va asegurado por el valor de la mercancía, sin excepción ni configuración

`additional_insured_price` se adjunta **siempre**, en los dos flujos, y su valor es el de la mercancía que viaja:

- **`art` (calculadora):** `art.price`. Toda fila de `art` lo tiene relleno.
- **`other` (carrito):** `parcel.totalValue`, que `parcelGrouper.js` ya calcula como la suma de `price × quantity` de los artículos del bulto.

`user_sendcloud_configuration.insurance_type` e `insurance_fixed_amount` **dejan de leerse en ambos flujos**. Ramificar sobre ellos sería ramificar sobre una constante: ningún formulario los escribe — `SendcloudConfigSection.js` no los toca, aunque el esquema Zod y el controlador los acepten — así que toda fila conserva el `DEFAULT 'none'`. La consecuencia práctica es que hoy **ningún** envío de la tienda viaja asegurado; a partir de este cambio, todos.

Esto sube el precio de envío de `others` en el carrito, y es una consecuencia aceptada explícitamente: el criterio es que ningún envío salga sin cobertura, sea un cuadro o un artículo de tienda.

**El rango que Sendcloud tarifica es `[2, 5000]`, y fuera de él no da error: recorta en silencio.** Verificado: con `1` cobra el mínimo (0,02 €), y con `5001`, `8000` o `25000` cobra exactamente lo mismo que con `5000` (prima de 30,00 €). El valor se acota explícitamente a ese rango, no para evitar un error que no ocurre, sino para que el número enviado sea el número tarificado y no haya una discrepancia invisible entre lo que se pide y lo que se cobra. El techo de 5000 € no es un problema en la práctica: no se esperan obras por encima de ese valor.

Los dos flujos comparten el mismo helper de cálculo (`insuredValueFor(goodsValue)`), para que el redondeo y el acotado no diverjan.

### D11 — El seguro también se declara al anunciar el envío, no solo al cotizar

Al extender el seguro a todos los envíos aparece un hueco en el código actual: `createShipments()` construye el bulto con peso, dimensiones y `parcel_items`, pero **nunca envía `additional_insured_price`**. Hoy eso es inocuo, porque tampoco se cotiza seguro nunca. En cuanto se cotice siempre, deja de serlo: el comprador pagaría una prima en el precio del envío y el paquete se anunciaría **sin cobertura**. Cobrar por un seguro que no existe no es un detalle de implementación, así que la paridad entra en este cambio.

**Cuidado con una asimetría de la API que invita al error:** el mismo campo tiene forma distinta en cada endpoint.

| Endpoint | Forma de `additional_insured_price` |
|---|---|
| `POST /v3/shipping-options` | entero (`350`) — un objeto o un decimal dan `HTTP 400`, verificado |
| `POST /v3/shipments` | objeto (`{ value, currency }`), según el esquema `optional-price` |

Es exactamente al revés de lo que sugiere la intuición tras corregir el bug del cotizador, y copiar la forma de un endpoint al otro rompe en silencio o con un 400. La forma de `shipments` sale de la documentación y **no** se ha verificado en vivo: anunciar un envío crea una etiqueta real con coste. Se confirma en preproducción durante la implementación, anunciando un envío y cancelándolo acto seguido.

### D12 — Qué opción se muestra, cuál se puede elegir

Dos estados, tras la simplificación que trae D5:

| Estado | Condición | En la UI |
|---|---|---|
| Elegible | tarifa numérica `> 0` | casilla marcable, con desglose |
| Sin tarifa | `quotes: []` | visible, gris, "Sin tarifa disponible (contrato propio del vendedor)" |

Y se descarta por completo lo que tenga `total <= 0` tras `parseFloat`, que es como `sendcloud:letter` desaparece — el mismo predicado que corrige el bug del carrito, compartido entre el proveedor y la calculadora en lugar de duplicado.

Mostrar las opciones sin tarifa en vez de filtrarlas es deliberado: su ausencia silenciosa fue justo lo que costó tiempo diagnosticar.

### D13 — Los tres campos nuevos de `art` no pasan por el formulario de producto

`outside_dimensions` y `outside_weight` describen el **paquete**, no la obra; `dimensions` y `weight` describen la obra. Son magnitudes distintas y por eso son columnas distintas en lugar de una reinterpretación de las existentes. Se escriben desde un único endpoint (`PATCH /api/admin/art-shipping/:artId/packaging`) y no se añaden a `productValidation.js`, ni a `ProductForm.js`, ni al `edit-data` del admin. El formato se valida igual que el de sus gemelas: `/^\d+x\d+x\d+$/` y entero de gramos `> 0`.

`packaging_cost` es `REAL NOT NULL DEFAULT 0`: el caso "embala el propio artista" es un 0 legítimo, no un nulo.

### D14 — Dimensiones y peso externos son obligatorios para cotizar

No hay respaldo automático a `dimensions`/`weight` de la obra. El admin tiene que teclear ambos valores antes de que el botón haga nada, y el endpoint los exige.

El motivo es que un respaldo silencioso produce un precio plausible pero equivocado: la obra mide 60×60×2 cm y pesa 3 kg, el paquete con su embalaje mide 70×70×8 cm y pesa 5,5 kg, y el peso volumétrico que factura el transportista (`60 x 60 x 5 / 5000 = 3.6kg` en las respuestas de prueba) se calcula sobre las dimensiones del bulto. Cotizar con las medidas de la obra da de menos, y ese error queda congelado en `shipping_zones.cost` sin ninguna señal de que se usó un valor sustituto. Obligar a teclearlos convierte un fallo silencioso en un campo vacío que se ve.

### D15 — Paginación en servidor y filtrado con debounce en cliente

`GET /api/admin/art-shipping/products` acepta `title`, `author`, `page` y `limit`, filtra en SQL con `LIKE` y responde con `sendPaginated()`. El cliente usa `useDebounce` (400 ms, el valor por defecto del hook) y no dispara la petición por debajo de 3 caracteres, pero **sí** cuando el campo se vacía por completo — si no, borrar el filtro dejaría la lista congelada en el último resultado.

## Risks / Trade-offs

**[OAuth2 está en beta y Sendcloud puede retirarlo o cambiarlo]** → `SENDCLOUD_AUTH_MODE=auto` cae a Basic Auth sola, y `basic` la desactiva por completo con una variable de entorno, sin desplegar código.

**[El fallback a Basic enmascara una rotura real de OAuth2]** → cada degradación deja un `logger.warn` con el estado HTTP y el cuerpo del error. La ventana de 5 minutos de D2 evita el ruido de un warning por petición sin ocultar el patrón.

**[Cuatro grupos y selección múltiple multiplican las filas de `shipping_zones`]** → una obra con 4 grupos × 3 opciones son 12 zonas más sus filas de provincia (47+1+2+2 = 52 referencias por opción y grupo). Es volumen, no complejidad: el índice de D8 acota el borrado de la regeneración, y `getAvailableShipping()` ya agrupa por método y se queda con el más barato. Conviene vigilar el tamaño de `shipping_zones_postal_codes` cuando el catálogo de obras crezca.

**[Más opciones en el carrito puede paralizar al comprador]** → es la contrapartida aceptada del criterio "más opciones = mejor". Queda en manos del admin no marcarlas todas si el listado resulta excesivo; la pantalla no impone ningún máximo.

**[El precio se congela y las tarifas de Sendcloud cambian]** → asumido: es el modelo que se pide, y hoy el precio también está congelado, solo que además es inventado. Mitigación parcial: `calculated_at` se muestra en la pantalla, y una fecha vieja es visible de un vistazo.

**[Una obra de más de 5000 € viaja infrasegurada]** → Sendcloud tarifica el seguro hasta 5000 € y por encima recorta sin avisar: 8000 € y 25000 € cobran la misma prima que 5000 €. La pantalla lo hará explícito en las obras que superen el techo, para que la galería sepa que necesita un seguro aparte y no descubra el hueco al perderse un cuadro. No hay solución técnica dentro de la API: es el límite del producto XCover.

**[Corregir el tipo del seguro no cambia nada hoy, pero es requisito de todo lo demás]** → `insurance_type` no se escribe desde ningún formulario, así que toda fila vale `none` y hoy el campo nunca se adjunta: el `HTTP 400` está latente, no activo. Pasa a activo en cuanto se asegure siempre, que es justo lo que hace este cambio en los dos flujos. Por eso la corrección del tipo va en el bloque 1 y no puede saltarse.

**[Los envíos de la tienda pasan a ser más caros para el comprador]** → consecuencia aceptada de asegurar todo envío. Sobre el paquete de prueba la prima es de 2,10 € en península y 5,25 € a Canarias; para artículos de tienda, de menor valor, será menor. Conviene comunicarlo antes de desplegar, porque es un cambio de precio visible en el carrito sin que el vendedor haya tocado nada.

**[El seguro se cotiza y no se declara]** → es el hueco que abre extender el seguro a todos los envíos: `createShipments()` nunca envía `additional_insured_price`, así que el comprador pagaría una prima por un paquete anunciado sin cobertura. La paridad entra en este cambio (D11). Es lo primero que hay que verificar en preproducción, porque un fallo aquí no se ve — el envío sale igual, solo que sin seguro.

**[La forma del campo difiere entre los dos endpoints]** → entero en `shipping-options`, objeto `{value, currency}` en `shipments`. La segunda sale de la documentación y no está verificada en vivo, porque anunciar un envío crea una etiqueta real con coste. Se confirma en preproducción anunciando y cancelando.

**[Eliminar `sendcloud:letter` quita la única opción en paquetes grandes]** → correcto y deliberado: con 150×100×20 cm y 25 kg era la única superviviente y ofrecía "envío gratis" en una carta de buzón. Sin opciones, el comprador ve el mensaje de "sin envío disponible", que es la verdad. Los paquetes que ninguna opción admite necesitan `max_dimensions`/`max_weight` mayores o transporte concertado, no una carta.

**[4 peticiones por clic contra una API externa]** → se lanzan en paralelo con `Promise.allSettled`, de modo que un fallo en una zona no tumba las otras tres; el grupo afectado se muestra con su error. El endpoint queda bajo `adminAuth`, así que no hay superficie pública que abusar.

**[Un `safeAlter` deja las columnas nuevas al final de la tabla]** → riesgo conocido y ya documentado en el proyecto por el volcado a S3: los `INSERT` del dump llevan lista de columnas explícita, así que las tres columnas nuevas de `art` no descolocan una restauración.

## Migration Plan

1. **Esquema.** Las columnas se añaden al `CREATE TABLE` de `api/config/database.js` **y** con `safeAlter` para las bases ya existentes. Todo con valor por defecto, ninguna `NOT NULL` sin default: una base preexistente arranca sin tocar una fila.
2. **Bloque 1 primero, y desplegable solo.** El saneamiento de la integración (OAuth2, payload, seguro, filtrado, borrado del log) no depende de nada del bloque 2 y corrige defectos que hoy afectan a compradores. Debería salir antes.
3. **`SENDCLOUD_ENABLED_ART=false`** en `api/.env` y `api/.env.local` antes de desplegar el bloque 2, para que el checkout de arte lea las zonas y no cotice en vivo.
4. **Verificación en preproducción**, que comparte las credenciales de Sendcloud: pedir token OAuth2, cotizar una obra con las cuatro peticiones y confirmar que las zonas escritas coinciden con lo que la pantalla mostró, incluidas las de Baleares con su tarifa propia.
5. **Rollback.** Bloque 1: `SENDCLOUD_AUTH_MODE=basic` restaura la autenticación anterior sin desplegar. Bloque 2: la pantalla es aditiva; borrar las filas con `shipping_zones.source = 'sendcloud_calculator'` devuelve el estado previo sin tocar nada creado a mano. Las columnas nuevas pueden quedarse, son inertes.

## Open Questions

1. **`sendcloud:letter` en `others`.** Se elimina por el predicado de precio compartido. Si algún artículo pequeño de la tienda se envía de verdad como carta, habría que filtrarlo por `functionalities.form_factor === 'mailbox'` en lugar de por precio.
