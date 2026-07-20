# agora-whiteboard — Delta Spec (refine-agora-live-ux)

> Refina la capability opcional introducida por `add-agora-streaming-provider` (sin archivar). Solo frontend/configuración (CSP) y documentación. Requiere archivarse **después** del cambio padre.

## ADDED Requirements

### Requirement: Política CSP para la pizarra interactiva (Agora Whiteboard)
La cabecera Content-Security-Policy de `client/next.config.js` SHALL permitir la carga de módulos del `white-web-sdk`: las directivas `script-src` y `connect-src` SHALL incluir `blob:` (además del `worker-src 'self' blob:` ya presente). Sin ello, `white-web-sdk` no puede cargar sus módulos —los inyecta con `document.createElement("script")` y `src=blob:`— y la pizarra falla con `[modules] load script with URL failed ... fetch "blob:..." failed`. Los hosts de la pizarra (`https://*.netless.link` / `wss://*.netless.link`) SHALL permanecer en `connect-src`.

#### Scenario: Host activa la pizarra sin errores de CSP
- **WHEN** el host activa la pizarra en un evento Agora activo
- **THEN** el `white-web-sdk` carga sus módulos desde `blob:` sin ser bloqueado por CSP y la pizarra se muestra a todos con los trazos en tiempo real

#### Scenario: Asistente ve la pizarra
- **WHEN** la pizarra está activa y un asistente recibe su room token de lectura
- **THEN** el asistente ve el lienzo renderizado (sin el error de carga de módulos) y los trazos del host en tiempo real

### Requirement: Aviso benigno de `agora-foundation` documentado (Agora Whiteboard)
El sistema SHALL documentar que `white-web-sdk@2.16.56` declara el peer `agora-foundation@"3.11.1-rc.1 || 3.11.1"`, versión **no publicada en npm** (solo existe hasta `3.11.0`), por lo que el paquete no se instala y el SDK cae a su logger de reserva (Argus), emitiendo el aviso NO bloqueante `agora-foundation logger worker unavailable, fallback to Argus` / `Cannot find module 'agora-foundation/lib/logger'`. NO SHALL forzarse una versión distinta del peer ni cambiarse la versión del SDK de pizarra para silenciarlo. Para silenciar todo el ruido de red relacionado, `connect-src` SHALL incluir `https://*.agoralab.co` y `wss://*.agoralab.co` (endpoints `api-solutions-*` del logger de reserva), y `font-src` SHALL incluir `https://*.netless.link` (fuentes de `convertcdn.netless.link`).

#### Scenario: Aviso conocido no bloquea la pizarra
- **WHEN** el host activa la pizarra y aparece en consola `agora-foundation logger worker unavailable, fallback to Argus`
- **THEN** la pizarra funciona con normalidad (el aviso es benigno y está documentado como conocido)

### Requirement: Compatibilidad de la pizarra con React 19
La pizarra SHALL funcionar y ser **dibujable** bajo React 19. La causa del fallo ("binding container" / "render is not a function"; pizarra visible pero no dibujable) es que **`white-web-sdk`** llama a `ReactDOM.render` y `unmountComponentAtNode`, eliminados en React 19 (NO es el wrapper `@netless/fastboard-react`: el error reaparece también con la API vanilla). El sistema SHALL incluir `client/lib/reactDomLegacyShim.js`, que re-implementa esos métodos legacy sobre `createRoot` (`react-dom/client`, con `flushSync`) parcheando el `module.exports` de `react-dom`, y SHALL importarlo **antes** de `@netless/fastboard` en `WhiteboardPanel.js`. `WhiteboardPanel.js` SHALL montar la pizarra con la API vanilla `@netless/fastboard` (`createFastboard` + `mount(app, div, { config })`, UI Svelte de `@netless/fastboard-ui`), destruir la instancia (`ui.destroy()` + `app.destroy()`) al desmontar, y usar el rol correcto (`isWritable`). NO SHALL cambiarse la versión del SDK de pizarra.

#### Scenario: El host puede dibujar en la pizarra
- **WHEN** el host activa la pizarra (rol writer) y usa las herramientas de dibujo
- **THEN** puede dibujar y los trazos se propagan a los asistentes en tiempo real, sin el error `render is not a function`

#### Scenario: El asistente ve la pizarra en modo lectura
- **WHEN** un asistente en `broadcast` recibe el rol reader
- **THEN** ve el lienzo y los trazos del host sin la barra de herramientas de edición (config de solo lectura), y sin errores de binding
