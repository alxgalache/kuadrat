## 1. Tests de semántica contra el código actual

- [x] 1.1 Crear `api/tests/zoneResolverReadCost.test.js` con fixtures propias: un vendedor con varias obras, zonas de calculadora (referencias `province`) y zonas a mano con referencias `postal_code`, `country` y sin referencias.
- [x] 1.2 Tests del resolvedor para los cuatro tipos de coincidencia: provincia (`28001` sí, `35001` no), código postal (`28001` sí, `08001` no), país (cualquier código `ES` existente), zona de todo el país (también un código ausente de `postal_codes`), y código desconocido (solo zonas sin referencias).
- [x] 1.3 Test de que una zona específica de OTRA obra del mismo vendedor, para el mismo método, no cambia el precio de la obra cotizada.
- [x] 1.4 Tests de `validatePostalCodeForDraw` para provincia, código postal, país y código desconocido.
- [x] 1.5 Ejecutar el fichero contra el código sin cambiar: todo en verde.

## 2. Resolvedor

- [x] 2.1 Añadir `id` al `SELECT` de `loadProduct` y una constante con nombre para el ámbito de producto `(sz.product_id IS NULL OR (sz.product_id = ? AND sz.product_type = ?))`.
- [x] 2.2 Aplicar el ámbito de producto en `loadPickupZones`, `loadDeliveryZonesForPostalCode` y `loadDeliveryZonesForCountry`.
- [x] 2.3 Implementar `resolveDestination(country, postalCode)`: una lectura de `postal_codes` por `postal_code` que devuelve `postalCodeIds`, `provinces` y `countries`, sin duplicados ni nulos.
- [x] 2.4 Implementar `destinationMatch(destination)` → `{ sql, args }`: la rama de todo el país y una rama `EXISTS … IN (…)` por cada conjunto no vacío.
- [x] 2.5 Reescribir `loadDeliveryZonesForPostalCode` sobre `resolveDestination` + `destinationMatch`, sin cruzar con `postal_codes`.
- [x] 2.6 Exportar `resolveDestination` y `destinationMatch` y documentar en el módulo por qué existen (incidente de lecturas de octubre de 2026).

## 3. Sorteos

- [x] 3.1 Sustituir en `validatePostalCodeForDraw` la copia en línea del predicado por `resolveDestination` + `destinationMatch`, conservando su ámbito de vendedor y su `LIMIT 1`.

## 4. Guardas

- [x] 4.1 Test que espía `db.execute` durante una cotización y un `validatePostalCodeForDraw`, ejecuta `EXPLAIN QUERY PLAN` de cada sentencia capturada y falla si algún paso usa `idx_postal_codes_province_country`.
- [x] 4.2 Test de que las sentencias de zonas no contienen `FROM postal_codes` ni `JOIN postal_codes`.
- [x] 4.3 Test de que las filas devueltas por las consultas de zonas son genéricas o del producto cotizado.
- [x] 4.4 Comprobar que las guardas 4.1–4.3 fallan contra el código anterior (`git stash` del resolvedor) y pasan con el nuevo.

## 5. Verificación

- [x] 5.1 Ejecutar la suite completa del API (`docker compose exec api npm test`): todo en verde, sin tocar `shippingCostVerification.test.js` ni los tests de los feeds.
- [x] 5.2 Repetir la simulación local sobre el `ES.csv` real con la consulta nueva y anotar el antes y el después en `docs/turso-lecturas/README.md`.

## 6. Documentación

- [x] 6.1 `.claude/rules/shipping/zone-resolution.md`: punto sobre el coste de lectura (ámbito de producto en SQL, destino resuelto una vez, guarda), y sustituir el punto de la copia deliberada de `drawService`.
- [x] 6.2 `.claude/rules/catalog/merchant-feed.md`: qué cuesta una generación y por qué no se vigila en el feed sino en el resolvedor.
- [x] 6.3 Ejecutar `node scripts/check-claude-rules.mjs`.
