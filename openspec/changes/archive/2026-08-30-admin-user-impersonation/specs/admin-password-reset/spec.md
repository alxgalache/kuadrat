## MODIFIED Requirements

### Requirement: Admin UI entry points

The authors admin screen SHALL expose the reset action for activated artists only, alongside the existing "Reenviar" action that already covers pending ones.

Per-artist actions SHALL be collected behind a single "Acciones" button on each card, opening a Headless UI `Menu` that lists them. The card no longer has room for four side-by-side actions once "Impersonar" joins "Ver", "Editar" and "Contraseña", and a row of truncated buttons is how an admin ends up clicking the wrong one.

The individual "Contraseña" action SHALL be guarded by a confirmation dialog before any request is issued. It has the same irreversible side effect the bulk action already warns about — issuing a new link kills whatever link the artist is currently holding — and a single misplaced click sending that email is a support conversation, not an accident the admin can undo.

`/admin/autores` SHALL additionally offer a bulk "Enviar a todos" action guarded by a confirmation dialog that states explicitly that any links previously sent will stop working.

#### Scenario: Activated artist card
- **WHEN** the admin views an artist whose `is_activated` is true
- **THEN** the card SHALL offer a single "Acciones" button
- **AND** the menu it opens SHALL contain "Ver", "Editar", "Contraseña" and "Impersonar"
- **AND** SHALL NOT contain "Reenviar"

#### Scenario: Pending artist card
- **WHEN** the admin views an artist whose `is_activated` is false
- **THEN** the actions menu SHALL contain "Ver" and "Reenviar"
- **AND** SHALL NOT contain "Contraseña" nor "Impersonar"

#### Scenario: Individual password action confirmation
- **WHEN** the admin activates "Contraseña" for an artist
- **THEN** a confirmation dialog SHALL appear naming the artist and stating that any reset link previously sent to them will stop working
- **AND** no request SHALL be issued until the admin confirms
- **AND** dismissing the dialog SHALL send no email

#### Scenario: Individual password action confirmed
- **WHEN** the admin confirms that dialog
- **THEN** `POST /api/admin/authors/:id/send-password-reset` SHALL be called exactly once
- **AND** the admin SHALL see the existing success or error notification

#### Scenario: Bulk action confirmation
- **WHEN** the admin clicks "Enviar a todos"
- **THEN** a confirmation dialog SHALL appear stating that every previously sent reset link will stop working
- **AND** no request SHALL be issued until the admin confirms

#### Scenario: Bulk action result
- **WHEN** a bulk send completes
- **THEN** the admin SHALL see a notification reporting how many emails were sent and how many failed
- **AND** the failed addresses SHALL be listed
