## ADDED Requirements

### Requirement: Admin orders page kebab menu
The admin orders page (`/admin/pedidos`) SHALL display a three-dot vertical icon button that opens a dropdown menu with alert actions.

#### Scenario: Menu is visible on admin orders page
- **WHEN** admin navigates to `/admin/pedidos`
- **THEN** a three-dot vertical icon button SHALL be visible in the page header area

#### Scenario: Menu opens on click
- **WHEN** admin clicks the three-dot vertical icon button
- **THEN** a dropdown menu SHALL appear with two options: "Alertas de productos recibidos" and "Alertas de productos enviados"

#### Scenario: Menu closes on outside click
- **WHEN** the dropdown menu is open and admin clicks outside of it
- **THEN** the dropdown menu SHALL close

### Requirement: Trigger stale arrived alert from menu
The "Alertas de productos recibidos" menu option SHALL call the stale arrived alert endpoint and display the result.

#### Scenario: Stale arrived items found
- **WHEN** admin selects "Alertas de productos recibidos" and the endpoint returns stale items
- **THEN** a success notification SHALL be displayed indicating the number of stale items found and that an email alert was sent

#### Scenario: No stale arrived items found
- **WHEN** admin selects "Alertas de productos recibidos" and the endpoint returns no stale items
- **THEN** a notification SHALL be displayed indicating no stale items were found

#### Scenario: Loading state during alert check
- **WHEN** admin selects "Alertas de productos recibidos"
- **THEN** the menu option SHALL show a loading state while the request is in progress

### Requirement: Trigger stale sent alert from menu
The "Alertas de productos enviados" menu option SHALL call the stale sent alert endpoint and display the result.

#### Scenario: Stale sent items found
- **WHEN** admin selects "Alertas de productos enviados" and the endpoint returns stale items
- **THEN** a success notification SHALL be displayed indicating the number of stale items found and that an email alert was sent

#### Scenario: No stale sent items found
- **WHEN** admin selects "Alertas de productos enviados" and the endpoint returns no stale items
- **THEN** a notification SHALL be displayed indicating no stale items were found

#### Scenario: Loading state during sent alert check
- **WHEN** admin selects "Alertas de productos enviados"
- **THEN** the menu option SHALL show a loading state while the request is in progress
