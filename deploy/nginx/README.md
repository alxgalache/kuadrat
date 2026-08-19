# nginx de producción

Configuración versionada del proxy de `140d.art`. Hasta ahora vivía sólo en
`/etc/nginx` de la instancia, sin copia en el repo y sin caché, límites ni
HTTP/2 — ver los hallazgos H3 y H6 del informe de carga.

| Fichero | Destino en la instancia |
|---|---|
| `00-kuadrat-shared.conf` | `/etc/nginx/conf.d/00-kuadrat-shared.conf` (nuevo) |
| `140d.art.conf` | `/etc/nginx/sites-available/140d.art` (**sustituye** al existente) |
| `errors/503.html` | `/var/www/kuadrat-errors/__error.html` |
| `errors/503.json` | `/var/www/kuadrat-errors/__error.json` |

Ojo con el **nombre de destino** de los dos ficheros de error: en el repo llevan
un nombre descriptivo, pero nginx los busca como `__error.html` y
`__error.json`.

`00-kuadrat-shared.conf` **debe cargarse antes** que el otro: define los
`upstream`, las zonas de caché y los mapas, que viven en el contexto `http`.
El prefijo `00-` lo garantiza con el `include /etc/nginx/conf.d/*.conf` de
Ubuntu.

El symlink `/etc/nginx/sites-enabled/140d.art → sites-available/140d.art` **ya
existe** y no hay que tocarlo: al sustituir el fichero de destino, el enlace
sigue apuntando bien.

## Ajustado a esta instancia concreta

`140d.art.conf` no es genérico. Reproduce decisiones de la instalación real que
romperían cosas si se «normalizaran»:

- **Un solo fichero con los seis bloques** (sitio, API, www, analytics, y los
  cuatro redirectores del puerto 80), porque eso es lo que hay y lo que apunta
  el symlink. No existe `sites-available/api.140d.art`.
- **Un único certificado multi-SAN** en `/etc/letsencrypt/live/140d.art/` para
  los cuatro nombres. No existe `live/api.140d.art/` ni
  `live/analytics.140d.art/`: referenciarlos impide arrancar nginx.
- **`client_max_body_size 550M` y timeouts de 600 s en la API.** La subida de
  vídeo de eventos acepta 500 MB en multer
  (`api/routes/admin/eventRoutes.js`). Bajarlos rompe esa subida con un 413 a
  mitad de una carga larga.
- **`proxy_request_buffering off`** en la API, por la misma razón.
- **`www` redirige al apex**, no sirve el sitio. Servirlo en ambos nombres
  crearía contenido duplicado de cara a los buscadores.
- **`ipv6only=on` aparece una sola vez.** Es un parámetro por dirección:puerto;
  repetirlo en otro bloque `[::]:443` aborta el arranque.
- **No se declara `ssl_session_cache` ni `ssl_session_timeout`.** El
  `options-ssl-nginx.conf` de certbot ya los define y nginx aborta por directiva
  duplicada. La reutilización de sesiones TLS ya está resuelta ahí.
- **HTTP/2 va como parámetro de `listen`, no como directiva `http2 on;`.** La
  instancia corre nginx **1.24.0**, y esa directiva no existe hasta la 1.25.1:
  usarla aborta con `unknown directive "http2"`. La forma elegida funciona en
  ambas. Validado con `nginx -t` sobre 1.24 (limpio) y 1.27 (correcto, con un
  aviso de obsolescencia). Si algún día actualizas por encima de 1.25.1 y
  quieres quitar el aviso, cambia los `listen ... http2` por `http2 on;`.

## `analytics.140d.art` — por qué la analítica pasa por esta instancia

Plausible **no corre aquí**: corre en el Mac mini M1, bajo OrbStack, detrás de
Nginx Proxy Manager. Este bloque es un proxy hacia allí, y existe por una razón
que no se deduce leyendo la configuración.

En macOS, la publicación de puertos de OrbStack (igual que la de Docker Desktop)
entra por un proxy en espacio de usuario que **sustituye la IP de origen** por
la puerta de enlace de la red Docker. Medido: toda petición llegaba a NPM como
`192.168.97.1`, incluidas las lanzadas desde el EC2. No es un ajuste mal puesto
—`network_mode: host` tampoco lo evita, [orbstack#1727]— y ninguna configuración
de NPM puede recuperar una IP que nunca le llega.

Consecuencia si no se hiciera este salto: Plausible identifica visitantes únicos
con `hash(sal_diaria, IP, User-Agent, dominio)`. Con la IP constante, **los
visitantes quedarían deduplicados sólo por User-Agent** —dos personas con el
mismo Chrome son una— y la geolocalización sería siempre vacía. No serían datos
imprecisos: serían datos falsos.

Aquí nginx corre sobre Linux y sí ve la IP real. La escribe en
`X-Forwarded-For`, y Plausible toma el valor **de más a la izquierda**
(`lib/plausible_web/remote_ip.ex`, `List.first`), así que la que añade OrbStack
después queda detrás y es inofensiva.

**Un solo nombre para el panel y para la ingesta, y no es opcional.** El
endpoint viaja cocido dentro del script generado como `BASE_URL/api/event`, y
`BASE_URL` gobierna además dónde vive el dashboard y la comprobación CSWSH de
los WebSockets. Separarlos en dos subdominios dejaría el panel cargando páginas
pero con el LiveView rechazado por origen: reconexión infinita.

**Los timeouts están separados por ruta a propósito.** `/api/event` usa 5 s
(el beacon es dispara-y-olvida, pero una conexión colgada consume recursos en
la instancia que sirve la galería); `/live/websocket` usa 3600 s, porque con los
5 s del beacon el WebSocket del panel moriría cada cinco segundos.

`$remote_addr` y **no** `$proxy_add_x_forwarded_for`: el segundo antepone lo que
mande el cliente y, como Plausible coge el primer valor sin verificar nada,
cualquier visitante podría declarar su país. Comprobado antes de arreglarlo: un
`curl` con `X-Forwarded-For: 1.1.1.1` se registró como Australia.

[orbstack#1727]: https://github.com/orbstack/orbstack/issues/1727

### Puesta en marcha (una sola vez, en este orden)

El orden importa: certbot necesita que el nombre resuelva a esta instancia y que
exista un bloque en el puerto 80 antes de poder emitir.

```bash
# 1. Route53: analytics.140d.art  →  A  →  <IP elástica del EC2>
#    (sustituye al CNAME que apuntaba al DDNS del router)
#    Espera a que propague:
dig +short analytics.140d.art

# 2. ⚠️ EDITA el placeholder del DDNS en deploy/nginx/140d.art.conf
#    set $plausible_casa https://CAMBIAR-POR-TU-HOST.asuscomm.com;

# 3. Instala la configuración y valida
sudo cp deploy/nginx/140d.art.conf /etc/nginx/sites-available/140d.art
sudo nginx -t && sudo systemctl reload nginx
```

En este punto `analytics.140d.art` responde con el certificado de `140d.art`,
que todavía **no** lleva ese SAN: el navegador avisará de nombre incorrecto.
Es esperado y dura lo que tardes en el paso siguiente.

```bash
# 4. Amplía el certificado EXISTENTE. --cert-name mantiene la misma lineage,
#    así que la ruta /etc/letsencrypt/live/140d.art/ NO cambia y la
#    configuración no hay que tocarla.
sudo certbot certonly --nginx --cert-name 140d.art --expand \
  -d 140d.art -d www.140d.art -d api.140d.art -d analytics.140d.art

sudo nginx -t && sudo systemctl reload nginx
```

```bash
# 5. Verificación de extremo a extremo
curl -sI https://analytics.140d.art/ -o /dev/null -w '%{http_code} %{ssl_verify_result}\n'
# El panel debe cargar y MANTENER el WebSocket (si reconecta en bucle,
# revisa que Websockets Support siga activo en el Proxy Host de NPM).
```

Y la comprobación que da sentido a todo el bloque — desde una IP pública,
**sin** inyectar ninguna cabecera:

```bash
curl -sS -X POST https://analytics.140d.art/api/event \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' \
  -d '{"name":"pageview","url":"https://140d.art/verificacion","domain":"140d.art"}'
```

En el Mac mini, el país debe salir relleno:

```bash
docker compose exec plausible_events_db clickhouse-client --query \
  "SELECT pathname, country_code FROM plausible_events_db.events_v2
    ORDER BY timestamp DESC LIMIT 3 FORMAT Vertical"
```

`country_code` vacío significa que la cadena sigue rota; **no despliegues el
tracker hasta que salga relleno**, porque los datos recogidos así no se pueden
reconstruir: la IP no se almacena, se convierte en un hash con la sal del día.

### Endurecimiento opcional

Con el DNS ya apuntando al EC2, nada más necesita alcanzar el 443 de tu casa
desde internet. Restringir ese reenvío del router a la IP elástica del EC2
reduce la superficie a un solo origen. Ojo: si esa IP cambiara, la analítica
deja de funcionar sin más aviso que un 502 en `kuadrat-analytics.access.log`.

## Instalación

```bash
# 1. Copia de seguridad de lo que hay ahora
sudo cp /etc/nginx/sites-available/140d.art \
        /root/140d.art.nginx.$(date +%F-%H%M).bak

# 2. Directorios de caché (nginx los crearía solos, pero así el dueño es correcto)
sudo mkdir -p /var/cache/nginx/kuadrat_html /var/cache/nginx/kuadrat_img
sudo chown -R www-data:www-data /var/cache/nginx

# 3. Páginas de error propias
sudo mkdir -p /var/www/kuadrat-errors
sudo cp deploy/nginx/errors/503.html /var/www/kuadrat-errors/__error.html
sudo cp deploy/nginx/errors/503.json /var/www/kuadrat-errors/__error.json
sudo chown -R www-data:www-data /var/www/kuadrat-errors

# 4. Instalar la configuración (desde la raíz del repo en la instancia)
sudo cp deploy/nginx/00-kuadrat-shared.conf /etc/nginx/conf.d/
sudo cp deploy/nginx/140d.art.conf          /etc/nginx/sites-available/140d.art

# 4. Validar SIEMPRE antes de recargar
sudo nginx -t
```

Si `nginx -t` dice `syntax is ok` y `test is successful`:

```bash
sudo systemctl reload nginx
```

`reload` no corta conexiones: los procesos antiguos terminan lo que tienen entre
manos. **Si `nginx -t` falla, NO recargues** — nginx sigue sirviendo con la
configuración anterior cargada en memoria y no ha pasado nada. Restaura y vuelve
a validar:

```bash
sudo cp /root/140d.art.nginx.<fecha>.bak /etc/nginx/sites-available/140d.art
sudo rm /etc/nginx/conf.d/00-kuadrat-shared.conf
sudo nginx -t && sudo systemctl reload nginx
```

## Comprobaciones tras recargar

Todas usan GET (`-o /dev/null -D -`) y no HEAD (`-I`): es lo que hace un
visitante, y evita depender de cómo la clave de caché trate ambos métodos.

```bash
# 1. HTTP/2 (antes negociaba 1.1). Debe imprimir: 2
curl -sI https://140d.art/galeria --http2 -o /dev/null -w '%{http_version}\n'

# 2. Una ficha de obra ya no dice no-store, sino s-maxage
curl -sI https://140d.art/galeria/p/cor | grep -i cache-control

# 3. La caché responde: MISS la primera vez, HIT la segunda
curl -s -o /dev/null -D - https://140d.art/galeria/p/cor | grep -i x-kuadrat-cache
curl -s -o /dev/null -D - https://140d.art/galeria/p/cor | grep -i x-kuadrat-cache

# 4. LO PRIVADO NO SE CACHEA. Debe salir MISS siempre, nunca HIT.
#    Usa una ruta que renderice en servidor: /admin es un prerender estático
#    sin datos de usuario y SÍ se cachea, legítimamente.
for i in 1 2 3; do curl -s -o /dev/null -D - https://140d.art/admin/pedidos/1 | grep -i x-kuadrat-cache; done

# 5. La subida de vídeo sigue admitiendo ficheros grandes (no debe dar 413)
curl -sI https://api.140d.art/api/art -o /dev/null -w '%{http_code}\n'
```

Si el punto 4 devuelve `HIT` alguna vez, **recarga la configuración anterior de
inmediato**: significaría que una página privada se está compartiendo entre
visitantes.

## Ver qué está haciendo la caché

`kuadrat.access.log` y `kuadrat-api.access.log` incluyen el campo `cache=`, que
el formato por defecto de Ubuntu no trae:

```bash
# Reparto de aciertos y fallos
awk '{for(i=1;i<=NF;i++) if($i ~ /^cache=/) print $i}' /var/log/nginx/kuadrat.access.log \
  | sort | uniq -c | sort -rn

# Qué URLs están fallando la caché
grep 'cache=MISS' /var/log/nginx/kuadrat.access.log | awk '{print $7}' | sort | uniq -c | sort -rn | head
```

Valores: `HIT`, `MISS`, `STALE`, `EXPIRED`, `UPDATING`, `BYPASS`, o `-` cuando
la petición no pasa por ninguna zona de caché.

## Invalidar la caché — OBLIGATORIO EN CADA DESPLIEGUE DEL CLIENTE

```bash
sudo rm -rf /var/cache/nginx/kuadrat_html/*
sudo systemctl reload nginx
```

**No es opcional.** Las páginas estáticas (`/`, `/galeria`, `/tienda`, …) salen
de Next con `s-maxage=31536000`, así que nginx las guarda **un año**. Cada build
genera nombres de fichero nuevos para los chunks de JavaScript, de modo que un
HTML viejo servido desde caché apunta a `/_next/static/chunks/<viejo>.js`, que el
contenedor nuevo ya no tiene. El resultado es una página que carga a medias y no
hidrata: se ve, pero no funciona.

Hoy el fallo está parcialmente amortiguado porque `/_next/static/` también se
cachea 30 días y los chunks viejos siguen ahí — pero es una casualidad
afortunada, no un diseño: basta con que un chunk haya sido desalojado por
`max_size` para que la página se rompa. Purga y no dependas de la suerte.

No hay purga selectiva (haría falta `ngx_cache_purge`, que no viene en el
paquete de Ubuntu), así que se vacía el directorio entero.

### Recalienta la caché justo después de purgar

```bash
curl -s -o /dev/null https://140d.art/ https://140d.art/galeria https://140d.art/tienda
curl -s "https://api.140d.art/api/art?page=1&limit=50" \
  | python3 -c "import sys,json;[print(p['slug']) for p in json.load(sys.stdin)['products']]" \
  | while read s; do curl -s -o /dev/null "https://140d.art/galeria/p/$s"; done
```

Tarda unos segundos y evita el único efecto secundario medido de bajar el
contenedor del cliente a 0.5 vCPU: con la caché vacía, el render sostiene ~11
peticiones por segundo, así que un pico de visitas que coincida con el
despliegue encuentra colas de varios segundos. `proxy_cache_lock` amortigua el
caso natural —todos los visitantes caen sobre las mismas pocas URLs y sólo se
renderiza una vez cada una—, pero recalentar a mano lo elimina del todo y no
depende de esa suerte.

Son unas 31 URLs en total; el bucle las cubre todas.

La caché de imágenes (`kuadrat_img`) **no hay que vaciarla nunca**: sus claves
llevan el basename UUID del fichero, así que una imagen nueva es una URL nueva.

## Decisiones que no conviene deshacer sin leer

Todo lo de abajo está verificado con nginx real y upstreams simulados, no
razonado sobre el papel.

- **No se añade `proxy_ignore_headers Cache-Control`.** Es lo único que mantiene
  fuera de la caché al panel de administración, los pedidos y el área de
  vendedor: Next los marca `private, no-store` y nginx lo respeta. Verificado:
  tres peticiones consecutivas a `/admin` dan `MISS` las tres y llegan al
  origen.
- **La clave de caché incluye las cabeceras RSC, y NO incluye `$request_method`.**
  Lo primero, porque el App Router sirve dos cuerpos distintos en la misma URL
  (documento y carga RSC del router) y con la clave por defecto de nginx el
  primero en llegar envenena al otro. Lo segundo, porque nginx sólo cachea GET y
  HEAD y trae `proxy_cache_convert_head` activado para que compartan entrada:
  añadir el método anula esa unificación y guarda cada URL dos veces, de modo
  que un HEAD nunca aprovecha la copia dejada por un GET. Verificado: con el
  método en la clave, dos URLs ocupaban seis ficheros; sin él, dos.
- **`proxy_cache_use_stale` incluye `http_500`.** Es el arreglo de la
  degradación sucia. Verificado con el origen completamente muerto: las páginas
  cacheadas siguen respondiendo `200` (`HIT` si están frescas, `STALE` si han
  caducado); sólo una URL que nunca estuvo en caché da `502`.
- **`limit_req` responde `503`, no corta.** Verificado con 200 peticiones
  concurrentes: 64 pasan (la ráfaga permitida) y 136 reciben `503`. Ninguna
  conexión cortada.
- **La API no se cachea.** Sirve estado (carrito, pujas, stock de ediciones
  limitadas); cachearla podría anunciar disponible una obra ya vendida.
