# admin-marketing-section Specification

## Purpose

Definir la sección admin "Marketing" del frontend y los endpoints admin que la sostienen: acceso restringido a administradores, lanzador del anuncio de nuevos autores, historial de envíos y endpoints de soporte.

## Requirements

### Requirement: Sección admin "Marketing" sólo para administradores

El frontend SHALL ofrecer una sección "Marketing" accesible únicamente para el rol admin, enlazada desde el menú de administración, que agrupa las acciones de email de marketing.

#### Scenario: Acceso del admin
- **WHEN** un administrador autenticado abre el menú de administración
- **THEN** ve una entrada "Marketing" que lleva a `/admin/marketing`

#### Scenario: Acceso denegado a no-admin
- **WHEN** un usuario que no es administrador intenta acceder a la sección o a sus endpoints
- **THEN** el acceso es rechazado

### Requirement: Lanzador de anuncio de nuevos autores

La sección Marketing SHALL ofrecer una acción "Nuevos autores" que abre un modal para seleccionar un autor, previsualizar el anuncio y enviarlo, mostrando el resultado del envío.

#### Scenario: Selección y envío
- **WHEN** el administrador selecciona un autor en el modal y confirma el envío
- **THEN** el frontend llama al endpoint de anuncio de nuevo autor y muestra una confirmación o el error devuelto

#### Scenario: Aviso de autor ya anunciado
- **WHEN** el autor seleccionado ya fue anunciado anteriormente
- **THEN** la interfaz advierte de ello antes de permitir el reenvío

### Requirement: Historial de envíos de marketing

La sección Marketing SHALL mostrar un historial paginado de los envíos de marketing registrados, con su tipo, entidad, resultado y fecha.

#### Scenario: Visualización del historial
- **WHEN** el administrador abre el historial de envíos
- **THEN** ve la lista paginada de envíos (incluidos los automáticos y los fallidos) con tipo, entidad asociada, estado y fecha

### Requirement: Endpoints admin de marketing

El backend SHALL exponer, bajo el router admin (con autenticación y verificación de rol admin ya aplicadas), los endpoints que sostienen la sección: listar autores para el selector, disparar el anuncio de nuevo autor (validado) y listar el historial de envíos.

#### Scenario: Listado de autores para el selector
- **WHEN** el frontend solicita la lista de autores para el selector
- **THEN** el backend devuelve los autores visibles aptos para anunciar

#### Scenario: Endpoint de anuncio validado y con límite de tasa
- **WHEN** se invoca el endpoint de anuncio de nuevo autor
- **THEN** la petición se valida con esquema (Zod) y se aplica un límite de tasa adecuado antes de procesar el envío
