# Portadas de los streams: fuentes

Diseños de las tres portadas de la escena (`agora-stage-covers`): «Inicio», «Intermedio» y «Final», a 1920 × 1080.

| Ruta | Qué es |
|---|---|
| `A · *-html.zip` | Exportación original de la herramienta de diseño (artboard `.dc.html` + su visor) |
| `oscura/*.png` | **En uso (v2)**, publicada como `client/public/cortinillas/*-v2.jpg`. La misma maqueta con fondo negro, texto blanco y logo invertido |
| `inicio.png`, `intermedio.png`, `final.png` | Diseño original (v1), de fondo blanco. Se fundía con la web blanca. `*-v1.jpg` sigue publicado, sin uso |
| `paspartu/*.png` | Alternativa finalista, sin uso: el diseño original al 90 % sobre negro, con esquinas redondeadas |
| `html/<variante>/*.html` | Fuente estática de cada PNG: el marcado del artboard sin el visor de la herramienta |
| `html/assets/logo-*.svg` | Logo original (negro) y su versión blanca para el fondo oscuro |

## Regenerar un PNG

Los HTML cargan Inter de Google Fonts. Con Chrome:

```
google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1920,1080 \
  --virtual-time-budget=5000 --screenshot="$PWD/salida.png" "file://$PWD/html/oscura/inicio.html"
```

El método está validado: `html/original/inicio.html` reproduce `inicio.png` con una diferencia media de 0,28/255, solo en el suavizado del texto.

## Cambiar un texto

Edita el HTML de cada variante, regenera el PNG y publícalo en `client/public/cortinillas/` como JPG con un nombre nuevo (`-v3`…), sin sobrescribir nunca el anterior. Después cambia los dos catálogos, `api/utils/stageCovers.js` y `client/lib/stageCovers.js`. Ver `docs/eventos-portadas.md`.
