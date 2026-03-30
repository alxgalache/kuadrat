## Context

Los sellers gestionan sus envíos desde el panel "Mis envíos" (`/seller/pedidos`). Actualmente pueden descargar etiquetas, ver seguimiento y programar recogidas, pero no tienen forma de consultar los puntos de entrega disponibles para el carrier asignado a cada pedido.

La funcionalidad de visualización de puntos de entrega ya existe en el flujo de checkout del comprador a través del componente `ServicePointSelector`, que muestra un overlay con mapa de Google Maps y listado de puntos. Sin embargo, ese componente está diseñado para **seleccionar** un punto (con confirmación vía botón "Aceptar"), mientras que el seller solo necesita **consultar** información.

El endpoint `GET /api/shipping/service-points` es público (no requiere autenticación) y acepta `carrier`, `country`, `postalCode` y `radius` como parámetros. Los datos del pedido del seller ya incluyen `sendcloudCarrierCode` y `deliveryAddress` (con país y código postal).

## Goals / Non-Goals

**Goals:**

- Permitir al seller consultar puntos de entrega cercanos a la dirección de destino de un pedido, directamente desde el panel "Mis envíos".
- Mostrar mapa interactivo con marcadores y listado de puntos con dirección, distancia y **horarios completos de todos los días de la semana**.
- Permitir buscar por código postal diferente al del pedido (campo editable).
- Reutilizar la infraestructura existente (endpoint, Google Maps loader, API client) sin cambios en el backend.

**Non-Goals:**

- No se implementa selección de punto de entrega. El modal es puramente informativo.
- No se modifica el endpoint existente de service points.
- No se añade funcionalidad de navegación o direcciones al mapa.
- No se persiste ninguna preferencia del seller sobre puntos de entrega.

## Decisions

### 1. Componente nuevo vs. reutilizar `ServicePointSelector`

**Decisión**: Crear un componente nuevo `ServicePointsInfoModal` en `client/components/seller/`.

**Alternativa considerada**: Añadir un prop `readOnly` al `ServicePointSelector` existente para suprimir la selección.

**Razón**: El componente del checkout tiene lógica de selección bidireccional, confirmación, y estado de selección que son irrelevantes para el caso del seller. Además, la diferencia clave en la visualización de horarios (todos los días vs. solo hoy) y el contexto de montaje (modal standalone vs. overlay dentro del drawer del carrito) hacen que un componente dedicado sea más limpio y mantenible. Sin embargo, se reutilizarán las mismas utilidades subyacentes: `loadGoogleMaps()` y `shippingAPI.getServicePoints()`.

### 2. Modal standalone vs. overlay

**Decisión**: Usar un modal con backdrop (`fixed inset-0`) montado directamente desde la página del seller, no un overlay dentro de otro contenedor.

**Razón**: La página del seller es una página completa (no un drawer), por lo que un modal con backdrop es el patrón UX natural. El `ServicePointSelector` usa un overlay porque vive dentro del drawer del carrito.

### 3. Reutilización del endpoint existente

**Decisión**: Llamar a `shippingAPI.getServicePoints(carrier, country, postalCode)` sin modificaciones en el backend.

**Alternativa considerada**: Crear un endpoint autenticado específico para sellers bajo `/api/seller/service-points`.

**Razón**: El endpoint actual es público por diseño (los compradores pueden no estar autenticados durante el checkout). No hay información sensible en los puntos de entrega de Sendcloud. Crear un endpoint duplicado con autenticación no añadiría seguridad real y violaría DRY. El endpoint ya tiene validación via Zod y rate limiting estándar.

### 4. Horarios completos vs. solo día actual

**Decisión**: Mostrar los horarios de **todos los días de la semana** (lunes a domingo), no solo el día actual.

**Razón**: El seller consulta los puntos para planificar cuándo depositar su envío, que puede ser cualquier día. La respuesta de Sendcloud ya incluye `formatted_opening_times` con todos los días (0=lunes a 6=domingo); el `ServicePointSelector` actual solo muestra el día actual por brevedad en el checkout.

### 5. Código postal editable con debounce

**Decisión**: Inicializar el campo de código postal con el de la dirección de entrega del pedido, pero permitir al seller editarlo. Las búsquedas se disparan con debounce (500ms) tras dejar de escribir.

**Razón**: El seller puede querer buscar puntos cercanos a su propia ubicación, no solo a la del destinatario. El debounce evita llamadas excesivas a la API mientras escribe.

### 6. Visibilidad del botón

**Decisión**: El botón "Consultar puntos de entrega" se muestra solo cuando el pedido tiene un `sendcloudCarrierCode` asociado en al menos un item.

**Razón**: Sin carrier code no es posible consultar puntos de entrega. Los pedidos sin shipment de Sendcloud (por ejemplo, envíos manuales o pedidos sin procesar) no tendrían resultados.

## Risks / Trade-offs

- **[Rate limiting]** El endpoint público está bajo rate limiting general. Si un seller hace muchas consultas cambiando código postal frecuentemente, podría alcanzar el límite. → Mitigación: debounce de 500ms en el input y longitud mínima de 4 caracteres para disparar la búsqueda.
- **[Carga de Google Maps]** Si el seller ya tiene la página cargada y Google Maps no se ha inicializado, el primer clic tendrá un delay de carga del script. → Mitigación: el loader singleton (`loadGoogleMaps`) ya gestiona esto con un estado de loading visible al usuario.
- **[Carrier code ausente]** Pedidos antiguos previos a la integración de Sendcloud no tendrán `sendcloudCarrierCode`. → Mitigación: el botón no se muestra cuando el carrier code es null.
