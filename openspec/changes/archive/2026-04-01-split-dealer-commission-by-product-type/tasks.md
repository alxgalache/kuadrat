## 1. Backend: Configuracion de entorno

- [x] 1.1 Reemplazar `dealerCommission` por `dealerCommissionArt` y `dealerCommissionOthers` en `api/config/env.js` (secccion `payment`)
- [x] 1.2 Actualizar `api/.env.example`: reemplazar `DEALER_COMMISSION=15` por `DEALER_COMMISSION_ART=15` y `DEALER_COMMISSION_OTHERS=15`

## 2. Backend: Calculo de comision en creacion de pedidos

- [x] 2.1 En `api/controllers/ordersController.js`, reemplazar el calculo unico `dealerCommissionRate` (linea ~445) por dos tasas: `dealerCommissionRateArt` (de `config.payment.dealerCommissionArt`) y `dealerCommissionRateOthers` (de `config.payment.dealerCommissionOthers`)
- [x] 2.2 Aplicar `dealerCommissionRateArt` en el loop de `artItems` (linea ~449) y `dealerCommissionRateOthers` en el loop de `othersItems` (linea ~483)

## 3. Backend: Endpoint wallet del seller

- [x] 3.1 En `api/routes/sellerRoutes.js` (linea ~373), reemplazar `commissionRate: config.payment.dealerCommission` por `commissionRateArt: config.payment.dealerCommissionArt` y `commissionRateOthers: config.payment.dealerCommissionOthers`

## 4. Backend: Bug fix del confirmationScheduler

- [x] 4.1 En `api/scheduler/confirmationScheduler.js`, modificar la query de `art_order_items` (linea ~24) para incluir `aoi.commission_amount` en el SELECT
- [x] 4.2 Modificar la query de `other_order_items` (linea ~36) para incluir `ooi.commission_amount` en el SELECT
- [x] 4.3 Cambiar la acreditacion al seller (linea ~66) para usar `(price_at_purchase - commission_amount)` en lugar de `price_at_purchase` solo

## 5. Frontend: Variables de entorno del cliente

- [x] 5.1 Actualizar `client/.env.example`: reemplazar `NEXT_PUBLIC_DEALER_COMMISSION=15` por `NEXT_PUBLIC_DEALER_COMMISSION_ART=15` y `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS=15`

## 6. Frontend: Texto de comision en Monedero

- [x] 6.1 En `client/app/orders/page.js` (linea ~530), reemplazar el texto de comision unica por uno que muestre ambas tasas usando `NEXT_PUBLIC_DEALER_COMMISSION_ART` y `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` (ej: "Se aplica una comision del X% en obras de arte y del Y% en otros productos sobre el total de las transacciones realizadas.")

## 7. Infra: Docker y Dockerfiles

- [x] 7.1 En `docker-compose.m1.yml`, reemplazar `NEXT_PUBLIC_DEALER_COMMISSION` por `NEXT_PUBLIC_DEALER_COMMISSION_ART` y `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`
- [x] 7.2 En `docker-compose.pre2.yml`, reemplazar `NEXT_PUBLIC_DEALER_COMMISSION` por `NEXT_PUBLIC_DEALER_COMMISSION_ART` y `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`
- [x] 7.3 En `client/Dockerfile.staging`, reemplazar el ARG/ENV `NEXT_PUBLIC_DEALER_COMMISSION` por `NEXT_PUBLIC_DEALER_COMMISSION_ART` y `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`
