# Design — per-seller-commission-rates

## Affected layers
Backend (DB schema, controllers, scheduler, routes, services, validators, env) **and**
Frontend (seller publish, orders/Monedero, admin author view+edit, api client).

## Key facts that shape the design
- `art` y `others` ya tienen `seller_id` (FK a `users`). Cada item de pedido,
  puja y participación de sorteo resuelve trivialmente a su vendedor.
- Los servicios de billing de subasta y sorteo (`auctionService.getBidBillingData`,
  `drawService.getParticipationBillingData`) **ya hacen `JOIN users`** → basta con
  añadir la columna de comisión al SELECT.
- `GET /api/seller/wallet` ya devuelve `commissionRateArt/Others` y
  `client/app/orders/page.js` ya lo consume → cambiar el origen del dato no exige
  tocar el flujo del cliente en esa página más allá de leer del wallet.
- `api/config/database.js` ya combina `CREATE TABLE` (DBs nuevas) con bloques
  `safeAlter('ALTER TABLE ... ADD COLUMN ...')` (DBs existentes). Las columnas
  nuevas deben ir en **ambos** sitios.

## Decisions

### 1. Nombres y semántica de columnas
- `dealer_commission_art REAL NOT NULL DEFAULT 25`
- `dealer_commission_other REAL NOT NULL DEFAULT 10`
- Singular `other` para alinear con el valor del enum `product_type` (`'other'`)
  y con `other_order_items`.
- Se almacena el **porcentaje entero** (25, 10), igual que las env actuales. El
  multiplicador se obtiene dividiendo entre 100 en el punto de uso, exactamente
  como hoy (`/ 100`). Así los cálculos existentes no cambian de forma, solo de
  origen del número.
- Default 25 / 10 = valores actuales de las env → los vendedores existentes y los
  nuevos registros quedan idénticos al comportamiento de hoy (sin sorpresas).

### 2. Resolución de la tasa en checkout (ordersController)
Un carrito puede contener productos de **varios vendedores**. `artProducts` /
`othersProducts` ya se cargan con `SELECT *` (incluye `seller_id`). Plan:
1. Reunir el conjunto de `seller_id` distintos de todos los productos del pedido.
2. Una única query `SELECT id, dealer_commission_art, dealer_commission_other
   FROM users WHERE id IN (...)` → `Map<sellerId, {art, other}>`.
3. Por cada item: `commissionAmount = product.price * (rate(seller, tipo) / 100)`.

Se evita un N+1: una sola query para todos los vendedores del pedido.

### 3. Billing de subasta / sorteo
Añadir `u.dealer_commission_art` y `u.dealer_commission_other` al SELECT de
billing (ya hay `JOIN users u`). El controlador elige la columna por
`data.product_type` (`'other'` → `dealer_commission_other`, resto → `_art`),
sustituyendo `config.payment.dealerCommission*`. Mantener el redondeo actual
`Math.round(x * rate * 100) / 100`.

### 4. Crédito de eventos (eventCreditScheduler)
El evento tiene un anfitrión (host = vendedor). `creditEvent(event)` debe resolver
la comisión `other` del host. Cargar `dealer_commission_other` del host (vía la
query que ya obtiene el evento, o un SELECT puntual por `event.user_id`/host id) y
usarla en lugar de `config.payment.dealerCommissionOthers`. El resto del cálculo
(`computeStandardVat`) no cambia.

### 5. Exposición al cliente (sin env)
- **Monedero** (`orders/page.js`): usa `commissionRateArt/Others` que ya devuelve
  `getWallet()`; el endpoint pasa a leerlos de la fila del usuario.
- **Publicación** (`seller/publish/page.js`): necesita las tasas del vendedor para
  la vista previa. Se añade `GET /api/seller/commission-rates` (auth + seller) que
  devuelve `{ commissionRateArt, commissionRateOther }` del usuario autenticado, y
  la página lo consume al montar. Se prefiere un endpoint dedicado (ligero, sin
  query de balance) frente a reusar `getWallet()`.
- **Por qué no meterlo en el objeto `user`/JWT:** el cliente guarda el `user` del
  login y no hay endpoint `/me`; con JWT de 7 días, una comisión editada por el
  admin no se reflejaría hasta re-login. Servir las tasas desde la API en cada
  carga evita ese desfase.

### 6. UI admin
`PUT /api/admin/authors/:id` añade `dealer_commission_art` y
`dealer_commission_other` al `UPDATE users` y al SELECT de respuesta; el `GET` del
autor también los devuelve. La pantalla de edición añade dos inputs numéricos
(`%`, paso 0.01, rango 0–100) con validación Zod en el backend. Texto es-ES.

### 7. Historicidad
`commission_amount` (importe) se sigue congelando por item/pedido en el momento de
la venta. Cambiar la tasa de un vendedor **no** recalcula ventas pasadas; solo
afecta a ventas futuras. Es el comportamiento actual y el deseado.

## Risks
- **Migración de DBs existentes:** imprescindible el `safeAlter` para staging/prod;
  sin él, las columnas no existirían en la tabla `users` ya creada y los SELECT/
  UPDATE fallarían. (Alto riesgo: toca esquema compartido.)
- **Puntos de cálculo dispersos (4):** olvidar uno deja una comisión global oculta.
  La verificación debe cubrir checkout, subasta, sorteo y eventos.
- **Coherencia env:** retirar las `NEXT_PUBLIC_*` exige tocar los 4 sitios del
  pipeline de build (env.example, Dockerfiles, docker-compose) o se enviaría un
  valor vacío; aquí se eliminan por completo, así que el riesgo es dejar
  referencias colgando que rompan el build de docker-compose (variable indefinida).
