## Context

Los cuatro grids de producto (`/galeria`, `/tienda`, `/galeria/autor/[authorSlug]`, `/tienda/autor/[authorSlug]`) comparten dos piezas:

- `client/components/ProductGrid.js` — rejilla de `<li>` con un `next/link` por producto hacia `${baseRoute}/p/${slug}`.
- `client/hooks/useGalleryProducts.js` — estado del listado: `products`, `page`, `hasMore`, `isLoadingMore`, `isFading`. Al montar ejecuta `loadProducts(true)`, que pide siempre `getAll(1, 12, authorSlug)`. El scroll infinito es un listener de `scroll` sobre `window` que pide la página siguiente al llegar al fondo del documento.

Al entrar en el detalle, el App Router desmonta la página del grid; al volver atrás la remonta desde cero. El estado (`page = 4`, 48 obras) se pierde y la restauración nativa del navegador no tiene contra qué restaurar, porque en ese momento el documento mide una pantalla. De ahí el salto a la parte superior.

Restricciones que condicionan el diseño:

- Sin TypeScript, sin dependencias nuevas, sin cambios en `api/`.
- `client/` no tiene runner de tests (regla vigente en `CLAUDE.md`), así que la verificación es QA manual guiada.
- Las tarjetas del grid reservan su altura (`aspect-square` + `next/image` con `fill`), así que la altura del documento es estable desde el commit de React: la carga posterior de las imágenes **no** desplaza el contenido. Esto es lo que hace viable centrar por elemento en lugar de esperar a las imágenes.

## Goals / Non-Goals

**Goals:**

- Volver atrás desde el detalle deja la obra pulsada aproximadamente centrada, con las páginas que había cargadas.
- Restaurar solo en navegación de historial; el resto de entradas al grid se comportan exactamente como hoy.
- El scroll infinito continúa sin huecos ni duplicados desde la última página restaurada.
- Degradación silenciosa: cualquier fallo se traduce en el comportamiento actual, nunca en un error visible.

**Non-Goals:**

- No se restauran otros grids (subastas, sorteos, panel de admin, dashboard de vendedor).
- No se persiste nada entre pestañas ni entre sesiones: `sessionStorage`, no `localStorage`.
- No se cachean los productos ya descargados: al volver se vuelven a pedir a la API (datos frescos: precio, estado de venta).
- No se toca el endpoint ni se añade paginación por cursor.
- No se restaura la variación de imagen que el usuario tuviera seleccionada en una tarjeta (`displayedBasename` en `ProductGridItem`).

## Decisions

### 1. Distinguir "volver atrás" marcando la entrada del historial

**Decisión:** en el primer render del grid se comprueba `window.history.state`. Si no lleva nuestra marca, se genera un id aleatorio y se escribe con `window.history.replaceState({ ...window.history.state, __gridRestoreId: id }, '')`. La instantánea se guarda en `sessionStorage` bajo ese id. Al montar, si `history.state` **ya** trae un id y existe una instantánea para él, estamos volviendo a esa entrada: se restaura.

**Por qué:** es la única señal que separa limpiamente "atrás/adelante" de "navegación nueva" en el App Router, que no expone el tipo de navegación. `performance.navigation.type === 'back_forward'` solo sirve para recargas completas, no para navegaciones soft; un listener de `popstate` en la página del grid no llega a tiempo, porque la página se monta *después* del evento; y un simple flag "vengo de un detalle" en `sessionStorage` se dispararía también al llegar al grid desde el menú tras haber visitado un producto, que es justo lo que la especificación excluye.

**Detalle importante:** el objeto de estado se **fusiona**, nunca se reemplaza — el App Router guarda ahí sus propias claves internas y perderlas rompería su navegación. Este patrón de `replaceState` fusionado es el soportado oficialmente por Next.js.

**Alternativa descartada:** clave por `pathname + filtro`. Es más simple pero no distingue la vuelta atrás de una entrada nueva a la misma URL, y obligaría a heurísticas de "cuánto hace que se guardó".

### 2. Rehidratar las páginas con una sola petición

**Decisión:** la restauración pide `getAll(1, N * 12, authorSlug)` con `N * 12` topado en 120, y a continuación fija `page = N` en el estado del hook.

**Por qué:** el offset del backend es `(page - 1) * limit`, así que N páginas de 12 y una página de N×12 devuelven exactamente el mismo conjunto y el mismo orden. Una petición evita N idas y vueltas en cascada y un render intermedio por página (que provocaría saltos de scroll). Fijar `page = N` deja intacto el contrato del scroll infinito: la siguiente carga es `getAll(N + 1, 12)`, sin solape.

**Alternativa descartada:** N peticiones secuenciales reproduciendo la paginación real. Más fiel pero más lenta y con renders intermedios; el resultado es idéntico.

**Tope de 120:** un `limit` mayor es una petición pesada sobre un endpoint público. `GET /api/art` y `GET /api/others` hacen `parseInt(req.query.limit)` sin cota superior, así que el tope es responsabilidad del cliente. Si la instantánea supera el tope se restauran 120 productos y, si la obra pulsada queda fuera, se cae al desplazamiento guardado (decisión 4).

### 3. Bloquear el pintado hasta que el scroll esté aplicado

**Decisión:** durante la restauración el grid mantiene el estado de carga que ya existe (`loading && page === 1` → pantalla "Cargando..."). Cuando llega la respuesta se renderiza el grid con `isFading` activo (opacidad 0), se aplica el desplazamiento en un `useLayoutEffect` y solo después se hace el fundido de entrada.

**Por qué:** reutiliza el gating que el grid ya tiene y evita el destello "arriba del todo → salto". El desplazamiento es instantáneo, nunca `smooth`: una animación de scroll aquí se percibe como un fallo, y además compite con la restauración nativa del navegador.

**Corrección en segundo frame:** tras el `useLayoutEffect` se repite el cálculo una vez en `requestAnimationFrame` para absorber cualquier reflow tardío (barra lateral de autores, fuentes). Es una corrección idempotente: si nada se movió, no hace nada.

### 4. Centrar por elemento, con el desplazamiento guardado como red de seguridad

**Decisión:** `ProductGrid` marca cada `<li>` con `data-product-id`. Al restaurar se busca `[data-product-id="87"]` y se calcula `window.scrollTo(0, rect.top + window.scrollY - (innerHeight - rect.height) / 2)`, acotado a los límites del documento. Si el elemento no existe, se aplica el `scrollY` guardado en la instantánea.

**Por qué:** el listado puede haber cambiado entre la ida y la vuelta (una obra vendida desaparece del grid y todo lo posterior sube una posición), de modo que el `scrollY` bruto ya no apunta a lo mismo; el id sí. Se usa cálculo manual en lugar de `scrollIntoView({ block: 'center' })` para acotar el resultado y no arrastrar contenedores con scroll propio. El `scrollY` se guarda igualmente porque es el único fallback razonable cuando la obra ya no está.

### 5. Registrar el clic solo en navegaciones reales del grid

**Decisión:** `ProductGrid` recibe un callback `onProductOpen(productId)` y lo invoca desde el `onClick` de los enlaces del producto, ignorando el evento si es clic con botón secundario/central o con `metaKey`/`ctrlKey`/`shiftKey`/`altKey`. Los botones de variación (`stopPropagation`) no lo disparan.

**Por qué:** abrir en pestaña nueva no cambia la página actual; escribir la instantánea ahí dejaría marcada una entrada que el usuario no ha abandonado, y una vuelta atrás posterior restauraría una posición que no corresponde.

### 6. Un hook aislado, `useGridScrollRestoration`

**Decisión:** toda la mecánica (marca del historial, lectura/escritura en `sessionStorage`, cálculo del desplazamiento) vive en `client/hooks/useGridScrollRestoration.js`. Devuelve `{ restoreSnapshot, onProductOpen, applyRestore }`. `useGalleryProducts` solo gana un parámetro opcional con la instantánea y una llamada a `applyRestore` cuando el listado restaurado ya está en el DOM. Las cuatro páginas se limitan a encadenar hook → hook → `ProductGrid`, siguiendo el patrón de hooks compartidos que ya usa el proyecto.

**Lectura de la instantánea:** se hace en el render (con guarda `typeof window !== 'undefined'`) y se memoriza en un `useRef`, porque `useGalleryProducts` la necesita en su efecto de montaje. El primer render devuelve la misma salida con o sin instantánea — la pantalla "Cargando..." —, así que no hay desajuste de hidratación. El **borrado** de la instantánea se hace en un efecto de montaje, no durante el render, para que el doble render de StrictMode en desarrollo no la consuma antes de usarla.

### 7. Higiene de `sessionStorage`

**Decisión:** cada escritura purga las instantáneas caducadas (TTL de 30 minutos) y conserva como mucho las 10 más recientes. Todo acceso va envuelto en `try/catch`; si falla, la funcionalidad se desactiva sin ruido.

**Por qué:** una sesión larga puede recorrer muchas entradas de grid, y `sessionStorage` puede estar bloqueado (modo privado, políticas del navegador) o lleno. Ninguna de esas situaciones puede degradar la navegación.

## Risks / Trade-offs

- **La marca en `history.state` colisiona con las claves internas del App Router** → se fusiona el estado existente en lugar de reemplazarlo, y solo se añade una clave con prefijo propio. Se verifica manualmente que la navegación atrás/adelante multi-paso sigue funcionando en los cuatro grids.
- **La petición de restauración pide hasta 120 productos a un endpoint sin cota de `limit`** → el tope es de cliente. Endurecer el `limit` en `api/controllers/artController.js` y `othersController.js` (con un máximo ≥ 120) queda como mejora independiente, fuera del alcance de este cambio.
- **Vuelta atrás más lenta que hoy**: una respuesta de 120 productos tarda más que una de 12, y el usuario ve "Cargando..." mientras tanto → es el coste de recuperar la posición; el endpoint está cacheado con `cacheControl()` y la alternativa (aparecer arriba del todo) es peor. Si en QA la espera resulta molesta, la palanca es bajar el tope de páginas.
- **El listado cambió entre la ida y la vuelta** (una obra se vendió, entró una nueva) → el centrado por id absorbe el desplazamiento de posiciones; solo si la obra pulsada desaparece se cae al `scrollY`, que puede quedar unas filas desviado. Es una degradación aceptable frente a volver arriba.
- **Reflow tardío que descoloque el centrado** → mitigado por la corrección en el segundo frame y por el hecho de que las tarjetas reservan altura. Si aparecieran elementos de altura variable sobre el grid (banners), habría que ampliar la corrección a un `ResizeObserver`.
- **Sin tests automatizados en `client/`** → se compensa con una lista de verificación manual explícita en `tasks.md` que cubre cada escenario de la especificación, incluidos los de degradación.

## Migration Plan

Cambio puramente aditivo en el cliente: sin migración de datos, sin variables de entorno, sin despliegue coordinado con la API. El despliegue es el habitual del cliente; la reversión es revertir el commit, ya que ninguna otra parte del sistema depende de la instantánea. Las instantáneas viven en `sessionStorage` y desaparecen al cerrar la pestaña, así que no queda estado residual tras una reversión.

## Open Questions

Ninguna pendiente. Las tres decisiones abiertas —alcance de los grids por autor, tope de profundidad y comportamiento cuando la obra pulsada ya no existe— se resolvieron con el usuario antes de redactar esta propuesta: los cuatro grids, 120 productos y caída al desplazamiento guardado, respectivamente.
