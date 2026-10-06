# 02 · Imágenes y mapa: qué pasaba y qué usar a partir de ahora

Contexto: el Perfil de Empresa de 140d, que se va a quitar (ver `01-perfil-de-empresa.md`), tenía dos imágenes subidas. Las dos eran carteles de texto sobre fondo negro, sacados de la carpeta `Brand/Google ads/`:

- `140d-google-ads-d-ls-1200x628.png` (1200×628).
- `140d-google-ads-d-sq-1200x1200.png` (1200×1200).

En el panel solo aparecía la primera, recortada («40D», «escubre obras única…»), junto a un mapa de España. Esta guía explica por qué, para no repetirlo en el perfil de marca ni en ninguna otra superficie de Google.

## 1. Por qué se recortaba la imagen de 1200×628

**1200×628 (1,91:1) es el formato de los anuncios de Google Ads**, no el del Perfil de Empresa, para el que Google recomienda **720×720 px** (mínimo 250×250, JPG o PNG, de 10 KB a 5 MB).

Google no respeta la proporción original: **recorta** la foto para llenar la casilla de cada superficie, y cada una tiene la suya:

| Superficie | Proporción aproximada de la casilla |
|---|---|
| Panel de la Búsqueda en escritorio (la captura) | ≈ 1,15:1, casi cuadrada (≈148×128 px junto al mapa) |
| Carrusel de fotos en móvil | entre 1:1 y 4:3 |
| Portada en Google Maps | ≈ 16:9 |
| Logotipo | círculo |

Una imagen de 1,91:1 metida en una casilla de ≈1,15:1 conserva solo **el ~60 % de su anchura**. El texto ocupaba de x≈88 a x≈940 de 1200 px, así que no podía caber entero. Además, el recorte no estaba centrado: Google eligió la zona que le pareció más relevante. Por eso centrar el diseño no basta.

La versión cuadrada tampoco se habría salvado en Maps: un recorte 16:9 de un cuadrado de 1200 px deja solo la franja y=262…937, y se pierden el «140D» de arriba y el pie de abajo.

## 2. Por qué no aparecía la de 1200×1200

- **La cabecera solo tenía sitio para una foto al lado del mapa.** Con pocas fotos, el resto queda dentro de «Ver fotos».
- **La portada es una preferencia, no una orden.** Según Google, elegirla «no garantiza» que salga la primera.
- **Las fotos tardan 24–48 h** en mostrarse y pasan por revisión.
- Google pide fotos que «representen la realidad». Un cartel de texto no está prohibido, pero, según la experiencia que recogen las guías del sector, es lo primero que pierde la portada frente a una foto real.

## 3. El mapa

**En un Perfil de Empresa, el mapa no se puede ocultar con ningún ajuste.** Forma parte de toda ficha local: con dirección visible muestra el punto, y con la dirección oculta muestra la zona de servicio, que en este caso era toda España.

**Desaparece al quitar el Perfil de Empresa.** Los paneles que corresponden a 140d (perfil de marca y panel de conocimiento) no llevan mapa.

## 4. Imágenes a partir de ahora

### Logotipo (perfil de marca)

Requisitos de Google: cuadrado **1:1**, entre **500×500 y 2000×2000 px**, BMP, JPEG o PNG, como máximo 5 MB. No se sube en Merchant Center: se sube desde la Búsqueda (ver `03-ruta-tienda-online.md`, paso 3).

Usa **`client/public/brand/140d.png`** (1680×1680, la pastilla «140D» centrada con margen). Cumple los requisitos y aguanta el recorte circular. Es el mismo logotipo que declara el JSON-LD de la web, y conviene que coincidan.

### Imágenes de marca (cuando el perfil de marca lo permita)

- **Prioridad, fotos reales**: obras en una pared o en contexto, detalles de textura, un artista trabajando, un directo fotografiado con cámara (no una captura de pantalla).
- Si usas un cartel de marca, en **lienzo cuadrado 1200×1200**, con todo el texto y el logotipo dentro de la caja **x=120…1080, y=300…900**. Esa caja es la zona común al 1:1, al ≈1,15:1 y al 16:9, con un 10 % de margen por si el recorte no va centrado. Usa pocas palabras: logotipo y una frase.
- Para sustituir una imagen, sube otra con otro nombre y borra la anterior, y espera 24–48 h antes de juzgar el resultado.

Es el mismo criterio que ya se aplicó a la imagen social (`docs/og-image.md`): el contenido vive en la zona segura común a todas las proporciones.

### Imágenes de producto (Merchant Center)

Son las fotos de cada obra. Ya salen de la hoja de cálculo del feed. Lo que hay que revisar está en `05-auditoria-merchant-center.md`.

## Fuentes

- Especificaciones de fotos del Perfil de Empresa: https://support.google.com/business/answer/6103862?hl=es
- Logotipo del perfil de marca: https://support.google.com/merchants/answer/7059936?hl=es
- Recortes por superficie (guía del sector, no oficial): https://socialk.it/en/sizes/google-business-cover-photo-size
