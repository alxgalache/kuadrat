---
paths:
  - "client/lib/{metadata,schema}.js"
  - "client/public/brand/**"
  - "docs/og-image.md"
---

## Imagen social por defecto: el logotipo vive en la zona segura

`DEFAULT_OG_IMAGE` (`client/lib/metadata.js`) es el `og:image`/`twitter:image` de toda ruta sin imagen propia, la raíz incluida. Guía completa —quién recorta y cómo, receta de generación, verificación y refresco de cachés— en `docs/og-image.md`.

* **Muchos consumidores no pintan los 1200×630: pintan un recorte CENTRADO.** 1:1 en la miniatura de ChatGPT Ads, en las previas compactas de WhatsApp/Telegram/Slack y en la tarjeta `summary` de X; 4:5 en los anuncios verticales de Meta. La versión anterior llevaba «140D» de x=105 a x=1135 y el cuadrado central mostraba sólo **«4Ø»** (así salió en la vista previa del anuncio de ChatGPT, 24/09/2026).
* **La tinta cabe en x=348…852**, la franja de 504 px común al 1:1 y al 4:5 (y el «80 % central» del cuadrado). Las letras miden 480 px y se centran **por la tinta, no por la pastilla** del PNG fuente: centrar por la pastilla fue lo que dejó la anterior 20 px desplazada. El 9:16 queda fuera a propósito.
* **Cambiar la imagen es cambiar el nombre (`og-image-vN.jpg`), nunca sobrescribirla.** Facebook, LinkedIn, Slack y Telegram cachean por URL, y WhatsApp incrusta la previa en el mensaje: un reemplazo con el mismo nombre seguiría saliendo viejo durante semanas, sin aviso. Misma regla que los vídeos de la portada.
* **Una sola `og:image`.** La versión 1:1 (`og-image-square-v2.jpg`) va en el `image` del JSON-LD de la organización y se sube a mano en los gestores de anuncios. Con dos `og:image`, cada consumidor elige a su manera. `schema.js` importa las URLs de `metadata.js`: no hay un segundo literal que se quede atrás al renombrar.
