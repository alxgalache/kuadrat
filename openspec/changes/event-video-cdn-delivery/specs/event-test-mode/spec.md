## ADDED Requirements

### Requirement: Marca de evento de prueba

Un evento SHALL tener la marca `is_test` (`INTEGER NOT NULL DEFAULT 0`), editable en la creación y en la edición desde el panel de admin. La marca SHALL escribirse a través de los dos esquemas Zod, del `INSERT` de `eventService.createEvent` y de `allowedFields` de `eventService.updateEvent`. Los eventos anteriores al cambio SHALL quedar como eventos reales (`0`).

#### Scenario: Crear un evento de prueba
- **WHEN** el admin crea un evento con la casilla «Evento de prueba» marcada
- **THEN** el evento se guarda con `is_test = 1`

#### Scenario: Desmarcar la prueba en la edición
- **WHEN** el admin edita un evento de prueba y desmarca la casilla
- **THEN** el evento se guarda con `is_test = 0`

### Requirement: Un evento de prueba no genera comunicaciones de marketing

El sistema SHALL NOT enviar el anuncio de evento, ni ninguna otra comunicación de marketing, a la newsletter ni a ningún topic, para un evento con `is_test = 1`. Esto SHALL aplicarse al crearlo y al editarlo. Los emails transaccionales dirigidos a quien se registra en el evento (código de verificación, acceso) SHALL seguir enviándose.

#### Scenario: Crear un evento de prueba ya programado
- **WHEN** el admin crea un evento con `is_test = 1` y estado `scheduled`
- **THEN** no se envía ningún anuncio ni se registra ningún envío en `marketing_sends`

#### Scenario: Programar un evento de prueba desde el borrador
- **WHEN** el admin edita un evento de prueba y lo pasa de `draft` a `scheduled`
- **THEN** no se envía ningún anuncio

#### Scenario: Registro de quien prueba
- **WHEN** alguien se registra en un evento de prueba
- **THEN** recibe el código de verificación por email como en cualquier otro evento

### Requirement: Un evento de prueba no aparece en la web pública

Un evento con `is_test = 1` SHALL NOT aparecer en `GET /api/events` (calendario y listado de `/live`) ni en el sitemap. Su página SHALL declarar `robots: noindex, nofollow` y SHALL omitir los datos estructurados `Event`. `GET /api/events/:slug` SHALL seguir devolviéndolo, para que se pueda acceder por enlace directo.

#### Scenario: Calendario con un evento de prueba en el rango
- **WHEN** se pide `GET /api/events` con un rango que incluye un evento de prueba
- **THEN** la respuesta no lo incluye

#### Scenario: Enlace directo
- **WHEN** quien prueba abre `/live/<slug>` de un evento de prueba
- **THEN** la página carga con `noindex, nofollow` y sin JSON-LD `Event`

### Requirement: Confirmación al convertir una prueba en evento real

En la edición, al desmarcar «Evento de prueba» en un evento en estado `scheduled`, el panel SHALL pedir confirmación antes de guardar, avisando de que se enviará el anuncio a los suscriptores. El panel SHALL mostrar la insignia «Prueba» en el listado y en el detalle de los eventos de prueba.

#### Scenario: Desmarcar en un evento programado
- **WHEN** el admin desmarca la casilla en un evento `scheduled` y pulsa guardar
- **THEN** el panel pide confirmación y solo guarda si el admin la acepta

#### Scenario: Insignia en el listado
- **WHEN** el admin abre el listado de eventos
- **THEN** los eventos de prueba muestran la insignia «Prueba»
