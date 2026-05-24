## Context

El backend ya entrega los tres endpoints admin para gestionar las pegatinas NTAG 424 DNA vinculadas a Certificados de Autenticidad (capability `coa-nfc-verification`, archivada en `2026-05-22-ntag424-coa-programming`). El flujo actual obliga al admin a usar `curl` con el JWT exportado para revocar/restaurar, lo cual no es operable. El frontend admin Kuadrat sigue un patrón muy estable: páginas client component bajo `client/app/admin/<recurso>/`, envueltas en `<AuthGuard requireRole="admin">`, con tabla server-rendered, badges por estado y botones de acción que llaman al cliente centralizado `adminAPI.*` de `client/lib/api.js`. Esta propuesta añade UI siguiendo exactamente ese patrón, sin modificar backend.

Restricciones:
- Sin TypeScript, Tailwind utility-first, es-ES en todo el texto.
- Reutilizar `useDebounce`, `apiRequest`, `AuthGuard`, `@heroicons/react` y la paleta de badges usada en `subastas/page.js`.
- Branding: "140d Galería de Arte" en cabeceras y mensajes de cara al usuario final (memoria `feedback_public_branding`). En el admin interno se puede usar el nombre técnico "CoA" en menús/rutas.

## Goals / Non-Goals

**Goals:**
- Listar tags paginados con filtros útiles (status, búsqueda por UID/serial, búsqueda por obra).
- Vista de detalle con metadatos completos del tag + historial de `verification_events` ordenado y paginable ("ver más").
- Cambio de estado auditado (notas obligatorias en transiciones reales) sin recargar la página.
- Cross-link bidireccional desde `/admin/products/[id]/edit` al tag activo de esa obra, y desde el detalle del tag a la edición de la obra.
- Patrones consistentes con `subastas/page.js`, `pedidos/`, `authors/` (mismas clases, mismo AuthGuard, misma forma de manejar `loading`/`error`).

**Non-Goals:**
- **NO** se añade alta de tags por UI (la personalización es offline vía `scripts/nfc-personalization/`).
- **NO** se añade borrado de tags (la API tampoco lo expone; el modelo de datos lo prohíbe vía FK `RESTRICT`).
- **NO** se gestiona el bloqueo permanente (`is_permanently_locked`) desde la UI — solo se visualiza; el lock es físico, irreversible y operado offline.
- **NO** se modifica la guía técnica `docs/guia_ntag424_galeria.md` ni los endpoints existentes.
- **NO** se traduce/expone información criptográfica del chip (claves derivadas, contadores SDM en crudo distintos de `last_counter`).

## Decisions

### 1. Estructura de rutas y componentes

- `client/app/admin/coa/page.js` — listado paginado (Client Component, `AuthGuard`).
- `client/app/admin/coa/[uid]/page.js` — detalle (Client Component, `AuthGuard`).
- `client/components/admin/CoaStatusModal.js` — modal compartido para PATCH de status.
- `client/components/admin/CoaEventsTable.js` — tabla de `verification_events` con "Cargar más".
- `client/hooks/useArtAutocomplete.js` — hook para resolver el filtro por obra (consulta a `/api/art?search=...`, ya existente, devuelve `{id, name, slug}[]`).

**Por qué Client Components y no Server Components**: el resto del admin (`subastas`, `authors`, `pedidos`) es enteramente client-side con `apiRequest` (que añade el JWT desde localStorage). El admin no puede ser SSR porque el JWT vive en el cliente. Mantener consistencia es más valioso que ahorrar JS aquí.

### 2. Filtros del listado y cómo se transmiten al endpoint

El endpoint acepta `status`, `art_id`, `page`, `limit` — pero **NO** acepta búsqueda libre por UID ni por nombre de obra. Decisión:

- **Filtro `status`**: select nativo, valores `''` (todos), `active`, `revoked`, `lost`, `damaged`.
- **Búsqueda por UID/serial**: input de texto con `useDebounce(value, 300)` que filtra **client-side** sobre la página actual. La razón: el listado total esperado es muy pequeño (decenas de obras), no merece la pena ampliar el endpoint. Si crece, se añade `?q=` al backend en otra iteración (registrado como Open Question abajo).
- **Búsqueda por obra**: autocomplete sobre `/api/art?search=...&visible_all=true` (endpoint público existente que ya implementa búsqueda por slug/nombre). El resultado elegido fija `art_id` en el query del listado y se muestra como chip con "✕" para limpiar. Si el endpoint público no acepta admin-visible-all (filtra por `visible=1`), se usa el endpoint admin equivalente o se aplica una mínima ampliación documentada como Open Question.

**Alternativa rechazada**: server-side search con `?q=`. Requiere modificar el backend y crear un índice — desproporcionado para el volumen real.

### 3. Detalle: cómo paginar `verification_events`

El endpoint admite `?events_limit=N` (default 50, sin offset). Para "Cargar más" se incrementa `events_limit` y se re-pide el detalle entero (la respuesta es compacta). Estado inicial: 25 eventos. Click "Cargar más": +25 hasta máximo razonable (200). Después, mensaje "Para más detalle consulta la BD". Esta decisión evita inventar un parámetro `?events_offset` en el backend.

**Alternativa rechazada**: añadir cursor/offset al backend en este cambio. Mantenemos scope estricto al frontend.

### 4. Modal de cambio de estado

Componente reutilizable que recibe `{ tag, isOpen, onClose, onSuccess }` y monta un `<form>` con:
- Select `status` (todas las opciones), preseleccionado al `tag.status` actual.
- Textarea `notes` (5 filas).
- Validación cliente: si el nuevo `status` es distinto del actual, `notes` es obligatorio (≥10 chars). Si coincide, `notes` es opcional (operación idempotente que solo deja constancia).
- Botón "Guardar" llama `adminAPI.coa.updateStatus(uid, { status, notes })`, refresca el detalle al éxito.
- Errores HTTP (4xx/5xx) se muestran en un banner rojo dentro del modal, **no** se redirige.

Patrón inspirado en cómo se usan modales nativos en `subastas/[id]` y `authors/[id]`. Implementación con `<dialog>` HTML nativo + clase Tailwind, o `useState` + overlay manual — el código existente del admin usa overlays manuales (`fixed inset-0 …`), seguimos esa convención.

### 5. Cliente API: forma de `adminAPI.coa`

En `client/lib/api.js`:

```js
adminAPI.coa = {
  list: async ({ page = 1, limit = 20, status, art_id } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(page));
    q.set('limit', String(limit));
    if (status) q.set('status', status);
    if (art_id) q.set('art_id', String(art_id));
    return apiRequest(`/admin/coa/tags?${q.toString()}`);
  },
  getByUid: async (uid, { events_limit = 50 } = {}) =>
    apiRequest(`/admin/coa/tags/${encodeURIComponent(uid)}?events_limit=${events_limit}`),
  updateStatus: async (uid, body) =>
    apiRequest(`/admin/coa/tags/${encodeURIComponent(uid)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
```

Coherente con `adminAPI.auctions`, `adminAPI.authors`, etc.

### 6. Cross-link en la ficha de la obra

En `/admin/products/[id]/edit` se añade una sección **"Certificado de Autenticidad"** después de las secciones existentes. Estrategia:

- Al cargar el producto (`useEffect`), si su `type === 'Físico'` (los digitales no se certifican físicamente), se hace una segunda llamada `adminAPI.coa.list({ art_id: product.id, status: 'active', limit: 1 })`.
- Si `tags.length === 1` → muestra UID + serial + badge de status + `<Link>` a `/admin/coa/<uid>`.
- Si vacía → mensaje "Sin pegatina NFC asignada todavía. Programar offline con `scripts/nfc-personalization/`".
- Se gestiona el error de red mostrando un texto neutro "No se pudo cargar la información del certificado" + reintentar.

Si el listado del backend no soporta `status=active` combinado con `art_id` (verificar en spec), se filtra client-side de la respuesta de `art_id` sola. **Verificación rápida**: en `coa-nfc-verification` spec dice "Acepta query params: page, limit, status (opcional), art_id (opcional)" — ambos compatibles.

### 7. Constantes y badges

Centralizar en `client/lib/constants.js`:

```js
export const COA_TAG_STATUSES = {
  active:  { label: 'Activa',   className: 'bg-green-100 text-green-800' },
  revoked: { label: 'Revocada', className: 'bg-red-100 text-red-800' },
  lost:    { label: 'Perdida',  className: 'bg-amber-100 text-amber-800' },
  damaged: { label: 'Dañada',   className: 'bg-orange-100 text-orange-800' },
};

export const COA_EVENT_STATUSES = {
  ok:           { label: 'OK',                  className: 'bg-green-100 text-green-800' },
  invalid_cmac: { label: 'CMAC inválido',       className: 'bg-red-100 text-red-800' },
  replay:       { label: 'Replay',              className: 'bg-amber-100 text-amber-800' },
  unknown_tag:  { label: 'Tag desconocido',     className: 'bg-gray-200 text-gray-800' },
  revoked:      { label: 'Revocada',            className: 'bg-red-100 text-red-800' },
  malformed:    { label: 'Mal formada',         className: 'bg-gray-100 text-gray-700' },
};
```

Un único `<StatusBadge type="tag|event" value={status} />` los consume — patrón idéntico al `getStatusBadge` inline de `subastas/page.js` pero extraído a componente compartido en `client/components/admin/StatusBadge.js`.

### 8. Privacidad de `ip_hash` en la UI

El campo `ip_hash` es ya HMAC-SHA256 (no IP), pero mostrarlo entero (32 hex chars) es ruido visual y aporta poco. Mostramos los primeros 8 caracteres como pista de correlación visual (mismo hash → mismo bloque azul de fondo `bg-blue-50` con código mono), seguidos de `…`. Tooltip con el hash completo al hover. No se muestra IP en claro porque la BD no la guarda.

### 9. Manejo de errores

- 401/403: `apiRequest` ya redirige globalmente (handler centralizado). No duplicar lógica.
- 429: banner rojo informativo "Demasiadas peticiones, espera unos segundos".
- 5xx / red caída: banner rojo con "Reintentar" en lista y detalle.
- Errores en PATCH: dentro del modal, sin cerrar — el admin puede corregir y reintentar.

### 10. Tests

Patrón actual del repo: no hay tests E2E del admin (verificado con `find client -name '*.test.js'`). Mantenemos el patrón: implementación + verificación manual con el flujo descrito en `docs/coa_admin_frontend_actions.md`. Se añade en `tasks.md` un paso de "verificación E2E manual" siguiendo Tests 1-8 de ese documento, **incluyendo** el cross-link y la modal.

## Risks / Trade-offs

- **[Riesgo] Búsqueda UID/serial solo client-side se queda corta si crecen los tags** → Mitigación: documentado como Open Question; cuando el volumen lo justifique, añadir `?q=` al endpoint en otro change. Por ahora ≤50 obras → trivial.
- **[Riesgo] Cargar más eventos repite la respuesta entera (incluyendo el tag)** → Mitigación: el payload es pequeño (decenas de bytes por evento), aceptable. Si crece, paginar server-side en otro change.
- **[Riesgo] El admin podría revocar masivamente por error desde la UI** → Mitigación: el modal exige `notes` obligatorio para transiciones reales (no es un botón de un click) y la propia spec del backend deja constancia con timestamp acumulado en `notes`.
- **[Trade-off] No extraemos `getStatusBadge` de `subastas/page.js` ahora aunque sí creamos el patrón nuevo** → Aceptable: refactor opcional fuera de scope; el nuevo `<StatusBadge>` solo se usa en coa y, si en el futuro se quiere unificar, será un cambio aparte.
- **[Trade-off] Cross-link reutiliza la API admin (no añade un endpoint dedicado)** → Hace una llamada extra por obra física en la edición. Volumen aceptable; alternativa "incrustar tag en la respuesta de `adminAPI.products.getById`" requiere cambiar backend y queda fuera de scope.

## Open Questions

1. ¿Aceptamos posponer una búsqueda libre `?q=` server-side hasta que el volumen lo exija? **Decisión por defecto: sí**, documentado.
2. ¿El endpoint público `/api/art?search=...` devuelve obras `visible=0` (necesario para autocomplete admin)? **Verificar al implementar**: si filtra solo visibles, usar el endpoint admin o ampliar mínimamente. Si no hay alternativa, fallback a búsqueda numérica por `art_id`.
3. ¿Hay que exponer `personalized_by` (operador) en algún filtro del listado? **Por ahora no**, se muestra solo en el detalle. Añadible después si el equipo crece.
