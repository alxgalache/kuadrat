## ADDED Requirements

### Requirement: Divulgación de la analítica web sin cookies

La página `/legal/politica-de-cookies` SHALL informar del uso de Plausible Analytics como herramienta de medición de audiencia. La redacción SHALL indicar explícitamente las tres circunstancias que justifican que funcione sin consentimiento previo:

1. que la instancia es **autoalojada** en infraestructura propia, de modo que los datos de visita no se ceden a un tercero;
2. que **no instala cookies ni identificadores persistentes** en el dispositivo del visitante;
3. que, por lo anterior, queda fuera del ámbito del art. 22.2 LSSI y **no requiere consentimiento previo**, sin que ello exima del deber de información.

El texto SHALL estar en español (es-ES) y SHALL seguir la estructura de secciones numeradas ya existente en la página. La divulgación SHALL ser independiente de la del píxel de Meta, que sí depende del consentimiento publicitario y cuya descripción no se modifica.

#### Scenario: Visitante consulta la política de cookies

- **WHEN** un visitante accede a `/legal/politica-de-cookies`
- **THEN** encuentra una mención expresa a Plausible Analytics que indica que es autoalojada, que no utiliza cookies y que por ello no se solicita su consentimiento

#### Scenario: La divulgación no se confunde con la del píxel de Meta

- **WHEN** se lee la sección de cookies de terceros
- **THEN** el píxel de Meta SHALL seguir descrito como dependiente del consentimiento publicitario
- **AND** Plausible SHALL aparecer diferenciado, sin sugerir que se rija por la misma decisión del visitante
