## Context

Los sorteos (Draws) comparten modelo de datos y flujo de participación con las subastas (Auctions): un comprador se registra con datos personales, direcciones de entrega y facturación, autoriza un método de pago vía Stripe SetupIntent, y queda inscrito. Sin embargo, los sorteos carecen de la infraestructura de tiempo real (Socket.IO), cuenta atrás, cierre automático del modal, finalización manual por admin, y el flujo de facturación para convertir participaciones en pedidos.

### Estado actual

- **Scheduler**: `auctionScheduler.js` ya gestiona el ciclo de vida de sorteos (líneas 54-84): inicia sorteos programados y finaliza sorteos activos cuya fecha ha pasado. Pero **no emite eventos socket** al finalizar un sorteo.
- **Socket.IO**: Existe `auctionSocket.js` y `eventSocket.js`, pero no existe ningún módulo para sorteos.
- **Frontend DrawDetail.js**: Muestra estado del sorteo y botón de participación, pero no tiene cuenta atrás ni conexión socket.
- **DrawParticipationModal.js**: Flujo completo de 7 fases (TERMS → PERSONAL → DELIVERY → INVOICING → PAYMENT → CONFIRM → SUCCESS), pero no se cierra cuando el sorteo termina.
- **Admin sorteos page**: Solo edición de campos y botones Iniciar/Cancelar. No tiene Finalizar, listado de participaciones, ni facturación.
- **Bug `stripe_customer_id`**: `drawsAPI.confirmPayment` en `client/lib/api.js` (línea 1388) acepta 3 parámetros `(drawId, drawBuyerId, setupIntentId)` pero **no envía `customerId`**. El backend lo espera en `req.body.customerId` (línea 204 de `drawController.js`) y lo guarda en `draw_authorised_payment_data`. El dato queda vacío, impidiendo cobros off-session.

### Referencia de subastas

El cambio archivado `2026-04-12-auction-fixes-and-billing` y el spec `auction-bid-billing` definen el flujo equivalente para subastas que se replica aquí.

## Goals / Non-Goals

**Goals:**
- G1: Corregir el almacenamiento de `stripe_customer_id` en `draw_authorised_payment_data` para permitir cobros off-session.
- G2: Implementar módulo Socket.IO para sorteos con eventos `draw_ended`, rooms `draw:<id>`, y helper `broadcastDrawEnded`.
- G3: Añadir cuenta atrás visible en `DrawDetail.js` cuando falten < 12 horas para el fin del sorteo, con desactivación automática del botón al expirar.
- G4: Cerrar automáticamente `DrawParticipationModal.js` cuando el sorteo finaliza durante el registro, mostrando mensaje de error.
- G5: Endpoint admin `POST /api/admin/draws/:id/finish` para finalizar manualmente un sorteo (status → finished).
- G6: Endpoint admin `GET /api/admin/draws/:id/participations` que devuelve participaciones con datos completos de buyer y pago.
- G7: Endpoint admin `POST /api/admin/draws/:id/participations/:participationId/bill` que genera pedido, cobra vía Stripe off-session, y envía email de confirmación al comprador.
- G8: UI admin con listado de participaciones, botón "Facturar" por fila, y modal de gastos de envío, idéntico al flujo de subastas.

**Non-Goals:**
- NG1: Automatización del sorteo (selección de ganador). Se realizará manualmente por el admin fuera de la aplicación.
- NG2: Reembolso automático a participantes no ganadores. Stripe SetupIntent no cobra; solo se cobra al facturar.
- NG3: Notificaciones por email al finalizar el sorteo. Solo se envía email al facturar (como en subastas).
- NG4: Cambios en el esquema de la tabla `draws` (los campos actuales son suficientes).

## Decisions

### D1: Módulo Socket.IO separado (`drawSocket.js`)
**Decisión**: Crear `api/socket/drawSocket.js` como módulo independiente, análogo a `auctionSocket.js`.
**Alternativa descartada**: Reutilizar `auctionSocket.js` con un namespace compartido → rechazada por acoplamiento innecesario entre dominios distintos.
**Rationale**: Cada dominio (subastas, sorteos, eventos) tiene su propio módulo socket, manteniendo separación de responsabilidades. El patrón ya está probado con `auctionSocket.js` y `eventSocket.js`.

### D2: Hook `useDrawSocket.js` con patrón idéntico a `useAuctionSocket.js`
**Decisión**: Crear `client/hooks/useDrawSocket.js` que gestione conexión, join/leave room, y escucha del evento `draw_ended`. Expone `{ drawEnded }` como estado.
**Rationale**: Reutilizar el patrón probado. El hook se conecta al socket existente (misma instancia de Socket.IO), únicamente suscribiéndose a eventos de sorteos.

### D3: Cuenta atrás con umbral de 12 horas
**Decisión**: Mostrar timer countdown debajo de la fecha de fin del sorteo solo cuando `end_datetime - now < 12h`. Intervalo de actualización: 1 segundo.
**Rationale**: Coherencia con subastas. El umbral de 12h evita mostrar cuentas atrás de días/semanas que no aportan urgencia.

### D4: Corrección `stripe_customer_id` — mínimo cambio
**Decisión**: Añadir parámetro `customerId` a `drawsAPI.confirmPayment` en `client/lib/api.js` y pasar `stripeCustomerId` desde `DrawParticipationModal.js` en la llamada a `handlePaymentSuccess`.
**Alternativa descartada**: Recuperar el `customerId` desde el SetupIntent en el backend → requiere llamada extra a Stripe API y el dato ya está disponible en el frontend.
**Rationale**: Replica exactamente la solución aplicada para subastas. El backend ya acepta `customerId` en `req.body` (línea 204 de `drawController.js`) pero el frontend no lo enviaba.

### D5: Flujo de facturación (`billParticipation`)
**Decisión**: Endpoint `POST /api/admin/draws/:id/participations/:participationId/bill` con body `{ shippingCost }`. Flujo:
1. Obtener datos de facturación via `getParticipationBillingData(participationId)`.
2. Verificar idempotencia: comprobar que no existe pedido con `notes = 'draw_participation:<participationId>'`.
3. Crear registro en `orders` con datos personales, direcciones, stripe_customer_id, stripe_payment_method_id.
4. Crear registro en `art_order_items` o `other_order_items` según `draw.product_type`.
5. Cobrar off-session via `stripeService.chargeWinnerOffSession({ customerId, paymentMethodId, amount, currency, metadata })`.
6. Actualizar status del pedido (paid / payment_failed / requires_action).
7. Enviar email confirmación via `sendPurchaseConfirmation()`.
**Rationale**: Réplica exacta del flujo de `billBid` en `auctionAdminController.js` (líneas 612-805).

### D6: Mapeo de campos draw → order
| Origen (draw tables) | Destino (order tables) | Notas |
|---|---|---|
| `draw_buyers.first_name + last_name` | `orders.full_name` | |
| `draw_buyers.email` | `orders.email` | |
| `draw.price + shippingCost` | `orders.total_price` | |
| `draw_buyers.delivery_*` | `orders.delivery_*` | Todos los campos de dirección |
| `draw_buyers.invoicing_*` | `orders.invoicing_*` | Todos los campos de dirección |
| `draw_authorised_payment_data.stripe_customer_id` | `orders.stripe_customer_id` | |
| `draw_authorised_payment_data.stripe_payment_method_id` | `orders.stripe_payment_method_id` | |
| `draw.price` | `art_order_items.price_at_purchase` o `other_order_items.price_at_purchase` | Según `product_type` |
| `draw.product_id` | `art_order_items.art_id` o `other_order_items.other_id` | Según `product_type` |
| `shippingCost` (input admin) | `*_order_items.shipping_cost` | |
| Comisión calculada | `*_order_items.commission_amount` | `price × dealerCommission(Art|Others)` |

### D7: Broadcast `draw_ended` en el scheduler
**Decisión**: Modificar `auctionScheduler.js` para que tras `drawService.endDraw()` llame a `drawSocket.broadcastDrawEnded(draw.id)`, obteniendo `drawSocket` desde `app.get('drawSocket')`.
**Alternativa descartada**: Scheduler separado para sorteos → innecesario dado que ya comparten el scheduler.

### D8: Modal auto-close con prop `drawEnded`
**Decisión**: `DrawDetail.js` pasa prop `drawEnded` a `DrawParticipationModal.js`. Cuando `drawEnded` cambia a `true` y el modal está abierto, se cierra inmediatamente con mensaje de error "El sorteo ha terminado".
**Rationale**: Patrón idéntico al de subastas (`BidModal.js` recibe `auctionEnded`).

## Risks / Trade-offs

- **[Race condition en facturación]** → Mitigación: idempotencia via marker `notes = 'draw_participation:<id>'` en tabla `orders`. Si ya existe, se retorna 409.
- **[Stripe charge falla]** → Mitigación: el pedido se crea con status `payment_failed` y el admin puede reintentar o gestionar manualmente.
- **[Scheduler no emite socket en entornos multi-instancia]** → Mitigación: mismo riesgo que subastas, aceptado para la escala actual (single-instance).
- **[Modal se cierra perdiendo datos del usuario]** → Trade-off aceptado: la experiencia es coherente con subastas. El usuario puede volver a registrarse en otro sorteo.

## Open Questions

Ninguna — todos los puntos han sido clarificados en base al funcionamiento existente de subastas.
