## Why

El checkout recoge nombre, email y teléfono del comprador, pero no su identificador fiscal. La factura de comprador (Serie A REBU y Serie P) se emite hoy **sin NIF del destinatario**, aunque el generador de PDF ya sabe pintar esa línea: `renderParties()` en `api/services/pdfGenerator.js` acepta `recipient.taxId` y renderiza «NIF/CIF: …», y ninguna de las dos funciones de factura de comprador se lo pasa, sencillamente porque el dato no existe en ninguna parte del sistema.

El resto de canales de venta sí lo piden desde el principio — `draw_buyers.dni` y `auction_buyers.dni` son obligatorios en sorteos y subastas — de modo que la compra directa por carrito es el único camino que llega a facturación sin identificar al comprador.

## What Changes

- **Nuevo campo «DNI/NIE» en el paso de datos personales del carrito**, inmediatamente debajo de «Nombre completo», a ancho completo (`sm:col-span-2`) y con los mismos estilos que el resto de campos del formulario. Se añade a **los dos** componentes que renderizan esa sección — `AddressManualInput` y `AddressAutocomplete` — porque `NEXT_PUBLIC_CART_ADDRESS_FUNC` conmuta entre ellos y el campo desaparecería en uno de los dos modos.
- **Obligatorio**: bloquea el avance a envío/pago igual que el email y el teléfono, y el backend rechaza el pedido con 400 si falta o no es válido.
- **Validación con dígito de control** (no solo formato) para DNI y NIE, en cliente y en servidor, con el mismo algoritmo del NIF español que ya usan sorteos y subastas. Un CIF de empresa (`B12345678`) se rechaza.
- **Nueva columna `orders.dni`**, escrita por el mismo `INSERT` que `full_name`, `email` y `phone`.
- **Los pedidos de sorteos y subastas también la rellenan**, propagando el DNI que ya guardan `draw_buyers` y `auction_buyers`; sin esto esos pedidos quedarían con `dni` NULL y su factura sin NIF.
- **La factura de comprador muestra el NIF** (Series A y P), pasando `taxId` al `recipient` que ya lo soporta.
- **El detalle de pedido del admin muestra el DNI** en el bloque «Información del comprador». De paso se corrige ahí un defecto existente: el campo «Nombre» muestra `order.email` en lugar de `order.full_name`.
- **Un único módulo de validación por lado** (`api/utils/spanishTaxId.js` y `client/lib/spanishTaxId.js`) en vez de una quinta copia del algoritmo: hoy vive duplicado en `drawService.js`, `auctionService.js`, `DrawParticipationModal.js` y `BidModal.js`.
- **No es BREAKING para los pedidos existentes**: la columna es nullable, y la factura omite la línea del NIF cuando no hay dato, de modo que cualquier pedido anterior sigue siendo facturable.

## Capabilities

### New Capabilities
- `checkout-buyer-tax-id`: captura, validación y persistencia del identificador fiscal (DNI/NIE) del comprador en el checkout del carrito, incluida la columna `orders.dni`, su propagación desde sorteos y subastas, y su exposición en el panel de administración.

### Modified Capabilities
- `pdf-invoice-engine`: el requisito «Buyer invoice — REBU (Series A)» y «Buyer invoice — Standard (Series P)» enumeran hoy los datos del comprador que van en la factura (`full_name`, `email`/`guest_email`, dirección de facturación). Se añade `dni` como NIF del destinatario, opcional en el PDF para no invalidar los pedidos anteriores.

## Impact

**Base de datos**
- `api/config/database.js`: nueva columna `dni TEXT` en `CREATE TABLE orders` + su `safeAlter` correspondiente para las bases ya creadas (preproducción y producción).

**Backend**
- `api/controllers/ordersController.js` — `placeOrder`: lee `customer.dni`, lo valida y lo persiste.
- `api/validators/orderSchemas.js` — `customerSchema` hace `strip` de las claves desconocidas: sin declarar `dni` ahí el campo se descartaría (aunque el esquema no está hoy cableado a ninguna ruta; ver design).
- `api/services/drawService.js` (`getParticipationBillingData`) y `api/services/auctionService.js` (`getBidBillingData`): añadir la columna al `SELECT`; ambos seleccionan columnas explícitas.
- `api/controllers/drawAdminController.js` y `api/controllers/auctionAdminController.js`: añadir `dni` a sus `INSERT INTO orders`.
- `api/services/invoiceService.js`: `taxId` en el `recipient` de las dos facturas de comprador.
- Nuevo `api/utils/spanishTaxId.js`; `drawService.validateDNI` y `auctionService.validateDNI` pasan a delegar en él conservando su export público.

**Frontend**
- `client/components/AddressManualInput.js` y `client/components/AddressAutocomplete.js`: el nuevo campo.
- `client/components/ShoppingCartDrawer.js`: estado `personalInfo.dni`, validación en `isPersonalInfoValid()`, precarga desde el usuario autenticado, reseteo tras el pago y envío en `customer` del payload.
- `client/app/admin/pedidos/[id]/page.js`: fila del DNI y corrección del campo «Nombre».
- Nuevo `client/lib/spanishTaxId.js`; `DrawParticipationModal.js` y `BidModal.js` pasan a importarlo.

**Pruebas**
- Nuevas pruebas de validación del NIF y de persistencia en `placeOrder`; `api/tests/orders.test.js` y `api/tests/pdfGenerator.test.js` necesitan revisión.

**Sin impacto** en pasarelas de pago (Stripe/Revolut no reciben el dato), en Sendcloud, en la verificación de costes de envío ni en ninguna variable de entorno.
