# Lecturas de Turso: incidente de octubre de 2026

Entre el 6 y el 10 de octubre de 2026, la base de datos de producción (`140d`) leyó **~2,9 mil millones de filas**. El plan Developer incluye 2.500 millones al mes. Casi todo el exceso vino de **una sola consulta**: la del resolvedor de zonas de envío (`api/services/shipping/zoneResolver.js`), que leía unas 654.000 filas por llamada.

## Qué pasó

```
1 cotización de envío (una obra, un código postal)
   └─ leía TODAS las zonas del vendedor          ← no filtraba por obra
        └─ y en cada zona, TODOS los códigos      ← índice de provincia en vez
           postales de cada provincia               del de código postal
   = ~654.000 filas

1 generación del catálogo de los feeds (Google + Meta)
   = cada obra × 4 grupos de zona = ~90 cotizaciones
   = ~55–60 millones de filas

Meta leyendo el feed cada hora  → ~24 generaciones/día → ~1.200 millones/día
```

El coste por cotización crecía con el número de obras, y el número de cotizaciones también. Por eso crecía con el cuadrado del catálogo. El defecto existía desde la calculadora de envíos (agosto de 2026), pero solo lo activaban compradores sueltos. Los feeds lo volvieron masivo.

## Guías

| | Guía | Dónde se ejecuta |
|---|---|---|
| 1 | [Quién ha leído los feeds y cuántas veces](01-quien-lee-los-feeds.md) | Servidor de producción (EC2) |
| 2 | [Ejecutar `ANALYZE` en producción](02-analyze-en-turso.md): parche inmediato, sin desplegar | Tu ordenador, con el CLI de Turso |

## El arreglo definitivo

El cambio OpenSpec `fix-zone-resolver-row-reads`:

- **Consulta solo las zonas de la obra cotizada.** El resultado es el mismo: las de otras obras ya se descartaban después.
- **Resuelve el destino una sola vez**, con una búsqueda por código postal. Así la consulta de zonas no vuelve a cruzar con `postal_codes` y no depende de qué índice elija SQLite.

Hay un test que comprueba el plan de consulta, para que no vuelva a pasar en silencio.

Medido en local sobre el `ES.csv` real, con 22 obras × 4 grupos × 2 opciones (176 zonas del vendedor):

| | Antes | Después |
|---|---|---|
| Tiempo por cotización | 52–82 ms | ~0,09 ms |
| Zonas que devuelve la consulta | 44 (de todas las obras) | 2 (solo de la obra cotizada) |
| Filas leídas por cotización (estimado) | ~650.000 | unos cientos |
| Filas por generación del catálogo (~90 cotizaciones) | ~55–60 millones | unas decenas de miles |

**Cómo comprobarlo tras el despliegue:** en Turso, **Top Queries → Today**, la consulta `SELECT DISTINCT sm.id, …` debe bajar de ~654K a cientos de filas leídas de media. Ya no tiene `JOIN postal_codes`, y en su lugar lleva `IN (?)`. El total diario de la base debería quedar en unos pocos millones.

## Datos útiles

- **Plan Developer de Turso:** 2.500 millones de lecturas al mes. Los overages están activados desde el 10/10/2026 y el exceso se cobra a 1 $ por cada 1.000 millones.
- **Si vuelve a subir el consumo:** en el dashboard, **Top Queries** ordenado por *Rows read* dice qué consulta es. Multiplicando *Queries* por *Rows read (avg)* se obtiene el total.
- **Diferencia con el repositorio:** en producción, `postal_codes` guarda los códigos con cero inicial (`07001`). El `api/migrations/ES.csv` del repositorio los tiene sin él (`7001`). Una base nueva importada desde ese CSV no encontraría los códigos de las provincias 01 a 09. No afecta a producción.
