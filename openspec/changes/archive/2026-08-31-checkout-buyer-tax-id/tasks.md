## 1. Módulo de validación compartido

- [x] 1.1 Crear `api/utils/spanishTaxId.js` con `validateSpanishTaxId(value)` y `normalizeSpanishTaxId(value)` (DNI + NIE con dígito de control, CIF rechazado, normalización a mayúsculas sin espacios, tolerante a `null`/no-cadena). Comentario de cabecera apuntando al gemelo del cliente.
- [x] 1.2 Crear `client/lib/spanishTaxId.js` con la misma API y el comentario cruzado hacia `api/utils/spanishTaxId.js`.
- [x] 1.3 Hacer que `drawService.validateDNI` y `auctionService.validateDNI` deleguen en `api/utils/spanishTaxId.js`, conservando nombre y export para no tocar sus llamantes.
- [x] 1.4 Sustituir la copia local del algoritmo en `client/components/DrawParticipationModal.js` y `client/components/BidModal.js` por el import de `client/lib/spanishTaxId.js`.
- [x] 1.5 Añadir `api/tests/spanishTaxId.test.js` cubriendo los siete escenarios del spec (DNI válido/inválido, NIE con X e Y, minúsculas con espacios, CIF rechazado, entradas no textuales).

## 2. Esquema de base de datos

- [x] 2.1 Añadir `dni TEXT` al `CREATE TABLE orders` de `api/config/database.js`, situado junto a `full_name`, `email` y `phone`.
- [x] 2.2 Añadir `safeAlter('ALTER TABLE orders ADD COLUMN dni TEXT')` en el bloque de `safeAlter` del mismo fichero, para las bases ya creadas.
- [x] 2.3 Verificar que la base de pruebas se recrea con la columna: `docker compose exec api npm test -- testEnvironmentIsolation` debe seguir en verde.

## 3. Backend — captura y persistencia

- [x] 3.1 En `api/validators/orderSchemas.js`, declarar `dni: z.string().optional()` dentro de `customerSchema` para que el `strip` del esquema no lo elimine si algún día se cablea a la ruta.
- [x] 3.2 En `ordersController.placeOrder`, extraer el DNI de `customer.dni`, normalizarlo y validarlo con `api/utils/spanishTaxId.js`, lanzando `ApiError(400, …)` **antes** del `INSERT INTO orders` y antes del `createBatch()` de reserva de inventario — junto a la comprobación del email que ya existe ahí.
- [x] 3.3 Añadir `dni` a la lista de columnas y a los `args` del `INSERT INTO orders` de `placeOrder`, en la misma sentencia que `full_name`.

## 4. Backend — sorteos y subastas

- [x] 4.1 Añadir `db2.dni` al `SELECT` de `drawService.getParticipationBillingData`.
- [x] 4.2 Añadir `dni` al `INSERT INTO orders` de `drawAdminController.billParticipation`, tomando el valor de `data.dni` (o `NULL`).
- [x] 4.3 Añadir `ab.dni` al `SELECT` de `auctionService.getBidBillingData`.
- [x] 4.4 Añadir `dni` al `INSERT INTO orders` del flujo de facturación de puja de `auctionAdminController`, tomando el valor de `data.dni` (o `NULL`).
- [x] 4.5 Comprobar que `api/tests/drawBillingEditions.test.js` sigue en verde: su doble de `db` intercepta el `INSERT INTO orders` y verifica argumentos.

## 5. Backend — factura del comprador

- [x] 5.1 Pasar `taxId: order.dni || undefined` en el `recipient` de `invoiceService.generateBuyerRebuInvoice`.
- [x] 5.2 Pasar `taxId: order.dni || undefined` en el `recipient` de `invoiceService.generateBuyerStandardInvoice`.
- [x] 5.3 Confirmar que `validateBuyerInvoicingData` **no** exige el DNI, para que los pedidos anteriores sigan siendo facturables.
- [x] 5.4 Ampliar `api/tests/pdfGenerator.test.js` (o el fichero de pruebas de factura correspondiente) con un caso con `dni` y otro con `dni = NULL`, comprobando presencia y ausencia de la línea «NIF/CIF».

## 6. Frontend — campo en el formulario

- [x] 6.1 Añadir el mensaje de error es-ES a `client/lib/constants.js`, siguiendo el patrón de `SHIPPING_VERIFICATION_ERRORS`.
- [x] 6.2 Añadir el campo «DNI/NIE» a `client/components/AddressManualInput.js`: bajo «Nombre completo», `sm:col-span-2`, asterisco rojo, `className` idéntico al de los demás inputs, `uppercase`, y error en línea bajo el campo.
- [x] 6.3 Replicar exactamente el mismo campo en `client/components/AddressAutocomplete.js` (sin esto desaparece con `NEXT_PUBLIC_CART_ADDRESS_FUNC=autocomplete`).
- [x] 6.4 Verificar visualmente los dos modos: campo presente, en su posición, y con la sección «Información personal» apareciendo una sola vez tanto en carritos de entrega como de recogida.

## 7. Frontend — estado y validación del carrito

- [x] 7.1 Añadir `dni: ''` al estado inicial de `personalInfo` en `ShoppingCartDrawer.js` y a los dos reseteos posteriores al pago.
- [x] 7.2 Añadir la comprobación del DNI a `isPersonalInfoValid()` usando `client/lib/spanishTaxId.js`, de modo que bloquee `handleProceedFromAddress` y deshabilite el botón de continuar.
- [x] 7.3 Incluir `dni` normalizado en el bloque `customer` del payload de `placeOrderInDatabase()`.
- [x] 7.4 Confirmar que `handleCheckout` **no** precarga el DNI desde `user` (`users.tax_id` es el identificador fiscal del artista, no el del comprador).

## 8. Frontend — panel de administración

- [x] 8.1 Añadir la fila «DNI» al bloque «Información del comprador» de `client/app/admin/pedidos/[id]/page.js`, con «Sin DNI» cuando falte.
- [x] 8.2 Corregir en ese mismo bloque el campo «Nombre», que hoy muestra `order.email` en lugar de `order.full_name`.

## 8b. Política de privacidad

- [x] 8b.1 Añadir el identificador fiscal (DNI/NIE) a la lista de datos recopilados de `client/app/legal/politica-de-privacidad/page.js` §2. La frase introductoria acota hoy la recogida a «cuando te registras como pujador en nuestras subastas», así que hay que ampliarla a la compra por carrito para que la mención sea cierta.
- [x] 8b.2 Actualizar la fecha de «Última actualización» de la página.

## 9. Verificación

- [x] 9.1 Prueba de integración: `POST /api/orders/placeOrder` sin `dni` y con `dni` inválido devuelven 400 y **no** crean fila en `orders` ni consumen ejemplares de la edición.
- [x] 9.2 Prueba de integración: un pedido con `dni` válido lo persiste normalizado en mayúsculas.
- [x] 9.3 Ejecutar la suite completa del backend (`docker compose exec api npm test`) y revisar en particular `orders.test.js`, `editionInventory.test.js` y `drawBillingEditions.test.js`.
- [x] 9.4 Compilar el cliente en modo producción (`docker compose exec -e NODE_ENV=production client npm run build`) para descartar fallos de prerenderizado.
- [x] 9.5 Recorrido manual de punta a punta en preproducción: compra completa, fila en `orders`, y generación de las dos facturas de comprador sobre un pedido nuevo (con DNI) y uno antiguo (sin DNI).
