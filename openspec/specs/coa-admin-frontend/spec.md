## ADDED Requirements

### Requirement: Entrada de navegación admin para CoA
El componente `client/components/Navbar.js` SHALL mostrar una entrada **"CoA"** en el menú admin (tanto desplegable de escritorio como menú móvil), enlazando a `/admin/coa`. SHALL aparecer junto a las entradas existentes (autores, pedidos, envíos, subastas, sorteos, espacios, payouts) y SHALL respetar la convención visual de las demás (mismas clases Tailwind, mismo orden en ambos menús).

#### Scenario: Admin autenticado ve el enlace
- **WHEN** un usuario con `role === 'admin'` abre el menú admin del Navbar
- **THEN** la entrada "CoA" aparece y el click navega a `/admin/coa`.

#### Scenario: Usuario no admin no ve el enlace
- **WHEN** un usuario sin `role === 'admin'` (anónimo, buyer, seller) carga el Navbar
- **THEN** la entrada "CoA" no es visible (el bloque admin entero ya está oculto).

### Requirement: Página de listado paginado `/admin/coa`
La página `client/app/admin/coa/page.js` SHALL ser un Client Component envuelto en `<AuthGuard requireRole="admin">`. SHALL renderizar una tabla con los tags devueltos por `adminAPI.coa.list({ page, limit, status, art_id })`, con paginación inferior (botones "Anterior"/"Siguiente" + indicador "página N de M").

Columnas mínimas: **UID** (mono, primeros 14 chars), **Serial** (`serial_label` o `—`), **Obra** (nombre + slug clicable a `/admin/products/<art_id>/edit`), **Estado** (badge con `COA_TAG_STATUSES`), **Último contador** (`last_counter`), **Bloqueada** (icono de candado si `is_permanently_locked === 1`), **Programada** (`personalized_at` formateada es-ES + `personalized_by`), **Acciones** (enlace "Ver" a `/admin/coa/<uid>`).

Controles superiores:
- Select de filtro por `status` (todos/active/revoked/lost/damaged), aplica al instante.
- Input de texto "Buscar UID o serial" con `useDebounce(value, 300)`, filtra **client-side** sobre la página actual.
- Input numérico "Filtrar por ID de obra (art_id)" con botón "✕" para limpiar; al cambiar pasa el valor como `art_id` al endpoint. Help text: "El ID está en la URL de la edición de la obra (`/admin/products/<id>/edit`) o en la propia lista (columna Obra enlaza a esa URL)".

SHALL manejar tres estados: `loading` (mensaje "Cargando…"), `error` (banner rojo con "Reintentar" que vuelve a llamar al endpoint), `empty` (mensaje "No hay etiquetas que coincidan con los filtros").

#### Scenario: Listado inicial
- **WHEN** un admin entra en `/admin/coa` sin filtros
- **THEN** la página llama `adminAPI.coa.list({ page: 1, limit: 20 })`
- **AND** muestra la tabla con los tags devueltos
- **AND** muestra controles de paginación si `pagination.pages > 1`.

#### Scenario: Filtro por estado
- **WHEN** el admin selecciona "Revocadas" en el select de estado
- **THEN** la página llama `adminAPI.coa.list({ page: 1, limit: 20, status: 'revoked' })`
- **AND** la paginación se reinicia a página 1.

#### Scenario: Búsqueda por UID/serial filtra client-side
- **WHEN** el admin teclea `"04A1"` en el input de búsqueda
- **AND** han pasado 300ms desde la última tecla
- **THEN** la tabla muestra solo filas cuyo `uid` o `serial_label` contengan `"04A1"` (case-insensitive) de la página actual
- **AND** no se realiza ninguna petición al backend.

#### Scenario: Filtro por ID de obra
- **WHEN** el admin escribe `42` en "Filtrar por ID de obra (art_id)"
- **THEN** la página llama `adminAPI.coa.list({ page: 1, limit: 20, art_id: 42 })`
- **AND** muestra solo los tags asociados a esa obra
- **AND** un botón "✕" permite limpiar el filtro.

#### Scenario: Tabla vacía
- **WHEN** la combinación de filtros no produce ningún resultado
- **THEN** la página muestra "No hay etiquetas que coincidan con los filtros" y SHALL NO mostrar la tabla.

#### Scenario: Error de red en lista
- **WHEN** la llamada a `adminAPI.coa.list` falla con error de red o 5xx
- **THEN** la página muestra un banner rojo con el mensaje del error y un botón "Reintentar" que vuelve a invocar la lista con los mismos filtros.

### Requirement: Página de detalle `/admin/coa/[uid]`
La página `client/app/admin/coa/[uid]/page.js` SHALL ser un Client Component envuelto en `<AuthGuard requireRole="admin">`. SHALL llamar `adminAPI.coa.getByUid(uid, { events_limit: 25 })` al montar y mostrar dos bloques:

1. **Datos del tag y de la obra**: UID, `serial_label`, badge de status, `last_counter`, `is_permanently_locked` (icono candado + label "Bloqueada permanentemente" cuando aplique), `personalized_at`, `personalized_by`, `locked_at`, `notes` (preformateado, monoespaciado, mostrando saltos de línea), nombre y slug de la obra con `<Link>` a `/admin/products/<art_id>/edit`. Botón **"Cambiar estado"** que abre el `CoaStatusModal`.
2. **Historial de verificaciones**: el componente `CoaEventsTable` muestra los eventos (`status` badge, `counter`, `occurred_at` formateado es-ES, `ip_hash` truncado a 8 chars con tooltip del completo, `user_agent` truncado a 60 chars con tooltip). Inicial 25 eventos; botón "Cargar más" pide +25 (re-fetch con `events_limit` incrementado) hasta máximo 200, después muestra "Para más detalle consulta la BD".

SHALL incluir un enlace "← Volver al listado" que navega a `/admin/coa`.

#### Scenario: Detalle con historial
- **WHEN** un admin abre `/admin/coa/04A1B2C3D4E5F6`
- **THEN** la página llama `adminAPI.coa.getByUid('04A1B2C3D4E5F6', { events_limit: 25 })`
- **AND** muestra los datos del tag, el badge de status y el botón "Cambiar estado"
- **AND** muestra la tabla de eventos con hasta 25 entradas ordenadas por `occurred_at DESC`.

#### Scenario: Cargar más eventos
- **WHEN** el admin pulsa "Cargar más" estando en `events_limit=25`
- **THEN** la página re-llama `adminAPI.coa.getByUid(uid, { events_limit: 50 })`
- **AND** la tabla se actualiza con hasta 50 eventos.

#### Scenario: Límite máximo de eventos
- **WHEN** el admin alcanza `events_limit=200`
- **THEN** el botón "Cargar más" desaparece
- **AND** se muestra el texto "Para más detalle consulta la BD".

#### Scenario: Tag no encontrado
- **WHEN** la API responde 404 (UID inexistente)
- **THEN** la página muestra "Etiqueta no encontrada" y un enlace "Volver al listado".

#### Scenario: IPs hasheadas se muestran truncadas
- **WHEN** el historial contiene eventos con `ip_hash`
- **THEN** cada celda muestra los primeros 8 caracteres del hash en fuente monoespacio
- **AND** el tooltip al hover muestra el hash completo
- **AND** SHALL NO mostrar nunca una IP en claro (porque la BD no la guarda).

### Requirement: Modal `CoaStatusModal` para cambio de estado auditado
El componente `client/components/admin/CoaStatusModal.js` SHALL recibir las props `{ tag, isOpen, onClose, onSuccess }` y renderizar un modal con overlay (`fixed inset-0`) que contiene:
- Select de status con las cuatro opciones (`active`, `revoked`, `lost`, `damaged`), preseleccionado al `tag.status` actual y etiquetadas en es-ES vía `COA_TAG_STATUSES`.
- Textarea "Notas / motivo" de 5 filas.
- Validación cliente: si `status` seleccionado ≠ `tag.status` actual, `notes` SHALL ser obligatoria (≥10 chars de texto no en blanco); si coincide, `notes` SHALL ser opcional.
- Botón **Guardar**: llama `adminAPI.coa.updateStatus(tag.uid, { status, notes })`. En éxito, invoca `onSuccess(updatedTag)` (que refresca el detalle) y cierra el modal.
- Botón **Cancelar**: cierra el modal sin llamar al backend.
- Errores 4xx/5xx: banner rojo dentro del modal, sin cerrarlo; el admin puede corregir y reintentar.

#### Scenario: Cambiar de active a revoked con motivo
- **WHEN** el admin abre el modal con un tag `status=active`
- **AND** selecciona `revoked` y escribe en notas `"Pegatina sustraída del CoA físico, ver caso #42"`
- **AND** pulsa Guardar
- **THEN** se llama `adminAPI.coa.updateStatus(uid, { status: 'revoked', notes: 'Pegatina sustraída…' })`
- **AND** el modal se cierra al recibir 200
- **AND** el detalle se refresca mostrando el nuevo badge "Revocada" y la nota con timestamp.

#### Scenario: Validación impide cambio sin notas
- **WHEN** el admin cambia el status (transición real) pero deja el textarea de notas vacío o con menos de 10 chars
- **AND** pulsa Guardar
- **THEN** el modal muestra error inline "Las notas son obligatorias al cambiar el estado (≥10 caracteres)"
- **AND** SHALL NO llamar al backend.

#### Scenario: Operación idempotente (mismo status, notas opcionales)
- **WHEN** el admin abre el modal con un tag `status=active`
- **AND** mantiene `active` y deja las notas vacías
- **AND** pulsa Guardar
- **THEN** se llama `adminAPI.coa.updateStatus(uid, { status: 'active' })` sin campo `notes`
- **AND** el backend responde 200 sin añadir nueva entrada timestamped al historial de notas.

#### Scenario: Error del backend se muestra dentro del modal
- **WHEN** la llamada PATCH responde con 429 o 5xx
- **THEN** el modal queda abierto
- **AND** muestra un banner rojo con el mensaje de error
- **AND** SHALL NO descartar los valores introducidos.

### Requirement: Cliente API `adminAPI.coa`
El módulo `client/lib/api.js` SHALL exponer `adminAPI.coa` con tres métodos: `list({ page, limit, status, art_id })`, `getByUid(uid, { events_limit })`, `updateStatus(uid, { status, notes })`. SHALL usar `apiRequest()` para mantener el manejo global de JWT, deduplicación, 401 y 429.

#### Scenario: `list` construye la query correctamente
- **WHEN** se llama `adminAPI.coa.list({ page: 2, limit: 10, status: 'active', art_id: 42 })`
- **THEN** la URL invocada SHALL ser `/admin/coa/tags?page=2&limit=10&status=active&art_id=42`.

#### Scenario: `list` omite parámetros vacíos
- **WHEN** se llama `adminAPI.coa.list({ page: 1, limit: 20 })` sin status ni art_id
- **THEN** la URL SHALL ser `/admin/coa/tags?page=1&limit=20` (sin `status=` ni `art_id=`).

#### Scenario: `getByUid` codifica el UID en la URL
- **WHEN** se llama `adminAPI.coa.getByUid('04A1B2C3D4E5F6')`
- **THEN** la URL SHALL ser `/admin/coa/tags/04A1B2C3D4E5F6?events_limit=50` (default).

#### Scenario: `updateStatus` usa PATCH y serializa el body
- **WHEN** se llama `adminAPI.coa.updateStatus('UID', { status: 'lost', notes: 'foo' })`
- **THEN** la petición SHALL ser `PATCH /admin/coa/tags/UID` con body JSON `{"status":"lost","notes":"foo"}`.

### Requirement: Cross-link desde la ficha de la obra
La página `client/app/admin/products/[id]/edit/page.js` SHALL añadir una sección **"Certificado de Autenticidad"** cuando el producto sea de tipo `'Físico'`. La sección SHALL llamar `adminAPI.coa.list({ art_id: product.id, status: 'active', limit: 1 })` y renderizar uno de tres estados:

- **Tag activo encontrado**: muestra UID (mono), `serial_label`, badge de status, y un `<Link>` "Ver detalle del certificado" hacia `/admin/coa/<uid>`.
- **Sin tag activo**: muestra "Sin pegatina NFC asignada todavía. Programar offline con `scripts/nfc-personalization/`."
- **Error de red**: muestra "No se pudo cargar la información del certificado" con un botón "Reintentar".

SHALL NOT mostrar la sección si `product.type !== 'Físico'` (obras digitales no llevan CoA físico).

#### Scenario: Obra física con tag activo
- **WHEN** el admin abre `/admin/products/42/edit` para una obra física con tag activo
- **THEN** la sección "Certificado de Autenticidad" muestra UID, serial, badge "Activa" y enlace al detalle del tag.

#### Scenario: Obra física sin tag
- **WHEN** el admin abre la edición de una obra física sin pegatina programada
- **THEN** la sección muestra el mensaje "Sin pegatina NFC asignada todavía…" sin enlace.

#### Scenario: Obra digital oculta la sección
- **WHEN** el admin abre la edición de un producto con `type !== 'Físico'`
- **THEN** la sección "Certificado de Autenticidad" SHALL NOT renderizarse.

#### Scenario: Fallo de red no rompe la página de edición
- **WHEN** la llamada a `adminAPI.coa.list` desde la edición falla
- **THEN** la sección muestra el mensaje de error con reintento
- **AND** el resto del formulario de edición sigue siendo funcional.

### Requirement: Constantes y badges centralizados
El fichero `client/lib/constants.js` SHALL exportar `COA_TAG_STATUSES` y `COA_EVENT_STATUSES` como objetos `{ [key]: { label, className } }` con etiquetas en es-ES y clases Tailwind. El componente `client/components/admin/StatusBadge.js` SHALL recibir `{ type: 'tag' | 'event', value: string }` y renderizar un `<span>` con las clases y etiquetas correspondientes; si el valor es desconocido, SHALL renderizar fallback `bg-gray-100 text-gray-800` con el valor en crudo.

#### Scenario: Badge de tag activo
- **WHEN** se renderiza `<StatusBadge type="tag" value="active" />`
- **THEN** el `<span>` SHALL tener clases `bg-green-100 text-green-800` y texto "Activa".

#### Scenario: Badge de evento con valor desconocido
- **WHEN** se renderiza `<StatusBadge type="event" value="future_unknown" />`
- **THEN** el `<span>` SHALL tener clases `bg-gray-100 text-gray-800` y mostrar `"future_unknown"` literal sin lanzar excepción.

<!-- El hook `useArtAutocomplete` se descartó tras verificar que no existe ningún
endpoint admin/público que permita buscar obras por nombre (el endpoint público
filtra `visible=1 AND status='approved' AND is_sold=0`, dejando fuera el caso
principal de CoA: obras ya vendidas). El filtro por obra se simplifica a un
input numérico de `art_id` en la lista; ver la requirement "Página de listado
paginado /admin/coa" para los detalles. -->
