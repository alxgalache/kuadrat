---
paths:
  - "client/lib/imageUpload.js"
  - "client/components/ProductForm.js"
  - "api/middleware/securityMiddleware.js"
  - "api/routes/{artRoutes,othersRoutes}.js"
  - "api/tests/requestSizeLimit.test.js"
---

## Subida de imágenes de producto: optimizadas en el navegador, un tope por petición

El 30/10/2026 una artista no pudo publicar un producto de la tienda en producción. Tres fotos de 6–7 MB pasaban cada una el tope de 10 MB, pero juntas sumaban 18,4 MB en **un solo** multipart, y el filtro global de `api/app.js` corta en 15 MB antes de que multer las vea. Recibía «Solicitud a la API fallida» y no había forma de saber qué hacer.

* **Hay dos topes y miden cosas distintas.** `limits.fileSize` de multer (10 MB) es **por fichero**. `MAX_REQUEST_BYTES` de `api/middleware/securityMiddleware.js` (15 MB) es para la **petición entera**: todas las imágenes generales, todas las de las variaciones y los campos de texto. Se mide por `Content-Length` y se aplica antes de autenticar. Las rutas admiten 3 imágenes + 20 variaciones × 3, así que el tope de multer nunca es el que se alcanza primero. **No se sube el de 15 MB:** multer guarda en memoria (`memoryStorage`), y 63 × 10 MB en un contenedor con 0,75 vCPU es justo el ataque que el filtro impide.
* **Cada imagen se optimiza en el navegador al elegirla** (`client/lib/imageUpload.js`, desde `validateImageFile` de `ProductForm`). El lado largo se reduce a 2000 px; el lado corto nunca baja de 600, el mínimo de `api/utils/productValidation.js`. Después se recodifica: WebP con calidad 0,85, o JPEG en Safari.
  * **Safari no tiene codificador WebP para canvas.** Si se le pide `image/webp`, devuelve un PNG sin avisar, más pesado que el original. Por eso hay una prueba de 1×1 (`toDataURL`) y se comprueba `blob.type` en el resultado. Se descartó un codificador WebP en WebAssembly: tras reducir la imagen, la diferencia entre WebP y JPEG es de unos 100 KB por foto, y añadiría una dependencia y un cambio de CSP (`wasm-unsafe-eval`).
  * **JPEG no tiene transparencia:** en la vía de Safari, lo transparente se pinta de blanco, porque sin fondo el navegador lo pinta de negro. WebP conserva el canal alfa.
  * **Una reducción de más de la mitad pasa por un lienzo intermedio del doble del tamaño final.** En un solo paso se pierde detalle fino. El intermedio mide como mucho 4000×4000, dentro del tope de Safari en iOS (16,7 Mpx por lienzo).
  * **Se recodifica siempre**, también una imagen que ya cabe en 2000 px. Así nunca se publica el EXIF de la cámara, incluida la ubicación GPS: lo que se sube es lo que sirve el CDN, y la URL del original viaja dentro de cada URL de `/_next/image`.
  * **Si el navegador no consigue codificar la imagen, se sube el original.** Pasa cuando `toBlob` devuelve `null` porque el lienzo supera los topes del navegador. La API valida igualmente lo que recibe.
  * **El tope de 10 MB se comprueba sobre el fichero optimizado**, no sobre el original. Es lo que recibe multer, y una foto de cámara de 14 MB sale por debajo de 1 MB.
  * **El botón de enviar espera a las imágenes en proceso** (`processingImages`). Si no, el formulario saldría sin ellas.
  * Medido en Chrome: una foto de 6000×4000 px y 10,2 MB sale a 2000×1333 px, 237 KB en WebP o 337 KB en JPEG, en menos de 0,4 s.
* **Antes de enviar, `ProductForm` estima el tamaño del multipart** (`estimateFormDataBytes`, que se queda unos cientos de bytes por encima del real). Si supera `MAX_REQUEST_BYTES`, avisa con el total real y no envía. **`MAX_REQUEST_BYTES` existe dos veces, en `securityMiddleware.js` y en `client/lib/constants.js`, y cambiar una obliga a cambiar la otra.** Ningún test puede leer `client/`, así que el espejo se mantiene por los comentarios de las dos.
* **El 413 lleva `REQUEST_TOO_LARGE` en `title`**, y `showApiError` lo traduce desde `GLOBAL_API_ERRORS` para cualquier formulario. Sin esa traducción, el aviso pondría el código como encabezado. Un 413 puede llegar **sin cuerpo legible**: nginx lo responde en HTML, y la API contesta antes de que el navegador termine de subir. Por eso `lib/api.js` deduce el código del estado HTTP cuando falta el `title`.
* **Consecuencias aceptadas:**
  * El detalle de un producto en una pantalla retina de 4K recibe 2000 px en lugar de 3840, porque el optimizador de Next nunca amplía.
  * Las imágenes subidas antes del 30/10/2026 conservan su tamaño original.
  * La parte del cliente no tiene test automático (no hay runner). Se verificó en Chrome, sin tocar ninguna base de datos ni S3. La vía de Safari se verificó forzando la codificación a JPEG en Chrome, no en un Safari real.
