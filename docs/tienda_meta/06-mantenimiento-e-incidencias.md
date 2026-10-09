# 06 · Mantenimiento e incidencias

**Para qué:** qué hace solo el sistema, qué queda a mano y cómo resolver los problemas previsibles.

## Qué es automático

| Ocurre en la web… | En Instagram y Facebook… |
|---|---|
| Se aprueba una obra nueva | Aparece en el catálogo, en su conjunto de artista y en las colecciones que lo usan |
| Cambia el precio, el título, la descripción o las fotos | Se actualiza |
| Se vende una obra, o entra en subasta o en sorteo | Sale del catálogo, y sus etiquetas desaparecen |
| Una variante de la tienda se queda sin stock | Sale del catálogo, y vuelve cuando hay stock (pero no recupera las etiquetas antiguas) |

**Retraso:** hasta unas dos horas, porque Meta lee cada hora y la API regenera como mucho cada hora. Si alguien entra desde Instagram a una obra vendida en ese margen, `/cesta` y la ficha le dicen que ya no está disponible, y el pago impide venderla dos veces.

## Qué queda a mano

- Crear el conjunto y la colección de cada **artista nuevo** (guía 05).
- **Etiquetar** las obras en las publicaciones nuevas.
- Revisar el **diagnóstico** del catálogo: cada semana el primer mes y, después, una vez al mes (Commerce Manager → Catálogo → Problemas).

## Obra rechazada (desnudo o contenido «sugerente»)

La revisión de Meta es automática, y a menudo rechaza arte con desnudo o figura humana. La decisión tomada es **no excluir obras de Meta**: se gestionan los rechazos uno a uno.

1. Commerce Manager → Catálogo → **Problemas** → el artículo rechazado → **Solicitar revisión** (o **Solicitar otra revisión**). Una persona revisa la obra. En arte, es frecuente que se apruebe.
2. Si se mantiene el rechazo, el artículo no aparece en la tienda ni se puede etiquetar, pero no afecta al resto del catálogo. Puedes dejarlo así.
3. Último recurso: en la web, **cambia el orden de las fotos** de esa obra y pon primero un detalle o una vista en sala. **Ojo:** la primera foto es la principal en la web, en Google y en Meta a la vez. No hay foto distinta por canal.
4. Si se acumulan muchos rechazos y Meta avisa de que la cuenta puede perder las funciones de compra, se replantea la exclusión por obra (una casilla en el admin). Se dejó fuera para empezar con menos piezas.

En las descripciones, el vocabulario técnico ayuda («estudio de figura», «figura humana»).

## La web deja de vender por un tiempo

Si se desactivan los pagos (`NEXT_PUBLIC_PAYMENT_ENABLED=false`) o la obra pasa a modo cotización (`NEXT_PUBLIC_ART_BUY_AVAILABLE=false`), **la API no lo sabe**, y el feed sigue anunciando las obras como en venta. Mientras tanto, `/cesta` no añade nada a la cesta y enlaza a las fichas.

1. Commerce Manager → Configuración → **Visibilidad de la tienda → Ocultar**.
2. Catálogo → Fuentes de datos → `Feed 140d (API)` → **Pausar** la programación, para que el catálogo no cambie mientras tanto.
3. Al volver a vender, haz lo contrario: reanuda la fuente y muestra la tienda.

## Todos los productos salen «Agotado» en la tienda

Pasó el 09/10/2026, justo después de aprobarse la tienda. En Commerce Manager, cada artículo tenía **cantidad en venta: 0** aunque el feed dijera `in stock`. La tienda de Instagram tiene un carrito propio, y Meta trata como 0 un artículo que no declara cantidad. Desde entonces el feed manda `quantity_to_sell_on_facebook`: 1 en cada obra y el stock real en cada variante.

Si vuelve a pasar:

1. Abre el feed y comprueba que cada `<item>` lleva `<g:quantity_to_sell_on_facebook>` con un número mayor que 0.
2. En Commerce Manager → Catálogo → Fuentes de datos → `Feed 140d (API)` → **Subir ahora**, para no esperar a la lectura horaria.
3. Abre un artículo en **Catálogo → Artículos**: su cantidad en venta debe coincidir con la del feed.

## El feed falla

- Commerce Manager avisa por correo y en **Fuentes de datos** si una lectura falla.
- Abre la URL del feed. Si responde, el fallo fue pasajero: **Subir ahora** en la fuente.
- Si la generación falla en la API, el feed sigue sirviendo la última versión buena. Meta no borra nada por un fallo puntual.
- Si falta un producto concreto, el registro de la API indica el motivo. Los motivos posibles son tres: sin foto, sin envío a ninguna zona o cotización fallida.

## Aviso de Meta: «el producto no coincide con la página de destino»

Meta compara el precio y la disponibilidad del feed con la ficha. Las dos salen de la misma base de datos, así que una discrepancia suele ser el retraso de hasta dos horas tras un cambio de precio. Se corrige sola en la siguiente lectura. Si persiste, compara el `<item>` del feed con la ficha y avisa.

## Si hay que tocar algo en el código

| Quiero cambiar… | Dónde |
|---|---|
| Qué productos entran (en Google y en Meta a la vez) | `visibilityPredicate` en `api/services/catalogOrdering.js` |
| Los campos del feed de Meta | `api/services/metaCatalogFeed.js` |
| El formato de las fotos JPEG | `api/services/catalogImageService.js`, y `CATALOG_JPEG_VERSION` a `v2` en `api/utils/productImageUrl.js` (mueve rutas y enlaces del feed a la vez). **Nunca** cambies lo que devuelve `v1` |
| La página de compra | `client/app/cesta/` y los textos en `META_CHECKOUT_COPY` (`client/lib/constants.js`) |
| Los identificadores de producto | **No se cambian.** Píxel, feed y URL de compra dependen de ellos, y cambiarlos borra todas las etiquetas |

Detalle técnico y el porqué de cada decisión: `openspec/changes/archive/2026-10-09-meta-instagram-shop/design.md` y la regla `.claude/rules/catalog/meta-catalog.md`.

## Riesgos que conviene vigilar

- **Meta cambia las reglas a menudo.** En cinco años ha abierto la tienda a todos, ha intentado imponer su propio pago y lo ha retirado. La base de datos de 140d es siempre la fuente principal, y la tienda de Instagram es un escaparate más.
- **Etiquetas generadas por IA:** Meta ha probado a etiquetar productos automáticamente sobre contenido ajeno. Si ves tus obras etiquetadas donde no las pusiste, revísalo en Commerce Manager.
- **La venta depende de la compra en el móvil.** Cada paso de más en `/cesta` o en el cajón cuesta conversiones. Revisa el recorrido completo desde Instagram después de cualquier cambio en la cesta o el pago.
