## ADDED Requirements

### Requirement: La adjudicación de subasta consume exactamente un ejemplar
Al terminar una subasta con puja ganadora, el scheduler (`auctionScheduler.processAuctionEnd`) SHALL consumir un ejemplar del producto `art` adjudicado mediante el incremento guardado (`UPDATE art SET editions_sold = editions_sold + 1, is_sold = CASE WHEN editions_sold + 1 >= edition_size THEN 1 ELSE 0 END WHERE id = ? AND editions_sold < edition_size`), en sustitución del marcado incondicional `is_sold = 1` actual. Si `rowsAffected = 0` (edición ya agotada por otro canal), el scheduler SHALL registrar un error estructurado y continuar sin corromper el contador. La facturación posterior de la puja (`auction-bid-billing`) SHALL seguir sin tocar inventario: la adjudicación del scheduler es el único punto de consumo del canal de subastas. El marcado de productos `others` no cambia.

#### Scenario: Subasta adjudicada sobre obra con edición
- **WHEN** termina una subasta con puja ganadora sobre una obra con `edition_size = 15` y `editions_sold = 4`
- **THEN** `editions_sold` pasa a 5 e `is_sold` permanece a 0
- **AND** la obra sigue siendo elegible para futuras subastas (`is_sold = 0`) mientras queden ejemplares

#### Scenario: Subasta adjudicada sobre obra única
- **WHEN** termina una subasta con puja ganadora sobre una obra con `edition_size = 1`
- **THEN** `editions_sold` pasa a 1 e `is_sold` pasa a 1 en la misma sentencia (comportamiento externo idéntico al actual)

#### Scenario: Edición agotada antes de la adjudicación
- **WHEN** termina una subasta cuya obra ya tiene `editions_sold >= edition_size`
- **THEN** el scheduler registra un error estructurado con el `productId` y el `auctionId`
- **AND** el contador no se modifica

#### Scenario: La facturación de la puja no vuelve a consumir
- **WHEN** un admin factura la puja ganadora de una subasta ya adjudicada
- **THEN** se crea el pedido y el item con sus snapshots
- **AND** `editions_sold` e `is_sold` de la obra no se modifican en la facturación
