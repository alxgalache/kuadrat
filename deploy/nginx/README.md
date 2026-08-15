# nginx de producción

Configuración versionada del proxy de `140d.art`. Hasta ahora vivía sólo en
`/etc/nginx` de la instancia, sin copia en el repo y sin caché, límites ni
HTTP/2 — ver el hallazgo H3/H6 del informe de carga.

| Fichero | Destino en la instancia |
|---|---|
| `00-kuadrat-shared.conf` | `/etc/nginx/conf.d/00-kuadrat-shared.conf` |
| `140d.art.conf` | `/etc/nginx/sites-available/140d.art` |
| `api.140d.art.conf` | `/etc/nginx/sites-available/api.140d.art` |

`00-kuadrat-shared.conf` **debe cargarse antes** que los otros dos: define los
`upstream`, las zonas de caché y los mapas, que viven en el contexto `http`.
El prefijo `00-` lo garantiza con el `include /etc/nginx/conf.d/*.conf` que trae
Ubuntu por defecto.

## Instalación

Los certificados los gestiona certbot y **no** se tocan. Antes de copiar nada,
comprueba que las rutas del repo coinciden con las que ya tienes:

```bash
grep -h ssl_certificate /etc/nginx/sites-available/140d.art \
                        /etc/nginx/sites-available/api.140d.art
```

Si difieren, edita los ficheros del repo — no al revés.

```bash
# 1. Copia de seguridad de lo que hay ahora
sudo cp -a /etc/nginx/sites-available /root/nginx-sites-available.$(date +%F)

# 2. Directorios de caché (el usuario de nginx en Ubuntu es www-data)
sudo mkdir -p /var/cache/nginx/kuadrat_html /var/cache/nginx/kuadrat_img
sudo chown -R www-data:www-data /var/cache/nginx

# 3. Instalar
sudo cp deploy/nginx/00-kuadrat-shared.conf /etc/nginx/conf.d/
sudo cp deploy/nginx/140d.art.conf          /etc/nginx/sites-available/140d.art
sudo cp deploy/nginx/api.140d.art.conf      /etc/nginx/sites-available/api.140d.art
sudo ln -sf /etc/nginx/sites-available/140d.art     /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/api.140d.art /etc/nginx/sites-enabled/

# 4. Validar SIEMPRE antes de recargar
sudo nginx -t && sudo systemctl reload nginx
```

`reload` no corta conexiones: los procesos viejos terminan lo que tienen entre
manos. Si `nginx -t` falla, no recargues — restaura desde la copia del paso 1.

## Comprobaciones

```bash
# HTTP/2 activo (antes negociaba 1.1)
curl -sI https://140d.art/galeria --http2 -o /dev/null -w '%{http_version}\n'

# La caché responde: MISS la primera vez, HIT la segunda
curl -sI https://140d.art/galeria | grep -i x-kuadrat-cache
curl -sI https://140d.art/galeria | grep -i x-kuadrat-cache

# Una ficha de obra ya no dice no-store
curl -sI https://140d.art/galeria/p/cor | grep -i cache-control

# Lo privado NO se cachea (debe decir BYPASS o no aparecer el header con HIT)
curl -sI https://140d.art/admin | grep -i -E 'x-kuadrat-cache|cache-control'
```

## Invalidar la caché

No hay purga selectiva (haría falta `ngx_cache_purge`, que no viene en el
paquete de Ubuntu). Para un despliegue con cambios de plantilla:

```bash
sudo rm -rf /var/cache/nginx/kuadrat_html/*
sudo systemctl reload nginx
```

La caché de imágenes (`kuadrat_img`) **no hay que vaciarla nunca**: sus claves
llevan el basename UUID del fichero, así que una imagen nueva es una URL nueva.

## Decisiones que no conviene deshacer sin leer

- **No se añade `proxy_ignore_headers Cache-Control`.** Es lo que hace que el
  panel de administración, los pedidos y el área de vendedor no se cacheen:
  Next los marca `private, no-store` y nginx lo respeta. Ignorar esas cabeceras
  daría un salto de rendimiento y podría servirle a un visitante el panel de
  otro.
- **La clave de caché incluye las cabeceras RSC.** El App Router sirve dos
  respuestas distintas en la misma URL (HTML completo y carga RSC del router).
  Con la clave por defecto de nginx, la primera en llegar envenena a la otra.
- **`proxy_cache_use_stale` incluye `http_500`.** Es el arreglo de la
  degradación sucia: bajo saturación el origen cortaba conexiones en seco y el
  visitante veía una pestaña en blanco. Ahora se sirve la última copia buena.
- **La API no se cachea.** Sirve estado (carrito, pujas, stock de ediciones);
  cachearla podría vender una obra ya vendida.
