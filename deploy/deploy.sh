#!/usr/bin/env bash
#
# Despliegue de producción de 140d.art
#
#   cd ~/projects/kuadrat && ./deploy/deploy.sh
#
# Sustituye a la secuencia manual de comandos. Ejecútalo como tu usuario
# habitual, NO con sudo: pide sudo sólo para los pasos de nginx (purgar la caché
# y recargar). Lanzarlo entero como root haría el `git pull` como root y dejaría
# el repositorio con permisos rotos.
#
# Opciones:
#   --no-pull      No hace `git pull` (despliega lo que haya en el directorio)
#   --no-build     No reconstruye imágenes; sólo recrea contenedores
#   --cache-only   Sólo purga y recalienta la caché de nginx
#   --yes, -y      No pide confirmación
#   --help, -h     Esta ayuda
#
set -euo pipefail

# ── Constantes ───────────────────────────────────────────────────────────────
COMPOSE_FILE="docker-compose.prod.yml"
NGINX_CACHE_HTML="/var/cache/nginx/kuadrat_html"
NGINX_SITE_DST="/etc/nginx/sites-available/140d.art"
NGINX_SHARED_DST="/etc/nginx/conf.d/00-kuadrat-shared.conf"
NGINX_ERRORS_DIR="/var/www/kuadrat-errors"
SITE="https://140d.art"
API="https://api.140d.art"
LOCAL_CLIENT="http://127.0.0.1:3000"
LOCAL_API="http://127.0.0.1:3001"
DEPLOY_KEY="$HOME/.ssh/140d-prod"
HEALTH_TIMEOUT=180   # segundos de margen para que arranquen los contenedores

# ── Salida ───────────────────────────────────────────────────────────────────
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  B=$(tput bold); R=$(tput sgr0); VERDE=$(tput setaf 2); ROJO=$(tput setaf 1); AMB=$(tput setaf 3); GRIS=$(tput setaf 8)
else
  B=""; R=""; VERDE=""; ROJO=""; AMB=""; GRIS=""
fi
PASO=0
paso()  { PASO=$((PASO+1)); printf '\n%s[%d/%d]%s %s\n' "$B" "$PASO" "$TOTAL_PASOS" "$R" "$1"; }
ok()    { printf '      %s✓%s %s\n' "$VERDE" "$R" "$1"; }
info()  { printf '      %s·%s %s\n' "$GRIS" "$R" "$1"; }
aviso() { printf '      %s!%s %s\n' "$AMB" "$R" "$1"; }
fallo() { printf '\n%s✗ %s%s\n\n' "$ROJO" "$1" "$R" >&2; exit 1; }

trap 'printf "\n%s✗ El despliegue se ha detenido en la línea %s.%s\n   El estado anterior sigue en pie: nada se aplica hasta que el paso correspondiente termina bien.\n\n" "$ROJO" "$LINENO" "$R" >&2' ERR

# ── Opciones ─────────────────────────────────────────────────────────────────
HACER_PULL=1; HACER_BUILD=1; SOLO_CACHE=0; CONFIRMAR=1
while [ $# -gt 0 ]; do
  case "$1" in
    --no-pull)    HACER_PULL=0 ;;
    --no-build)   HACER_BUILD=0 ;;
    --cache-only) SOLO_CACHE=1 ;;
    -y|--yes)     CONFIRMAR=0 ;;
    # Imprime la cabecera del propio fichero hasta la primera línea que no es
    # comentario, en lugar de un rango fijo: así la ayuda no se descuadra al
    # editar el encabezado.
    -h|--help)    awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *)            fallo "Opción desconocida: $1 (usa --help)" ;;
  esac
  shift
done
[ "$SOLO_CACHE" = "1" ] && { HACER_PULL=0; HACER_BUILD=0; }
TOTAL_PASOS=$([ "$SOLO_CACHE" = "1" ] && echo 3 || echo 8)

cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO="$PWD"

printf '\n%s╭─ Despliegue de producción · 140d.art%s\n' "$B" "$R"
printf '%s│%s  repositorio: %s\n' "$B" "$R" "$REPO"
printf '%s╰─%s\n' "$B" "$R"

# ═══ 1. Comprobaciones previas ═══════════════════════════════════════════════
paso "Comprobaciones previas"

[ "$(id -u)" -ne 0 ] || fallo "No lo ejecutes como root. Úsalo con tu usuario; pedirá sudo sólo para nginx."
[ -f "$REPO/$COMPOSE_FILE" ] || fallo "No encuentro $COMPOSE_FILE. ¿Estás en el repositorio correcto?"
command -v docker >/dev/null || fallo "docker no está instalado o no está en el PATH."
docker compose version >/dev/null 2>&1 || fallo "'docker compose' no está disponible (¿versión antigua de Docker?)."
ok "docker y compose disponibles"

if sudo -n true 2>/dev/null; then
  ok "sudo sin contraseña"
else
  aviso "sudo pedirá contraseña en los pasos de nginx"
fi

# Los tres .env que hacen falta. El de la raíz alimenta los build-args
# NEXT_PUBLIC_* que Next.js incrusta en el bundle durante la compilación.
for f in "$REPO/.env" "$REPO/api/.env" "$REPO/client/.env"; do
  [ -f "$f" ] || fallo "Falta $f. Sin él, compose no puede resolver sus variables."
done
ok "los tres .env están presentes"

# Variables nuevas en los .example que aún no están en los .env reales. Es el
# fallo clásico de este proyecto: un NEXT_PUBLIC_* que falta en la build se
# incrusta VACÍO en el bundle y el síntoma aparece en el navegador, lejos de
# aquí. Se avisa, no se aborta: puede haber variables opcionales.
faltantes_totales=0
comparar_env() {
  local ejemplo="$1" real="$2"
  [ -f "$ejemplo" ] || return 0
  local faltan
  faltan=$(comm -23 \
    <(grep -oE '^[A-Z][A-Z0-9_]*=' "$ejemplo" | tr -d '=' | sort -u) \
    <(grep -oE '^[A-Z][A-Z0-9_]*=' "$real"    | tr -d '=' | sort -u) || true)
  if [ -n "$faltan" ]; then
    aviso "$(basename "$(dirname "$real")")/$(basename "$real") no define: $(echo "$faltan" | tr '\n' ' ')"
    faltantes_totales=$((faltantes_totales+1))
  fi
}
comparar_env "$REPO/.env.example"        "$REPO/.env"
comparar_env "$REPO/api/.env.example"    "$REPO/api/.env"
comparar_env "$REPO/client/.env.example" "$REPO/client/.env"
[ "$faltantes_totales" -eq 0 ] && ok "los .env cubren todas las variables de los .example"

if [ "$SOLO_CACHE" = "1" ]; then
  printf '\n%sModo --cache-only:%s sólo se purgará y recalentará la caché.\n' "$B" "$R"
else
  if [ "$CONFIRMAR" = "1" ]; then
    printf '\n   Se va a %sreconstruir y reiniciar producción%s. ¿Continuar? [s/N] ' "$B" "$R"
    read -r respuesta
    case "$respuesta" in [sSyY]*) ;; *) printf '   Cancelado.\n\n'; exit 0 ;; esac
  fi
fi

# ═══ 2. Código ═══════════════════════════════════════════════════════════════
if [ "$HACER_PULL" = "1" ]; then
  paso "Actualizando el código"
  # La clave de despliegue sólo se carga si no está ya en el agente, para no
  # pedir la passphrase en cada ejecución.
  if [ -f "$DEPLOY_KEY" ]; then
    if ! ssh-add -l >/dev/null 2>&1; then
      eval "$(ssh-agent -s)" >/dev/null
      ssh-add "$DEPLOY_KEY"
      info "clave de despliegue cargada en un agente nuevo"
    else
      info "ya hay un agente ssh con claves cargadas"
    fi
  fi
  antes=$(git rev-parse --short HEAD)
  git pull origin main
  ahora=$(git rev-parse --short HEAD)
  if [ "$antes" = "$ahora" ]; then
    ok "sin cambios ($ahora)"
  else
    ok "$antes → $ahora"
    git --no-pager log --oneline "$antes..$ahora" | sed 's/^/      · /'
  fi
else
  paso "Actualizando el código"
  info "omitido (--no-pull); se despliega $(git rev-parse --short HEAD)"
fi

# ═══ 3. nginx ════════════════════════════════════════════════════════════════
paso "Configuración de nginx"
nginx_cambiado=0
sincronizar_nginx() {
  local origen="$1" destino="$2"
  if [ ! -f "$destino" ] || ! sudo cmp -s "$origen" "$destino"; then
    sudo cp -a "$destino" "${destino}.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
    sudo cp "$origen" "$destino"
    info "actualizado $(basename "$destino")"
    nginx_cambiado=1
  fi
}
sudo mkdir -p "$NGINX_ERRORS_DIR"
sincronizar_nginx "$REPO/deploy/nginx/00-kuadrat-shared.conf" "$NGINX_SHARED_DST"
sincronizar_nginx "$REPO/deploy/nginx/140d.art.conf"          "$NGINX_SITE_DST"
sincronizar_nginx "$REPO/deploy/nginx/errors/503.html"        "$NGINX_ERRORS_DIR/__error.html"
sincronizar_nginx "$REPO/deploy/nginx/errors/503.json"        "$NGINX_ERRORS_DIR/__error.json"

if [ "$nginx_cambiado" = "1" ]; then
  # `nginx -t` valida contra los ficheros en disco SIN aplicarlos. Si falla,
  # nginx sigue sirviendo con lo que tiene cargado en memoria y no ha pasado
  # nada — por eso se restauran las copias antes de abortar.
  if sudo nginx -t 2>&1 | sed 's/^/      /'; then
    sudo systemctl reload nginx
    ok "configuración aplicada y nginx recargado"
  else
    aviso "restaurando la configuración anterior..."
    for d in "$NGINX_SHARED_DST" "$NGINX_SITE_DST"; do
      ultima=$(sudo ls -1t "${d}".bak.* 2>/dev/null | head -1 || true)
      [ -n "$ultima" ] && sudo cp "$ultima" "$d"
    done
    fallo "nginx -t ha fallado. Se ha restaurado lo anterior; nginx no se ha tocado."
  fi
else
  ok "sin cambios"
fi

# ═══ 4. Contenedores ═════════════════════════════════════════════════════════
paso "Construyendo y levantando los contenedores"
# Deliberadamente SIN `down --rmi all`: borrar las imágenes obliga a
# reconstruir desde cero en cada despliegue y —lo importante— deja el sitio
# caído durante toda la compilación, no sólo durante el reinicio. `up -d
# --build` compila primero, con el sitio en pie, y sólo entonces recrea los
# contenedores. La caché de capas de Docker hace el resto.
if [ "$HACER_BUILD" = "1" ]; then
  docker compose -f "$COMPOSE_FILE" up -d --build 2>&1 | sed 's/^/      /'
else
  docker compose -f "$COMPOSE_FILE" up -d 2>&1 | sed 's/^/      /'
  info "sin reconstruir (--no-build)"
fi
ok "contenedores en marcha"

# ═══ 5. Salud ════════════════════════════════════════════════════════════════
paso "Esperando a que respondan"
# Este paso va ANTES de purgar la caché a propósito. Mientras los contenedores
# reinician, nginx sigue sirviendo copias cacheadas (`proxy_cache_use_stale`),
# así que los visitantes no ven nada. Purgar antes de tiempo tiraría justo esa
# red de seguridad.
esperar() {
  local url="$1" nombre="$2" fin=$((SECONDS + HEALTH_TIMEOUT))
  while [ $SECONDS -lt $fin ]; do
    if curl -sf -o /dev/null --max-time 5 "$url" 2>/dev/null; then
      ok "$nombre responde"; return 0
    fi
    sleep 2
  done
  fallo "$nombre no responde tras ${HEALTH_TIMEOUT}s. Revisa: docker compose -f $COMPOSE_FILE logs --tail=50"
}
esperar "$LOCAL_API/health" "api"
esperar "$LOCAL_CLIENT/"    "client"

# ═══ 6. Caché ════════════════════════════════════════════════════════════════
paso "Purgando la caché de páginas"
# Obligatorio en cada despliegue del cliente: las páginas estáticas se cachean
# un año y su HTML referencia chunks de JS con nombres que el build nuevo ya no
# tiene. Servir HTML viejo con chunks que devuelven 404 da una página que se ve
# pero no funciona.
#
# La caché de imágenes (kuadrat_img) NO se toca: sus claves llevan el basename
# UUID del fichero, así que una imagen nueva es siempre una URL nueva.
sudo rm -rf "${NGINX_CACHE_HTML:?}"/* 2>/dev/null || true
sudo systemctl reload nginx
ok "caché de páginas vacía"

# ═══ 7. Recalentado ══════════════════════════════════════════════════════════
paso "Recalentando la caché"
# Con la caché vacía el render sostiene ~11 req/s, así que un pico de visitas
# justo después del despliegue encontraría colas de varios segundos. Recorrer
# las URLs aquí tarda segundos y lo elimina.
calentar() { curl -sf -o /dev/null --max-time 20 "$1" 2>/dev/null && printf '.' || printf 'x'; }
printf '      '
for ruta in / /galeria /tienda /eventos /autores /contacto; do calentar "$SITE$ruta"; done
for endpoint in art others; do
  slugs=$(curl -sf --max-time 15 "$API/api/$endpoint?page=1&limit=100" 2>/dev/null \
    | python3 -c "import sys,json;[print(p.get('slug') or p.get('id')) for p in json.load(sys.stdin).get('products',[])]" 2>/dev/null || true)
  seccion=$([ "$endpoint" = "art" ] && echo galeria || echo tienda)
  if [ -n "$slugs" ]; then
    while IFS= read -r s; do [ -n "$s" ] && calentar "$SITE/$seccion/p/$s"; done <<< "$slugs"
  fi
done
printf '\n'
ok "URLs públicas recorridas ('.' = servida, 'x' = fallo)"

# ═══ 8. Verificación ═════════════════════════════════════════════════════════
paso "Verificación final"
errores=0
comprobar() {
  local desc="$1" real="$2" esperado="$3"
  if [ "$real" = "$esperado" ]; then ok "$desc"
  else aviso "$desc — esperado '$esperado', obtenido '$real'"; errores=$((errores+1)); fi
}

comprobar "el sitio responde 200"  "$(curl -sS -o /dev/null -w '%{http_code}' "$SITE/galeria")" "200"
comprobar "la API responde 200"    "$(curl -sS -o /dev/null -w '%{http_code}' "$API/health")"   "200"
comprobar "HTTP/2 negociado"       "$(curl -sS -o /dev/null -w '%{http_version}' "$SITE/galeria")" "2"

# La caché sirve: tras el recalentado, la siguiente petición debe ser un acierto.
estado_cache=$(curl -sSI "$SITE/galeria" 2>/dev/null | grep -i '^x-kuadrat-cache:' | tr -d '\r' | awk '{print $2}')
comprobar "la caché de nginx sirve" "$estado_cache" "HIT"

# Una ficha de obra ya no puede salir sin cachear.
cc=$(curl -sSI "$SITE/galeria/p/$(curl -sf "$API/api/art?page=1&limit=1" | python3 -c 'import sys,json;p=json.load(sys.stdin)["products"];print(p[0]["slug"] if p else "")' 2>/dev/null)" 2>/dev/null | grep -i '^cache-control:' | tr -d '\r')
case "$cc" in
  *s-maxage*) ok "la ficha de obra se sirve cacheable" ;;
  *)          aviso "la ficha de obra no anuncia s-maxage: $cc"; errores=$((errores+1)) ;;
esac

# Lo privado NO puede cachearse. Si esto falla, es lo más grave que puede pasar.
priv=$(curl -sSI "$SITE/admin/pedidos/1" 2>/dev/null | grep -i '^x-kuadrat-cache:' | tr -d '\r' | awk '{print $2}')
if [ "$priv" = "HIT" ]; then
  fallo "GRAVE: /admin/pedidos/1 se está sirviendo desde caché. Restaura la configuración de nginx AHORA."
fi
ok "las rutas privadas no se cachean"

# ── Resumen ──────────────────────────────────────────────────────────────────
printf '\n'
if [ "$errores" -eq 0 ]; then
  printf '%s%s ✓ Despliegue completado%s  ·  %s  ·  %s\n\n' "$B" "$VERDE" "$R" "$(git rev-parse --short HEAD)" "$SITE"
else
  printf '%s%s ! Desplegado con %d comprobación(es) en amarillo%s\n' "$B" "$AMB" "$errores" "$R"
  printf '   El sitio está en pie. Revisa los avisos de arriba.\n\n'
  exit 1
fi
