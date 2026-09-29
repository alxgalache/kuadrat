# preprod-access-gate

## Purpose

Puerta de acceso a preproducción (`WEB_APP_HIDDEN`): el token que concede el acceso queda ligado a la contraseña vigente (`TEST_ACCESS_PASSWORD`), de modo que cambiarla revoca los accesos concedidos.

## Requirements

### Requirement: Acceso a preproducción ligado a la contraseña vigente

Con `WEB_APP_HIDDEN` activo, `POST /api/test-access/verify` SHALL devolver, ante la contraseña correcta, un token firmado con `JWT_SECRET` que contiene una huella HMAC de la contraseña y su caducidad (30 días). `POST /api/test-access/check` SHALL aceptar el token solo si la firma es válida, no ha caducado y la huella coincide con la de la contraseña configurada en ese momento; en otro caso SHALL responder 401. Con la puerta desactivada, ambos endpoints SHALL responder 404. La comparación de la contraseña SHALL hacerse en tiempo constante.

#### Scenario: Cambio de contraseña
- **GIVEN** un navegador que obtuvo un token con la contraseña A
- **WHEN** el operador cambia `TEST_ACCESS_PASSWORD` a B y el navegador vuelve a cargar la web
- **THEN** `check` responde 401, el cliente borra el token y pide la contraseña

#### Scenario: Token manipulado o caducado
- **WHEN** el cliente envía un token con la firma alterada o con `exp` vencido
- **THEN** `check` responde 401

#### Scenario: Indicador antiguo
- **GIVEN** un navegador con el indicador anterior `test_access_granted`
- **WHEN** carga la web
- **THEN** el cliente lo borra y pide la contraseña

#### Scenario: Error de red en la comprobación
- **WHEN** `check` no responde
- **THEN** el cliente pide la contraseña en lugar de mostrar la web
