## Why

Los sorteos (Draws) carecen de funcionalidades críticas presentes en las subastas (Auctions): no tienen cuenta atrás en tiempo real, no emiten eventos Socket.IO al finalizar, el modal de participación no se cierra si el sorteo termina durante el registro, el admin no puede finalizar manualmente un sorteo ni facturar participaciones. Además, el campo `stripe_customer_id` no se almacena en `draw_authorised_payment_data`, lo que impide realizar cobros off-session. Este cambio equipara los sorteos con la infraestructura ya probada en subastas.

## What Changes

- **Corrección del bug de `stripe_customer_id`**: La función `drawsAPI.confirmPayment` del frontend no envía el `customerId` al backend. Se corrige en `client/lib/api.js` y `client/components/DrawParticipationModal.js` para que pase el parámetro, replicando la solución aplicada en subastas.
- **Módulo Socket.IO para sorteos**: Nuevo `api/socket/drawSocket.js` con rooms `draw:<id>`, eventos `draw_ended` y helpers para broadcast. Nuevo hook `client/hooks/useDrawSocket.js` análogo a `useAuctionSocket.js`.
- **Cuenta atrás en `DrawDetail.js`**: Timer visible cuando faltan menos de 12 horas para el fin del sorteo, idéntico al patrón de subastas. Desactivación del botón de participación cuando expira.
- **Cierre automático del modal**: Cuando el sorteo finaliza mientras un usuario está en `DrawParticipationModal.js`, el modal se cierra y se muestra un mensaje de error indicando que el sorteo ha terminado.
- **Broadcast de `draw_ended` en el scheduler**: El scheduler existente (`auctionScheduler.js`) que ya finaliza sorteos ahora también emite el evento `draw_ended` vía `drawSocket`.
- **Endpoint y botón admin "Finalizar sorteo"**: Nuevo endpoint `POST /api/admin/draws/:id/finish` y nuevo `drawAdminController.finishDraw`. Botón visible en la página de edición del sorteo admin (`client/app/admin/sorteos/[id]/page.js`).
- **Listado de participaciones para admin**: Nuevo endpoint `GET /api/admin/draws/:id/participations` que devuelve participaciones con datos de buyer y pago. Se muestra en la página admin del sorteo cuando `status === 'finished'`.
- **Facturación de participaciones**: Nuevo endpoint `POST /api/admin/draws/:id/participations/:participationId/bill` que crea un pedido (`orders` + `art_order_items`/`other_order_items`), cobra off-session vía Stripe (`chargeWinnerOffSession`), y envía email de confirmación al comprador (`sendPurchaseConfirmation`). Incluye modal de gastos de envío en el frontend, idéntico al flujo de subastas.
- **Nueva función de servicio `getParticipationBillingData`**: En `drawService.js`, join de `draw_participations`, `draw_buyers`, `draw_authorised_payment_data` y `draws` con datos de producto, análogo a `getBidBillingData` de subastas.
- **Nuevos métodos API en `client/lib/api.js`**: `adminAPI.draws.finish`, `adminAPI.draws.getParticipations`, `adminAPI.draws.billParticipation`.

## Capabilities

### New Capabilities
- `draw-billing`: Flujo completo de facturación admin para participaciones de sorteos: listado de participaciones, creación de pedido, cobro off-session Stripe, y envío de email de confirmación al comprador.
- `draw-realtime`: Módulo Socket.IO para sorteos con eventos en tiempo real, cuenta atrás en el componente de detalle, cierre automático del modal de participación al finalizar el sorteo, y broadcast de `draw_ended` desde el scheduler.

### Modified Capabilities
- `draw-participation`: Corrección del bug de `stripe_customer_id` que no se enviaba al endpoint `confirm-payment`, impidiendo cobros posteriores.
- `draw-lifecycle`: Adición del endpoint admin "Finalizar sorteo" (`POST /api/admin/draws/:id/finish`) y broadcast de eventos socket al finalizar.

## Impact

### Backend
- **Nuevos ficheros**: `api/socket/drawSocket.js`
- **Ficheros modificados**: `api/server.js` (registrar drawSocket), `api/scheduler/auctionScheduler.js` (broadcast draw_ended), `api/controllers/drawAdminController.js` (finish, getParticipations, billParticipation), `api/services/drawService.js` (getParticipationBillingData, getDrawParticipationsWithDetails), `api/routes/admin/drawRoutes.js` (3 nuevas rutas), `api/controllers/drawController.js` (posible validación adicional en confirmPayment)

### Frontend
- **Nuevos ficheros**: `client/hooks/useDrawSocket.js`
- **Ficheros modificados**: `client/app/eventos/sorteo/[id]/DrawDetail.js` (countdown, socket, drawEnded state), `client/components/DrawParticipationModal.js` (drawEnded prop, auto-close, pasar customerId), `client/lib/api.js` (drawsAPI.confirmPayment + adminAPI.draws nuevos métodos), `client/app/admin/sorteos/[id]/page.js` (botón Finalizar, listado participaciones, modal envío, botón Facturar)

### APIs
- `POST /api/admin/draws/:id/finish` — nuevo
- `GET /api/admin/draws/:id/participations` — nuevo
- `POST /api/admin/draws/:id/participations/:participationId/bill` — nuevo
- `POST /api/draws/:id/confirm-payment` — modificado (recibe `customerId`)

### Dependencias
- No se añaden dependencias nuevas. Se reutilizan Socket.IO, Stripe SDK y Nodemailer ya existentes.
