## Why

La API ya expone los tres endpoints admin para gestionar las etiquetas NTAG 424 DNA pegadas a los Certificados de Autenticidad (`GET /api/admin/coa/tags`, `GET /api/admin/coa/tags/:uid`, `PATCH /api/admin/coa/tags/:uid/status`), pero no existe ninguna UI que los consuma. Hoy un administrador solo puede revocar/marcar pegatinas como perdidas/dañadas usando `curl` con el JWT de admin, lo cual es inviable operativamente: ante una incidencia real (pegatina sustraída, daño físico, falsificación detectada) hay que reaccionar rápido, con trazabilidad de quién revocó y por qué. Esta propuesta cierra el flujo añadiendo la sección admin necesaria.

## What Changes

- Nueva sección admin **`/admin/coa`** ("CoA" en el menú) con tres vistas:
  - `/admin/coa` — listado paginado de pegatinas con filtro por `status`, búsqueda por UID/serial (debounced) y autocomplete de obra (por slug/nombre que resuelve a `art_id` antes de pasarlo al endpoint).
  - `/admin/coa/[uid]` — detalle del tag (datos del chip + obra vinculada + estado + historial de `verification_events` con paginación de "ver más").
  - Modal **Cambiar estado** lanzable desde el detalle: select de status (`active|revoked|lost|damaged`) + textarea de notas (obligatoria si el status cambia, opcional si coincide con el actual). Reutilizable para revocar / marcar perdido / restaurar.
- Entrada de menú **"CoA"** añadida al `Navbar.js` (dropdown admin y menú móvil), junto a las existentes (autores, pedidos, …).
- Cross-link en `/admin/products/[id]/edit`: nueva sección "Certificado de Autenticidad" que muestra el tag activo (UID, serial, badge de status, link a `/admin/coa/[uid]`) o un mensaje "Sin pegatina NFC asignada" cuando la obra no tiene tag. Para resolverlo se reutiliza el filtro `?art_id=` del endpoint de listado.
- Nuevo cliente API `adminAPI.coa` en `client/lib/api.js`: métodos `list`, `getByUid`, `updateStatus`.
- Hook reutilizable `useArtAutocomplete` (sobre la API pública de art) para el filtro por obra; reutiliza `useDebounce` existente.
- Constantes nuevas en `client/lib/constants.js`:
  - `COA_TAG_STATUSES` (etiqueta es-ES + clase Tailwind por estado, similar al `getStatusBadge` de subastas).
  - `COA_EVENT_STATUSES` (es-ES + clase para `ok|invalid_cmac|replay|unknown_tag|revoked|malformed`).

No hay cambios *breaking*: la funcionalidad es estrictamente aditiva sobre la API ya implementada. No requiere cambios en backend, base de datos ni scripts de personalización.

## Capabilities

### New Capabilities
- `coa-admin-frontend`: Páginas e interacciones del panel de administración para listar etiquetas NFC, ver su detalle con historial de verificaciones, cambiar su estado de forma auditada y navegar desde la ficha de la obra hasta la pegatina asociada.

### Modified Capabilities
<!-- Ninguna. La capability `coa-nfc-verification` (backend) ya cubre los endpoints consumidos; este cambio solo añade UI cliente que los consume. -->

## Impact

- **Frontend (`client/`)**:
  - Nuevos ficheros: `client/app/admin/coa/page.js` (lista), `client/app/admin/coa/[uid]/page.js` (detalle), `client/components/admin/CoaStatusModal.js` (modal de cambio de estado), `client/components/admin/CoaEventsTable.js` (tabla de `verification_events`), `client/hooks/useArtAutocomplete.js` (autocomplete de obras).
  - Modificaciones: `client/lib/api.js` (añadir `adminAPI.coa.*`), `client/lib/constants.js` (añadir `COA_TAG_STATUSES`, `COA_EVENT_STATUSES`), `client/components/Navbar.js` (nuevo enlace "CoA" en menú admin desktop + mobile), `client/app/admin/products/[id]/edit/page.js` (sección "Certificado de Autenticidad" con tag activo y link).
- **Backend**: sin cambios. Se consumen tal cual los endpoints `/api/admin/coa/tags*` ya definidos en la capability `coa-nfc-verification`.
- **Base de datos**: sin cambios.
- **Dependencias**: sin cambios. Reutiliza `@heroicons/react` (ya en uso) y los patrones existentes (`AuthGuard`, `useDebounce`, `apiRequest`).
- **Seguridad**: las páginas se envuelven en `<AuthGuard requireRole="admin">`. La autenticación real la fuerza el backend (JWT + adminAuth) — el AuthGuard solo redirige si el cliente carece de sesión válida.
- **Privacidad (GDPR)**: el `ip_hash` (HMAC-SHA256, no IP en claro) se muestra truncado a 8-12 caracteres como pista de correlación visual, nunca como identificador re-derivable.
- **Sentry**: errores de carga/PATCH se capturan vía el SDK ya configurado.
- **Sin impacto** sobre el endpoint público `/coa`, scripts de personalización, auctions, events, orders, Stripe, livekit ni emails.
