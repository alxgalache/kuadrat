## MODIFIED Requirements

### Requirement: Control "Efectos" en la barra de controles
El control de efectos SHALL presentarse en la barra inferior de controles, **junto al interruptor de Cámara**, con la etiqueta "Efectos" y el mismo patrón visual y de interacción que el selector de dispositivos existente (`client/components/events/DeviceDropdown.js`): botón chevron que despliega un panel, cierre por clic fuera y por tecla Escape, y opción activa marcada con un check. SHALL montarse en las dos superficies con control de cámara: `AgoraHostControls` (host en broadcast y en meeting) y `MeetingSelfControls` (asistentes en meeting).

El control SHALL estar **deshabilitado mientras la cámara esté apagada** y habilitarse al encenderla. El panel SHALL listar, en este orden: "Ninguno", "Desenfoque suave", "Desenfoque intenso" y, a continuación, una rejilla de **miniaturas** de las imágenes del catálogo con su etiqueta. Las miniaturas SHALL renderizarse con `<Image>` de `next/image` con `width` y `height` explícitos, conforme a la spec `nextjs-image-usage`. Todos los textos SHALL estar en es-ES.

Cuando el catálogo de fondos esté vacío, el panel SHALL mostrar únicamente las opciones de desenfoque, sin hueco vacío ni mensaje de error.

En la **disposición compacta** de `live-event-mobile-layout`, el control SHALL presentarse como la entrada «Efectos» de la hoja «Más» y no como panel desplegable. Conservará:
- las mismas opciones y el mismo orden;
- el check sobre la opción activa;
- el estado deshabilitado mientras la cámara esté apagada.

Las opciones SHALL pintarse con un único componente compartido por el panel y la hoja (`client/components/events/VideoEffectsOptions.js`). La regla de no renderizar el control en dispositivos móviles (requisito «Compatibilidad — móvil y navegadores no soportados») SHALL seguir aplicándose también en la hoja.

#### Scenario: El control está deshabilitado con la cámara apagada
- **WHEN** un usuario con la cámara apagada mira la barra de controles
- **THEN** el control "Efectos" aparece deshabilitado y no se puede desplegar
- **AND** al encender la cámara, el control queda disponible

#### Scenario: Cierre del panel por clic fuera y Escape
- **WHEN** el usuario abre el panel de efectos y hace clic fuera de él, o pulsa Escape
- **THEN** el panel se cierra sin cambiar el efecto seleccionado

#### Scenario: La opción activa está marcada
- **WHEN** el usuario con "Desenfoque intenso" activo abre el panel de efectos
- **THEN** esa opción aparece marcada con el check, igual que el dispositivo activo en el selector de dispositivos

#### Scenario: Catálogo de fondos vacío
- **WHEN** no hay ninguna imagen declarada en el manifiesto del catálogo
- **THEN** el panel muestra solo "Ninguno", "Desenfoque suave" y "Desenfoque intenso"

#### Scenario: Efectos en una ventana de escritorio estrecha
- **WHEN** un host de escritorio con la ventana por debajo de 1024 px abre «Más» y toca «Efectos» con la cámara encendida
- **THEN** la hoja muestra "Ninguno", "Desenfoque suave", "Desenfoque intenso" y las miniaturas, con la opción activa marcada

#### Scenario: Sin efectos en un teléfono
- **WHEN** un host abre la hoja «Más» desde un teléfono
- **THEN** la hoja no contiene la entrada «Efectos»
