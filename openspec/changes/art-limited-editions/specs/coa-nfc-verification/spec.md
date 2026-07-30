## MODIFIED Requirements

### Requirement: Modelo de datos para tags NFC y eventos de verificación
La base de datos SHALL incluir dos tablas nuevas, `nfc_tags` y `verification_events`, definidas idempotentemente en `api/config/database.js` (sin migraciones SQL sueltas, sin `ALTER TABLE`).

`nfc_tags` SHALL contener: `uid` (PRIMARY KEY, hex 14 chars), `art_id` (FK a `art(id)` con `ON DELETE RESTRICT`), `edition_number` (INTEGER nullable — número de ejemplar dentro de la tirada; NULL para obras únicas), `serial_label` (opcional, p. ej. `GAL-2026-0017` o `GAL-2026-0042-3/15`), `status` (`active|revoked|lost|damaged`, default `active`), `last_counter` (INTEGER, default `-1`), `is_permanently_locked` (INTEGER 0/1, default `0`), `personalized_at` (DATETIME, default `CURRENT_TIMESTAMP`), `personalized_by` (TEXT, NOT NULL), `locked_at` (DATETIME nullable), `notes` (TEXT nullable). Índices sobre `art_id` y `status`. Varias filas MAY compartir el mismo `art_id` (una por ejemplar físico de la edición).

`verification_events` SHALL contener: `id` (autoincrement), `uid` (nullable, en casos `malformed` puede no recuperarse), `counter` (nullable), `status` (`ok|invalid_cmac|replay|unknown_tag|revoked|malformed`), `ip_hash` (HMAC-SHA256 con sal, truncado a 32 hex chars), `user_agent` (truncado a 256 chars), `occurred_at` (DATETIME default `CURRENT_TIMESTAMP`). Índices sobre `uid`, `status`, `occurred_at`.

#### Scenario: Creación idempotente del schema
- **WHEN** se arranca el backend con la base de datos vacía
- **THEN** `initializeDatabase()` crea `nfc_tags` (incluida `edition_number`) y `verification_events` con sus índices
- **AND** un segundo arranque con la misma base de datos no produce errores ni cambios (los `CREATE TABLE IF NOT EXISTS` no hacen nada).

#### Scenario: FK protege contra borrado de obras con tags activos
- **WHEN** existe una fila en `nfc_tags` con `art_id = 42`
- **AND** se intenta `DELETE FROM art WHERE id = 42`
- **THEN** la operación SHALL fallar con error de FK (`ON DELETE RESTRICT`).

#### Scenario: Varias etiquetas para la misma obra
- **WHEN** una obra con `edition_size = 15` tiene 15 filas en `nfc_tags` con `edition_number` 1..15
- **THEN** las 15 filas coexisten sin conflicto, cada una con su `uid`, `last_counter` y `status` independientes.

### Requirement: Página pública `/coa` que muestra el resultado al coleccionista
El frontend SHALL implementar `client/app/coa/page.js` como Server Component (sin `'use client'`) que:
1. Lee los query params `picc` y `cmac` (App Router pattern).
2. Llama internamente al backend vía `INTERNAL_API_URL` (variable server-only, p. ej. `http://api:3001/api`) usando `fetch` con `cache: 'no-store'`.
3. Renderiza un componente `<CoaSuccess>` si la respuesta es `status='ok'`, con una cabecera formada por un badge verde "Certificado verificado" (icono de check + texto) y el título "Certificado de Autenticidad", seguidos del contador "Verificación nº N de este certificado"; a continuación muestra la imagen de la obra (via `getArtImageUrl(basename)`), nombre, **nombre del artista**, descripción, tipo y dimensiones. `<CoaSuccess>` SHALL NO renderizar cabecera de marca propia: el logo de "140d Galería de Arte" lo aporta el `Navbar` global (`LayoutWrapper`), que está activo en `/coa` porque la ruta no figura en `ROUTES_WITHOUT_LAYOUT`.
4. Renderiza un componente `<CoaFailure>` en cualquier otro caso con un mensaje en es-ES específico para cada `status` (`malformed`, `invalid_cmac`, `unknown_tag`, `revoked`, `replay`).
5. Los mensajes de fallo SHALL estar centralizados en `client/lib/constants.js` como `COA_FAILURE_MESSAGES`.
6. SHALL usar exclusivamente clases Tailwind, sin CSS custom.
7. SHALL capturar errores de red/timeout del backend con Sentry y mostrar `Failure` con `status='malformed'`.

El nombre del artista SHALL proceder de `users.full_name` del propietario de la obra (`art.seller_id`), expuesto por la respuesta de `GET /api/coa/verify` como `art.artistName`. El `JOIN` a `users` SHALL ser un `LEFT JOIN` y el campo SHALL valer `null` cuando la obra no tenga propietario asociado; en ese caso la página SHALL omitir la línea del artista sin romper el resto del certificado.

#### Scenario: Verificación exitosa muestra la obra
- **WHEN** el coleccionista hace tap y el backend responde `status='ok'` con la obra
- **THEN** la página SHALL mostrar el badge "Certificado verificado" y el título "Certificado de Autenticidad"
- **AND** SHALL mostrar el logo de "140d Galería de Arte" a través del `Navbar` global, sin que `<CoaSuccess>` lo duplique
- **AND** SHALL mostrar imagen, nombre, descripción y dimensiones de la obra
- **AND** SHALL mostrar el nombre del artista bajo el título de la obra
- **AND** SHALL mostrar texto "Verificación nº N de este certificado".

#### Scenario: Obra sin propietario asociado
- **WHEN** el backend verifica un tag cuya obra no tiene `seller_id` o el usuario ya no existe
- **THEN** la respuesta SHALL incluir `art.artistName = null`
- **AND** la página SHALL renderizar el certificado sin la línea del artista, mostrando el resto de datos con normalidad.

#### Scenario: Verificación falla con mensaje claro
- **WHEN** el backend responde con `status='invalid_cmac'`
- **THEN** la página SHALL mostrar el mensaje correspondiente de `COA_FAILURE_MESSAGES` ("La firma del certificado no es válida. Esta pegatina podría ser una copia.")
- **AND** SHALL NO mostrar la imagen ni datos de ninguna obra
- **AND** SHALL incluir una línea de contacto con la galería.

#### Scenario: Backend caído o timeout
- **WHEN** la llamada interna al backend lanza una excepción o tarda más del timeout
- **THEN** la página SHALL renderizar `<CoaFailure status="malformed" />`
- **AND** SHALL capturar el error en Sentry sin filtrar query params ni datos sensibles.

#### Scenario: Falta query param
- **WHEN** la URL es `/coa` sin `picc` o sin `cmac`
- **THEN** la página SHALL renderizar directamente `<CoaFailure status="malformed" />` sin llamar al backend.

## ADDED Requirements

### Requirement: La verificación expone la edición del ejemplar
La respuesta OK de `GET /api/coa/verify` SHALL incluir `edition_size` (de la obra) y `edition_number` (del tag verificado). La página pública `/coa` SHALL mostrar, cuando `edition_size > 1`, el texto "Edición Limitada. Ejemplar n de N" (es-ES, centralizado en `client/lib/constants.js`) junto a los datos de la obra; si `edition_number` es NULL en una obra de edición, SHALL mostrar solo "Edición limitada de N ejemplares". Para obras con `edition_size = 1` la página no cambia.

#### Scenario: Verificación de un ejemplar de una edición
- **WHEN** un coleccionista verifica el tag del ejemplar 3 de una obra con `edition_size = 15`
- **THEN** la respuesta incluye `edition_size = 15` y `edition_number = 3`
- **AND** la página `/coa` muestra "Edición Limitada. Ejemplar 3 de 15".

#### Scenario: Verificación de una obra única
- **WHEN** un coleccionista verifica el tag de una obra con `edition_size = 1`
- **THEN** la página `/coa` no muestra ningún texto de edición (comportamiento actual).

#### Scenario: Revocación independiente por ejemplar
- **WHEN** el tag del ejemplar 7 de una edición se marca `revoked`
- **THEN** la verificación de ese tag devuelve `status='revoked'`
- **AND** los tags de los demás ejemplares de la misma obra siguen verificando con `status='ok'`.
