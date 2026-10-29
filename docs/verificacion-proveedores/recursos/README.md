# Recursos de marca de origen

Los dos ficheros oficiales de los que salen los logotipos de las tarjetas «Continuar con Google» y «Continuar con Microsoft». Descargados el 29/10/2026. Se guardan sin modificar, como referencia: lo que sirve el sitio son sus derivados en `client/public/brand/proveedores/`.

| Fichero | Origen | Derivado en el sitio |
|---|---|---|
| `google-light-square-icon@4x.png` (160×160) | [signin-assets.zip](https://developers.google.com/static/identity/images/signin-assets.zip) de Google → `Android + Web/PNG @4x/Light/Theme=Light, Show text=No, Shape=Square, Platform=Android+Web@4x.png` | `google-g-v1.png`: el cuadrado central de 80×80 px, la «G» sin el marco del botón y sin tocar ningún píxel de la G. Se pinta a 20 px |
| `ms-symbollockup_mssymbol_19.svg` (21×21) | [Guía de marca de Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps), descarga del símbolo | `microsoft-v1.svg`: el mismo fichero, sin cambios |

**Por qué el PNG de Google y no su SVG.** El SVG oficial dibuja el degradado con un `foreignObject` (HTML incrustado) y 49 filtros de desenfoque. Se vio bien en Safari para iOS, pero el PNG no depende de cómo cada vista web pinte eso.

**Reglas de las guías:**
- la «G» nunca se recolorea, ni se pone en monocromo, ni se redibuja;
- el símbolo de Microsoft nunca se altera;
- la tarjeta de Google debe ser al menos igual de visible que las demás.

**Si cambian los logotipos:** se vuelve a descargar de las mismas URLs, se sustituyen estos ficheros y se publica el derivado **con otro nombre** (`-v2`). Los recursos del sitio se sirven con caché inmutable y nunca se sobrescriben.
