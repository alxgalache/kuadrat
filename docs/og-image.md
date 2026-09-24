# Imagen social por defecto (`og:image`)

Guía operativa de la tarjeta que acompaña a cualquier enlace a 140d que no tenga
imagen propia: la raíz `https://140d.art`, los listados, las legales, las guías…
Qué fichero es, por qué tiene la composición que tiene, cómo regenerarla sin
reintroducir el fallo y qué hacer después de desplegarla.

## Ficheros

| fichero | tamaño | dónde se usa |
|---|---|---|
| `client/public/brand/og-image-v2.jpg` | 1200×630 | `og:image` y `twitter:image` de toda ruta sin imagen propia (`DEFAULT_OG_IMAGE` en `client/lib/metadata.js`) |
| `client/public/brand/og-image-square-v2.jpg` | 1200×1200 | JSON-LD de la organización (`image`, junto a la apaisada) y subida manual en gestores de anuncios que piden 1:1 |
| `client/public/brand/og-image.jpg`, `og-image.png` | 1200×630 | **Nada.** La versión recortable anterior; se conserva para que las publicaciones antiguas no pierdan su miniatura. Se puede borrar cuando ya no aparezca en ningún sitio. |

Las URLs sólo se escriben en `client/lib/metadata.js`. `client/lib/schema.js` las
importa de ahí, así que renombrar el fichero es cambiar una sola línea.

## El fallo que corrige

La versión anterior llevaba «140D» de x=105 a x=1135 en un lienzo de 1200 px:
prácticamente de borde a borde y, además, 20 px descentrado a la derecha. En la
tarjeta apaisada se veía bien. En cualquier consumidor que recorta al centro,
no: el cuadrado central (x=285…915) dejaba sólo **«4Ø»**. Así lo mostraba la
vista previa del anuncio de ChatGPT, y así sale en las previas compactas de
otros consumidores.

**No es un problema de tamaño ni de peso, sino de composición.** El 1200×630 es
correcto. Lo que falla es suponer que el consumidor pinta el lienzo entero.

## Quién recorta y cómo

Todos recortan **desde el centro**. Lo que cambia es la proporción:

| proporción | quién |
|---|---|
| 1,91:1 (lienzo entero) | previa grande de Facebook, LinkedIn, WhatsApp, iMessage, Discord, Slack y Telegram con `summary_large_image` |
| 2:1 | tarjeta `summary_large_image` de X (quita 15 px arriba y abajo) |
| 16:9 | Google Discover |
| 4:3 | miniaturas de resultados de Google |
| **1:1** | **miniatura de ChatGPT Ads** (se rellena a partir de los metadatos del sitio); previas compactas de WhatsApp (imagen pequeña o pesada, o según el cliente), Telegram y Slack; tarjeta `summary` de X; formato cuadrado de Google Ads y Meta |
| **4:5** | anuncios verticales del feed de Meta |

El 1:1 es el caso que se ve a diario. El 4:5 es el más estrecho, y en él coincide
el ancho de dos reglas distintas: 630 × 4/5 = 504 px, que es también el «80 %
central» del cuadrado (630 × 0,8) que recomiendan las guías de anuncios para
librar las esquinas redondeadas.

## La zona segura

Sobre el lienzo de 1200×630, la tinta (las letras) debe caber en **x=348…852**,
la franja de 504 px común al 1:1 y al 4:5. Las letras miden **480×113 px**,
centradas en (600, 315):

```
0        285  348                   852  915       1200
┌─────────┬────┬─────────────────────┬────┬─────────┐
│         │    │                     │    │         │
│         │    │      1 4 Ø D        │    │         │   ← 480 px de tinta
│         │    │                     │    │         │
└─────────┴────┴─────────────────────┴────┴─────────┘
           └─ 1:1 (630) ──────────────────┘
                └──── 4:5 (504) ─────┘
```

Márgenes medidos: 75 px en el recorte 1:1 y 12 px en el 4:5. En la miniatura de
ChatGPT (≈116 px de lado) la palabra mide unos 88 px de ancho: se lee.

**Queda fuera, a propósito: el 9:16** (historias y reels). Un recorte de 354 px
de ancho sólo admitiría un logotipo de ~300 px en la tarjeta grande, y ahí
ningún consumidor genera la pieza desde el `og:image`: se sube una creatividad
propia.

La cuadrada guarda la misma proporción, con las letras al 76,2 % del lado. Es
el recorte central de la apaisada, sólo que a más resolución.

## Regenerar

Desde `client/`. Parte de `public/brand/140d-nospace-white.png` (letras blancas
sobre la pastilla negra, 1680×512): sobre fondo negro la pastilla desaparece y
quedan sólo las letras, igual que en la tarjeta original. Se recorta a la caja
real de la tinta y **se centra por la tinta, no por la pastilla**. Centrar por la
pastilla es lo que dejó la versión anterior 20 px desplazada.

```bash
cd client
python3 - <<'PY'
from PIL import Image

SRC = 'public/brand/140d-nospace-white.png'
LETTERS_FRACTION = 480 / 630          # ancho de la tinta / lado del cuadrado central

def letters():
    src = Image.open(SRC).convert('RGBA')
    flat = Image.alpha_composite(Image.new('RGBA', src.size, (0, 0, 0, 255)), src).convert('L')
    return flat.crop(flat.point(lambda v: 255 if v > 0 else 0).getbbox())

def compose(width, height, square_side):
    ink = letters()
    w = round(square_side * LETTERS_FRACTION)
    ink = ink.resize((w, round(ink.height * w / ink.width)), Image.LANCZOS)
    canvas = Image.new('L', (width, height), 0)
    canvas.paste(ink, ((width - ink.width) // 2, (height - ink.height) // 2))
    return canvas.convert('RGB')

# JPEG base (no progresivo), RGB: el formato que acepta cualquier scraper.
# Peso ~15 KB y ~27 KB, muy por debajo de los 300 KB de WhatsApp.
compose(1200, 630, 630).save('public/brand/og-image-vN.jpg', 'JPEG', quality=90, optimize=True, progressive=False)
compose(1200, 1200, 1200).save('public/brand/og-image-square-vN.jpg', 'JPEG', quality=90, optimize=True, progressive=False)
PY
```

`vN` es el número de versión siguiente. **Nunca se sobrescribe un fichero
publicado**: Facebook, LinkedIn, Slack y Telegram guardan la vista previa según
la URL de la imagen, y WhatsApp la guarda en cada dispositivo. Un fichero
reemplazado con el mismo nombre seguiría saliendo viejo durante semanas, y nada
avisaría de ello. Es la misma regla que los vídeos de la portada
(`docs/cdn-cache.md`). Después, actualizar las dos URLs en
`client/lib/metadata.js`.

### Verificar antes de publicar

Simula cada recorte centrado y falla si alguno corta tinta:

```bash
cd client
python3 - <<'PY'
import sys
from PIL import Image

RATIOS = {'2:1': 2, '16:9': 16/9, '4:3': 4/3, '1:1': 1, '4:5': 4/5}
bad = False
for path in sys.argv[1:] or ['public/brand/og-image-v2.jpg', 'public/brand/og-image-square-v2.jpg']:
    im = Image.open(path); W, H = im.size
    x0i, y0i, x1i, y1i = im.convert('L').point(lambda v: 255 if v > 40 else 0).getbbox()
    for name, r in RATIOS.items():
        cw, ch = (W, round(W / r)) if W / H < r else (round(H * r), H)
        cw, ch = min(cw, W), min(ch, H)
        x0, y0 = (W - cw) // 2, (H - ch) // 2
        m = min(x0i - x0, x0 + cw - x1i, y0i - y0, y0 + ch - y1i)
        bad |= m < 0
        print(f'{path} {name:5s} margen {m:4d}px {"OK" if m >= 0 else "CORTA"}')
sys.exit(1 if bad else 0)
PY
```

Además de la comprobación numérica, mirar la miniatura a tamaño real: un recorte
1:1 reducido a 116 px es lo que enseña ChatGPT.

## Después de desplegar

La URL nueva obliga a descargar la imagen de nuevo, pero **sólo cuando el
consumidor vuelve a leer el HTML de la página**, y cada uno lo hace a su ritmo:

* **Facebook / Messenger:** [Sharing Debugger](https://developers.facebook.com/tools/debug/) → `https://140d.art` → «Volver a extraer».
* **LinkedIn:** [Post Inspector](https://www.linkedin.com/post-inspector/) → `https://140d.art`.
* **Telegram:** enviar la URL al bot `@WebpageBot`.
* **X:** no tiene validador. La caché caduca en unos 7 días. Añadir un parámetro
  (`?v=2`) a un enlace concreto lo fuerza en el acto.
* **WhatsApp:** la previa se genera en el dispositivo que envía y se incrusta en
  el mensaje. Los mensajes ya enviados no cambian; los nuevos sí.
* **ChatGPT Ads:** el borrador del anuncio ya guardó su imagen al crearse. Hay
  que volver a generarlo desde la URL o subir `og-image-square-v2.jpg`
  directamente como imagen del anuncio.

Comprobación en producción:

```bash
curl -s https://140d.art/ | grep -oE '<meta[^>]*(og:image|twitter:image)[^>]*>'
curl -sI https://140d.art/brand/og-image-v2.jpg | head -3
```

## Lo que esto no toca

* **El icono pequeño junto al nombre** (el «1» de la miniatura de ChatGPT, las
  pestañas y los marcadores) es el favicon. Es otra pieza con su propia guía:
  `docs/favicon.md`.
* **Las imágenes de contenido** (obra, retrato del artista, portada de evento)
  son las que son. Un recorte centrado en ellas es inherente al consumidor y no
  se compone a mano.
