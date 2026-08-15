# Despliegue de producción

```bash
cd ~/projects/kuadrat && ./deploy/deploy.sh
```

Eso es todo. El script hace los ocho pasos que antes se ejecutaban a mano, en el
orden correcto, y aborta en cuanto algo va mal.

Para tenerlo a un solo comando, añade el alias en la instancia:

```bash
echo "alias desplegar='cd ~/projects/kuadrat && ./deploy/deploy.sh'" >> ~/.bashrc
source ~/.bashrc
```

A partir de ahí, `desplegar` desde cualquier directorio.

## Qué hace, y por qué en ese orden

| | Paso | Nota |
|---|---|---|
| 1 | Comprobaciones previas | Los tres `.env`, docker, sudo, y **variables nuevas en los `.example` que faltan en los `.env`** |
| 2 | `git pull origin main` | Carga la clave de despliegue sólo si no hay ya un agente |
| 3 | Configuración de nginx | Copia los ficheros del repo **sólo si han cambiado**, valida con `nginx -t` y restaura si falla |
| 4 | `up -d --build` | Sin `down` previo: ver abajo |
| 5 | Esperar a que respondan | **Antes** de purgar: ver abajo |
| 6 | Purgar la caché de páginas | Obligatorio en cada despliegue del cliente |
| 7 | Recalentar | Recorre las URLs públicas |
| 8 | Verificación | 200, HTTP/2, caché sirviendo, ficha cacheable, y **privado sin cachear** |

### Por qué ya no hay `docker compose down --rmi all --volumes`

Borrar las imágenes obliga a reconstruir desde cero en cada despliegue, y
—lo importante— deja el sitio **caído durante toda la compilación**, no sólo
durante el reinicio. `up -d --build` compila primero, con el sitio en pie, y
sólo entonces recrea los contenedores: la parada baja de varios minutos a unos
segundos.

Dos aclaraciones sobre lo que se pierde al quitarlo: `--volumes` nunca afectó a
las subidas, porque `/home/ubuntu/uploads` es un *bind mount* y esos no se
borran. Y el `down` original no llevaba `-f docker-compose.prod.yml`, así que
operaba con la definición de desarrollo.

Si alguna vez necesitas de verdad una reconstrucción limpia:

```bash
docker compose -f docker-compose.prod.yml build --no-cache && ./deploy/deploy.sh --no-build
```

### Por qué se espera a que respondan antes de purgar

Mientras los contenedores reinician, nginx sigue sirviendo copias cacheadas
(`proxy_cache_use_stale`), de modo que los visitantes no ven nada. Purgar antes
de tiempo tiraría justo esa red de seguridad y expondría el reinicio.

### Por qué se recalienta

Con la caché vacía el render sostiene ~11 peticiones por segundo (medido). Un
pico de visitas que coincida con el despliegue encontraría colas de varios
segundos. Recorrer las ~31 URLs públicas tarda segundos y lo elimina.

## Opciones

| Opción | Para qué |
|---|---|
| `--no-pull` | Desplegar lo que ya hay en el directorio, sin traer cambios |
| `--no-build` | Recrear contenedores sin reconstruir imágenes |
| `--cache-only` | Sólo purgar y recalentar (útil tras editar contenido) |
| `-y`, `--yes` | Sin confirmación |

## Cuando algo falla

El script se detiene en el primer error y **no continúa**, así que el estado
anterior sigue en pie. Los dos casos que tienen recuperación automática:

- **`nginx -t` falla** → restaura la configuración anterior y aborta. nginx no
  llega a recargarse, así que sigue sirviendo con lo que tenía en memoria.
- **Un contenedor no responde en 180 s** → aborta antes de purgar la caché, de
  modo que nginx sigue sirviendo las copias que ya tenía.

Para volver a una versión anterior:

```bash
git log --oneline -10
git checkout <commit>
./deploy/deploy.sh --no-pull
git checkout main   # cuando lo hayas resuelto
```

## Lo único que sigue siendo manual

Editar los `.env` cuando un cambio introduce variables nuevas. El script no
puede inventarse los valores, pero **sí te avisa** en el paso 1 de qué variables
están en los `.example` y no en los `.env` reales — que es el fallo clásico de
este proyecto: un `NEXT_PUBLIC_*` ausente se incrusta vacío en el bundle durante
la compilación y el síntoma aparece después en el navegador, lejos de la causa.
