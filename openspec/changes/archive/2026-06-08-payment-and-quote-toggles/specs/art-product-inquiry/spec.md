## MODIFIED Requirements

### Requirement: Inquiry call-to-action en ficha de obra

La ficha pública de una obra (`/galeria/p/[id]`, componente `ArtProductDetail`) SHALL mostrar, debajo del nombre del autor, un texto explicativo en es-ES que invite al usuario a contactar para casos no estándar (otro método de pago, otro método de envío, información específica). El fragmento "haz click aquí" SHALL renderizarse como un enlace clicable que abra un modal de consulta. Este call-to-action SHALL ocultarse cuando la ficha esté mostrando el botón "Solicitar cotización" (capability `storefront-buy-quote-toggles`); permanece visible (sin cambios) en el resto de casos, sujeto además al gating existente por Turnstile.

#### Scenario: Texto visible bajo el autor

- **WHEN** un usuario carga `/galeria/p/[id]` para una obra con `seller_full_name` definido y la ficha NO está mostrando el botón "Solicitar cotización"
- **THEN** debajo de la línea "Autor: <nombre>" se renderiza el texto "Si deseas utilizar otro método de pago, cambiar el método de envío, o solicitar información específica sobre esta obra, haz click aquí" con "haz click aquí" estilizado como enlace.

#### Scenario: El enlace abre el modal de consulta

- **WHEN** el usuario hace click en "haz click aquí"
- **THEN** se abre el modal `ArtProductInquiryModal` con el formulario vacío y el widget de Turnstile montado.

#### Scenario: Texto presente aunque el autor esté ausente

- **WHEN** una obra no tiene `seller_full_name` y la ficha NO está mostrando el botón "Solicitar cotización"
- **THEN** el texto explicativo y su enlace SHALL renderizarse igualmente, en su posición habitual (debajo del bloque de soporte/autor).

#### Scenario: Texto oculto cuando se muestra "Solicitar cotización"

- **WHEN** la lógica de `storefront-buy-quote-toggles` determina que la ficha muestre el botón "Solicitar cotización"
- **THEN** el texto explicativo de consulta y su enlace "haz click aquí" NO se renderizan.
