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

- **Un solo fichero con los cinco bloques** (sitio, API, www, y los tres
  redirectores del puerto 80), porque eso es lo que hay y lo que apunta el
  symlink. No existe `sites-available/api.140d.art`.
- **Un único certificado multi-SAN** en `/etc/letsencrypt/live/140d.art/` para
  los tres nombres. No existe `live/api.140d.art/`: referenciarlo impide
  arrancar nginx.
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

```bash
# 1. HTTP/2 (antes negociaba 1.1). Debe imprimir: 2
curl -sI https://140d.art/galeria --http2 -o /dev/null -w '%{http_version}\n'

# 2. Una ficha de obra ya no dice no-store, sino s-maxage
curl -sI https://140d.art/galeria/p/cor | grep -i cache-control

# 3. La caché responde: MISS la primera vez, HIT la segunda
curl -sI https://140d.art/galeria/p/cor | grep -i x-kuadrat-cache
curl -sI https://140d.art/galeria/p/cor | grep -i x-kuadrat-cache

# 4. LO PRIVADO NO SE CACHEA. Debe salir MISS las tres veces, nunca HIT
for i in 1 2 3; do curl -sI https://140d.art/admin | grep -i x-kuadrat-cache; done

# 5. La subida de vídeo sigue admitiendo ficheros grandes (no debe dar 413)
curl -sI https://api.140d.art/api/art -o /dev/null -w '%{http_code}\n'
```

Si el punto 4 devuelve `HIT` alguna vez, **recarga la configuración anterior de
inmediato**: significaría que una página privada se está compartiendo entre
visitantes.

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
- **La clave de caché incluye las cabeceras RSC.** El App Router sirve dos
  cuerpos distintos en la misma URL (documento y carga RSC del router); con la
  clave por defecto de nginx, el primero en llegar envenena al otro. Verificado:
  la variante HTML y la RSC se guardan y sirven por separado.
- **`proxy_cache_use_stale` incluye `http_500`.** Es el arreglo de la
  degradación sucia. Verificado con el origen completamente muerto: las páginas
  cacheadas siguen respondiendo `200` (`HIT` si están frescas, `STALE` si han
  caducado); sólo una URL que nunca estuvo en caché da `502`.
- **`limit_req` responde `503`, no corta.** Verificado con 200 peticiones
  concurrentes: 64 pasan (la ráfaga permitida) y 136 reciben `503`. Ninguna
  conexión cortada.
- **La API no se cachea.** Sirve estado (carrito, pujas, stock de ediciones
  limitadas); cachearla podría anunciar disponible una obra ya vendida.
