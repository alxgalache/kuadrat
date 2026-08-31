## Context

El paso de datos personales del carrito vive en **dos** componentes intercambiables, no en `ShoppingCartDrawer.js`: la sección «Información personal» está duplicada en `AddressManualInput.js` y en `AddressAutocomplete.js`, y `NEXT_PUBLIC_CART_ADDRESS_FUNC` (por defecto `manual`) decide cuál se monta. El drawer solo posee el estado `personalInfo` y lo pasa hacia abajo. Tocar uno solo de los dos deja el campo invisible en el otro modo, sin ningún error.

El algoritmo del NIF español ya existe **cinco veces** en el repositorio, en dos variantes que no coinciden:

| Ubicación | Formatos | Comprueba dígito de control |
|---|---|---|
| `api/services/drawService.js` `validateDNI` | DNI, NIE | Sí |
| `api/services/auctionService.js` `validateDNI` | DNI, NIE | Sí |
| `client/components/DrawParticipationModal.js` | DNI, NIE | Sí |
| `client/components/BidModal.js` | DNI, NIE | Sí |
| `api/validators/fiscalSchemas.js` (datos fiscales del artista) | DNI, NIE, **CIF** | No — solo regex |

`orders` no tiene columna para el identificador fiscal, pero `pdfGenerator.renderParties()` **ya sabe pintarlo**: acepta `recipient.taxId` y emite la línea «NIF/CIF: …». Las dos facturas de comprador (`generateBuyerRebuInvoice`, `generateBuyerStandardInvoice`) construyen su `recipient` sin ese campo porque el dato no existe.

Hallazgo relevante para la validación de servidor: **`placeOrderSchema` está definido en `api/validators/orderSchemas.js` pero no está cableado a ninguna ruta.** `router.post('/placeOrder', sensitiveLimiter, optionalAuthenticate, placeOrder)` no lleva `validate(...)`. La única validación que realmente se ejecuta hoy es la que el controlador hace en línea (el regex del email en `placeOrder`).

## Goals / Non-Goals

**Goals:**

- Capturar el DNI/NIE del comprador en el checkout, obligatorio, con validación de dígito de control en cliente y en servidor.
- Persistirlo en `orders.dni`, escrito por el mismo `INSERT` que el resto de los datos del comprador.
- Que los pedidos de sorteos y subastas lo rellenen a partir del DNI que ya guardan.
- Que la factura de comprador lo muestre, sin romper la facturación de los pedidos anteriores.
- Dejar **una** implementación del algoritmo por lado en vez de añadir una quinta y una sexta copia.

**Non-Goals:**

- Aceptar CIF de persona jurídica. Se descarta explícitamente (decisión del usuario): un comprador que sea empresa no completará la compra por el carrito.
- Validar contra ningún registro externo (AEAT). La comprobación es la del dígito de control, igual que en sorteos y subastas.
- Unificar `api/validators/fiscalSchemas.js` con el nuevo módulo. Responde a otra pregunta (identificación fiscal del **artista**, donde el CIF sí es válido) y su cambio arrastraría el formulario fiscal del vendedor.
- Retro-rellenar el DNI de los pedidos ya existentes. No hay de dónde sacarlo.
- Enviar el DNI a Stripe, a Revolut o a Sendcloud. Ninguno lo necesita.
- Exponerlo al vendedor.

## Decisions

### 1. Un módulo compartido por lado, y los cuatro llamantes existentes pasan a usarlo

`api/utils/spanishTaxId.js` y `client/lib/spanishTaxId.js`, cada uno exportando `validateSpanishTaxId(value)` y `normalizeSpanishTaxId(value)`. El algoritmo es idéntico al que ya está en producción; no se inventa nada.

`drawService.validateDNI` y `auctionService.validateDNI` **conservan su nombre y su export**, delegando en el módulo, para no tocar sus llamantes (`drawController`, `auctionController`, sus rutas y sus pruebas). `DrawParticipationModal.js` y `BidModal.js` importan el módulo del cliente y borran su copia local.

*Alternativa descartada:* copiar el algoritmo una sexta vez. Es lo más barato hoy y lo que produjo la tabla de arriba. Cinco copias ya son una invitación a que diverjan; el coste de unificarlas ahora es pequeño porque todas son textualmente la misma función.

*No se comparte código entre `api/` y `client/`*: el monorepo no tiene paquete común y ambos se construyen en imágenes Docker distintas. Dos ficheros gemelos es el patrón que el repositorio ya usa (`client/lib/cookieConsent.js` frente al script inline, los regex de `SellerFiscalForm.js` que un comentario obliga a mantener sincronizados con `fiscalSchemas.js`). El comentario de cabecera de cada uno apuntará al otro.

### 2. La validación de servidor va **en el controlador**, no en el esquema Zod

`placeOrderSchema` no está cableado, así que añadir `dni` solo al esquema no validaría nada: el pedido entraría igual. La comprobación normativa se hace en `placeOrder`, junto al regex del email que ya está ahí, y lanza `ApiError(400, …)`.

Se añade `dni` a `customerSchema` **de todas formas**, porque el esquema hace `strip` de las claves desconocidas: si algún día alguien cablea `validate(placeOrderSchema)` a la ruta —lo natural, y lo que dicta el patrón del proyecto— el campo desaparecería del cuerpo antes de llegar al controlador y el pedido empezaría a fallar con un 400 cuyo origen no está en ninguna parte visible. Es una bomba de relojería de una línea; se desactiva ahora.

*Alternativa descartada:* cablear `validate(placeOrderSchema)` en esta misma tarea. El esquema lleva `.strip()` sobre un cuerpo que el controlador desestructura con muchos campos; comprobar que ninguno se pierde es un trabajo con su propio riesgo y su propia prueba, ajeno a este cambio.

### 3. El orden de la validación importa: antes de crear la fila y antes de tocar el inventario

La comprobación se coloca junto a la del email, es decir **antes** del `INSERT INTO orders` y antes del `createBatch()` que consume ejemplares de la edición. Un 400 tardío dejaría inventario reservado para un pedido que no llega a existir; el contador `editions_sold` no es idempotente y su única vía de liberación es `inventoryService.releaseOrderInventory`, que necesita un `orders.id`.

### 4. `orders.dni` es nullable, y la factura omite la línea cuando falta

Hay pedidos anteriores al cambio, y los habrá con `dni` NULL después (una subasta antigua cuyo `auction_buyers.dni` es NULL). Si `validateBuyerInvoicingData` exigiera el DNI, esos pedidos dejarían de ser facturables — un 400 nuevo sobre datos históricos. `renderParties()` ya trata `taxId` como opcional (`if (recipient.taxId)`), así que basta con pasar `order.dni || undefined` y no tocar la validación.

### 5. Columna: `CREATE TABLE` **y** `safeAlter`

`api/config/database.js` es la fuente única de verdad y debe declarar `dni TEXT` dentro del `CREATE TABLE orders` para las bases nuevas (incluida la de pruebas, que se recrea desde `initializeDatabase()`). Las bases ya existentes de preproducción y producción no reejecutan el `CREATE TABLE`, así que necesitan además la línea `safeAlter('ALTER TABLE orders ADD COLUMN dni TEXT')` en el bloque que el fichero ya reserva para eso — el mismo patrón que `orders.reserved_at` y `orders.payment_mismatch`.

**Consecuencia para las copias de seguridad:** una columna añadida por `safeAlter` queda al final de la tabla real mientras figura a media lista en el `CREATE TABLE` volcado. `dbDumpService` emite los `INSERT` con lista explícita de columnas precisamente por esto, así que el volcado sigue restaurando bien. No hay nada que ajustar; se anota porque es la clase de detalle que se descubre tarde.

### 6. Dónde aparece el DNI y dónde no

La columna nueva viaja sola en las consultas que hacen `SELECT *` o `SELECT o.*` sobre `orders`:

- `getOrderByIdAdmin` y el listado de pedidos del admin → **deseado**.
- `getOrderByToken` (público con token de 48 hex) → el pedido del propio comprador. El enlace ya es una credencial al portador que da acceso a su nombre, dirección y teléfono; el DNI no mueve la frontera de confianza. `api/utils/redactUrl.js` ya oculta ese token en los registros.

Las consultas orientadas al vendedor (`sellerOrdersController.getSellerOrders`, `getSellerShipmentsAdmin`, el reparto de ingresos de `sellerRoutes`) seleccionan **columnas explícitas** de `orders`, de modo que el DNI no llega al vendedor por omisión. Esa propiedad es del código actual y hay que conservarla: cualquier consulta futura orientada al vendedor debe seguir enumerando columnas.

### 7. Sin precarga desde la cuenta del usuario

`handleCheckout` precarga nombre, email y teléfono desde `user`. No hay equivalente para el DNI: `users.tax_id` es el identificador fiscal del **artista vendedor** (lo rellena el admin en la ficha fiscal, y ahí sí puede ser un CIF). Usarlo para precargar al comprador confundiría dos sujetos distintos y, en el caso de una sociedad, precargaría un valor que el propio campo rechaza. El campo se deja vacío.

### 8. Textos en `client/lib/constants.js`

El mensaje de error en línea sigue el patrón de `SHIPPING_VERIFICATION_ERRORS` y `PASSWORD_RESET_ERRORS`: la copia es-ES vive en `client/lib/constants.js`, no incrustada en el JSX.

### 9. Corrección adyacente en el detalle de pedido del admin

`client/app/admin/pedidos/[id]/page.js` muestra hoy `order.email` bajo la etiqueta «Nombre», de modo que el email aparece dos veces seguidas y `full_name` no aparece nunca. Se corrige en el mismo cambio porque se está editando ese bloque para añadir el DNI y dejarlo mal a sabiendas sería peor. Es una corrección de una línea, no una reescritura de la pantalla.

## Risks / Trade-offs

- **Un comprador sin DNI/NIE español no puede completar la compra** → Es la decisión tomada. El impacto real es bajo: las zonas de envío que el sistema resuelve (`peninsula`, `baleares`, `canarias`, `ceuta_melilla`) son todas territorio español, y el selector de teléfono solo ofrece +34. Si aparece la necesidad, el punto de cambio es una sola función en cada lado.
- **Un comprador que sea empresa queda fuera** → Consecuencia directa de rechazar el CIF. Sale por sorteo/subasta o por trato directo. Añadir el CIF más adelante es tocar el mismo par de módulos y su algoritmo de control.
- **El campo empuja Email y Teléfono una fila hacia abajo** en la rejilla de dos columnas y alarga el formulario en el paso de datos → Es lo pedido («ocupará el mismo espacio»); el drawer ya tiene scroll.
- **api y cliente deben desplegarse juntos** → Si el cliente sube primero, envía un campo que el servidor ignora (sin daño). Si sube primero el servidor, **todas las compras fallan con 400** porque el cliente antiguo no manda `dni`. El orden es: base de datos → api → cliente, y el api no puede subir con la validación activa antes que el cliente. Ver plan de migración.
- **Dos ficheros gemelos que pueden divergir** → Mitigado con un comentario de cabecera cruzado en ambos, y con la prueba del backend que fija los casos límite del algoritmo. Es el mismo compromiso que el repositorio ya acepta en `fiscalSchemas.js` ↔ `SellerFiscalForm.js`.
- **Dato personal adicional en un volcado diario a S3** → El volcado ya contiene nombre, dirección, teléfono y email de cada comprador; el bucket solo admite `PutObject` mediante el rol de instancia. No cambia la clasificación del volcado. Sí conviene que la política de privacidad mencione el identificador fiscal entre los datos tratados en una compra — queda anotado como pregunta abierta, no como tarea.

## Migration Plan

1. **Base de datos.** El `safeAlter` se ejecuta solo, en el arranque del api, sobre preproducción y producción. Es aditivo y nullable: ninguna consulta existente se ve afectada y no hace falta ventana de mantenimiento.
2. **Backend.** Se despliega con la validación ya activa. **Aquí está el único punto delicado:** entre el despliegue del api y el del cliente, un navegador con el bundle antiguo enviaría un pedido sin `dni` y recibiría un 400. La ventana es la que separa ambos contenedores en `./deploy/deploy.sh`, que los reinicia en la misma ejecución; y los navegadores ya cargados que estén a mitad de un checkout durante ese minuto. Se acepta por ser el mismo compromiso que documenta la sección de resolución de zonas de envío en `CLAUDE.md` («api y cliente deben desplegarse juntos»), y porque el volumen de checkouts simultáneos es de un dígito.
3. **Cliente.** `next build` con `NODE_ENV=production` y **purga obligatoria de la caché de páginas de nginx** tras el despliegue, como cualquier despliegue de cliente: el HTML cacheado referencia chunks que la nueva compilación ya no tiene.
4. **Verificación.** Un pedido de prueba de punta a punta en preproducción, comprobando la fila en `orders` y generando después las dos facturas de comprador sobre un pedido antiguo (sin DNI) y uno nuevo (con DNI).

**Rollback.** Revertir el código de api y cliente. **La columna se deja**: es nullable, nadie la exige y borrarla en SQLite implica reescribir la tabla. Un `rollback` deja filas con DNI que nadie lee, lo cual es inofensivo.

## Open Questions

- **¿Debe la política de privacidad recoger el identificador fiscal?** Se incorpora un dato identificativo nuevo al tratamiento de una compra. La revisión del texto legal queda fuera de este cambio, pero conviene decidirlo antes de que el primer pedido real lo almacene.
- **¿Debe el email de confirmación de pedido mostrarlo?** Se ha decidido mostrarlo en la factura PDF y en el panel de administración; el correo no se toca. Si se quisiera, es una línea en la plantilla de `emailService.js`.
- **¿Conviene además rellenar `taxId` en la factura de comisión y en la liquidación al artista?** Esas usan `seller.tax_id`, que ya existe y ya se pasa. No forma parte de este cambio; solo se anota para dejar constancia de que no es un olvido.
