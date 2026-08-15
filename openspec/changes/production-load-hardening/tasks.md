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
- [x] 3.2 `deploy/nginx/140d.art.conf`: fichero único con los cinco bloques, `http2 on`, caché de HTML con `use_stale`, caché de `/_next/image` y `/_next/static`, `limit_req`.
- [x] 3.3 Adaptar a la instalación real de la instancia: un solo certificado multi-SAN en `live/140d.art`, `client_max_body_size 550M` y timeouts de 600 s en la API (subida de vídeo de 500 MB), `www` redirigiendo al apex, `ipv6only=on` una sola vez, y sin `ssl_session_cache` propio (lo define el `options-ssl-nginx.conf` de certbot y duplicarlo aborta el arranque).
- [x] 3.4 `deploy/nginx/README.md`: instalación, restauración, comprobaciones e invalidación.
- [x] 3.5 Validar la sintaxis con nginx real (`nginx -t`) replicando el entorno de la instancia.
- [x] 3.6 Verificar el comportamiento con upstreams simulados: `/admin` nunca cacheado, HTML y RSC sin contaminarse, `STALE` con el origen caído, y `503` explícito del limitador sin conexiones cortadas.

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

- [x] 7.1 Comprobar que `client/.env` de producción define `INTERNAL_API_URL=http://api:3001/api`. Sin ella el render sigue saliendo por la URL pública — no rompe nada, pero H7 queda a medias.
- [x] 7.2 Instalar la configuración de nginx siguiendo `deploy/nginx/README.md`, con copia de seguridad previa y `nginx -t` antes de recargar.
- [x] 7.3 Reconstruir y levantar: `docker compose -f docker-compose.prod.yml up -d --build`.
- [x] 7.4 Comprobado: HTTP/2 negociado, `s-maxage=300` en la ficha, `X-Kuadrat-Cache: HIT` en la segunda petición. **Corrección a la comprobación de `/admin`**: sí se cachea, y es correcto — es un prerender estático (`○` en la tabla de rutas) cuyo HTML no contiene datos de usuario; la autenticación ocurre en el navegador. Las rutas de admin que sí renderizan en servidor (`/admin/pedidos/[id]`, `/admin/products/[id]/edit`, `/admin/coa/[uid]`) mandan `private, no-store` y nunca se cachean — verificado.
- [x] 7.5 Repetir la rampa de carga y comparar con la línea base (25 / 126 req/s).

## 8. Medición del techo de la API (opcional, ventana acotada)

- [x] 8.1 Subir `GENERAL_RATE_LIMIT_MAX_REQUESTS=1000000` en `api/.env` y recrear sólo el servicio api. Verificado: `RateLimit-Policy: 1000000;w=1800`.
- [x] 8.2 Medido con los límites levantados. Techo de la API: **~50 req/s** (`/api/art`, con consulta a Turso) y **~188 req/s** (`/health`, sin base de datos). Página con MISS en nginx pero acierto de ISR: **108 req/s**. Render completo sin caché en ningún nivel: **23,5 req/s**. Contenido cacheado en nginx: **4 878 req/s**.
- [x] 8.3 **Revertir** `GENERAL_RATE_LIMIT_MAX_REQUESTS` a `1000` y los `rate=` de `00-kuadrat-shared.conf` a `30r/s` (web) y `20r/s` (api). El `warn` del arranque es la red de seguridad, no el procedimiento.

## 9. Derivadas de la medición final

- [x] 9.1 Página de error propia (`deploy/nginx/errors/`) para 502/503/504: HTML con la estética de la galería en el sitio, JSON en la API. Autocontenida (sin fuentes ni CSS externos) porque se sirve justo cuando el origen no responde. Verificada con origen caído y con rechazo del limitador.
- [x] 9.2 Documentar que la purga de `kuadrat_html` es **obligatoria en cada despliegue del cliente**: las páginas estáticas se cachean un año y su HTML referencia chunks de JS que el build nuevo ya no tiene.
- [x] 9.3 **Rebalanceado CPU hacia la API** (api 1.25 / client 0.5). Verificado: p95 de la API baja de 149,6 a 117,3 ms a 20 req/s, y de 141,6 a 114,9 ms en el recorrido real; las páginas no se mueven (23,6 ms). Coste medido: con la caché vacía el render baja de ~23 a ~11 req/s, mitigado recalentando las 31 URLs tras purgar. El reparto actual (api 0.75 / client 1.0) se decidió cuando el cuello era el render. Ya no lo es: nginx sirve lo cacheado y el render ocurre una vez cada 5 min por página, mientras la API —que no se puede cachear— satura a 50 req/s y es hoy el límite del tráfico real. Propuesta: api 1.25 / client 0.5, manteniendo 0.25 para nginx.

- [x] 9.4 Recalibrar los límites por IP. Los **ritmos** se dejan intactos (30 r/s web, 20 r/s api): son lo que impide que una sola IP agote el camino sin caché (108 y 50 req/s medidos). Se amplían las **ráfagas** (60→100, 40→60), porque el App Router precarga los enlaces visibles, y las **conexiones** (50→200 web, 50→100 api), porque con HTTP/2 ese número equivale a «cuántas personas caben tras un mismo NAT». En Express: ventana general de 30 a 5 min y máximo de 1000 a 3000 (recuperación 6× más rápida y margen para CGNAT móvil); `inquiry` de 3 a 5 por hora, ya protegido por Turnstile.
- [x] 9.5 Página de error propia verificada en producción: un 503 real del limitador devuelve la página de la galería (3308 bytes) en lugar del texto plano de nginx.
- [x] 9.6 Documentar el recalentado de caché tras purgar, en `deploy/nginx/README.md`.
- [x] 9.7 Automatizar el despliegue en `deploy/deploy.sh` (+ `deploy/README.md`). Ocho pasos con parada al primer error. Dos ordenaciones que el procedimiento manual invitaba a equivocar: la purga de caché va **después** de que los contenedores respondan (durante el reinicio `proxy_cache_use_stale` cubre a los visitantes, y purgar antes tira esa red), y se elimina el `down --rmi all --volumes` previo, que reconstruía desde cero y mantenía el sitio caído durante toda la compilación en vez de sólo durante el reinicio. Incluye detección de variables presentes en los `.example` y ausentes en los `.env`, validación de nginx con restauración automática si `nginx -t` falla, y una verificación final que aborta en rojo si una ruta privada aparece cacheada.
