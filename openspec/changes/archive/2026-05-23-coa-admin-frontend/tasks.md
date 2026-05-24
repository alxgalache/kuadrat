## 1. Cliente API y constantes

- [x] 1.1 Añadir bloque `coa: { list, getByUid, updateStatus }` dentro de `adminAPI` en `client/lib/api.js`, siguiendo el patrón de `adminAPI.auctions`/`adminAPI.authors` y usando `apiRequest()` con `URLSearchParams` para querystring.
- [x] 1.2 Añadir `COA_TAG_STATUSES` y `COA_EVENT_STATUSES` a `client/lib/constants.js` con etiquetas es-ES y clases Tailwind por estado.
- [x] 1.3 Crear `client/components/admin/StatusBadge.js` que renderiza `<span>` consumiendo las constantes anteriores; fallback `bg-gray-100 text-gray-800` para valores desconocidos.

## 2. Filtro por obra (DESCARTADO: autocomplete)

- [x] 2.1 Verificación: `/api/art` no acepta `?search=` y filtra `visible=1 AND is_sold=0 AND status='approved' AND for_auction=0 AND for_draw=0`; no hay endpoint admin equivalente. Las obras con CoA típicamente son vendidas (`is_sold=1`), por lo que el autocomplete contra el público sería inservible.
- [x] 2.2 Decisión: sustituir el hook por un input numérico `art_id` en el listado (tarea 3.4). Sin hook `useArtAutocomplete`.

## 3. Página de listado `/admin/coa`

- [x] 3.1 Crear `client/app/admin/coa/page.js` como Client Component envuelto en `<AuthGuard requireRole="admin">`, copiando la estructura visual de `client/app/admin/subastas/page.js` (cabecera + tabla + estados loading/error/empty).
- [x] 3.2 Implementar estado de filtros (`status`, `art_id`, `searchUidSerial`) y paginación (`page`, `limit=20`) y carga vía `adminAPI.coa.list`.
- [x] 3.3 Implementar las columnas (UID, Serial, Obra, Estado, Último contador, Bloqueada, Programada, Acciones) usando `StatusBadge`, formatter de fechas es-ES y enlaces a `/admin/products/<art_id>/edit` y `/admin/coa/<uid>`.
- [x] 3.4 Implementar controles de filtro: select `status`, input "Buscar UID o serial" con `useDebounce` y filtrado client-side de la página actual, input numérico "Filtrar por ID de obra (art_id)" con botón "✕" que pasa el valor al endpoint.
- [x] 3.5 Implementar paginación inferior (botones "Anterior"/"Siguiente" + "página N de M") consumiendo `data.pagination`.

## 4. Página de detalle `/admin/coa/[uid]`

- [x] 4.1 Crear `client/app/admin/coa/[uid]/page.js` Client Component con `<AuthGuard requireRole="admin">`, llamando `adminAPI.coa.getByUid` al montar con `events_limit=25` y enlace "← Volver al listado".
- [x] 4.2 Renderizar bloque "Datos del tag" con UID (mono), serial, badge, `last_counter`, icono candado si bloqueada, `personalized_at`/`personalized_by`, `locked_at`, `notes` preformateado y enlace a la obra.
- [x] 4.3 Crear `client/components/admin/CoaEventsTable.js` que recibe `events` y renderiza la tabla con badge de status, counter, fecha es-ES, `ip_hash` truncado a 8 chars (tooltip con completo) y `user_agent` truncado a 60 chars (tooltip).
- [x] 4.4 Implementar "Cargar más eventos": incrementa `events_limit` de 25 en 25 (cap 200) y re-llama `getByUid`; al alcanzar 200, oculta el botón y muestra "Para más detalle consulta la BD".
- [x] 4.5 Manejar estados 404 (etiqueta no encontrada), error de red (banner + reintentar) y loading.

## 5. Modal de cambio de estado

- [x] 5.1 Crear `client/components/admin/CoaStatusModal.js` con props `{ tag, isOpen, onClose, onSuccess }`, overlay manual (`fixed inset-0 …`) coherente con el patrón existente del admin.
- [x] 5.2 Implementar formulario: select de status preseleccionado al actual + textarea de notas (5 filas) + botones Guardar/Cancelar.
- [x] 5.3 Validar en cliente: notas obligatorias (≥10 chars no en blanco) si el status cambia respecto al actual; opcionales si coincide. Mostrar error inline cuando falla.
- [x] 5.4 Implementar submit: llama `adminAPI.coa.updateStatus`, en éxito invoca `onSuccess(updated)` y cierra; en error muestra banner rojo dentro del modal sin perder los valores.
- [x] 5.5 Cablear botón "Cambiar estado" del detalle (4.2) para abrir el modal y refrescar el detalle al cerrar con éxito.

## 6. Navegación

- [x] 6.1 Añadir entrada "CoA" al menú admin desktop en `client/components/Navbar.js` (entre `payouts` y donde encaje, manteniendo orden), enlazando a `/admin/coa`.
- [x] 6.2 Añadir la misma entrada al menú admin móvil (segundo bloque de `Navbar.js` que duplica los enlaces).

## 7. Cross-link en la edición de obra

- [x] 7.1 En `client/app/admin/products/[id]/edit/page.js`, añadir sección "Certificado de Autenticidad" condicional a `product.type === 'Físico'`.
- [x] 7.2 Llamar `adminAPI.coa.list({ art_id: product.id, status: 'active', limit: 1 })` después de cargar el producto y renderizar uno de tres estados (tag encontrado / sin tag / error con reintento).
- [x] 7.3 Asegurar que el fallo de esta llamada no rompe el formulario de edición (manejo aislado).

## 8. Verificación E2E manual (siguiendo `docs/coa_admin_frontend_actions.md`)

- [x] 8.1 Arrancar la stack en local (`docker compose up -d` o equivalente) y autenticarse como admin.
- [x] 8.2 Reproducir Tests 1, 2, 3 desde la UI (`/admin/coa` con filtros, navegar al detalle del tag `04A1B2C3D4E5F6`, verificar historial).
- [x] 8.3 Reproducir Test 4 desde el modal: revocar con motivo "Test de revocación E2E" y comprobar que la fila aparece en `notes` con timestamp.
- [x] 8.4 Reproducir Test 5: con el tag revocado, generar un PICC/CMAC válido nuevo (`node src/test-build-url.js …`) y verificar contra `/api/coa/verify` que devuelve `status: revoked`.
- [x] 8.5 Reproducir Test 6 (idempotencia): cambiar a `revoked` de nuevo en el modal y comprobar que no se añade nueva entrada timestamped.
- [x] 8.6 Reproducir Test 7 cerrando sesión: verificar que `/admin/coa` redirige por AuthGuard (cliente) y que el backend rechaza con 401 cuando se llama directamente.
- [x] 8.7 Reproducir Test 8: restaurar el tag a `active` con motivo "Restaurada tras test E2E" para no dejar BD sucia.
- [x] 8.8 Cross-link descartado: `GET /api/admin/products/:id` consulta la tabla legacy `products` (ya no en uso; productos viven en `art`/`others`). La página `/admin/products/[id]/edit` devuelve 404 y redirige; `CoaSection` eliminado de dicha página.
- [x] 8.9 Verificar el cross-link inverso: desde `/admin/coa/<uid>` navegar a la edición de la obra y volver con "← Volver al listado".
