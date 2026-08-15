# Design: art-limited-editions

## Context

Hoy la unicidad de una obra `art` vive en un único punto: el flag `is_sold`, usado a la vez como "reservada" y "vendida". Todo lo posterior a la reserva ya es multi-pedido: `art_order_items` no tiene restricción de unicidad sobre `art_id` y cada línea lleva snapshots propios (`price_at_purchase`, `vat_regime`, `commission_amount`, envío). De hecho ya existen varios items para el mismo `art_id` (pedido expirado → liberado → revendido). Los puntos que tocan inventario de arte son exactamente cuatro:

1. **Reserva en checkout** — `ordersController.placeOrder` (batch atómico `SET is_sold = 1 WHERE is_sold = 0`, con rollback).
2. **Liberación** — `inventoryService.releaseOrderInventory` (pago fallido/expirado/cancelado; `SET is_sold = 0`).
3. **Vía legacy de verificación de pago** — `ordersController.verifyPayment` (~línea 2877): re-marca `is_sold = 1` incondicionalmente sobre arte ya reservado (redundante pero inofensivo por ser idempotente).
4. **Adjudicación de subasta** — `auctionScheduler.processAuctionEnd` (`SET is_sold = 1` incondicional por puja ganadora). La facturación de subasta y la de sorteo (`billParticipation`) crean pedido+item pero **no tocan inventario**; los productos de subasta/sorteo se ocultan de la galería solo por `for_auction`/`for_draw`.

En el plano NFC, `nfc_tags` ya soporta N etiquetas por obra (PK `uid`, `art_id` no único); la regla "una etiqueta activa por obra" es un guard del script `personalize.js`, no del esquema. `draws.units` ya existe (default 1) pero no se aplica en ninguna validación ni en la facturación.

## Goals / Non-Goals

**Goals:**

- Representar tiradas de N ejemplares con **una sola fila `art`** (URL única, ficha única, ventas concurrentes).
- Compatibilidad total hacia atrás: con `edition_size = 1` el sistema se comporta bit a bit como hoy; ningún lector de `is_sold` cambia.
- Consumo de ejemplares consistente en los tres canales de venta (checkout, sorteo, subasta).
- 15 certificados físicos verificables e independientemente revocables para una misma obra, con número de ejemplar visible en `/coa`.
- Cierre del hueco preexistente de sorteos: no poder facturar más ganadores que `units`.

**Non-Goals:**

- Selector de cantidad o stock visible para arte (el carrito sigue limitado a 1 ejemplar por obra).
- Bloquear la recompra de otro ejemplar por el mismo usuario en pedidos sucesivos (aceptado explícitamente).
- Modificar `edition_size` tras la creación (inmutable; ampliaciones de tirada quedan fuera de alcance).
- Venta simultánea galería + sorteo del mismo producto (`for_draw`/`for_auction` siguen excluyendo de la galería).
- Ediciones para productos `other` (ya tienen stock por variantes).
- Revocación automática de etiquetas NFC en devoluciones.

## Decisions

### D1. Contador en fila única con `is_sold` derivado (opción C)

`art` gana `edition_size INTEGER NOT NULL DEFAULT 1` y `editions_sold INTEGER NOT NULL DEFAULT 0`. `is_sold` pasa a significar "agotada" y se mantiene **en la misma sentencia** que el contador:

```sql
-- Reserva (checkout, facturación de sorteo, adjudicación de subasta)
UPDATE art
SET editions_sold = editions_sold + 1,
    is_sold = CASE WHEN editions_sold + 1 >= edition_size THEN 1 ELSE 0 END
WHERE id = ? AND editions_sold < edition_size

-- Liberación
UPDATE art
SET editions_sold = MAX(editions_sold - 1, 0),
    is_sold = 0
WHERE id = ? AND editions_sold > 0
```

*Por qué:* `rowsAffected = 0` conserva exactamente el contrato actual de detección de conflicto del batch de reserva (mismo patrón que el stock de `other_vars`). Mantener `is_sold` como columna real (no vista/consulta derivada) evita tocar sus ~10 lectores (filtro galería, elegibilidad subastas, dashboard seller, badge vendida). Alternativas descartadas: 15 filas duplicadas (rotación manual, slugs artificiales, enlaces rotos, ventas serializadas); tabla hija de ejemplares (sobra: no hay atributos por ejemplar en el flujo de venta — el ejemplar concreto solo existe físicamente, y en NFC ya lo captura `nfc_tags`).

### D2. Idempotencia: cada camino toca el contador exactamente una vez

El paso de flag idempotente a contador no idempotente es el riesgo central. Regla por camino:

| Camino | Hoy | Nuevo |
|---|---|---|
| `placeOrder` (reserva) | `is_sold = 1` guardado | incremento guardado (única fuente de consumo del checkout) |
| `verifyPayment` legacy | re-marca `is_sold = 1` | **elimina el update de arte** (la reserva ya consumió; el flag ya está correcto) |
| `releaseOrderInventory` | `is_sold = 0` guardado (`AND is_sold = 1`) | decremento guardado; **una sola vez por pedido** (ver D3) |
| Sorteo `billParticipation` | no toca inventario | incremento guardado **antes** del cobro Stripe; si el cobro falla → decremento (liberación) |
| Subasta `processAuctionEnd` (scheduler) | `is_sold = 1` incondicional | incremento guardado; la facturación de subasta sigue sin tocar inventario |

En el sorteo se consume antes de cobrar (patrón reserva→cobro→liberar-si-falla, igual que el checkout) para que dos facturaciones concurrentes no sobrevendan la edición.

### D3. Guard contra doble liberación

`releaseOrderInventory` hoy es cuasi-idempotente gracias a `AND is_sold = 1`; con contador, dos llamadas para el mismo pedido descontarían dos veces. Guard elegido: marcar la liberación a nivel de pedido con una columna `orders.inventory_released_at DATETIME` — la función hace primero `UPDATE orders SET inventory_released_at = CURRENT_TIMESTAMP WHERE id = ? AND inventory_released_at IS NULL` y solo procede si `rowsAffected = 1`. *Por qué:* un único punto de entrada (`releaseOrderInventory`) hace el guard trivial y cubre a todos sus llamadores (webhook Stripe, expiración, cancelación) sin depender de que cada uno sea cuidadoso. Alternativa descartada: flag por item (más filas que tocar, mismo efecto).

### D4. `edition_size` inmutable, fijado por el seller al publicar

`POST /api/art` acepta `edition_size` (entero 1–1000, default 1; Zod en `productSchemas.js`). Los endpoints de edición (admin full-update) lo ignoran/rechazan explícitamente y el formulario admin lo muestra en solo lectura. No existe endpoint de edición del seller, así que no hay más superficies. *Por qué:* coherencia con el certificado impreso ("Edición limitada de 15 ejemplares") y con la promesa comercial de tirada fija.

### D5. Sorteos: `units` pasa a aplicarse

- **Validación de creación/edición** (`drawAdminController`/`drawService`): para producto arte, `units ≤ edition_size - editions_sold` en el momento de crear o editar el sorteo. Para `other`, se mantiene el comportamiento actual.
- **Tope de facturación:** `billParticipation` cuenta los pedidos ya facturados del sorteo (por el marcador `draw_participation:%` + `draw_id`, o consulta equivalente sobre pedidos del sorteo) y rechaza con 409 si ya se alcanzó `units`. Además el incremento guardado de la edición actúa de límite físico global.
- El sorteo **no** pre-reserva ejemplares al activarse: el consumo ocurre al facturar cada ganador. Entre la validación de creación y la facturación puede haber ventas por galería solo si `for_draw = 0`; como `for_draw = 1` excluye de la galería, en la práctica no compiten. La facturación puede aun así fallar por edición agotada (p. ej. subasta previa del mismo producto) → 409 con mensaje claro.

### D6. NFC/CoA: la unicidad criptográfica vive en la etiqueta

- `nfc_tags` gana `edition_number INTEGER` (NULL para obras únicas). Columna estructurada en vez de parsear `serial_label`, para que `/coa` y el admin lo rendericen de forma fiable.
- `personalize.js`: el guard "ya tiene tag activo" pasa a "ya tiene `edition_size` tags activos". Para obras con `edition_size > 1` pregunta el número de ejemplar (1..N), rechaza duplicados activos del mismo número y graba `serial_label = GAL-<año>-<artId(4)>-<n>/<N>` (p. ej. `GAL-2026-0042-3/15`). Para obras únicas, comportamiento y serial actuales sin cambios.
- `GET /api/coa/verify` añade `edition_size` (de `art`) y `edition_number` (del tag) a la respuesta OK; `client/app/coa/page.js` muestra "Edición Limitada. Ejemplar n de N". El certificado en papel es único y compartido; la artista numera a mano y el operador registra el mismo número al personalizar.
- Sin cambios criptográficos: cada sticker tiene UID → claves derivadas → contador anti-replay propios; revocación por ejemplar ya soportada por `status` per-uid.

### D7. Presentación

- Ficha pública (`galeria/p/[id]` y respuesta de `artController`): si `edition_size > 1`, texto "Edición limitada de N ejemplares". **No** se muestra el remanente. Texto es-ES en `client/lib/constants.js`.
- Dashboard seller (`sellerRoutes.js`): `total_stock` pasa de `is_sold ? 0 : 1` a `edition_size - editions_sold`.
- ProductForm: campo "Nº de ejemplares de la edición" (default 1) solo en creación.

## Risks / Trade-offs

- **[Contador no idempotente]** Un camino que incremente/decremente dos veces corrompe el inventario silenciosamente. → D2/D3 definen un único punto de consumo por camino + guard `inventory_released_at`; tests dedicados por camino (reserva→verify, doble liberación, sorteo con cobro fallido, subasta+galería).
- **[Sorteo consume antes de cobrar]** Si el cobro falla y la liberación también fallara (crash entre ambos), queda un ejemplar fantasma consumido. → mismo riesgo residual que el checkout actual; la liberación es reintentable manualmente y queda logueada.
- **[Drift `is_sold` vs contador]** Escrituras futuras que toquen solo una de las dos columnas desincronizarían la semántica. → regla de diseño: `is_sold` de arte solo se escribe en las dos sentencias de D1 (y documentado en CLAUDE.md al archivar).
- **[Datos preexistentes]** Filas actuales con `is_sold = 1` deben quedar coherentes (`editions_sold = 1`). → backfill idempotente en `database.js` tras `safeAlter`: `UPDATE art SET editions_sold = 1 WHERE is_sold = 1 AND editions_sold = 0` (con `edition_size = 1` es exactamente la semántica de "agotada").
- **[Tope de facturación por conteo]** Contar pedidos facturados del sorteo es más frágil que un contador dedicado, pero evita otra columna; el límite duro real lo pone el incremento guardado de la edición. → aceptado.
- **[Guard solo en script NFC]** El límite de `edition_size` tags activos se valida en `personalize.js` (único punto de inserción), no en BD. → aceptado, coherente con el diseño actual del subproyecto.

## Migration Plan

1. `safeAlter` de las tres columnas + backfill idempotente de `editions_sold` (D. Risks). Deploy sin downtime: columnas con default no rompen lectores existentes.
2. Backend y frontend en el mismo deploy (los cambios de reserva son internos; la API pública solo **añade** campos).
3. Rollback: revertir código; las columnas quedan inertes (`edition_size = 1` en todas las filas existentes hace que el flujo antiguo siga siendo correcto salvo obras de edición ya publicadas — no publicar tiradas hasta validar en preprod con la artista `aka.alicia@axgalache.me`).

## Open Questions

- Ninguna bloqueante. (Confirmado con el usuario: recompra permitida, subastas/sorteos habilitados para ediciones, sin remanente visible, `edition_size` inmutable, `/coa` muestra "Ejemplar n de N".)
