## 1. Fix stripe_customer_id en participación de sorteos

- [x] 1.1 Modificar `drawsAPI.confirmPayment` en `client/lib/api.js` (línea 1388) para aceptar un cuarto parámetro `customerId` y enviarlo en el body de la petición `{ setupIntentId, customerId }`
- [x] 1.2 Modificar `DrawParticipationModal.js` (función `handlePaymentSuccess`, línea 283) para pasar `stripeCustomerId` del state a `drawsAPI.confirmPayment` como cuarto argumento

## 2. Módulo Socket.IO para sorteos (backend)

- [x] 2.1 Crear `api/socket/drawSocket.js` con funciones `setupDrawSocket(io)`, eventos `join-draw` / `leave-draw`, y helper `broadcastDrawEnded(drawId)` que emite `draw_ended` a room `draw:<drawId>`
- [x] 2.2 Registrar el módulo drawSocket en `api/server.js`: importar, inicializar con `setupDrawSocket(io)`, y establecer `app.set('drawSocket', drawSocket)` junto a los otros módulos socket existentes

## 3. Broadcast draw_ended en el scheduler

- [x] 3.1 Modificar `api/scheduler/auctionScheduler.js` (sección de sorteos, líneas ~70-84): tras `drawService.endDraw(draw.id)`, obtener `drawSocket` via `app.get('drawSocket')` y llamar a `drawSocket.broadcastDrawEnded(draw.id)`

## 4. Hook useDrawSocket (frontend)

- [x] 4.1 Crear `client/hooks/useDrawSocket.js` análogo a `useAuctionSocket.js`: conexión socket, join/leave room `draw:<drawId>`, escucha de `draw_ended`, countdown con intervalo de 1s cuando `endDatetime - now < 12h`, y failsafe client-side al llegar a 0. Expone `{ drawEnded, timeRemaining }`

## 5. Cuenta atrás y estado draw_ended en DrawDetail.js

- [x] 5.1 Integrar `useDrawSocket` en `client/app/eventos/sorteo/[id]/DrawDetail.js`: obtener `drawEnded` y `timeRemaining` del hook
- [x] 5.2 Mostrar countdown (hh:mm:ss) debajo del bloque de fecha de finalización (después de línea 207) cuando `timeRemaining` está activo (< 12h)
- [x] 5.3 Desactivar botón de participación y mostrar mensaje "El sorteo ha terminado" cuando `drawEnded` sea `true`

## 6. Auto-cierre del DrawParticipationModal

- [x] 6.1 Añadir prop `drawEnded` a `DrawParticipationModal.js` y pasarla desde `DrawDetail.js`
- [x] 6.2 Implementar useEffect en `DrawParticipationModal.js` que cierre el modal cuando `drawEnded` cambie a `true`, análogo al comportamiento de `BidModal.js` con `auctionEnded`

## 7. Endpoint admin: Finalizar sorteo

- [x] 7.1 Añadir función `finishDraw(drawId)` en `api/services/drawService.js` que verifique status `active` y cambie a `finished`, y emita broadcast `draw_ended` via socket
- [x] 7.2 Añadir endpoint handler `finishDraw` en `api/controllers/drawAdminController.js` que llame al servicio y devuelva success
- [x] 7.3 Añadir ruta `POST /:id/finish` en `api/routes/admin/drawRoutes.js`
- [x] 7.4 Añadir método `finishDraw(id)` en `adminAPI.draws` de `client/lib/api.js`

## 8. Endpoint admin: Listar participaciones

- [x] 8.1 Añadir función `getDrawParticipationsWithDetails(drawId)` en `api/services/drawService.js` que haga JOIN de `draw_participations`, `draw_buyers`, `draw_authorised_payment_data` y devuelva los datos completos de cada participación, incluyendo si ya ha sido facturada (EXISTS en orders con notes = 'draw_participation:<id>')
- [x] 8.2 Añadir endpoint handler `getParticipations` en `api/controllers/drawAdminController.js` que verifique status `finished` y llame al servicio
- [x] 8.3 Añadir ruta `GET /:id/participations` en `api/routes/admin/drawRoutes.js`
- [x] 8.4 Añadir método `getParticipations(drawId)` en `adminAPI.draws` de `client/lib/api.js`

## 9. Endpoint admin: Facturar participación

- [x] 9.1 Añadir función `getParticipationBillingData(participationId)` en `api/services/drawService.js` que haga JOIN de `draw_participations`, `draw_buyers`, `draw_authorised_payment_data`, `draws` y devuelva todos los datos necesarios para crear el pedido
- [x] 9.2 Añadir endpoint handler `billParticipation` en `api/controllers/drawAdminController.js` con flujo completo: verificar idempotencia (notes = 'draw_participation:<id>'), crear order, crear order_item (art/other según product_type), cobrar via `stripeService.chargeWinnerOffSession`, actualizar status del pedido, enviar email via `sendPurchaseConfirmation`
- [x] 9.3 Añadir ruta `POST /:id/participations/:participationId/bill` en `api/routes/admin/drawRoutes.js`
- [x] 9.4 Añadir validación Zod para el body `{ shippingCost }` en `api/validators/drawSchemas.js`
- [x] 9.5 Añadir método `billParticipation(drawId, participationId, shippingCost)` en `adminAPI.draws` de `client/lib/api.js`

## 10. UI admin: Página detalle de sorteo con participaciones y facturación

- [x] 10.1 Añadir botón "Finalizar sorteo" en `client/app/admin/sorteos/[id]/page.js` visible cuando status es `active`, que llame a `adminAPI.draws.finishDraw(id)` con confirmación previa
- [x] 10.2 Añadir sección de participaciones en la misma página visible cuando status es `finished`: fetch de `adminAPI.draws.getParticipations(id)`, tabla con columnas nombre, email, DNI, últimos 4 dígitos tarjeta, fecha, acción
- [x] 10.3 Implementar botón "Facturar" por fila que abra un modal con input para gastos de envío y botón "Confirmar facturación", con lógica análoga a `client/app/admin/subastas/[id]/page.js` (handleBillBid + handleConfirmBill)
- [x] 10.4 Mostrar indicador "Facturado" (con status del pedido) en las participaciones que ya tengan pedido asociado, desactivando el botón "Facturar"
