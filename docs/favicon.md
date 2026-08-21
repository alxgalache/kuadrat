# Favicon e iconos de 140d

Guía operativa del conjunto de iconos del cliente: qué fichero pinta cada
superficie, cuál es el arte maestro y cómo regenerarlos sin reintroducir el
fallo que tenían.

## El maestro y su trampa

`client/public/brand/favicon-master-512.png` (512×512 RGBA) es la única copia
del badge del favicon. **No es lo mismo que `brand/140d.png`**, que es el
logotipo completo «140d» en su barra redondeada.

Su composición no es la evidente:

```
   ┌──────────────────────────────────────┐
   │ ▒▒▒                            ▒▒▒   │  ▒ alpha 0   →  7.632 px  (esquinas)
   │ ▒   ████████████████████████    ▒    │  █ negro     → 208.512 px (la pastilla)
   │     ██████░░░░░░██████████████        │  ░ alpha 0   →  44.213 px (el "1")
   │ ▒   ████████████████████████    ▒    │
   │ ▒▒▒                            ▒▒▒   │  Todo el color es (0,0,0).
   └──────────────────────────────────────┘  NO hay un solo píxel blanco.
```

**El "1" blanco no es tinta blanca: es un hueco recortado, y lo que se ve es el
fondo asomando por detrás.** De ahí sale todo lo demás:

* Aplanar el maestro sobre **blanco** da el "1" blanco… y también las esquinas
  blancas. Eso es exactamente el fallo que tenían `favicon.ico`, `icon1.png` y
  `apple-icon.png`: invisible en pestaña clara, cuñas blancas en pestaña oscura.
* Aplanar sobre **negro** da esquinas negras y "1" negro sobre negro, es decir,
  un cuadrado negro liso. No sirve tal cual.
* **Poner el alfa del maestro sin más hace desaparecer el "1"**, porque comparte
  el mismo alpha 0 que las esquinas. Es el error fácil de cometer.

La receta correcta es: aplanar sobre blanco y devolver el alfa **sólo** a las
cuñas de esquina. Se aíslan con un *flood fill* desde las cuatro esquinas sobre
los píxeles de alpha 0 — las cuñas tocan el borde y el hueco del "1" es
interior, así que la separación es exacta y no hace falta ninguna constante de
radio.

Dos detalles que no se ven hasta que se miran sobre fondo oscuro:

* En la banda del redondeo hay que **forzar el RGB a negro** antes de aplicar el
  alfa. Si se queda el gris del aplanado sobre blanco, al reescalar aparece un
  fleco claro siguiendo la curva.
* LANCZOS rebota en las colas del alfa y deja residuo (alpha 8/255) en la
  esquina de la versión de 16 px. Se recorta con un `point()`.

## Qué fichero pinta qué

| fichero | superficie | forma |
|---|---|---|
| `client/app/favicon.ico` | pestaña, marcadores, historial | redondeado, esquinas alfa 0 |
| `client/public/icon-32x32.png` | pestaña (según DPI) | redondeado, esquinas alfa 0 |
| `client/public/icon-192x192.png` | pestaña HiDPI, Android | redondeado, esquinas alfa 0 |
| `client/public/apple-touch-icon.png` | pantalla de inicio iOS | **cuadrado y opaco** |
| `client/public/web-app-manifest-192/512.png` | PWA (`purpose: maskable`) | **cuadrado y opaco** |

Los dos últimos grupos **no** llevan transparencia y no deben llevarla: iOS
aplana el alfa sobre negro y aplica su propia máscara, y un icono `maskable`
tiene que llenar el lienzo entero.

`favicon.ico` lleva tres entradas (16/32/48) en **BMP de 32 bits**, no PNG. PIL
escribe PNG dentro del ICO por defecto; los navegadores modernos lo leen, pero
BMP es lo que leen también los agregadores y servicios de marcadores antiguos, y
el coste son ~11 KB.

## Cómo se declaran

En `client/app/layout.js`, vía `metadata.icons`. **Ese bloque anula la
convención de fichero de Next** (`app/icon*.*`, `app/apple-icon.*`): esos
ficheros dejan de emitir su `<link>` aunque existan — por eso `app/icon0.svg`,
`app/icon1.png` y `app/apple-icon.png` se borraron, eran peso muerto servido en
rutas que nada enlazaba. `app/favicon.ico` es la excepción: Next lo emite
siempre, y por eso `/favicon.ico` aparece dos veces en el `<head>`.

Verificación en producción:

```bash
curl -s https://140d.art/ | grep -oE '<link[^>]*(icon|manifest)[^>]*>'
```

## Regenerar

```bash
cd client
python3 - <<'PY'
from collections import deque
from PIL import Image, ImageFilter

m = Image.open('public/brand/favicon-master-512.png').convert('RGBA')
w, h = m.size
A = m.getchannel('A'); al = A.load()

# Cuñas de esquina: componentes de alpha==0 conectados al borde. El hueco del
# "1" es interior, así que queda fuera por construcción.
outside = Image.new('L', (w, h), 0); ol = outside.load()
seen = [[False] * w for _ in range(h)]
for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    if al[sx, sy] != 0:
        continue
    q = deque([(sx, sy)]); seen[sy][sx] = True
    while q:
        x, y = q.popleft(); ol[x, y] = 255
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and al[nx, ny] == 0:
                seen[ny][nx] = True; q.append((nx, ny))

band = outside.filter(ImageFilter.MaxFilter(9))   # engloba el borde antialiased

rgb = Image.alpha_composite(Image.new('RGBA', (w, h), (255, 255, 255, 255)), m).convert('RGB')
rgb.paste((0, 0, 0), (0, 0), band)                # sin esto, fleco claro en la curva
alpha = Image.composite(A, Image.new('L', (w, h), 255), band)
master = Image.merge('RGBA', (*rgb.split(), alpha))

def at(size):
    im = master.resize((size, size), Image.LANCZOS)
    im.putalpha(im.getchannel('A').point(lambda v: 0 if v < 12 else (255 if v > 243 else v)))
    return im

at(32).save('public/icon-32x32.png', optimize=True)
at(192).save('public/icon-192x192.png', optimize=True)
# El mayor va como imagen base: PIL descarta cualquier `sizes` mayor que im.size.
at(48).save('app/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)],
            append_images=[at(16), at(32)], bitmap_format='bmp')
PY
```

Comprobación rápida de que las esquinas quedaron transparentes:

```bash
python3 -c "
from PIL import Image
ico = Image.open('client/app/favicon.ico')
for s in sorted(ico.ico.sizes()):
    ico.size = s; im = ico.copy().convert('RGBA'); px = im.load(); w, h = im.size
    print(s, [px[x, y][3] for x, y in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]])
"
```

Las cuatro esquinas deben dar `[0, 0, 0, 0]` en los tres tamaños.

## Al desplegar

`/favicon.ico` se sirve con `public, max-age=0, must-revalidate`, así que ni
nginx ni el CDN lo retienen. **Chrome sí**: guarda los favicons en una base de
datos propia, independiente de la caché HTTP, y puede seguir mostrando el
anterior durante días en un perfil ya usado. Verificar siempre en ventana
privada o en un perfil limpio; ver el icono viejo en el perfil de siempre no
significa que el despliegue haya fallado.
