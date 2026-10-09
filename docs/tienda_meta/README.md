# Tienda de Instagram (Meta) para 140d

Cómo poner las obras de 140d en la tienda de Instagram y Facebook, etiquetarlas en publicaciones, reels y stories, y mantenerlo sin trabajo manual. Cada guía se lee por separado.

- **Estudio de partida:** [Instagram Shopping para 140d Kuadrat estudio y guía práctica.md](Instagram%20Shopping%20para%20140d%20Kuadrat%20estudio%20y%20gu%C3%ADa%20pr%C3%A1ctica.md) (07/10/2026). Sigue siendo válido como explicación general. Algunos puntos los corrige el código real (tabla de abajo).
- **Cambio de código:** `openspec/changes/archive/2026-10-09-meta-instagram-shop/` (propuesta, diseño y tareas), archivado el 09/10/2026. Specs vigentes: `openspec/specs/meta-catalog-feed/`, `openspec/specs/catalog-jpeg-images/` y `openspec/specs/meta-checkout-url/`.

## Decisiones tomadas

- **Meta tiene su propio feed, generado a partir del mismo catálogo que el de Google.** Va en `https://api.140d.art/api/feeds/meta-catalog.xml`. La API decide una sola vez qué se vende y cómo se describe, y escribe dos ficheros con el formato de cada canal. No es una copia del feed de Google: los identificadores, el formato de las imágenes y las variantes de la tienda tienen que ser distintos (guía 02).
- **Los identificadores son los del píxel de Meta** (`art_57`, `other_4_v12`), no los slugs. Así Meta relaciona cada visita y cada compra con su obra.
- **Las fotos llegan a Meta en JPEG cuadrado sobre fondo blanco**, con la obra entera. Meta no acepta WebP, que es el formato de todas las fotos de la web.
- **URL de compra: `https://140d.art/cesta`.** Meta exige una, o la tienda no se ve. Recibe los productos que el comprador eligió en Instagram, los pone en la cesta y abre la compra de la web.
- **Meta lee el feed cada hora.** Una obra vendida desaparece de Instagram en dos horas como mucho. No se usa la API de Meta para avisar al instante, porque añade piezas en el flujo de pago para ahorrar ese margen.
- **No se excluyen obras por canal.** Si Meta rechaza una obra (por ejemplo, por desnudo), se pide revisión (guía 06).
- **Sin cupones.** La web no tiene códigos de descuento: no crees ofertas en Commerce Manager.

## Lo que el estudio decía y lo que es

| El estudio dice… | En realidad… |
|---|---|
| Instalar el píxel de Meta y la API de conversiones (paso 4) | **Ya están instalados**, con consentimiento de cookies. Solo hay que conectarlos al catálogo (guía 03). |
| Verificar el dominio con un TXT en Route 53 | El DNS de 140d.art está en **GoDaddy**, y ya tiene un TXT `facebook-domain-verification`. Probablemente el dominio ya está verificado (guía 01). |
| Piloto con 10–20 obras en una hoja de Google Sheets | **No hace falta.** El feed sale de la base de datos desde el primer día, y la tienda se prueba en vista previa. La hoja de Google Merchant Center demostró los errores que produce editar a mano. |
| El feed de Google sirve para Meta «con cambios mínimos» | No sirve tal cual: identificadores distintos de los del píxel, fotos WebP, `in_stock` en vez de `in stock` y la tienda sin variantes. Lo que sí se reutiliza es el catálogo que lo genera (guía 02). |
| URL de compra `https://140d.art/checkout?products=OBRA-0123:1` | `https://140d.art/cesta?products=art_57:1`. La obra pide elegir el envío en esa página, igual que en su ficha. |
| Combinar el feed horario con la API por lotes | Solo el feed horario. La API por lotes queda como paso futuro. |
| «Los cuatro artistas» | El número de artistas cambia: no lo uses como dato fijo en ningún texto. |

## Estado a 09/10/2026

| Pieza | Estado |
|---|---|
| Píxel de Meta y API de conversiones (conjunto de datos `1057434273433077`) | ✔ En producción |
| TXT `facebook-domain-verification` en GoDaddy | ✔ Existe. Falta comprobar que el dominio figura como verificado en el porfolio (guía 01) |
| Cuentas: porfolio con control total de la página de Facebook y de Instagram | ✗ Pendiente (guía 01). La página está en otra cuenta personal |
| Feed de Meta, fotos JPEG y página `/cesta` | ✔ En producción, comprobado el 09/10/2026: 42 artículos, 52 fotos JPEG de 1600 × 1600 y `/cesta` sin caché. El feed de Google sigue con los mismos 42 `id` |
| Catálogo en Commerce Manager | ✗ Pendiente (guía 03), después del despliegue |
| Tienda y URL de compra | ✗ Pendiente (guía 04) |

## Plan por fases

| Fase | Cuándo | Acción | Guía |
|---|---|---|---|
| 1 | Ahora, sin esperar al código | Ordenar el porfolio, comprobar el dominio y la cuenta profesional, y publicar con regularidad | [01](01-cuentas-y-dominio.md) |
| 2 | Ahora | Implementar el cambio y desplegar API y cliente juntos | [02](02-feed-de-meta.md) |
| 3 | Tras desplegar | Crear el catálogo, conectar el feed horario y el píxel, y revisar el diagnóstico | [03](03-catalogo-commerce-manager.md) |
| 4 | Con el catálogo sin errores | Crear la tienda, configurar `/cesta`, probar en vista previa y enviar a revisión. La revisión puede tardar semanas | [04](04-tienda-y-url-de-compra.md) |
| 5 | Con la tienda aprobada | Activar las compras en Instagram, crear colecciones, etiquetar y medir | [05](05-etiquetar-y-promocionar.md) |
| 6 | Siempre | Revisar el diagnóstico, gestionar rechazos y pausar si la web deja de vender | [06](06-mantenimiento-e-incidencias.md) |

## Guías

| Guía | Responde a |
|---|---|
| [01 · Cuentas y dominio](01-cuentas-y-dominio.md) | Qué tiene que estar en el porfolio empresarial y cómo comprobar el dominio y el píxel |
| [02 · El feed de Meta](02-feed-de-meta.md) | Por qué un feed propio y no el de Google, qué lleva cada obra y cómo comprobarlo |
| [03 · Catálogo en Commerce Manager](03-catalogo-commerce-manager.md) | Crear el catálogo, conectar el feed horario y el píxel, y leer el diagnóstico |
| [04 · Tienda y URL de compra](04-tienda-y-url-de-compra.md) | Crear la tienda, configurar `/cesta`, vista previa, revisión y publicación |
| [05 · Etiquetar y promocionar](05-etiquetar-y-promocionar.md) | Etiquetas, sticker, colecciones, artistas que etiquetan y qué medir |
| [06 · Mantenimiento e incidencias](06-mantenimiento-e-incidencias.md) | Qué es automático, rechazos, modo cotización y qué tocar en el código |

## Direcciones útiles

| Qué | Dónde |
|---|---|
| Feed de Meta | `https://api.140d.art/api/feeds/meta-catalog.xml` (tras desplegar) |
| URL de compra | `https://140d.art/cesta` (tras desplegar) |
| Porfolio empresarial | https://business.facebook.com/settings |
| Commerce Manager | https://business.facebook.com/commerce |
| Administrador de eventos (píxel) | https://business.facebook.com/events_manager |

**Meta cambia a menudo los nombres de sus menús.** Toma las rutas de estas guías como orientativas: si un nombre no coincide, busca la opción equivalente en la misma pantalla.
