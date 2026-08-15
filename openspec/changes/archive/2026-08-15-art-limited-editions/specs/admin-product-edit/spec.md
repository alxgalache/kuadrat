## MODIFIED Requirements

### Requirement: Admin full-update endpoints

The system SHALL expose admin-only endpoints `PUT /api/admin/art/:id` and `PUT /api/admin/others/:id` accepting the same multipart field structure as the corresponding creation endpoints, plus image manifests describing kept existing images and their order. Updates SHALL apply the same field validation rules as creation. The endpoints SHALL NOT modify the product's `slug`, `status`, or (for art) `edition_size` — any `edition_size` value present in the request payload SHALL be ignored.

#### Scenario: Successful art product update

- **WHEN** an admin submits valid changes to an art product's name, price, and description
- **THEN** the `art` row is updated with the new values, `slug` and `status` remain unchanged, and the response returns the updated product

#### Scenario: Validation failure on update

- **WHEN** an admin submits an update with a description shorter than 100 characters
- **THEN** the endpoint responds with the same validation error structure and Spanish message used by the creation endpoint, and no changes are persisted

#### Scenario: Rename keeps public URL stable

- **WHEN** an admin changes a product's name
- **THEN** the product's `slug` is not regenerated and existing public product URLs keep resolving

#### Scenario: Edition size cannot be modified

- **WHEN** an admin submits an update for an art product with `edition_size = 20` while the row has `edition_size = 15`
- **THEN** the row keeps `edition_size = 15` and the rest of the valid changes are applied

## ADDED Requirements

### Requirement: La tirada se muestra en solo lectura en el formulario de edición admin
La página de edición admin (`/admin/products/[id]/edit`) SHALL mostrar, para productos `art` con `edition_size > 1`, el tamaño de la tirada como dato de solo lectura ("Edición limitada de N ejemplares"), sin campo editable. El formulario SHALL NO enviar `edition_size` en la petición de actualización.

#### Scenario: Edición de una obra con tirada
- **WHEN** un admin abre el formulario de edición de una obra con `edition_size = 15`
- **THEN** la página muestra "Edición limitada de 15 ejemplares" como texto informativo no editable

#### Scenario: Edición de una obra única
- **WHEN** un admin abre el formulario de edición de una obra con `edition_size = 1`
- **THEN** el formulario no muestra ninguna indicación de edición (comportamiento actual)
