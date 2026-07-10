# marketing-email-provider Specification

## Purpose

Definir cómo el backend envía emails de marketing a través de la Broadcasts API de Resend: cliente y API key dedicados, circuit breaker, segmento y configuración por entorno, render de plantillas server-side, auditoría con guard de envío único y tolerancia a fallos.

## Requirements

### Requirement: Envío de marketing vía Broadcasts API de Resend

El backend SHALL enviar los emails de marketing a través de la Broadcasts API de Resend, creando un broadcast scoped a un `segment_id` y un `topic_id` y enviándolo en la misma operación, de modo que Resend gestione la cola, el throttling y la baja por topic.

#### Scenario: Envío al segmento newsletter intersección con un topic
- **WHEN** un flujo de la app solicita un anuncio de marketing para un topic concreto
- **THEN** el sistema invoca `broadcasts.create` con `segment_id` = segmento newsletter configurado, `topic_id` = el topic del anuncio, `from`, `subject` y `html`, y lo envía
- **AND** sólo reciben el correo los contactos del segmento suscritos a ese topic

#### Scenario: Retorno normalizado e idempotente del wrapper
- **WHEN** el broadcast se crea y envía con éxito
- **THEN** el wrapper devuelve un identificador del broadcast de Resend
- **AND** el llamante puede registrar ese identificador

### Requirement: API key full-access dedicada al marketing

El backend SHALL usar una API key de Resend full-access propia para el envío de marketing (`RESEND_MARKETING_API_KEY`), distinta de la key send-only usada por el email transaccional, inicializando un cliente Resend independiente.

#### Scenario: Cliente de marketing separado del transaccional
- **WHEN** el servicio de marketing se inicializa con marketing habilitado
- **THEN** crea su propio cliente Resend a partir de `RESEND_MARKETING_API_KEY`
- **AND** no reutiliza la key send-only del servicio transaccional

### Requirement: Circuit breaker para envíos de marketing

El backend SHALL respetar la variable `MARKETING_EMAILS_ENABLED`, que por defecto está **desactivada**, no enviando ningún email de marketing cuando está desactivada, y SHALL tratar el marketing como desactivado cuando no hay API key de marketing configurada.

#### Scenario: Circuit breaker desactivado (por defecto)
- **WHEN** se dispara cualquier anuncio de marketing y `MARKETING_EMAILS_ENABLED` no está activado
- **THEN** el sistema no llama a la Broadcasts API
- **AND** registra el evento como no enviado y el flujo de negocio continúa

#### Scenario: Sin API key de marketing (entorno local)
- **WHEN** se dispara un anuncio y `RESEND_MARKETING_API_KEY` no está configurada
- **THEN** el sistema no intenta el envío y opera como no-op

#### Scenario: Circuit breaker activado con configuración válida
- **WHEN** `MARKETING_EMAILS_ENABLED` está activado y la configuración de marketing es válida
- **THEN** los anuncios se envían a través de la Broadcasts API

### Requirement: Segmento de destino configurable por entorno

El backend SHALL tomar el segmento de destino de los broadcasts de `RESEND_NEWSLETTER_SEGMENT_ID`, de modo que cada entorno pueda apuntar a un segmento distinto (segmento de pruebas fuera de producción, segmento real en producción) sin cambios de código.

#### Scenario: Segmento según el entorno
- **WHEN** se envía un anuncio de marketing en un entorno dado
- **THEN** el broadcast se dirige al segmento indicado por `RESEND_NEWSLETTER_SEGMENT_ID` en ese entorno
- **AND** el mismo código envía al segmento de pruebas o al real según la configuración, sin ramificación por entorno

### Requirement: Configuración de marketing por entorno

El backend SHALL leer la configuración de marketing (key, segmento newsletter, IDs de topics —incluido el topic *Newsletter* en `RESEND_TOPIC_NEWSLETTER`—, remitente y kill-switch) desde variables de entorno validadas, exigiendo la key y los IDs sólo cuando el marketing está habilitado.

#### Scenario: Validación condicional al arranque
- **WHEN** la aplicación arranca con `MARKETING_EMAILS_ENABLED` activado y falta la key o algún ID de segmento/topic requerido (incluido `RESEND_TOPIC_NEWSLETTER`)
- **THEN** la configuración falla el arranque con un mensaje claro
- **WHEN** la aplicación arranca con el marketing desactivado
- **THEN** la ausencia de la key o de los IDs no impide el arranque

#### Scenario: Remitente consistente
- **WHEN** se envía cualquier broadcast de marketing
- **THEN** el `from` usa el remitente configurado (`MARKETING_FROM`, por defecto el mismo `EMAIL_FROM` con nombre "140d Galería de Arte")

#### Scenario: Topic Newsletter disponible para la suscripción
- **WHEN** la configuración de marketing está cargada con el marketing habilitado
- **THEN** el ID del topic *Newsletter* está disponible (`RESEND_TOPIC_NEWSLETTER`) para ofrecerlo como opción de suscripción junto a los demás topics

### Requirement: Plantillas de marketing renderizadas server-side

El backend SHALL almacenar las plantillas de marketing como archivos HTML en un directorio dedicado y renderizarlas server-side sustituyendo tokens `{{TOKEN}}` por valores escapados antes de enviarlas como contenido del broadcast.

#### Scenario: Render de plantilla con datos dinámicos
- **WHEN** se genera un anuncio a partir de su plantilla
- **THEN** el sistema sustituye los tokens `{{TOKEN}}` por los datos correspondientes, escapando los valores dinámicos
- **AND** el HTML resultante se pasa como contenido del broadcast

#### Scenario: Bloques repetidos pre-renderizados
- **WHEN** una plantilla contiene una sección repetible (p. ej. varias imágenes/piezas)
- **THEN** el sistema construye ese fragmento en código ya escapado y lo inyecta como un único token
- **AND** el resto de tokens simples se siguen escapando individualmente

### Requirement: Auditoría y guard de envío único de marketing

El backend SHALL registrar cada intento de envío de marketing en una tabla de auditoría (`marketing_sends`) con su tipo, entidad asociada, topic, identificador de broadcast y resultado, y SHALL impedir un segundo envío exitoso para los anuncios automáticos de la misma entidad.

#### Scenario: Registro de cada envío
- **WHEN** un anuncio de marketing se envía o falla
- **THEN** el sistema inserta un registro con el tipo, el identificador de la entidad, el topic, el resultado y, si aplica, el identificador del broadcast o el error

#### Scenario: Guard de envío único para anuncios automáticos
- **WHEN** un anuncio automático se vuelve a disparar para una entidad que ya tiene un envío exitoso registrado
- **THEN** el sistema no crea un segundo broadcast para esa entidad

### Requirement: El fallo de marketing no rompe el flujo de negocio

El backend SHALL ejecutar los disparos de marketing después de confirmar la escritura en base de datos y SHALL capturar cualquier error de envío sin abortar la operación de negocio que lo originó.

#### Scenario: Error de Resend tolerado
- **WHEN** la creación/envío del broadcast lanza un error o devuelve fallo
- **THEN** el sistema captura el error, lo registra (incluido en `marketing_sends` como fallo) y la creación/edición de la entidad asociada se completa con normalidad

### Requirement: Gestión de contactos de la audiencia vía Resend

El backend SHALL gestionar contactos de la audiencia de Resend (alta y actualización) usando el cliente full-access de marketing, haciendo *upsert* idempotente por email: crear el contacto si no existe y actualizarlo si ya existe. La operación SHALL fijar nombre y apellidos, asegurar el estado `unsubscribed = false` y asociar el contacto al segmento newsletter configurado.

#### Scenario: Alta de un contacto nuevo
- **WHEN** se solicita suscribir un email que no existe en la audiencia
- **THEN** el sistema crea el contacto con su nombre y apellidos, `unsubscribed = false`, lo asocia al segmento `RESEND_NEWSLETTER_SEGMENT_ID` y fija sus preferencias de topics

#### Scenario: Actualización de un contacto existente
- **WHEN** se solicita suscribir un email que ya existe en la audiencia
- **THEN** el sistema actualiza su nombre y apellidos, fija `unsubscribed = false`, asegura su pertenencia al segmento y reescribe sus preferencias de topics

### Requirement: Re-suscripción de contactos dados de baja

El backend SHALL re-suscribir a un contacto que existía como `unsubscribed`, fijando `unsubscribed = false` y aplicando las preferencias de topics indicadas, sin tratar la existencia previa como un error.

#### Scenario: Contacto previamente dado de baja
- **WHEN** se suscribe un email que existe en Resend con `unsubscribed = true`
- **THEN** el sistema lo actualiza a `unsubscribed = false` y aplica las preferencias de topics
- **AND** la operación se considera exitosa, no un error de duplicado

### Requirement: Preferencias de topics por contacto

El backend SHALL fijar las preferencias de suscripción por topic del contacto a partir de un estado completo de topics conocidos, enviando `opt_in` para los topics solicitados y `opt_out` para los demás topics conocidos.

#### Scenario: Aplicación de preferencias
- **WHEN** se da de alta o se actualiza un contacto con una selección de topics
- **THEN** el sistema fija `opt_in` en los topics seleccionados y `opt_out` en los topics conocidos no seleccionados

### Requirement: La gestión de contactos respeta el circuit breaker

El backend SHALL aplicar a la gestión de contactos el mismo gobierno que a los broadcasts: no operar contra Resend cuando `MARKETING_EMAILS_ENABLED` está desactivado o falta la API key de marketing.

#### Scenario: Marketing desactivado o sin key
- **WHEN** se solicita un alta o actualización de contacto y el marketing está desactivado o no hay API key de marketing
- **THEN** el sistema no contacta con Resend y trata la operación como no realizada
