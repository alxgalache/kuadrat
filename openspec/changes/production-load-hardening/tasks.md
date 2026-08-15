# Tareas

## 1. Caché de render (H1)

- [x] 1.1 `client/app/galeria/p/[id]/page.js`: `revalidate = 300`, `generateStaticParams()` vacío y `dynamicParams = true`.
- [x] 1.2 Lo mismo en `client/app/tienda/p/[id]/page.js`.
- [x] 1.3 Lo mismo en `client/app/galeria/autor/[authorSlug]/page.js`.
- [x] 1.4 Lo mismo en `client/app/tienda/autor/[authorSlug]/page.js`.
- [x] 1.5 Verificar en la tabla de rutas de `next build` que las cuatro pasan de `ƒ` a `●`.
- [x] 1.6 Verificar en runtime que la ficha devuelve `s-maxage=300` y `x-nextjs-cache: HIT` en la segunda petición.

## 2. Rate limit e URL interna (H7) — riesgo alto: middleware compartido

- [x] 2.1 `api/middleware/rateLimiter.js`: `isInternalRequest()` y exención en `generalLimiter`.
- [x] 2.2 `api/middleware/rateLimiter.js`: `warn` al arrancar si el límite general queda por encima de 100 000.
- [x] 2.3 `client/lib/serverApi.js`: separar `DATA_API_URL` (interna, para los `fetch`) de `API_URL` (pública, para las URLs de imagen que viajan en el HTML).
- [x] 2.4 `api/tests/rateLimitInternalExemption.test.js`, incluido el caso de falsificación con `X-Forwarded-For`.
- [x] 2.5 `api/.env.example`: documentar la ventana en minutos, la exención interna y el procedimiento para medir el techo de la API.

## 3. Proxy (H3, H6)

- [x] 3.1 `deploy/nginx/00-kuadrat-shared.conf`: upstreams con keepalive, mapa `$connection_upgrade`, zonas de `limit_req`/`limit_conn`, `proxy_cache_path`, clave RSC.
- [x] 3.2 `deploy/nginx/140d.art.conf`: `http2 on`, caché de HTML con `use_stale`, caché de `/_next/image` y `/_next/static`, `limit_req`.
- [x] 3.3 `deploy/nginx/api.140d.art.conf`: `http2 on`, bloque de Socket.IO, caché de imágenes servidas por la API, sin caché de datos.
- [x] 3.4 `deploy/nginx/README.md`: instalación, comprobaciones, invalidación y decisiones que no conviene deshacer.
- [x] 3.5 Validar la sintaxis con nginx real (`nginx -t` en contenedor).

## 4. Imágenes (H5)

- [x] 4.1 `client/next.config.js`: `minimumCacheTTL` a un año, `deviceSizes` a 5 anchos, `formats` explícito sin AVIF.
- [x] 4.2 Caché en disco de `/_next/image` en nginx con `proxy_cache_lock` (cubierto por 3.2).

## 5. Infraestructura

- [x] 5.1 `api/Dockerfile.prod` con `npm ci --omit=dev` y `tini`.
- [x] 5.2 `docker-compose.prod.yml`: usar `Dockerfile.prod`, quitar el `command:` sobreescrito.
- [x] 5.3 `docker-compose.prod.yml`: reparto de CPU dejando margen a nginx (api 0.75 / client 1.0 de 2 vCPU).
- [x] 5.4 `docker-compose.prod.yml`: `healthcheck` en ambos servicios.
- [x] 5.5 Verificar que la imagen de producción de la API compila y no arrastra jest/nodemon/supertest.
- [x] 5.6 Validar `docker compose -f docker-compose.prod.yml config`.

## 6. Verificación

- [x] 6.1 Suite completa de la API en verde (281 tests).
- [x] 6.2 `next build` en verde con los cuatro cambios de ruta.
- [x] 6.3 Carga local contra el contenedor con 1 vCPU sobre la ficha ya cacheada.

## 7. Despliegue (manual, en la instancia)

- [ ] 7.1 Comprobar que `client/.env` de producción define `INTERNAL_API_URL=http://api:3001/api`. Sin ella el render sigue saliendo por la URL pública — no rompe nada, pero H7 queda a medias.
- [ ] 7.2 Instalar la configuración de nginx siguiendo `deploy/nginx/README.md`, con copia de seguridad previa y `nginx -t` antes de recargar.
- [ ] 7.3 Reconstruir y levantar: `docker compose -f docker-compose.prod.yml up -d --build`.
- [ ] 7.4 Comprobar las cuatro cosas: HTTP/2 negociado, `Cache-Control: s-maxage` en una ficha de obra, `X-Kuadrat-Cache: HIT` en la segunda petición, y **ninguna** caché en `/admin`.
- [ ] 7.5 Repetir la rampa de carga y comparar con la línea base (25 / 126 req/s).

## 8. Medición del techo de la API (opcional, ventana acotada)

- [ ] 8.1 Subir `GENERAL_RATE_LIMIT_MAX_REQUESTS=1000000` en `api/.env` y recrear sólo el servicio api.
- [ ] 8.2 Rampa contra `https://api.140d.art/api/art` a 100, 200 y 400 req/s.
- [ ] 8.3 **Revertir el valor** y volver a levantar. El `warn` del arranque es la red de seguridad, no el procedimiento.
