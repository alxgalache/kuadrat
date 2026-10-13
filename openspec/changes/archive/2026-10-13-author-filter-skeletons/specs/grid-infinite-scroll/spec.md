## MODIFIED Requirements

### Requirement: Garantía manual de acceso al resto del catálogo

Mientras queden productos por cargar y no haya una carga en curso, la rejilla SHALL mostrar un control manual que carga la siguiente página al ser activado. El control SHALL estar presente siempre, no sólo cuando se detecte un fallo de la carga automática.

El control SHALL ser accesible mediante teclado y SHALL estar expuesto a los productos de apoyo, de modo que exista una forma de recorrer el catálogo completo sin realizar ningún gesto de desplazamiento.

Única excepción: mientras la rejilla está sustituida por el esqueleto de un cambio de filtro de autor (capacidad `author-filter-skeleton`), el pie de rejilla completo NO SHALL renderizarse, ni el centinela ni el control manual. La rejilla que describía ya no está en pantalla, y al encogerse la página el centinela pediría la página siguiente de un listado que se está abandonando.

#### Scenario: La carga automática no se produce

- **WHEN** por cualquier motivo ninguno de los disparadores automáticos solicita la siguiente página
- **THEN** el visitante puede cargar el resto del catálogo activando el control manual

#### Scenario: Recorrido con teclado

- **WHEN** una persona navega la rejilla únicamente con teclado
- **THEN** puede alcanzar y activar el control manual, y con ello acceder a los productos más allá de la primera página

#### Scenario: No quedan productos

- **WHEN** la última respuesta indica que no hay más productos
- **THEN** el control manual no se muestra

#### Scenario: Cambio de filtro de autor en curso

- **WHEN** un visitante con varias páginas ya cargadas pulsa un artista del filtro y la rejilla pasa a esqueleto
- **THEN** el pie de rejilla NO SHALL renderizarse mientras dure la espera
- **THEN** NO SHALL solicitarse ninguna página más del listado que se abandona
