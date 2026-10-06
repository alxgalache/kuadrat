# 03 · La vía de Google para una tienda solo online

Contexto: 140d es una galería exclusivamente online, así que no le corresponde un Perfil de Empresa (se quita, ver `01-perfil-de-empresa.md`). Google ofrece a las tiendas online dos superficies de marca, y **ninguna lleva mapa**:

- **Perfil de marca** («brand profile»): panel que aparece al buscar el nombre exacto de la marca. Muestra imágenes de marca, productos, información de la empresa, envíos y devoluciones, promociones y redes. Se gestiona con una cuenta **verificada de Merchant Center**. Hoy solo pueden reclamarlo «comercios electrónicos seleccionados» y Google lo va ampliando, así que puede que todavía no esté disponible para 140d.
- **Panel de conocimiento** de la entidad «140d»: lo genera Google cuando confía en que la entidad existe. Se alimenta del JSON-LD de la portada, de los perfiles de `sameAs` y de las menciones externas. No se crea: se gana. Cuando aparece, se reclama.

## Estado a 06/10/2026

| Pieza | Estado |
|---|---|
| Search Console | ✔ Verificado por DNS. Registro TXT `google-site-verification=QgAi9r…` en GoDaddy, comprobado. |
| Merchant Center | ✔ Cuenta «140d Servicios Digitales SL» con la tienda verificada y reclamada y 42 de 42 productos aprobados, cargados desde una **hoja de cálculo de Google**. La auditoría encontró errores en la hoja, devoluciones y envío incompletos y el Perfil de Empresa vinculado: correcciones en `05-auditoria-merchant-center.md`. |
| Fichas en la web | 41 obras y 1 producto de tienda, los 42 a la venta. Desde el despliegue del 06/10/2026, las obras a la venta se marcan también como `Product`. |
| Perfil de marca | Sin comprobar (paso 3). |
| Perfil de Empresa | Se quita (guía 01), después de desvincularlo de Merchant Center. |

## Paso 1 · Search Console: dejarlo como está

La verificación por DNS es el método más robusto, y no hace falta cambiarlo:

- Cubre la **propiedad de dominio** entera (`140d.art`, `www`, subdominios, http y https).
- No depende del código: ningún despliegue puede romperla, al contrario que una etiqueta `<meta>` o un fichero HTML.

Lo único que hay que cuidar: **nunca borrar ese registro TXT** al tocar el DNS en GoDaddy. Si desaparece, Search Console pierde la verificación y Merchant Center deja de considerar reclamado el sitio. En la misma zona hay otros dos TXT de verificación que también hay que conservar: `facebook-domain-verification` y `pinterest-site-verification`.

## Paso 2 · Merchant Center: corregir y mantener la hoja

Las correcciones de la auditoría del 06/10/2026 (hoja, devoluciones, envío y desvinculación del Perfil de Empresa) están en `05-auditoria-merchant-center.md`, con un CSV corregido listo para importar.

**El riesgo de mantenimiento: las obras son únicas.** Con una hoja de cálculo, el feed solo cambia cuando alguien la edita. Por eso hay que aplicar tres reglas:

- **Al venderse una obra**, ponla en la hoja como `out_of_stock` o borra su fila ese mismo día. Si Google ve una obra vendida anunciada como disponible, la marca como discrepancia de disponibilidad, y si se repite, puede avisar sobre la cuenta. Las actualizaciones automáticas de artículos (activadas por defecto) ya lo corrigen solas al leer la ficha, que declara `Product`.
- **Al publicar una obra nueva**, añade su fila con el formato del CSV corregido. Si no, no aparecerá en Google.
- **Al recotizar un envío en la calculadora**, actualiza su columna `shipping`.

**La solución definitiva ya está implementada:** el feed generado desde la base de datos (`06-feed-automatico.md`), pendiente de desplegar y activar. Con él, las tres reglas se cumplen solas.

## Paso 3 · Comprobar el perfil de marca (ahora y cada mes)

1. Con la sesión de `ale@140d.art` iniciada (debe ser **superadministrador** de Merchant Center), busca **`140d`** en Google.
2. Si aparece **«Gestionar este perfil de marca»**: pulsa, elige la cuenta de Merchant Center y pulsa **Gestionar ahora**.
   - Sube el logotipo `client/public/brand/140d.png` (requisitos en `02-imagenes-y-mapa.md`).
   - Revisa la descripción, las redes y las imágenes.
3. Si no aparece, 140d todavía no es apta para reclamarlo. No hay ningún formulario para pedirlo: repite la comprobación cada mes.

## Paso 4 · Panel de conocimiento (si aparece)

Si al buscar `140d` aparece un panel con **«Reclamar este panel de conocimiento»**, pulsa y verifica con Search Console, que ya está verificado. Después se proponen correcciones desde «Comentarios».

## Paso 5 · Señales de entidad (sin coste, continuo)

Google decide si «140d» es una entidad cruzando lo que dicen varias fuentes:

- **Mismo nombre** en todas partes: «140d» como marca y «140d Galería de Arte» como nombre largo, igual que en `client/lib/siteInfo.js`.
- El **enlace a `https://140d.art`** en la bio de cada perfil oficial: Instagram, Facebook, X, Pinterest y LinkedIn. Son los cinco que declara el `sameAs` de la web.
- **Menciones externas**: prensa local, entrevistas, las webs de los artistas enlazando a su ficha en 140d. Es la señal que más pesa y la única que no depende de 140d.
- Wikidata no se recomienda por ahora: sus normas de notabilidad suelen borrar entradas de empresas recién creadas sin referencias externas.

## Seguimiento

Cada mes, en una ventana de incógnito, busca `140d`, `140d galería de arte` y `140d.art`, y apunta qué panel aparece.

- Las fichas gratuitas de Shopping aparecen en días o semanas tras la aprobación de los productos.
- El perfil de marca depende de que Google lo abra a 140d.
- El panel de conocimiento puede tardar meses.
- Hasta que exista alguno de los dos, «140d galería de arte» puede seguir mostrando galerías físicas cercanas.

## Fuentes

- Perfil de Empresa frente a perfil de marca: https://support.google.com/business/answer/16394780?hl=es
- Perfil de marca en la Búsqueda: https://support.google.com/merchants/answer/14998338?hl=es
- Reclamar el perfil de marca: https://support.google.com/brandprofile/answer/15662376
- Actualizaciones automáticas de artículos: https://support.google.com/merchants/answer/3246284?hl=es
- Añadir productos automáticamente desde la tienda online: https://support.google.com/merchants/answer/12158480?hl=es
- Verificarse en un panel de conocimiento: https://support.google.com/knowledgepanel/answer/7534902?hl=es
