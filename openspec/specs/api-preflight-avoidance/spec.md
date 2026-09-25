# api-preflight-avoidance

## Purpose

Las lecturas anónimas a la API son peticiones CORS simples —sin un `Content-Type` que no describe ningún cuerpo— y los preflights inevitables (peticiones autenticadas) se cachean en el navegador.

> Capa afectada: `client/lib/api.js` (`apiRequest`) y las opciones de `cors()` en `api/app.js`.

## Requirements

### Requirement: Las lecturas a la API no declaran un tipo de contenido que no llevan

`apiRequest` en `client/lib/api.js` NO SHALL enviar el encabezado `Content-Type` en peticiones `GET` o `HEAD`. En el resto de métodos SHALL conservar el comportamiento actual (`application/json` salvo con `FormData`). El resto de encabezados —incluido `Authorization` cuando hay sesión— no cambian.

Una petición `GET` anónima sin encabezados propios es una petición CORS simple y el navegador no la precede de un `OPTIONS`.

#### Scenario: Visitante anónimo en /eventos
- **WHEN** un visitante sin sesión carga `/eventos`
- **THEN** las peticiones `GET /api/auctions` y `GET /api/draws` salen sin preflight
- **AND** sus respuestas son las mismas que antes del cambio

#### Scenario: Escritura con cuerpo JSON
- **WHEN** el cliente hace un `POST` con cuerpo JSON (inicio de sesión, pedido, consulta)
- **THEN** la petición lleva `Content-Type: application/json` exactamente como antes

#### Scenario: Subida de ficheros
- **WHEN** el cliente envía un `FormData`
- **THEN** no fija `Content-Type` y el navegador añade el límite `multipart` como antes

### Requirement: La API permite cachear los preflights

El middleware `cors()` de `api/app.js` SHALL responder a los preflights con `Access-Control-Max-Age: 7200`, el tope que aplica Chrome. El origen permitido (`config.clientUrl`) y `credentials: true` no cambian.

#### Scenario: Preflight de una petición autenticada
- **WHEN** el navegador envía `OPTIONS` con `Origin` igual a `config.clientUrl` y `Access-Control-Request-Headers: authorization`
- **THEN** la respuesta incluye `Access-Control-Allow-Origin` con ese origen y `Access-Control-Max-Age: 7200`

#### Scenario: Origen no permitido
- **WHEN** el navegador envía un preflight desde otro origen
- **THEN** la respuesta no incluye `Access-Control-Allow-Origin` para ese origen, igual que antes

#### Scenario: Cobertura en la suite
- **WHEN** se ejecuta `npm test` en `api/`
- **THEN** un test comprueba ambas cabeceras sobre una ruta pública a través de `tests/helpers/app.js`
