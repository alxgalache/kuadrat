# Presencia de 140d en Google

Análisis, decisiones y auditoría del 06/10/2026, a raíz del Perfil de Empresa creado en `business.google.com`. Cada guía se lee por separado.

## Decisiones tomadas

- **140d es exclusivamente online**, sin local físico ni atención presencial, tampoco a medio plazo. Por eso **se quita el Perfil de Empresa**: Google no lo permite para negocios solo online, y la categoría «Artista» está expresamente excluida.
- La presencia de marca va por la **vía de tienda online**: Search Console, Merchant Center, perfil de marca y panel de conocimiento. Ninguna de estas superficies lleva mapa.
- **Search Console se queda verificado por DNS**, que es el método más robusto.
- **Merchant Center es la única fuente** de la política de devoluciones y de envío. No se duplican en el JSON-LD.
- **El feed de Merchant Center se genera desde la base de datos** (`/api/feeds/google-merchant.xml`), no desde una hoja editada a mano.

## Estado a 06/10/2026 (noche)

| Pieza | Estado |
|---|---|
| JSON-LD: obras como `Product`, `OnlineStore`, cinco perfiles en `sameAs`, denominación social, CIF y NIF-IVA | ✔ En producción, comprobado |
| Perfil de Empresa desvinculado de Merchant Center y quitado | ✔ Hecho |
| Feed automático (`/api/feeds/google-merchant.xml`), 42 productos | ✔ En producción, comprobado; es la única fuente principal de Merchant Center |
| Fuente complementaria con el ISBN de «El Límite» | ✔ Creada |
| Devoluciones y envío de la cuenta completados | ✔ Hecho |

## Pendiente

| Cuándo | Acción | Guía |
|---|---|---|
| Ahora | Prueba de resultados enriquecidos (https://search.google.com/test/rich-results) con `https://140d.art/galeria/p/fragil-1` y con `https://140d.art/` | 04 |
| Ahora | Borrar del repositorio los dos CSV de esta carpeta: la fuente de verdad ya es la base de datos | — |
| Ahora | Bio de Instagram, Facebook, X, Pinterest y LinkedIn con enlace a `https://140d.art` | 03 |
| 07–08/10/2026 (24–48 h) | Capturas de «Políticas de devoluciones» y de «Productos → Requiere atención». Comprobar que la fuente se descargó sola esa madrugada y que «El Límite» muestra el GTIN | 05, 06 |
| En 1–2 semanas | Search Console → Mejoras: el informe de productos con las obras como válidas | 04 |
| En 2–4 semanas | Buscar «140d Galería de Arte» en Google Maps (incógnito): no debe salir ninguna ficha de 140d. Si sale, «Sugerir un cambio → Cerrar o quitar» | 01 |
| Cada mes | Con la sesión iniciada, buscar `140d` y ver si aparece «Gestionar este perfil de marca»; si aparece, reclamarlo y subir el logotipo | 03, 02 |
| Cada mes | En incógnito, buscar `140d`, `140d galería de arte` y `140d.art`, y anotar qué panel sale | 03 |
| Si la tienda pasa a modo cotización | Pausar la fuente del feed en Merchant Center: la API no lo sabe | 06 |

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
