## MODIFIED Requirements

### Requirement: Aceptación de la política al registrarse

La casilla obligatoria del registro en un evento (`client/components/EventAccessModal.js`) SHALL decir «Acepto las normas y términos para la participación en eventos en directo y la política de privacidad», con un enlace a `/legal/normas-eventos` en «normas y términos para la participación en eventos en directo» y otro a `/legal/politica-de-privacidad` en «política de privacidad», los dos en una pestaña nueva. La casilla SHALL mostrarse en el paso de métodos (`METHOD`, ver `event-verification-methods`) y SHALL aceptarse antes de elegir cualquier método: Google, Microsoft o el código por email. Ningún método SHALL poder empezar sin ella.

#### Scenario: Registro
- **WHEN** alguien se registra en cualquier evento
- **THEN** SHALL aceptar en la misma casilla las normas de los eventos y la política de privacidad, con un enlace a cada una

#### Scenario: Registro con Google
- **WHEN** alguien pulsa «Continuar con Google» sin marcar la casilla
- **THEN** NO SHALL salir hacia Google, y SHALL ver «Debes aceptar las normas de participación»

#### Scenario: Registro con código por email
- **WHEN** alguien elige «Recibir un código por email»
- **THEN** SHALL haber aceptado la casilla en el paso de métodos, y el formulario de email NO SHALL repetirla
