# Presencia de 140d en Google

Análisis, decisiones y auditoría del 06/10/2026, a raíz del Perfil de Empresa creado en `business.google.com`. Cada guía se lee por separado.

## Decisiones tomadas

- **140d es exclusivamente online**, sin local físico ni atención presencial, tampoco a medio plazo. Por eso **se quita el Perfil de Empresa**: Google no lo permite para negocios solo online, y la categoría «Artista» está expresamente excluida.
- La presencia de marca va por la **vía de tienda online**: Search Console, Merchant Center, perfil de marca y panel de conocimiento. Ninguna de estas superficies lleva mapa.
- **Search Console se queda verificado por DNS**, que es el método más robusto.
- **Merchant Center es la única fuente** de la política de devoluciones y de envío. No se duplican en el JSON-LD.
- **Código aplicado** (pendiente de desplegar): obras a la venta como `Product`, organización solo como `OnlineStore`, y Pinterest y LinkedIn en `sameAs`.

## Plan de acción

| # | Acción | Quién | Guía |
|---|---|---|---|
| 1 | Desplegar con `./deploy/deploy.sh` (purga la caché de nginx, para que las fichas salgan con el JSON-LD nuevo) y comprobarlo con la Prueba de resultados enriquecidos | Tú | 04 |
| 2 | Importar `feed-merchant-center-corregido.csv` en la hoja de Merchant Center y pulsar «Actualizar» | Tú | 05 |
| 3 | Completar en Merchant Center la política de devoluciones (gastos a cargo del cliente) y la de envío (nombre del servicio y precio fijo de seguridad de 70 €) | Tú | 05 |
| 4 | Desvincular el Perfil de Empresa en Merchant Center y después quitarlo, marcado como cerrado permanentemente | Tú | 01 |
| 5 | Responder: ¿ISBN de «El Límite»? ¿Días que tarda cada artista en preparar un envío? ¿Alta en operadores intracomunitarios? | Tú | 05, 04 |
| 6 | Decidir los cambios propuestos 4 (denominación social y CIF en el JSON-LD) y 5 (feed generado desde la base de datos) | Tú → código | 04 |
| 7 | A las 24–48 h del paso 2: capturas de «Políticas de devoluciones» y de «Productos → Requiere atención» | Tú | 05 |
| 8 | Comprobar si aparece «Gestionar este perfil de marca» y, si aparece, reclamarlo y subir el logotipo. Ahora y cada mes | Tú | 03, 02 |
| 9 | Mientras el feed sea una hoja: obra vendida, fuera el mismo día; obra nueva, fila nueva; envío recotizado, columna `shipping` actualizada | Tú, continuo | 03, 05 |
| 10 | Bio de los cinco perfiles sociales con enlace a `https://140d.art` | Tú | 03 |
| 11 | Cada mes, buscar en incógnito `140d`, `140d galería de arte` y `140d.art`, y anotar qué panel sale | Tú | 03 |

## Guías

| Guía | Responde a |
|---|---|
| [01 · Perfil de Empresa](01-perfil-de-empresa.md) | Por qué salía otra galería, por qué 140d no puede tener Perfil de Empresa y cómo quitarlo |
| [02 · Imágenes y mapa](02-imagenes-y-mapa.md) | Por qué se recortaba la imagen de 1200×628, por qué no salía la cuadrada, qué pasa con el mapa y qué imágenes usar |
| [03 · Ruta para tienda online](03-ruta-tienda-online.md) | Estado actual, Search Console, mantenimiento del feed, perfil de marca, panel de conocimiento y seguimiento |
| [04 · Cambios en el código](04-mejoras-codigo.md) | Lo aplicado, lo propuesto y lo descartado en el código, con el porqué |
| [05 · Auditoría de Merchant Center](05-auditoria-merchant-center.md) | Errores encontrados en la hoja y en la cuenta, el CSV corregido y cómo aplicarlo |

## Ficheros de datos

- `Feed de Google Merchant Center_ Products source - Hoja 1.csv`: la exportación original de la hoja (06/10/2026), conservada como referencia de la auditoría.
- `feed-merchant-center-corregido.csv`: la versión corregida, para importar.

Los dos son **fotos de un día** y envejecen con cada venta. Bórralos del repositorio cuando la hoja esté corregida: la fuente de verdad es la hoja o, si se aprueba el cambio 5, la base de datos.

## Lo que no se puede forzar

El perfil de marca está en despliegue y Google decide a qué tiendas se lo abre. El panel de conocimiento se gana con el tiempo y con menciones externas. Mientras no exista ninguno de los dos, una búsqueda que incluya «galería de arte» puede seguir mostrando galerías físicas cercanas. Es el comportamiento normal de la búsqueda local.
