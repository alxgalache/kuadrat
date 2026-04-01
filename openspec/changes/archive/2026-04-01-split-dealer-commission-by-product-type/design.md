## Context

Actualmente, `DEALER_COMMISSION` es un valor único (float) en `api/config/env.js` que se aplica por igual a productos 'art' y 'others'. El valor se usa en:

1. **Creación de pedido** (`ordersController.js:445`): calcula `commission_amount` para cada item al insertarlo en `art_order_items` / `other_order_items`.
2. **Endpoint wallet** (`sellerRoutes.js:373`): devuelve `commissionRate` al frontend.
3. **Texto informativo** (`client/app/orders/page.js:530`): muestra el porcentaje al seller vía `NEXT_PUBLIC_DEALER_COMMISSION`.
4. **Acreditación al seller**: múltiples puntos en `ordersController.js` calculan `sellerEarning = price - commission_amount` (ya almacenado por item).
5. **Emails**: `emailService.js` calcula ganancias del seller restando `commission_amount`.
6. **Auto-confirmación** (`confirmationScheduler.js`): acredita al seller pero actualmente NO resta la comisión (bug).

El `commission_amount` ya se almacena **por item** en la BD, por lo que no hay cambio de esquema necesario. El valor correcto simplemente se calcula con la tasa apropiada al momento de crear el pedido.

## Goals / Non-Goals

**Goals:**
- Permitir configurar porcentajes de comisión diferentes para productos 'art' y 'others'
- Aplicar la tasa correcta al calcular `commission_amount` en la creación de pedidos
- Informar al seller de ambas tasas en la UI
- Corregir el bug del `confirmationScheduler.js` que no descuenta comisión

**Non-Goals:**
- Comisiones por vendedor individual (sigue siendo global por tipo de producto)
- Migrar pedidos históricos (los `commission_amount` ya almacenados son correctos para su momento)
- Cambiar el esquema de BD (no se necesita)

## Decisions

### 1. Dos variables de entorno con sufijo `_ART` / `_OTHERS`

**Decisión:** Reemplazar `DEALER_COMMISSION` por `DEALER_COMMISSION_ART` y `DEALER_COMMISSION_OTHERS` en el backend, y `NEXT_PUBLIC_DEALER_COMMISSION` por `NEXT_PUBLIC_DEALER_COMMISSION_ART` y `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` en el frontend.

**Alternativa considerada:** Mantener `DEALER_COMMISSION` para art y solo añadir `_OTHERS`. Descartada porque es menos explícita y puede causar confusión futura.

**Implementación en `env.js`:**
```js
payment: {
  provider: optional('PAYMENT_PROVIDER', 'stripe'),
  vatEs: optionalFloat('TAX_VAT_ES', 0.21),
  dealerCommissionArt: optionalFloat('DEALER_COMMISSION_ART', 0),
  dealerCommissionOthers: optionalFloat('DEALER_COMMISSION_OTHERS', 0),
},
```

### 2. Selección de tasa en la creación del pedido

**Decisión:** En `ordersController.js`, usar dos tasas diferentes:
- `config.payment.dealerCommissionArt / 100` para items del loop `artItems`
- `config.payment.dealerCommissionOthers / 100` para items del loop `othersItems`

Esto es directo porque los loops de art y others ya están separados (líneas 447 y 480).

### 3. Endpoint wallet devuelve dos campos

**Decisión:** El endpoint `GET /api/seller/wallet` devolverá `commissionRateArt` y `commissionRateOthers` como campos separados, eliminando `commissionRate`.

**Alternativa considerada:** Objeto anidado `commission: { art, others }`. Descartada por ser excesivo para solo dos valores y romper con el estilo flat de las respuestas existentes.

### 4. Texto del Monedero muestra ambas tasas

**Decisión:** El texto informativo mostrará: "Se aplica una comisión del X% en obras de arte y del Y% en otros productos sobre el total de las transacciones realizadas."

### 5. Corrección del bug en confirmationScheduler

**Decisión:** Modificar las queries del scheduler para incluir `commission_amount` en el SELECT, y calcular `sellerEarning = price_at_purchase - commission_amount` antes de acreditar, alineándolo con el patrón usado en `ordersController.js`.

## Risks / Trade-offs

- **Breaking change en API wallet**: El campo `commissionRate` desaparece y se reemplaza por `commissionRateArt` + `commissionRateOthers`. → Mitigación: el único consumidor es `client/app/orders/page.js`, que se actualiza en el mismo cambio.
- **Pedidos históricos con comisión calculada con tasa anterior**: → No es un riesgo real: `commission_amount` ya está almacenado por item, los pedidos existentes conservan su valor original.
- **Bug fix del scheduler podría reducir ganancias del seller en auto-confirmaciones futuras**: → Esto es el comportamiento correcto; el bug actual sobre-acredita al seller.

## Migration Plan

1. Añadir las nuevas variables a todos los `.env` (api, client, docker-compose, Dockerfile).
2. Desplegar backend y frontend juntos (cambio coordinado).
3. No hay rollback de datos necesario — los `commission_amount` almacenados no cambian.

## Open Questions

_(ninguna — todas las decisiones están resueltas)_
