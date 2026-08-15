## MODIFIED Requirements

### Requirement: Comando `personalize` — programación de pegatinas
El script `scripts/nfc-personalization/src/personalize.js` SHALL implementar un flujo interactivo que:
1. Detecta el tag NFC vía `nfc-pcsc` cuando se coloca sobre el lector ACR1552U.
2. Lee el UID y muestra al operador.
3. Pide por CLI (`prompts`) el `slug` de la obra a vincular.
4. Consulta `art` en Turso por `slug` con `removed = 0 AND status = 'approved'`. Si no existe o no cumple, aborta con mensaje claro.
5. Comprueba que el número de tags activos para esa obra (`SELECT COUNT(*) FROM nfc_tags WHERE art_id = ? AND status = 'active'`) es menor que `edition_size`. Si la obra ya tiene `edition_size` tags activos, aborta mostrando el límite y los UIDs existentes.
6. Si `edition_size > 1`, pide al operador el número de ejemplar (entero 1..`edition_size`) y comprueba que no exista ya un tag activo con ese `edition_number` para la obra; si existe, aborta indicando su UID. Si `edition_size = 1`, no pregunta y `edition_number` queda NULL.
7. Pide confirmación explícita al operador antes de tocar el chip (mostrando obra y, si aplica, "Ejemplar n de N").
8. Deriva las 5 claves para el UID.
9. Autentica con K0 = 16 bytes a `0x00` (clave de fábrica) y ejecuta `ChangeKey` en orden K1→K2→K3→K4→K0.
10. Re-autentica con la nueva K0 y escribe el NDEF con la URL plantilla: `${GALLERY_BASE_URL}/coa?picc=<32 ceros ASCII>&cmac=<16 ceros ASCII>`.
11. Configura SDM mediante `ChangeFileSettings` sobre el File 02 con: `Read=E, Write=0, ReadWrite=0, Change=0`, `SDMMetaReadKey=2`, `SDMFileReadKey=1`, `PICCDataMirrorOffset=25`, `SDMMACInputOffset=63`, `SDMMACOffset=63`.
12. Inserta en `nfc_tags`: `uid`, `art_id`, `edition_number` (NULL para obra única), `serial_label` autogenerado — `GAL-YYYY-<art_id zero-padded>` para obras únicas, `GAL-YYYY-<art_id zero-padded>-<n>/<N>` para ediciones (p. ej. `GAL-2026-0042-3/15`) —, `status='active'`, `personalized_by=<OPERATOR>`.
13. Imprime instrucciones al operador: retirar la pegatina, probar con móvil, verificar URL dinámica, **NO** bloquear todavía (paso separado).

El script SHALL NO imprimir las claves derivadas en consola ni logs.

#### Scenario: Personalización exitosa de una pegatina virgen
- **WHEN** se coloca un NTAG 424 DNA virgen sobre el lector y se ejecuta `npm run personalize`
- **AND** el operador introduce un `slug` válido de una obra `status='approved' AND removed=0` con hueco en su edición
- **AND** confirma
- **THEN** el script SHALL completar todos los pasos y mostrar mensaje de éxito
- **AND** SHALL aparecer una nueva fila en `nfc_tags` con los datos correctos
- **AND** un tap posterior con un móvil SHALL abrir la página `/coa` correctamente.

#### Scenario: Operador introduce slug inexistente
- **WHEN** el operador introduce un `slug` que no existe en `art` o tiene `removed=1`
- **THEN** el script SHALL mostrar error claro
- **AND** SHALL NO ejecutar ninguna operación sobre el chip
- **AND** SHALL NO insertar fila en `nfc_tags`.

#### Scenario: Obra única ya tiene tag activo
- **WHEN** el operador introduce el `slug` de una obra con `edition_size = 1` que ya tiene una fila en `nfc_tags` con `status='active'`
- **THEN** el script SHALL mostrar error indicando el UID del tag existente
- **AND** SHALL mostrar la instrucción SQL para revocarlo (`UPDATE nfc_tags SET status='revoked' WHERE uid=...`)
- **AND** SHALL NO tocar el chip.

#### Scenario: Personalización de varios ejemplares de una edición
- **WHEN** el operador personaliza sucesivamente tres pegatinas para una obra con `edition_size = 15`, indicando ejemplares 1, 2 y 3
- **THEN** las tres filas quedan en `nfc_tags` con el mismo `art_id`, `edition_number` 1, 2 y 3 y `serial_label` `GAL-YYYY-XXXX-1/15`, `-2/15` y `-3/15`
- **AND** cada tag conserva claves derivadas y contador anti-replay propios.

#### Scenario: Número de ejemplar duplicado
- **WHEN** el operador indica un `edition_number` que ya tiene un tag activo para esa obra
- **THEN** el script SHALL abortar mostrando el UID del tag existente
- **AND** SHALL NO tocar el chip.

#### Scenario: Edición completa de tags
- **WHEN** una obra con `edition_size = 15` ya tiene 15 tags activos
- **THEN** el script SHALL abortar indicando que la edición está completa
- **AND** SHALL NO tocar el chip.

#### Scenario: Interrupción durante ChangeKey deja el tag inconsistente
- **WHEN** se interrumpe el script (Ctrl+C, fallo de comunicación) entre ChangeKey de K1 y K0
- **THEN** el script SHALL imprimir un aviso instando al operador a anotar el UID y descartar físicamente la pegatina
- **AND** SHALL NO dejar fila en `nfc_tags` con datos inconsistentes (o la marcará como `damaged` si llegó a insertarse).
