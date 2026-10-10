# 2. Ejecutar `ANALYZE` en la base de datos de producción

**Para qué:** que SQLite busque los códigos postales por su índice correcto. Así la consulta de zonas de envío lee unas 100 veces menos filas, sin desplegar nada. Es un parche inmediato: el arreglo definitivo es el cambio `fix-zone-resolver-row-reads`, que deja de depender de esto.

**Dónde:** en **tu ordenador**, en una terminal. El CLI de Turso ya está instalado en `~/.turso/turso` (versión 1.0.31).

**Base de datos:** `140d`, la de producción. No `140d-pre`.

**Qué hace `ANALYZE postal_codes`:**

- Recorre una vez la tabla `postal_codes` y sus dos índices. Son unas 115.000 lecturas, una sola vez: lo que hoy cuestan unas 2 consultas de envío.
- Guarda el resultado en la tabla interna `sqlite_stat1`. Con eso, el planificador sabe que un código postal tiene unas 4 filas y una provincia unas 729, y deja de elegir el índice de provincia.
- Solo afecta a las consultas sobre `postal_codes`: el resto de tablas no se analiza.
- Las estadísticas no caducan en la práctica, porque `postal_codes` no cambia.
- No afecta a los backups: el volcado ignora las tablas `sqlite_*` (`api/services/dbDumpService.js`).

**Cómo deshacerlo:** paso 7.

---

## Paso 1. Comprobar que el CLI responde

```bash
turso --version
```

Debe decir `turso version v1.0.31` o una posterior.

Si dice `command not found`, añádelo al PATH de esta terminal y repite:

```bash
export PATH="$HOME/.turso:$PATH"
turso --version
```

## Paso 2. Comprobar que tienes la sesión iniciada

```bash
turso auth whoami
```

Si muestra tu usuario, pasa al paso 3. Si da error:

```bash
turso auth login
```

Se abre el navegador para que entres con tu cuenta de Turso. Si no se abre, usa `turso auth login --headless` y sigue las instrucciones de la terminal.

## Paso 3. Confirmar el nombre de la base de datos

```bash
turso db list
```

Deben aparecer `140d` y `140d-pre`. Todo lo que sigue va contra **`140d`**.

## Paso 4. Ver el plan actual (antes)

```bash
turso db shell 140d "EXPLAIN QUERY PLAN SELECT 1 FROM postal_codes WHERE postal_code = '28001' AND country = 'ES' AND province = 'Madrid';"
```

`EXPLAIN QUERY PLAN` no lee ninguna fila: solo dice qué índice usaría. Hoy debe responder algo como:

```
SEARCH postal_codes USING INDEX idx_postal_codes_province_country (province=? AND country=?)
```

Ese es el índice malo: recorre todos los códigos de la provincia.

## Paso 5. Ejecutar `ANALYZE`

```bash
turso db shell 140d "ANALYZE postal_codes;"
```

No muestra nada si va bien. Tarda unos segundos.

## Paso 6. Comprobar que ha funcionado

Primero, las estadísticas guardadas:

```bash
turso db shell 140d "SELECT * FROM sqlite_stat1;"
```

Deben salir dos filas parecidas a estas (los números exactos pueden variar):

```
postal_codes  idx_postal_codes_province_country  37867 729 729
postal_codes  idx_postal_codes_code_country      37867 4 4
```

Después, repite el plan del paso 4:

```bash
turso db shell 140d "EXPLAIN QUERY PLAN SELECT 1 FROM postal_codes WHERE postal_code = '28001' AND country = 'ES' AND province = 'Madrid';"
```

Ahora debe decir:

```
SEARCH postal_codes USING INDEX idx_postal_codes_code_country (postal_code=? AND country=?)
```

Por último, al día siguiente, mira en el dashboard de Turso **Top Queries → Today**. La consulta `SELECT DISTINCT sm.id, …` debe haber bajado de ~654K filas leídas de media a unos pocos miles. Mira el día siguiente y no el mismo día: la media de «Today» mezcla las llamadas de antes del `ANALYZE`.

## Paso 7 (solo si quisieras deshacerlo)

```bash
turso db shell 140d "DROP TABLE sqlite_stat1;"
```

Borra las estadísticas y SQLite vuelve a planificar como antes.

---

## Alternativa: la shell interactiva

Si prefieres escribir las sentencias una a una:

```bash
turso db shell 140d
```

Dentro, escribe cada sentencia terminada en `;` y pulsa Intro. Por ejemplo `ANALYZE postal_codes;`. Para salir, `.quit`.
