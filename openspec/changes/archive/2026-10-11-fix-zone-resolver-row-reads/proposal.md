## Why

Entre el 6 y el 10 de octubre de 2026, la base de datos de producción (`140d`) leyó ~2,9 mil millones de filas. El plan Developer de Turso incluye 2.500 millones al mes, y se agotó en seis días.

El dashboard atribuye todo el exceso a una sola consulta: `loadDeliveryZonesForPostalCode` de `api/services/shipping/zoneResolver.js`. Se ejecutó 1.800 veces al día y leyó 653.880 filas de media por llamada (1.800 × 653.880 ≈ 1,18 mil millones, el total del día).

Dos defectos que se multiplican hacen que cada cotización lea tanto:

- **La consulta no filtra por producto.** Evalúa todas las zonas del vendedor (cada obra × 4 grupos × opciones elegidas en la calculadora) y `applyProductPriority` descarta después, en JavaScript, todas menos las de la obra cotizada.
- **SQLite elige el índice equivocado.** La comprobación «¿pertenece este código postal a alguna provincia de la zona?» se planifica con `idx_postal_codes_province_country`. En vez de buscar el código postal (unas 4 filas), recorre todos los códigos de cada provincia. Una zona de península cuesta entre 22.565 y 35.717 filas, medido sobre el `ES.csv` real.

El defecto existe desde que la calculadora de envíos escribe una zona por obra con 47 provincias (agosto de 2026). Solo se notó cuando los feeds de Google Merchant Center y Meta empezaron a cotizar el catálogo entero: obras × 4 grupos de zona por generación, y Meta leía cada hora. El coste por cotización crece con el número de obras del vendedor, y el número de cotizaciones también: crece con el cuadrado del catálogo.

El operador ya pasó Meta a una lectura diaria, pero no basta. Con una o dos generaciones al día seguirían siendo entre 1.700 y 3.400 millones de lecturas al mes. Además, los endpoints públicos que cotizan (`GET /api/shipping/available`, `POST /api/shipping/options`, `POST /api/draws/:id/validate-postal-code`) permiten que cualquiera consuma ~650.000 lecturas por petición.

## What Changes

- **El resolvedor lee solo las zonas del producto cotizado.** Las tres consultas de zonas (recogida, envío con código postal y envío sin él) llevan en el SQL la condición «zona genérica o zona de este producto». Lo que llega a `applyProductPriority` es lo mismo que antes, menos las filas que ya descartaba, así que precios y opciones no cambian.
- **El destino se resuelve una sola vez.** Una búsqueda por `postal_code` (índice `idx_postal_codes_code_country`) obtiene los ids, las provincias y los países de ese código postal. La consulta de zonas los recibe como parámetros y ya no cruza con `postal_codes`, así que no depende de qué índice elija el planificador ni de que haya estadísticas (`ANALYZE`).
- **El predicado de destino tiene nombre.** El resolvedor lo exporta, y `validatePostalCodeForDraw` de `api/services/drawService.js` lo usa en vez de su copia en línea, que tenía el mismo defecto de plan. El sorteo sigue respondiendo solo «¿se puede entregar?», sin precio.
- **Tests de guarda:**
  - Que ninguna consulta del resolvedor use `idx_postal_codes_province_country`, comprobado con `EXPLAIN QUERY PLAN`.
  - Que la consulta de zonas no cruce con `postal_codes`.
  - Que una cotización no lea zonas de otro producto.
- **Tests de semántica:** cubren los cuatro tipos de coincidencia (zona de todo el país, referencia por código postal, por provincia y por país) y el código postal desconocido. Hoy solo está probada la de provincia.
- Sin cambios de esquema, de API ni de cliente.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `shipping-zone-resolution`: nuevo requisito. Resolver una zona lee solo las zonas del producto y resuelve el destino una vez, de modo que el coste de una cotización no crece con el catálogo del vendedor ni depende del planificador. La comprobación de entrega de los sorteos usa el mismo predicado de destino.

## Impact

- **Código:** `api/services/shipping/zoneResolver.js` (consultas y nuevo predicado exportado) y `api/services/drawService.js` (`validatePostalCodeForDraw`).
- **Tests:** un fichero nuevo en `api/tests/`. `shippingCostVerification.test.js` y los tests de los feeds deben seguir pasando sin cambios.
- **Documentación:**
  - `.claude/rules/shipping/zone-resolution.md`: coste de lectura y fin de la copia del predicado en sorteos.
  - `.claude/rules/catalog/merchant-feed.md`: coste de una generación.
  - `docs/turso-lecturas/`: guías del incidente y del `ANALYZE`.
- **Operación:** tras desplegar, la consulta debe bajar en **Top Queries** de Turso de ~654.000 filas por llamada a unos cientos. API y cliente no cambian de contrato, así que no hace falta desplegarlos juntos por este cambio.
- **Fuera de alcance:**
  - La validación de código postal de subastas (`auctionService.js`), que usa otras tablas y se llama poco.
  - El `ES.csv` del repositorio guarda los códigos 01–09 sin cero inicial (`7001`), mientras producción los tiene con él (`07001`). Afecta a bases nuevas, no a producción.
