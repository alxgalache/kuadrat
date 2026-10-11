## Context

`resolveShippingOptions` (`api/services/shipping/zoneResolver.js`) es la única respuesta a «qué zona de envío aplica» (regla `shipping/zone-resolution.md`). Lo usan:

- la cotización al comprador (`GET /api/shipping/available` y `POST /api/shipping/options`, a través de `cartQuoting` y `legacyProvider`);
- la verificación del coste al pagar (`verifyShippingCosts`);
- y, desde octubre de 2026, los feeds de producto (`productFeedCatalogue.quoteShipping`). Estos cotizan cada producto del catálogo en los cuatro grupos de zona, una vez por generación.

Forma de los datos en producción:

- La calculadora de envíos escribe, por cada obra, grupo y opción elegida, una fila de `shipping_zones` con `product_id` y `zone_group`.
- Cada fila lleva una referencia `province` por cada provincia del grupo: 47 en península, 1 en Baleares, 2 en Canarias y 2 en Ceuta y Melilla.
- Las zonas hechas a mano por el admin pueden llevar referencias `postal_code`, `province` o `country`, o ninguna (zona de todo el país).
- `postal_codes` tiene ~37.900 filas, con dos índices: `(postal_code, country)` y `(province, country)`.

Plan actual de la consulta de envío con código postal, sin `sqlite_stat1`, reproducido en local sobre el `ES.csv` real:

```
SEARCH sz USING INDEX idx_shipping_zones_seller (seller_id=?)       ← todas las zonas del vendedor
CORRELATED SCALAR SUBQUERY 4
  SEARCH szpc USING INDEX idx_szpc_zone_ref (shipping_zone_id=? AND ref_type=?)
  SEARCH pc EXISTS USING INDEX idx_postal_codes_province_country (province=? AND country=?)
                                                                     ← todos los códigos de cada provincia
```

Con 22 obras y 2 opciones por grupo, la simulación tarda entre 46 y 76 ms por llamada. Forzando el índice del código postal baja a ~0,5 ms. En producción, Turso mide 340 ms y 653.880 filas por llamada.

## Goals / Non-Goals

**Goals:**
- Que el coste de una cotización dependa de las zonas del producto cotizado, no del catálogo del vendedor.
- Que ese coste no dependa del índice que elija el planificador, ni de que exista `ANALYZE`.
- Mismo resultado observable: mismas opciones, mismos precios y mismos errores en la cotización, la verificación, el proveedor legacy, los feeds y los sorteos.
- Dejar una guarda automática que falle si una consulta vuelve a recorrer `postal_codes` por provincia.

**Non-Goals:**
- Cambiar los feeds: la caché de una hora, la concurrencia o los cuatro grupos se quedan como están. Con el arreglo, una generación cuesta unas decenas de miles de filas.
- Cambiar el esquema, por ejemplo con un índice `(shipping_zone_id, ref_type, ref_value)`. Recorrer las ≤47 referencias de las pocas zonas de un producto es barato.
- La validación de código postal de subastas (`auctionService.validatePostalCode`): otras tablas pivote, ya acotadas por subasta y producto.
- Normalizar los códigos postales sin cero inicial de `api/migrations/ES.csv`.

## Decisions

### 1. Filtrar por producto en el SQL, sin quitar `applyProductPriority`

Las tres consultas de zonas añaden `(sz.product_id IS NULL OR (sz.product_id = ? AND sz.product_type = ?))`. El fragmento es una constante con nombre del módulo, usada en los tres sitios.

`applyProductPriority` se queda tal cual. Su trabajo real es la prioridad (la zona específica gana a la genérica, y la más barata dentro de cada nivel). Su rama de descarte pasa a ser defensiva.

Es equivalente porque las filas que el SQL deja de devolver son exactamente las que esa función descartaba: `product_id` no nulo y distinto del producto, o con otro `product_type`.

El id que se pasa es el de la fila que carga `loadProduct` (se añade `id` a su `SELECT`), no el valor que llega del llamante.

*Alternativa descartada:* dejar el filtro solo en JavaScript. Es justo lo que hace que cada cotización pague las zonas de todo el catálogo.

### 2. Resolver el destino una vez y pasar valores, no subconsultas

`resolveDestination(country, postalCode)` ejecuta `SELECT id, province, country FROM postal_codes WHERE postal_code = ?`. Esa consulta solo puede usar `idx_postal_codes_code_country`, porque es el único índice que empieza por `postal_code`. Con las filas que devuelve se forman tres conjuntos:

| Conjunto | Filas de las que sale | Equivale a la rama antigua |
|---|---|---|
| `postalCodeIds` | las del país de destino | `postal_code`: `pc.postal_code = ? AND pc.country = ?` |
| `provinces` | las del país de destino, sin nulos | `province`: `… AND pc.province = szpc.ref_value` |
| `countries` | todas, sin nulos | `country`: `pc.postal_code = ? AND pc.country = szpc.ref_value`, que no filtraba por el país de destino |

`destinationMatch(destination)` devuelve `{ sql, args }`: un fragmento con la zona de todo el país (`NOT EXISTS` refs) y una rama `EXISTS … IN (…)` por cada conjunto no vacío.

- Un conjunto vacío omite su rama. No se escribe `IN ()`, que es una extensión de SQLite.
- Con los tres vacíos (código desconocido) queda solo la rama de todo el país, igual que antes.

La comparación de igualdad sigue en SQL (`ref_value IN (?)` contra los valores leídos de la propia base), así que la sensibilidad a mayúsculas y la afinidad de tipos no cambian.

*Alternativas descartadas:*
- **`ANALYZE`:** corrige el plan sin tocar código, pero depende de estadísticas que una base nueva, restaurada o de test no tiene, y que nadie vería desaparecer. Se documenta como parche inmediato para producción (`docs/turso-lecturas/02-analyze-en-turso.md`), no como arreglo.
- **`INDEXED BY idx_postal_codes_code_country`:** fija el plan, pero rompe la consulta con error si alguien renombra el índice, y sigue cruzando `postal_codes` una vez por cada referencia de cada zona.
- **Un CTE con el destino dentro de la misma sentencia:** una sola ida y vuelta, pero el planificador vuelve a decidir cómo cruzarlo, que es justo lo que se quiere evitar.

### 3. Los sorteos usan el mismo predicado

`validatePostalCodeForDraw` tenía una copia literal de la rama de destino, con el mismo plan malo. Es un endpoint público que el cliente llama al teclear, con un retardo de 400 ms. Pasa a usar `resolveDestination` + `destinationMatch`.

- Conserva su propio `SELECT 1 … LIMIT 1` y su ámbito: todas las zonas del vendedor para el tipo de artículo, porque responde «¿se puede entregar?», no «¿cuánto cuesta?».
- No se le añade el filtro por producto: cambiaría su respuesta para obras con zonas de otras obras.

Así deja de existir la copia que la regla `zone-resolution.md` documentaba como deliberada.

### 4. Las guardas, en un test propio

`api/tests/zoneResolverReadCost.test.js` espía `db.execute` mientras se resuelve una cotización con varias obras del mismo vendedor. Sobre cada sentencia capturada:

- Ejecuta `EXPLAIN QUERY PLAN` con sus mismos argumentos y comprueba que ningún paso usa `idx_postal_codes_province_country`.
- Comprueba que la sentencia de zonas no contiene `FROM postal_codes` ni `JOIN postal_codes`.
- Comprueba que las filas que devuelven las consultas de zonas son genéricas o del producto cotizado.

El mismo fichero cubre la semántica de los cuatro tipos de coincidencia y la del sorteo, que hoy solo está probada para `province`. Esos tests se escriben **antes** del cambio y deben pasar contra el código actual: son la prueba de que el resultado no cambia.

Se compara contra el nombre del índice y no contra un recuento de filas porque la base local de test no expone las filas leídas. El nombre del índice es exactamente lo que falló.

## Risks / Trade-offs

- **[Una ida y vuelta más a Turso por cotización]** → Es una lectura por índice de ~1–5 filas, frente a las ~650.000 que se ahorran. En recogida no se ejecuta, y en envío sin código postal tampoco.
- **[Un código postal con muchas filas genera listas `IN` largas]** → En `ES.csv`, un mismo código postal tiene como mucho unas decenas de filas (localidades), muy lejos del límite de parámetros de SQLite. Los conjuntos se deduplican.
- **[El filtro por producto cambia el resultado en algún caso límite]** → Los tests de paridad existentes (`shippingCostVerification.test.js`, 30+ casos) y los de los feeds deben pasar sin modificarse. Se añade el caso de una zona específica de otra obra del mismo vendedor para el mismo método.
- **[El planificador elige otro índice para `shipping_zones` con el `OR` de producto]** → El coste de recorrer las zonas del vendedor es de unos cientos de filas como mucho, porque las subconsultas solo se evalúan para las zonas del producto. La guarda no fija ese plan, solo prohíbe el índice malo de `postal_codes`.

## Migration Plan

1. Antes de desplegar, opcional: `ANALYZE postal_codes;` en producción (guía `docs/turso-lecturas/02-analyze-en-turso.md`) para cortar el consumo ya. Es inocuo con el código nuevo.
2. Desplegar la API con `./deploy/deploy.sh`. No hay cambios de esquema ni de contrato con el cliente.
3. Verificar al día siguiente en Turso, **Top Queries → Today**: la consulta de zonas debe bajar de ~654.000 a cientos de filas por llamada, y el total diario de la base a unos pocos millones.
4. **Marcha atrás:** revertir el commit y desplegar. No hay datos que deshacer.

## Open Questions

- Con el arreglo, el operador puede devolver la lectura de Meta a cada hora: el retraso con el que desaparece de Instagram una obra vendida pasa de ~25 h a ~2 h. Es una decisión de producto, fuera de este cambio.
