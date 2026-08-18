# Caché del CDN (cdn.140d.art)

`cdn.140d.art` es una distribución de CloudFront delante del bucket de medios de
S3. Sirve las imágenes de producto y de autor y los vídeos de la portada
(`stories/`).

## El problema

PageSpeed, en la versión móvil de la portada:

```
Usar tiempos de vida de caché eficientes — ahorro estimado 2085 KiB
/stories/14543304.mp4 (cdn.140d.art)   Tiempo de vida en caché: None   1835 KiB
```

Comprobado a mano:

```console
$ curl -sI https://cdn.140d.art/stories/14543304.mp4
HTTP/2 200
content-type: video/mp4
content-length: 1878435
x-cache: Hit from cloudfront
age: 84824
```

No hay `Cache-Control`. **CloudFront sí cachea** (el `age` lo demuestra: casi
24 h, su TTL por defecto), así que el objeto no se vuelve a pedir a S3; lo que
falta es la instrucción para el **navegador**. Sin ella, cada visita repetida
vuelve a descargar 1,8 MB, y eso es lo que mide la auditoría.

El origen es que los vídeos de `stories/` se suben **a mano** desde la consola de
AWS: no pasan por `s3Service.uploadFile()` y por tanto nadie les pone la
cabecera. Las imágenes subidas por la aplicación sí la llevan desde
`MEDIA_CACHE_CONTROL` (un año, `immutable`) — ver `api/services/s3Service.js`.

---

# Cómo arreglarlo

Hay tres vías. **Basta con UNA.** La diferencia entre ellas es qué permisos
necesitan y si exigen desplegar antes:

| | Dónde se ejecuta | ¿Necesita desplegar? | Permisos que exige |
|---|---|---|---|
| **A. AWS CLI en la instancia** | shell de la EC2 | No | `s3:GetObject` + `s3:PutObject` sobre el bucket de medios |
| **B. Política de CloudFront** | consola de AWS | No | ninguno nuevo |
| **C. `npm run s3:cache-headers`** | dentro del contenedor `api` | **Sí** | los mismos que A |

Si quieres arreglarlo hoy y sin tocar nada más, ve a la **B**: es la única que no
depende de los permisos del rol de la instancia. La **C** existe sobre todo como
herramienta repetible una vez el código esté desplegado.

## Por qué falló `npm run s3:cache-headers` en producción

```
npm error Missing script: "s3:cache-headers"
```

No es un problema de entorno ni de permisos: **el script todavía no está en la
instancia**. `api/Dockerfile.prod` hace `COPY . .`, es decir, hornea el código
—`package.json` incluido— dentro de la imagen en el momento de la build. El
contenedor que hay corriendo ahora mismo se construyó antes de que existieran
`scripts/setMediaCacheHeaders.js` y su entrada en `package.json`, así que dentro
de él ese script sencillamente no existe.

La vía C, por tanto, solo funciona **después** de:

```console
cd ~/projects/kuadrat && ./deploy/deploy.sh
```

Ni `docker compose restart` ni `docker compose up -d` bastan: hay que
reconstruir la imagen, que es lo que hace el script de despliegue.

---

## Vía A — AWS CLI en la instancia (sin desplegar)

Todo esto se ejecuta **en la shell de la EC2**, como tu usuario habitual, NO
dentro del contenedor. Las credenciales las pone el rol de la instancia por la
cadena por defecto del SDK; no hay que exportar ninguna clave.

**1. Averigua el nombre del bucket** (está en el `.env` de la API, no hace falta
entrar al contenedor):

```console
grep AWS_S3_BUCKET ~/projects/kuadrat/api/.env
```

**2. Comprueba que el rol puede leer** — este es el paso que decide si la vía A y
la C son viables. `HeadObject` y `CopyObject` necesitan `s3:GetObject`, que las
subidas de la aplicación no usan y que por tanto puede no estar concedido:

```console
aws s3api head-object --bucket EL_BUCKET --key stories/14543304.mp4
```

* Si responde con el JSON del objeto → adelante.
* Si responde `AccessDenied` → **ve a la vía B**, o añade `s3:GetObject` a la
  política del rol de la instancia y vuelve aquí.
* Si dice `aws: command not found` → tampoco pasa nada, ve a la vía B.

**3. Escribe la cabecera.** Un objeto cada vez, que es lo transparente cuando son
tres o cuatro vídeos:

```console
aws s3api copy-object \
  --bucket EL_BUCKET \
  --key stories/14543304.mp4 \
  --copy-source EL_BUCKET/stories/14543304.mp4 \
  --metadata-directive REPLACE \
  --content-type video/mp4 \
  --cache-control "public, max-age=31536000, immutable"
```

Copiar el objeto sobre sí mismo con `--metadata-directive REPLACE` es la única
forma que ofrece S3 de cambiar cabeceras. No transfiere contenido: es una
operación interna del bucket.

**`--content-type video/mp4` no es opcional.** Con `REPLACE`, S3 descarta toda la
metadata que no venga en la copia, así que omitirlo dejaría el vídeo como
`application/octet-stream` y el navegador se lo descargaría en lugar de
reproducirlo. Si algún fichero es `.webm`, ese lleva `video/webm`.

Para listar qué hay en el prefijo antes de nada:

```console
aws s3 ls s3://EL_BUCKET/stories/
```

**4. Invalida CloudFront.** Sin esto no verás ningún cambio: las copias que el
CDN ya tiene guardadas siguen sirviendo la respuesta antigua, sin cabecera,
hasta que caduquen solas.

```console
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?contains(@,'cdn.140d.art')]].Id" --output text

aws cloudfront create-invalidation --distribution-id EL_ID --paths "/stories/*"
```

Si el rol no puede invalidar, se hace desde la consola: CloudFront → la
distribución → *Invalidations* → *Create invalidation* → `/stories/*`.

**5. Comprueba el resultado** (desde donde quieras, tu portátil incluido):

```console
$ curl -sI https://cdn.140d.art/stories/14543304.mp4 | grep -i 'cache-control\|content-type'
cache-control: public, max-age=31536000, immutable
content-type: video/mp4
```

Si `cache-control` no aparece, la invalidación aún no ha terminado (tarda un par
de minutos) o no cubrió esa ruta.

## Vía B — Response Headers Policy en CloudFront (sin permisos nuevos)

Desde la **consola de AWS**, en un solo sitio y sin tocar ningún objeto:

1. CloudFront → *Policies* → pestaña *Response headers* → **Create response
   headers policy**.
2. Nombre: `cdn-140d-cache-inmutable`. En *Custom headers* → *Add header*:
   * Header: `Cache-Control`
   * Value: `public, max-age=31536000, immutable`
   * **Origin override: activado.** El origen hoy no manda ninguna cabecera,
     pero si mañana la manda (porque el fichero se subió por la aplicación),
     queremos que siga ganando una sola regla y no dos criterios distintos.
3. CloudFront → la distribución de `cdn.140d.art` → *Behaviors* → editar el
   *behavior* por defecto (`Default (*)`) → *Response headers policy* → elegir la
   recién creada → guardar.
4. *Invalidations* → *Create invalidation* → `/*`.

Ventaja: cubre cualquier objeto futuro subido a mano, sin que nadie tenga que
acordarse. Inconveniente: la regla vive en la consola y no en este repositorio,
así que **si algún día el vídeo vuelve a aparecer sin caché, este documento es el
único sitio donde consta que la política existe.**

## Vía C — `npm run s3:cache-headers` (después de desplegar)

Una vez desplegado el código, dentro de la instancia:

```console
cd ~/projects/kuadrat

# 1. Simulacro. No escribe nada, pero hace un HeadObject por fichero: es lo que
#    comprueba de verdad que el rol tiene s3:GetObject, y enseña el
#    Cache-Control que tiene hoy cada objeto.
docker compose -f docker-compose.prod.yml exec api npm run s3:cache-headers

# 2. Solo los vídeos de portada
docker compose -f docker-compose.prod.yml exec api npm run s3:cache-headers -- --apply --prefix stories/

# 3. O todo el bucket de medios (stories/, art/, others/, authors/)
docker compose -f docker-compose.prod.yml exec api npm run s3:cache-headers -- --apply
```

Ojo con dos cosas:

* **`-f docker-compose.prod.yml`.** Sin el `-f`, `docker compose` usa
  `docker-compose.yml`, que es el de desarrollo. En la instancia el fichero de
  producción es el que hay que nombrar siempre.
* **El `--` antes de `--apply`** es de npm, no del script: sin él npm se queda
  los argumentos en vez de pasárselos al programa, y lo que ejecutas es otro
  simulacro.

Si el simulacro escupe `AccessDenied` en cada fichero, al rol de la instancia le
falta `s3:GetObject` sobre el bucket de medios: o se añade, o se usa la vía B.

Después de `--apply` sigue haciendo falta **invalidar CloudFront** (paso 4 de la
vía A). El propio script lo recuerda al terminar.

---

## Por qué un año e `immutable`

Ningún objeto del bucket de medios se reescribe: los basenames de producto son
UUID (ver `product_images.basename`) y los de autor llevan marca de tiempo más
aleatorio; sustituir una imagen crea un fichero nuevo y borra el viejo. Una URL,
por tanto, nunca cambia de contenido.

**Esto obliga a una regla de operación para `stories/`:** sustituir un vídeo
significa subirlo con un nombre nuevo y borrar el anterior, nunca reescribir el
mismo nombre. Con `immutable`, una invalidación de CloudFront arregla el CDN
pero no el navegador de quien ya lo descargó, y ese visitante se quedaría con el
vídeo viejo durante un año.

## Lo que esto NO arregla

* **El peso del vídeo.** 1,8 MB de `autoplay` en móvil siguen siendo 1,8 MB en la
  primera visita. Si vuelve a aparecer en las mediciones, lo que toca es un
  fichero más ligero (WebM/AV1, menor bitrate) o no reproducirlo automáticamente
  bajo `prefers-reduced-data` / conexiones lentas — no la caché.
* **`js.stripe.com/clover/stripe.js` (2 min) y `m.stripe.network` (5 min).** Los
  TTL los fija Stripe en sus propios servidores; no son configurables desde aquí
  y el script debe cargarse desde su origen por requisito de PCI. Lo único que
  está en nuestra mano es no cargarlo en páginas que no lo necesitan.
