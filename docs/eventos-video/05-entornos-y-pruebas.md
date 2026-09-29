# 05 · Entornos, variables y pruebas

**Objetivo.** Poner las claves en producción y en preproducción, probar todo en
preproducción, hacer un ensayo en producción **sin avisar a ningún suscriptor**
y preparar el día del evento.

> Esta guía describe la aplicación **una vez implementado** el cambio
> `event-video-cdn-delivery`. Las variables se pueden poner antes: sin el código
> nuevo, la API las ignora.

---

## 1 · Preproducción puede probar todo (y por qué)

La duda era razonable. El Mac mini **no tiene credenciales de AWS ni IMDS** por
decisión, y por eso en preproducción no funcionan la subida de imágenes a S3,
las copias de seguridad ni las grabaciones.

**Firmar una URL de CloudFront no necesita nada de eso.** Es criptografía
local: la API firma un texto con su clave privada y CloudFront comprueba la
firma con la clave pública que le diste. No se llama a ninguna API de AWS.

```
              Mac mini (preprod)                      EC2 (producción)
              clave eventos-video-pre                 clave eventos-video-prod
                       │  firma                                │  firma
                       ▼                                       ▼
   navegador ──── URL firmada ────▶  cdn.140d.art  ◀──── URL firmada ──── navegador
                                    (grupo de claves con las dos)
                                          │
                                          ▼
                              bucket de medios: el MISMO vídeo
```

Los dos entornos usan el **mismo CDN y el mismo archivo**, que está en el bucket
de producción (`140d-media-pro-243303976956-eu-south-2-an`), el único origen de
`cdn.140d.art`. Solo cambia qué par de claves firma. Por eso preproducción es una
prueba completa del mecanismo. **No subas vídeos de eventos a otro bucket:** para
el CDN no existirían (ver la [guía 03](03-configurar-aws.md)).

Esto significa que preproducción **lee** vídeos del bucket de producción, siempre
con URLs firmadas y solo de `eventos-video/`. Es lo que se busca: se prueba con
el archivo real. Si algún día la clave del Mac mini se viera comprometida, basta
con quitarla del grupo de claves (guía 03, «Rotar o revocar»); producción no se
entera.

Lo único que preproducción **no** prueba son las variables y la clave **de
producción**. Para eso está el ensayo del apartado 5, con un «Evento de prueba».

## 2 · Las tres variables

| Variable | Valor | Igual en los dos entornos |
|---|---|---|
| `EVENT_VIDEO_CDN_URL` | `https://cdn.140d.art` (solo el origen, sin barra final ni ruta) | Sí |
| `EVENT_VIDEO_CF_KEY_PAIR_ID` | el ID `K…` de la clave pública de **ese** entorno ([guía 03, paso 3](03-configurar-aws.md#paso-3--subir-las-claves-públicas-a-cloudfront)) | No |
| `EVENT_VIDEO_CF_PRIVATE_KEY_B64` | la clave privada de **ese** entorno, en base64 y en una sola línea | No |

- **Las tres o ninguna.** Con una o dos, la API **no arranca** y dice cuál
  falta. Sin ninguna arranca normal, pero rechaza guardar URLs de
  `eventos-video/`.
- **No es una credencial de AWS.** No puede llamar a ninguna API de AWS; solo
  firmar URLs de `eventos-video/*`. Aun así es un secreto: nunca va al
  repositorio.
- **Base64 porque** el `env_file` de Docker Compose no admite bien un valor de
  varias líneas, y un PEM las tiene.

### Dónde va cada una

| Entorno | Fichero | Clave |
|---|---|---|
| Producción (EC2) | `api/.env` del repositorio en la instancia | `eventos-video-prod` |
| Preproducción (Mac mini) | `api/.env.staging` | `eventos-video-pre` |
| Desarrollo local (opcional) | `api/.env` de tu Ubuntu | `eventos-video-pre` (tu entorno local usa la base de datos de preproducción) |

### Cómo añadirlas sin copiar la clave al portapapeles

Desde tu Ubuntu, donde generaste las claves (guía 03, paso 2). Sustituye lo que
va entre `< >` por tus datos de conexión y la ruta del repositorio en cada
máquina.

**Primero, comprueba que no existen ya** (para no duplicarlas):

```bash
ssh <usuario>@<ec2> 'grep -c "^EVENT_VIDEO_" <ruta-repo>/api/.env'            # debe dar 0
ssh <usuario>@<mac-mini> 'grep -c "^EVENT_VIDEO_" <ruta-repo>/api/.env.staging'  # debe dar 0
```

**Producción:**

```bash
cd ~/utils/keys/claves-cloudfront
KEY_ID_PROD=K…      # ← ID de eventos-video-prod
printf '\n# Vídeo de eventos por CloudFront (docs/eventos-video/05)\nEVENT_VIDEO_CDN_URL=https://cdn.140d.art\nEVENT_VIDEO_CF_KEY_PAIR_ID=%s\nEVENT_VIDEO_CF_PRIVATE_KEY_B64=%s\n' \
  "$KEY_ID_PROD" "$(base64 -w0 eventos-video-prod.pem)" \
  | ssh <usuario>@<ec2> 'cat >> <ruta-repo>/api/.env'
```

**Preproducción:**

```bash
cd ~/utils/keys/claves-cloudfront
KEY_ID_PRE=K…       # ← ID de eventos-video-pre
printf '\n# Vídeo de eventos por CloudFront (docs/eventos-video/05)\nEVENT_VIDEO_CDN_URL=https://cdn.140d.art\nEVENT_VIDEO_CF_KEY_PAIR_ID=%s\nEVENT_VIDEO_CF_PRIVATE_KEY_B64=%s\n' \
  "$KEY_ID_PRE" "$(base64 -w0 eventos-video-pre.pem)" \
  | ssh <usuario>@<mac-mini> 'cat >> <ruta-repo>/api/.env.staging'
```

Si prefieres hacerlo a mano: `base64 -w0 eventos-video-prod.pem` imprime una
sola línea larga. Pégala tras `EVENT_VIDEO_CF_PRIVATE_KEY_B64=` en el fichero del
servidor, **sin comillas y sin espacios**.

**Comprueba la clave en el servidor antes de desplegar el código nuevo.** Con el
código nuevo, una clave mal copiada impide arrancar la API, en producción
incluida:

```bash
# En la EC2 (en el Mac mini, lo mismo con api/.env.staging)
grep '^EVENT_VIDEO_CF_PRIVATE_KEY_B64=' <ruta-repo>/api/.env | cut -d= -f2- | base64 -d | openssl rsa -check -noout
```

Tiene que responder `RSA key ok`. Si dice `Could not read private key`, el
valor está cortado o mal pegado: vuelve a añadirlo.

### Aplicar el cambio (recrear el contenedor de la API)

```bash
# Producción (en la EC2, en la carpeta del repositorio)
docker compose -f docker-compose.prod.yml up -d --force-recreate api
docker compose -f docker-compose.prod.yml logs --tail=30 api | grep -iE "\[ENV\]|error|listening"

# Preproducción (en el Mac mini, en la carpeta del repositorio)
docker compose -f docker-compose.pre2.yml up -d --force-recreate api
docker compose -f docker-compose.pre2.yml logs --tail=30 api | grep -iE "\[ENV\]|error|listening"
```

Si aparece una línea `[ENV] …`, la configuración está incompleta o la clave no
se puede leer: el contenedor se reiniciará en bucle hasta corregirlo. Cuando el
código nuevo se despliegue con `./deploy/deploy.sh`, el contenedor se recrea
solo.

## 3 · Orden de despliegue

1. AWS configurado y verificado ([guía 03](03-configurar-aws.md), pasos 1-7).
2. Variables puestas en los dos entornos (apartado 2).
3. Desplegar **preproducción** con el código nuevo y probar (apartado 4).
4. Desplegar **producción** con `./deploy/deploy.sh`. **API y cliente van
   juntos**: la API ya no manda la URL del vídeo en la ficha pública, y un
   cliente antiguo no sabría pedirla. El script despliega los dos y purga la
   caché de páginas.
5. Ensayo en producción con un «Evento de prueba» (apartado 5).
6. Subir los vídeos definitivos y crear el evento real (apartado 6).

## 4 · Lista de pruebas en preproducción

Marca cada punto. Usa los vídeos reales si ya están subidos, o el
`eventos-video/prueba/prueba.mp4` de la guía 03.

**Crear el evento** (panel de admin de preproducción):

- [ ] Formato «Vídeo pregrabado», origen «URL del vídeo», las dos URLs,
      duración real más un margen y estado «Programado».
- [ ] Guardar una URL de `cdn.140d.art` **fuera** de `eventos-video/` → el
      formulario muestra el error de vídeo no protegido y no guarda.
- [ ] Guardar solo la URL AV1 sin la MP4 → error y no guarda.

**La API pública no revela el vídeo:**

```bash
curl -s https://api.pre.140d.art/api/events/<slug> | jq '.event | {has_video, video_url, video_url_av1}'
```

- [ ] Sale `has_video: true`, `video_url: null` y `video_url_av1: null`.

**Reproducción:**

- [ ] Regístrate como asistente con tu email y verifica el código.
- [ ] En el panel, pulsa «Iniciar».
- [ ] El vídeo arranca solo (silenciado; un toque activa el sonido).
- [ ] Abre el evento en **otro navegador** unos minutos después: arranca en el
      mismo punto que el primero.
- [ ] Recarga la página a mitad: vuelve al punto del pase, no al principio.
- [ ] En un móvil Android (Chrome) y en un iPhone (Safari): se ve y se oye.

**Qué versión recibe cada dispositivo** (herramientas de desarrollador →
**Red** → filtra por `eventos-video`; el nombre del archivo dice cuál):

- [ ] Mac con M3 o posterior, iPhone 15 Pro o posterior, portátil Windows
      moderno → `…_av1.mp4`.
- [ ] iPhone 14 o anterior, Mac Intel, M1 o M2, y en general Chrome en Linux →
      `…_h264.mp4`.

**Seguridad** (lo que **debe fallar**):

- [ ] En **Red**, clic derecho en la petición del vídeo → «Abrir en una pestaña
      nueva» → **403**.
- [ ] Copia esa URL y pégala en la barra de otra pestaña → **403**.
- [ ] Clic derecho sobre el vídeo → **no** aparece el menú del navegador.
- [ ] No hay opción de picture-in-picture.
- [ ] La URL sin la parte que va tras `?`, en una terminal
      (`curl -sI "https://cdn.140d.art/eventos-video/…mp4"`) → **403**.
- [ ] Tras «Finalizar» el evento, la página ya no ofrece el vídeo.

**Evento de prueba** (también se puede probar aquí; en preproducción el
marketing va a un segmento de pruebas):

- [ ] Marca «Evento de prueba»: el evento desaparece de `/live` y del calendario.
- [ ] `curl -s https://<dominio-preprod>/live/<slug> | grep -o '<meta name="robots"[^>]*>'`
      → `noindex, nofollow`.

## 5 · Ensayo en producción con «Evento de prueba»

Comprueba lo que preproducción no puede: la clave y las variables **de
producción**. Hazlo con un evento **gratuito** (uno de pago cobraría y abonaría
de verdad).

**Crear:**

- [ ] Panel de admin de producción → nuevo evento con **«Evento de prueba»
      marcado** antes de guardar. Formato vídeo, las URLs reales, estado
      «Programado».

**Comprobar que no ha salido ningún correo:**

- [ ] En el panel de Resend → **Broadcasts**: no hay ninguno nuevo con el título
      del evento.
- [ ] En la EC2:
      `docker compose -f docker-compose.prod.yml logs api | grep "Marketing announcement sent"`
      → ninguna línea con el id del evento.

**Comprobar que no es visible:**

- [ ] No aparece en `https://140d.art/live` ni en el calendario.
- [ ] `curl -s https://140d.art/sitemap.xml | grep -c "<slug>"` → `0`.
- [ ] `curl -s https://140d.art/live/<slug> | grep -o '<meta name="robots"[^>]*>'`
      → `noindex, nofollow`.

**Reproducir:**

- [ ] Regístrate con tu email, verifica, pulsa «Iniciar» y repite la
      reproducción y las comprobaciones de seguridad del apartado 4 en dos o tres
      dispositivos.
- [ ] «Finalizar» el evento.

**Después:** el evento queda como «Finalizado» y oculto, así que no molesta.
Para el evento real, **crea uno nuevo sin la marca**. No conviertas el de prueba.

> **Si desmarcas «Evento de prueba» en un evento programado**, el panel pide
> confirmación porque **en ese guardado se enviará el anuncio** a los
> suscriptores. Es el comportamiento correcto para una prueba que se convierte en
> evento real, pero hay que hacerlo a propósito.

## 6 · El día del evento

**Unos días antes:**

- [ ] Vídeos definitivos subidos a `eventos-video/<evento>/` (guía 03, paso 8).
- [ ] Evento real creado **sin** «Evento de prueba», con las dos URLs y
      **duración = duración del vídeo + unos 10 minutos** (con este vídeo,
      `45`).
- [ ] Al guardarlo como «Programado» sale el anuncio a los suscriptores (esto sí
      se quiere).

**A la hora:**

- [ ] Pulsa **«Iniciar»** en el panel **a la hora exacta**: el pase empieza en
      el instante de la pulsación, no a la hora que figura en el evento.
- [ ] Abre el evento como asistente en otro dispositivo para vigilarlo.

**Al terminar:**

- [ ] Pulsa **«Finalizar»**.
- [ ] Si el vídeo no se va a reutilizar, bórralo de S3 más adelante.

## 7 · Problemas frecuentes

| Síntoma | Qué mirar |
|---|---|
| La API no arranca y el log dice `[ENV] … EVENT_VIDEO_…` | Falta alguna de las tres variables, o el base64 está cortado o lleva comillas o espacios |
| Al guardar el evento: «no está configurada la firma» | Ese servidor no tiene las variables, o no se recreó el contenedor tras añadirlas |
| Al guardar: «el vídeo no estaría protegido» | La URL es de `cdn.140d.art` pero no está dentro de `eventos-video/` |
| «No se pudo reproducir el vídeo» en todos los dispositivos | Prueba la URL firmada a mano ([guía 03, paso 7.4](03-configurar-aws.md#paso-7--verificar-con-un-vídeo-de-prueba-antes-de-subir-nada-real)) con la clave de ese entorno. Si falla ahí, el problema está en AWS o en el ID de la clave |
| Funciona en preproducción y no en producción | El `EVENT_VIDEO_CF_KEY_PAIR_ID` de producción no es el de `eventos-video-prod`, o la clave de producción no está en el grupo `eventos-video` |
| Un dispositivo recibe el AV1 y no se ve | El reproductor debería pasar solo al MP4. Si no lo hace, anota dispositivo y navegador: es un fallo a corregir |
| Se corta a mitad del pase | Duración del evento menor que el vídeo. El reproductor pide una firma nueva; si se repite, alarga la duración |
