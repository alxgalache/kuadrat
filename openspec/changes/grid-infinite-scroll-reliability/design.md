# Diseño

## El fallo

Todo el scroll infinito de las cuatro rejillas son quince líneas, `client/hooks/useGalleryProducts.js:70-85`:

```js
const handleScroll = () => {
  if (isLoadingMore || !hasMore) return

  const scrollPosition = window.innerHeight + window.scrollY
  const bottomPosition = document.documentElement.scrollHeight

  if (scrollPosition >= bottomPosition) {   // ← tolerancia CERO
    loadProducts(false)
  }
}
window.addEventListener('scroll', handleScroll)
```

En escritorio hay una sola noción de «alto de la ventana». En móvil hay dos, y el navegador las mantiene distintas a propósito:

```
        ┌──────────────────────────┐  ┐
        │   barra de URL / chrome  │  │  ← se oculta al bajar,
        ├──────────────────────────┤  │     reaparece al subir
        │                          │  │
        │                          │  │  window.innerHeight
        │     viewport VISUAL      │  │  (encoge cuando el chrome
        │                          │  │   está a la vista)
        │                          │  │
        ├──────────────────────────┤  ┘
        │  (tapado por el chrome)  │     documentElement.clientHeight
        └──────────────────────────┘     (viewport de MAQUETACIÓN: NO
                                          cambia, para no reflowear en
                                          cada scroll)
```

El recorrido de scroll se calcula **siempre** contra el de maquetación:

```
scrollY_max = scrollHeight − clientHeight
```

y la comprobación suma el **visual**. Sustituyendo:

```
innerHeight + scrollY_max
  = (clientHeight − altoChrome) + (scrollHeight − clientHeight)
  =  scrollHeight − altoChrome          ← siempre por debajo de scrollHeight
```

Con la barra del navegador a la vista, `scrollPosition >= bottomPosition` es **matemáticamente imposible**, con el usuario clavado en el fondo absoluto de la página. La resta se queda corta entre 48 y 130 px según el navegador. Y en ese punto ya no queda recorrido, así que **no se emitirán más eventos de scroll**: el único disparador de la funcionalidad se ha agotado.

## La evidencia que descarta lo demás

Hay una segunda fragilidad real en esa misma línea: `scrollHeight` es un **entero redondeado** y los otros dos son flotantes con subpíxel. En móvil las alturas son fraccionarias casi siempre, porque la rejilla es `grid-cols-2` con `px-6` y `gap-4` y las tarjetas son `aspect-square`:

```
Pantalla de 393 px:  (393 − 48 padding − 16 gap) / 2 = 164,5 px de ancho
                                                     → 164,5 px de alto
```

Cuando la altura total redondea hacia arriba, la suma tampoco llega. Parecía tan buen candidato como el anterior. **Lo descarta el comportamiento observado**: el operador reporta que subir y volver a bajar arregla la carga *a veces*.

```
Si fuera el redondeo:
    mientras no cargue nada, la altura de la página NO cambia
    → el fallo sería determinista y permanente para esa página
    → subir y bajar no lo arreglaría jamás

Si es el chrome del navegador:
    depende de si la barra está dentro o fuera en ese instante concreto
    → subir mucho y bajar de golpe → hay recorrido para colapsarla → CARGA
    → subir poco y bajar poco      → no hay recorrido, sigue fuera → NO CARGA
    → "a veces sí, a veces no, sin patrón"                    ✅ lo observado
```

Los navegadores colapsan la barra sólo tras un desplazamiento hacia abajo de cierta magnitud. Cerca del final de la página no queda recorrido para provocarlo, y la barra se queda puesta por muchos intentos que se hagan — hasta que el usuario sube lo suficiente. Eso explica también el sesgo por navegador que se observa:

| | |
|---|---|
| **Escritorio, nunca** | No hay chrome dinámico: `innerHeight ≡ clientHeight` y la suma cae exactamente en `scrollHeight`. Correcto por accidente. |
| **Samsung Internet, más veces** | Barra **inferior**, que reaparece ante cualquier movimiento hacia arriba, incluido el rebote elástico al tocar fondo. |
| **Navegador de Instagram** | WebView con cabecera y barra propias que ocupan viewport visual de forma permanente. El peor caso posible. |

Y un agravante propio de este catálogo: con **26 obras**, la página de `/galeria` mide unas dos pantallas y media en móvil. Cuanto más corta es la página, menos recorrido hay para que el navegador llegue a ocultar su barra, y más probable es que siga a la vista justo al llegar al final. Las fichas de artista, con menos obras todavía, son aún más propensas.

El redondeo subpíxel queda como agravante secundario — explica los casos en que ni subiendo y bajando funciona — y se arregla con la misma decisión.

## Decisión 1: el disparo deja de medir el viewport

La corrección mínima es un umbral: `>= bottomPosition - 600`. Arregla las dos causas y son cinco caracteres. Y deja intacto el defecto de fondo: la funcionalidad sigue dependiendo de que tres números medidos en dos marcos de referencia distintos cuadren, con un margen elegido a ojo, en motores que no se pueden probar.

Se sustituye por un `IntersectionObserver` sobre un centinela colocado tras la rejilla:

```
  ┌─────────────────────────────────────────────┐
  │  ProductGrid (obras 1..N)                   │
  ├─────────────────────────────────────────────┤
  │  <div ref={centinela} />                    │ ← rootMargin 600px:
  ├─────────────────────────────────────────────┤    dispara ANTES de
  │  spinner  |  [Cargar más]  |  error+reintentar │   llegar al muro
  ├─────────────────────────────────────────────┤
  │  Footer                                     │
  └─────────────────────────────────────────────┘
```

Lo que lo hace correcto por construcción y no por afinado: para un observador con `root: null`, el rectángulo de intersección **es el viewport del documento** — el mismo marco contra el que el navegador calcula el recorrido de scroll — y no el viewport visual que encoge con la barra. El observador no lee `innerHeight`, no lee `scrollY`, no lee `scrollHeight` y no compara nada. Las causas 1 y 2 dejan de tener superficie donde manifestarse, y el zoom con dos dedos (habitual en el navegador de Instagram) tampoco le afecta.

`rootMargin` de 600 px, además, carga antes de que el visitante toque el final, que es mejor experiencia que cargar justo cuando ya se ha quedado mirando el hueco.

## Decisión 2: el observador hay que re-armarlo a mano

Es la trampa clásica de este patrón y hay que dejarla escrita, porque el síntoma de olvidarla es exactamente el bug que se está arreglando. Un `IntersectionObserver` notifica **cambios** de estado de intersección. Si tras añadir 12 obras el centinela **sigue** dentro del margen —pantalla alta, página corta, o una página que tras deduplicar no aporta nada—, no hay cambio de estado y **el callback no vuelve a dispararse nunca**.

El re-armado se consigue recreando el observador en un efecto con `[hasMore, isLoadingMore, page]` en las dependencias: un `observe()` nuevo entrega siempre una observación inicial con el estado actual, así que tras cada carga se vuelve a evaluar. No hace falta ningún temporizador.

## Decisión 3: tres disparadores, un único punto de entrada

```
   IntersectionObserver ──┐
   (primario)             │
                          │      ┌──────────────────────┐
   scroll / resize ───────┼─────▶│  requestLoadMore()   │──▶ fetch
   (respaldo, umbral      │      │  cerrojo en useRef   │
    600px, agrupado       │      └──────────────────────┘
    con rAF)              │
                          │
   Botón «Cargar más» ────┘
   (garantía)
```

El vigía de `scroll`/`resize` no es redundancia decorativa: `resize` es precisamente el evento que Chrome Android emite cuando la barra del navegador se oculta o reaparece, o sea, el momento exacto en que la situación puede haber cambiado sin que se haya producido ningún scroll. Y con umbral de 600 px, no de cero.

El cerrojo vive en un `useRef`, no en el estado. El estado llega tarde por definición: `handleScroll` captura `isLoadingMore` por cierre y no se entera del cambio hasta que React vuelve a renderizar y el efecto se resuscribe. Esa ventana de un frame es la que permite hoy que dos disparos calculen el mismo `page + 1`, que la deduplicación de GET de `lib/api.js:144` les devuelva **la misma promesa** y que las 12 obras se concatenen dos veces. Un `ref` se actualiza en el mismo tick.

## Decisión 4: el botón es la garantía, no un adorno

Visible siempre que `hasMore` y no se esté cargando. No aparece «cuando falla lo automático» —no hay forma fiable de detectar ese fallo desde dentro— sino siempre.

Es lo único que convierte el objetivo declarado («que en el 100 % de los casos se pueda llegar al resto del catálogo») en una propiedad verificable en lugar de una esperanza sobre motores que no se pueden probar. Si mañana un WebView nuevo rompe el observador y el vigía, la funcionalidad degrada a «pulsar para cargar»: peor, pero no inalcanzable.

Y arregla de paso un agujero que hoy existe en todos los navegadores: con teclado o con lector de pantalla **no hay ninguna forma de pasar de la obra 12**, porque el único disparador es un gesto de scroll.

## Decisión 5: un error NO re-arma la carga automática

Esta decisión existe por un riesgo que **introduce el propio arreglo**. Con el re-armado de la Decisión 2, una carga fallida deja `isLoadingMore` en `false`, el efecto se vuelve a ejecutar, `observe()` entrega una observación inicial, el centinela sigue interseccionando y se dispara otra carga. Que vuelve a fallar. En bucle, tan rápido como responda la red:

```
   fallo ──▶ isLoadingMore=false ──▶ efecto ──▶ observe() ──▶ dispara ──┐
     ▲                                                                  │
     └──────────────────────────────────────────────────────────────────┘
```

Un 429 del limitador general se convertiría así en una tormenta de peticiones desde el navegador del visitante. Por eso: tras un fallo, la carga automática queda **desarmada** y sólo la reactiva una acción del usuario — pulsar «Reintentar», o un nuevo gesto de scroll que vuelva a cruzar el umbral. Es el mismo criterio de fondo que la Decisión 4: cuando el sistema no sabe, decide la persona.

Corolario del mismo bucle: si una carga responde con `hasMore: true` pero **no aporta ninguna obra nueva** tras deduplicar, la carga automática también se desarma. Sin esa cláusula, un solape total entre páginas produce el mismo bucle sin ningún error de por medio.

## Decisión 6: un fallo de la página N no puede borrar la rejilla

Hoy el `catch` de `loadProducts` (`useGalleryProducts.js:151`) escribe en el mismo `error` que la carga inicial, y las cuatro páginas hacen:

```js
if (error) return <pantalla de error a página completa>
```

Un corte de red en el WebView de Instagram, o un 429, y las 36 obras ya cargadas **desaparecen** y el visitante se queda mirando «No se pudieron cargar las obras». Se separan los dos estados: `error` sigue gobernando la pantalla completa cuando no hay nada que enseñar, y `loadMoreError` pinta un aviso en línea bajo la rejilla, que se mantiene entera.

## Decisión 7: un solo pie de rejilla para las cuatro rutas

`GalleryAuthorContent.js:26` y `GalleryMasAuthorContent.js:26` desestructuran `{ products, loading, error, page, isFading }` — **sin `isLoadingMore`**. En las fichas de artista no hay spinner: durante la carga no ocurre absolutamente nada en pantalla, que para el visitante es indistinguible del bug que se está arreglando.

No es un olvido que se arregle añadiendo la variable en dos sitios: es el resultado previsible de tener cuatro copias del mismo pie de rejilla. Se extrae a `client/components/GridLoadMore.js`, que contiene el centinela, el spinner, el botón y el error, y que las cuatro rutas montan tras `<ProductGrid>`. Un estado nuevo se añade una vez y aparece en las cuatro.

## Decisión 8: concatenar deduplicando por `id`

`setProducts(prev => [...prev, ...nuevas])` confía en que la API nunca devuelva una obra ya presente. Con paginación por `OFFSET` sobre un catálogo vivo esa confianza no está fundada: basta con que se venda o se despublique una obra entre dos peticiones para que la ventana se desplace. Filtrar por `id` contra lo ya cargado cuesta un `Set` y elimina la categoría entera —claves de React duplicadas incluidas—, sea cual sea el origen del solape.

## Decisión 9: orden total determinista en la paginación pública

`api/controllers/artController.js:52` (y su gemelo en `othersController.js:51`):

```sql
ORDER BY a.created_at DESC LIMIT ? OFFSET ?
```

`created_at` es `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`, y `CURRENT_TIMESTAMP` de SQLite tiene resolución de **un segundo**. Dos obras creadas en el mismo segundo empatan, y el orden entre empatadas es indefinido: SQLite puede resolverlo de forma distinta para `OFFSET 0` y para `OFFSET 12`. Consecuencia:

```
   OFFSET 0,  12 filas:  … A B    ← B entra en la página 1
   OFFSET 12, 12 filas:  B C …    ← B se repite; la que iba en su sitio se pierde
```

Se repiten obras y, peor, **se saltan obras que no aparecerán en ninguna página**, con `hasMore` diciendo la verdad todo el rato. Es invisible: nadie echa en falta lo que nunca ha visto.

**Comprobado contra producción: hoy no hay ningún empate** (26 obras, 26 marcas de tiempo distintas). Esto es endurecimiento preventivo, no la incidencia actual, y así debe quedar registrado para que nadie lo lea dentro de seis meses como «el arreglo del scroll». Pero es una línea, y el día que se importe un lote de obras el síntoma no se parecerá en nada a la causa. Añadir `, a.id DESC` da un orden total (el `id` es `INTEGER PRIMARY KEY AUTOINCREMENT`, único y no reutilizado) y coincide con el orden por antigüedad, así que no cambia nada de lo que hoy se ve.

Lleva test propio en `api/tests/`, en la línea de `editionInventory.test.js` y `spainShippingZones.test.js`: con obras que empatan en `created_at`, recorrer todas las páginas devuelve cada obra exactamente una vez.

## Decisión 10: medir la salida de emergencia

La incidencia no se ha podido reproducir ni en local ni en escritorio, y no se va a poder verificar el arreglo del mismo modo. Pero hay una señal limpia disponible: **cuánta gente necesita pulsar el botón**. Si el observador funciona, el botón casi no se toca; si en algún navegador concreto sigue fallando, ahí aparecerá, desglosado por navegador, que es justo la dimensión que interesa.

Una llamada, con encadenamiento opcional, apoyada en el stub de cola que ya existe en `client/app/layout.js:210` precisamente para esto:

```js
window.plausible?.('GridLoadMoreManual', { props: { grid: 'galeria' } })
```

Fuera de producción `window.plausible` no existe y la línea no hace nada. Sin cookies, sin identificador persistente y sin ningún dato del visitante: encaja con la analítica sin cookies que ya está desplegada y no toca el banner de consentimiento.

**Coste operativo a asumir:** el evento sólo se registra si se da de alta como objetivo en el panel de Plausible. Sin ese paso se envía y se descarta en silencio, sin error en ninguna parte — el mismo modo de fallo mudo que ya documenta el `CLAUDE.md` para el id del tracker.

## Lo que no se toca, y por qué

- **La restauración de scroll.** `useGridScrollRestoration` sigue igual: instantánea por entrada de historial, rehidratación de N páginas en una sola petición, `setLoadedPages(page)`. El desempate de la Decisión 9 sólo la hace más exacta.
- **El contrato de la API.** Mismos `page`/`limit`, mismo `hasMore` por `limit + 1`. Un cursor resolvería el solape de raíz, pero arrastra la restauración, el sitemap y el prerenderizado, y no tiene nada que ver con la incidencia.
- **La deduplicación de GET de `lib/api.js`.** Hace bien su trabajo; el defecto estaba en llamar dos veces.
- **`ProductGrid`.** Ni el `data-product-id` ni las `key` cambian.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Sólo el umbral (`- 600`) | Arregla el síntoma con un número elegido a ojo y mantiene la dependencia de medir dos marcos de referencia distintos. Se planteó como parche de contención desplegable por separado (grupo 2 de `tasks.md`) y el operador lo **descartó**: al implementarse el cambio de una vez, el grupo 4 sustituye el listener entero y el parche habría sido código escrito para borrarlo acto seguido. |
| API `visualViewport` | Permitiría corregir la resta con el alto real del chrome. Es sustituir una medición frágil por otra más frágil, y con menos soporte. |
| Evento `scrollend` | Resuelve «no llegan eventos», no «la condición es imposible». Y sigue sin existir en Safari hasta hace muy poco. |
| Cargar el catálogo entero de una vez | Con 26 obras funcionaría hoy y explotaría con 300, justo cuando ya no se recuerde por qué se hizo. Y no arregla `/tienda` cuando crezca. |
| Virtualizar la rejilla | Resuelve un problema de rendimiento que no existe y rompe la restauración de scroll, que depende de que el `data-product-id` esté en el DOM. |
| Paginación por cursor | Correcta a largo plazo, desproporcionada aquí: toca la restauración, el sitemap y el prerenderizado para arreglar un solape que hoy no se produce. |
