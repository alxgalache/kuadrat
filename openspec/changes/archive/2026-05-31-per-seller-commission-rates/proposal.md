## Why

Hoy la comisión de la galería es **global**: dos variables de entorno en la API
(`DEALER_COMMISSION_ART`, `DEALER_COMMISSION_OTHERS`) y dos en el cliente
(`NEXT_PUBLIC_DEALER_COMMISSION_ART`, `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`).
Todos los vendedores comparten el mismo porcentaje y cambiarlo exige un redeploy
(las `NEXT_PUBLIC_*` se embeben en el bundle en build time).

El negocio necesita **acordar comisiones distintas con cada artista**. Esta
propuesta mueve los porcentajes a la base de datos, **por usuario vendedor**, de
modo que cada venta calcule la comisión y el neto del artista usando el
porcentaje configurado para el vendedor dueño del producto. Se guarda la comisión
de la galería (p. ej. 25 %), nunca el porcentaje que se queda el artista.

## What Changes

- **Esquema (users):** dos columnas nuevas en `users`:
  `dealer_commission_art REAL NOT NULL DEFAULT 25` y
  `dealer_commission_other REAL NOT NULL DEFAULT 10`. Almacenan la comisión de la
  galería como **porcentaje entero** (misma convención que las env actuales).
  Se añaden tanto al `CREATE TABLE users` (DBs nuevas) como vía `safeAlter(...)`
  (DBs existentes), siguiendo el patrón ya usado en `api/config/database.js`.
- **Fuente de verdad de la comisión:** se deja de leer
  `config.payment.dealerCommissionArt/Others` para el cálculo de ventas. Cada
  punto de cálculo resuelve el `seller_id` del producto y usa la columna del
  vendedor (`dealer_commission_art` para `art`, `dealer_commission_other` para
  `other`). Puntos afectados:
  - `api/controllers/ordersController.js` (checkout del carrito → items).
  - `api/controllers/auctionAdminController.js` (facturar puja ganadora).
  - `api/controllers/drawAdminController.js` (facturar ganador de sorteo).
  - `api/scheduler/eventCreditScheduler.js` (crédito al anfitrión de eventos de
    pago → usa `dealer_commission_other` del host).
- **Exposición al cliente (sin env):** el cliente deja de leer las
  `NEXT_PUBLIC_DEALER_COMMISSION_*`. La API expone los porcentajes del vendedor
  autenticado:
  - `GET /api/seller/wallet` ya devolvía `commissionRateArt/Others` → pasa a
    leerlos de la fila del usuario.
  - Nuevo `GET /api/seller/commission-rates` para que el formulario de
    publicación obtenga las tasas del vendedor en tiempo real.
- **UI admin completa:** el panel de admin permite ver y editar la comisión de
  cada vendedor. Se amplían `PUT /api/admin/authors/:id` (acepta y persiste
  `dealer_commission_art`, `dealer_commission_other`), el `GET` del autor (los
  devuelve) y la pantalla `client/app/admin/authors/[id]/edit/page.js`. Validación
  Zod: número en `[0, 100]`.
- **Cliente — consumidores:**
  - `client/app/seller/publish/page.js`: la vista previa "Recibirás X€ netos"
    usa las tasas del vendedor (vía API) en lugar de las env.
  - `client/app/orders/page.js` (Monedero): el texto "Se aplica una comisión del
    X% … e Y% …" usa las tasas devueltas por `getWallet()`.
- **Limpieza de configuración:** se eliminan las cuatro variables y todas sus
  referencias en `.env.example` (raíz, `api/`, `client/`), `docker-compose.*.yml`
  y `client/Dockerfile.staging` / `client/Dockerfile.prod`. Las env de la API
  (`DEALER_COMMISSION_ART/OTHERS` → `config.payment.dealerCommission*`) dejan de
  usarse para cálculo; se eliminan de `config/env.js`.

## Capabilities

### New Capabilities
- `per-seller-commission-rates`: columnas `dealer_commission_art` /
  `dealer_commission_other` en `users`, su edición por admin, su exposición al
  vendedor autenticado, y la regla de que **todo cálculo de comisión usa la tasa
  del vendedor dueño del producto**.

### Modified Capabilities
- `seller-net-earnings-preview`: la vista previa de neto en publicación usa las
  tasas por-vendedor obtenidas de la API en lugar de las `NEXT_PUBLIC_*`.
- `orders-dashboard-stats`: el texto de comisión del Monedero usa las tasas del
  vendedor (de `getWallet()`) en lugar de env.
- `auction-bid-billing`: `commission_amount` se calcula con la comisión del
  vendedor del producto subastado, no con `config.payment.dealerCommissionArt`.
- `draw-billing`: `commission_amount` se calcula con la comisión del vendedor del
  producto sorteado.
- `event-payouts`: el crédito al anfitrión usa `dealer_commission_other` del host.

## Impact

- **Database:** `api/config/database.js` — 2 columnas nuevas en `users` (en
  `CREATE TABLE` + `safeAlter`).
- **Backend:** `ordersController.js`, `auctionAdminController.js`,
  `drawAdminController.js`, `eventCreditScheduler.js` (cálculo); `sellerRoutes.js`
  (wallet + nuevo endpoint de tasas); `routes/admin/authorRoutes.js` (GET/PUT
  autor); `services/auctionService.js` y `services/drawService.js` (los SELECT de
  billing ya hacen JOIN a `users` → añadir la columna de comisión);
  `validators/` (esquema de edición de autor); `config/env.js` (retirar las dos
  env de pago usadas para cálculo).
- **Frontend:** `client/app/seller/publish/page.js`, `client/app/orders/page.js`,
  `client/app/admin/authors/[id]/edit/page.js`,
  `client/app/admin/authors/[id]/page.js` (mostrar tasas), `client/lib/api.js`
  (nueva función `getCommissionRates`, campos en admin authors API).
- **Infra/config:** retirar 4 env vars de `.env.example` (×3), `docker-compose
  .prod.yml`, `docker-compose.pre2.yml`, `docker-compose.m1.yml`,
  `client/Dockerfile.staging`, `client/Dockerfile.prod`.

## Non-goals

- No se almacena ni expone el porcentaje que se queda el artista (se deriva como
  `100 - comisión` solo a efectos de cálculo).
- No se versiona históricamente la comisión: `art_order_items.commission_amount`
  y `other_order_items.commission_amount` siguen guardando el **importe**
  congelado en el momento de la venta; cambiar la tasa de un vendedor no
  recalcula ventas pasadas.
- No se añaden comisiones por producto individual ni por categoría más fina que
  `art` / `other`.
- No se cambia el régimen fiscal (REBU / IVA general) ni las tasas de IVA.
