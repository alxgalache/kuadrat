## ADDED Requirements

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

## MODIFIED Requirements

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
</content>
