# Presencia de 140d en Google

Análisis, decisiones y auditoría del 06/10/2026, a raíz del Perfil de Empresa creado en `business.google.com`. Cada guía se lee por separado.

## Decisiones tomadas

- **140d es exclusivamente online**, sin local físico ni atención presencial, tampoco a medio plazo. Por eso **se quita el Perfil de Empresa**: Google no lo permite para negocios solo online, y la categoría «Artista» está expresamente excluida.
- La presencia de marca va por la **vía de tienda online**: Search Console, Merchant Center, perfil de marca y panel de conocimiento. Ninguna de estas superficies lleva mapa.
- **Search Console se queda verificado por DNS**, que es el método más robusto.
- **Merchant Center es la única fuente** de la política de devoluciones y de envío. No se duplican en el JSON-LD.
- **El feed de Merchant Center se genera desde la base de datos** (`/api/feeds/google-merchant.xml`), no desde una hoja editada a mano.

## Estado a 06/10/2026

| Pieza | Estado |
|---|---|
| Cambios 1–3 del JSON-LD (obras como `Product`, `OnlineStore`, Pinterest y LinkedIn) | ✔ Desplegados y comprobados en producción |
| Hoja de Merchant Center corregida e importada; devoluciones y envío completados | ✔ Hecho por ti |
| Perfil de Empresa desvinculado de Merchant Center y quitado | ✔ Hecho por ti |
| Cambio 4: denominación social, CIF y NIF-IVA en el JSON-LD | ✔ Implementado, **pendiente de desplegar** |
| Cambio 5: feed automático | ✔ Implementado y con tests (suite completa en verde), **pendiente de desplegar y activar** |
| ISBN de «El Límite» | Pendiente: fuente adicional en Merchant Center (guía 06, paso 4) |
| Seguimiento de Merchant Center (capturas) | Pendiente: a las 24–48 h del cambio de fuente |

## Plan de acción

| # | Acción | Quién | Guía |
|---|---|---|---|
| 1 | Revisar y hacer commit de los cambios; desplegar **API y cliente juntos** con `./deploy/deploy.sh` | Tú | 04, 06 |
| 2 | Abrir el feed en producción y comprobar el enlace del sitio, las imágenes del CDN y el número de productos | Tú | 06 |
| 3 | En Merchant Center: añadir la fuente por URL (diaria, España, español, etiqueta ES), obtenerla y eliminar la fuente de la hoja | Tú | 06 |
| 4 | Fuente adicional con el ISBN de «El Límite» (`9788409871018`, `yes`, categoría 784) | Tú | 06 |
| 5 | Prueba de resultados enriquecidos con una ficha de obra y con la portada | Tú | 04 |
| 6 | A las 24–48 h del paso 3: capturas de «Políticas de devoluciones» y de «Productos → Requiere atención» | Tú | 05 |
| 7 | Comprobar si aparece «Gestionar este perfil de marca» y, si aparece, reclamarlo y subir el logotipo. Ahora y cada mes | Tú | 03, 02 |
| 8 | Bio de los cinco perfiles sociales con enlace a `https://140d.art` | Tú | 03 |
| 9 | Cada mes, buscar en incógnito `140d`, `140d galería de arte` y `140d.art`, y anotar qué panel sale | Tú | 03 |

## Guías

| Guía | Responde a |
|---|---|
| [01 · Perfil de Empresa](01-perfil-de-empresa.md) | Por qué salía otra galería, por qué 140d no puede tener Perfil de Empresa y cómo quitarlo |
| [02 · Imágenes y mapa](02-imagenes-y-mapa.md) | Por qué se recortaba la imagen de 1200×628, por qué no salía la cuadrada, qué pasa con el mapa y qué imágenes usar |
| [03 · Ruta para tienda online](03-ruta-tienda-online.md) | Estado actual, Search Console, mantenimiento del feed, perfil de marca, panel de conocimiento y seguimiento |
| [04 · Cambios en el código](04-mejoras-codigo.md) | Lo aplicado, lo propuesto y lo descartado en el código, con el porqué |
| [05 · Auditoría de Merchant Center](05-auditoria-merchant-center.md) | Errores encontrados en la hoja y en la cuenta, el CSV corregido y cómo aplicarlo |
| [06 · Feed automático](06-feed-automatico.md) | Cómo genera la API el feed, cómo activarlo en Merchant Center y qué tocar para cambiarlo |

## Ficheros de datos

- `Feed de Google Merchant Center_ Products source - Hoja 1.csv`: la exportación original de la hoja (06/10/2026), conservada como referencia de la auditoría.
- `feed-merchant-center-corregido.csv`: la versión corregida, para importar.

Los dos son **fotos de un día** y envejecen con cada venta. Bórralos del repositorio cuando el feed automático esté activo: a partir de entonces la fuente de verdad es la base de datos.

## Lo que no se puede forzar

El perfil de marca está en despliegue y Google decide a qué tiendas se lo abre. El panel de conocimiento se gana con el tiempo y con menciones externas. Mientras no exista ninguno de los dos, una búsqueda que incluya «galería de arte» puede seguir mostrando galerías físicas cercanas. Es el comportamiento normal de la búsqueda local.
