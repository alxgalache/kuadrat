# Medición de la carga incremental de las rejillas

Cómo leer el evento `GridLoadMoreManual` en Plausible, qué conclusiones soporta
y cuáles **no**.

- **Evento:** `GridLoadMoreManual`, propiedad `grid`
- **Panel:** https://analytics.140d.art/140d.art
- **Cambio que lo introdujo:** `openspec/changes/grid-infinite-scroll-reliability`
- **Última revisión:** 24/08/2026

---

## 0. Por qué existe esta medición

En agosto de 2026 el scroll infinito de `/galeria` dejaba de cargar obras en
navegadores móviles —sobre todo Samsung Internet y el navegador integrado de
Instagram— de forma aparentemente aleatoria. Con 26 obras en catálogo y páginas
de 12, un visitante afectado veía el **46 % del catálogo** sin ninguna vía
alternativa para llegar al resto.

La causa está documentada en `client/hooks/useInfiniteScroll.js`: el disparo
comparaba `window.innerHeight` (viewport **visual**, que encoge cuando la barra
del navegador está a la vista) con el recorrido de scroll (calculado contra el
viewport de **maquetación**, que no cambia), y con tolerancia cero. Con la barra
visible la condición era inalcanzable.

**El problema no se reprodujo nunca en escritorio ni en local.** Y no se va a
poder verificar el arreglo del modo habitual, por la misma razón. Lo único que
se puede medir es **cuánta gente necesita la salida de emergencia** — el botón
«Cargar más» — y con qué navegador. De ahí este evento.

---

## 1. Qué es exactamente el evento

| | |
|---|---|
| **Nombre** | `GridLoadMoreManual` (sensible a mayúsculas) |
| **Propiedad** | `grid` → `galeria` \| `tienda` \| `galeria-autor` \| `tienda-autor` |
| **Se emite en** | `client/components/GridLoadMore.js`, manejador `cargarManualmente` — la pulsación del botón «Cargar más» |
| **NO se emite en** | el botón «Reintentar» tras un error de red. Es una acción manual también, pero significa *falló la red*, no *falló el disparo automático*: mezclarlos ensuciaría la única métrica que hay |
| **NO se emite en** | ninguna carga automática (observador, vigía de scroll/resize). Sólo la pulsación humana |
| **Cortafuegos** | `window.plausible?.(…)` con encadenamiento opcional. Fuera de producción el tracker no está cargado y la línea no hace nada |

La definición del nombre vive en una constante, no en el componente:

```bash
grep GRID_LOAD_MORE_EVENT client/lib/constants.js
```

**Si alguna vez se cambia esa constante, hay que dar de alta el objetivo nuevo en
Plausible.** El objetivo se define por nombre exacto; renombrar el evento sin
tocar el panel deja de registrar conversiones sin ningún error en ninguna parte.

---

## 2. La asimetría del indicador — léase esto antes que nada

Este indicador **no es simétrico**, y tratarlo como si lo fuera es el error más
probable al interpretarlo:

```
  Muchas pulsaciones concentradas       ──▶  EVIDENCIA FUERTE de que la carga
  en un navegador concreto                   automática falla ahí

  Pocas pulsaciones                     ──▶  evidencia DÉBIL de que todo va bien
```

Las dos direcciones no valen lo mismo por dos motivos independientes:

**Falsos positivos.** Pulsar el botón no demuestra que el observador fallara.
Hay gente que lo pulsa por impaciencia, porque es la afordancia obvia, o porque
apareció justo delante. Quien navega con teclado lo usa **siempre**, porque es
su único camino. Un número absoluto de pulsaciones no dice nada por sí solo.

**Falsos negativos, que son los graves.** Si la carga automática falla y el
visitante **no ve** el botón o no le apetece pulsarlo, simplemente se va. No
genera evento. **Las personas más afectadas por el fallo son precisamente las
que no dejan rastro en esta métrica.** Por eso «cero pulsaciones» nunca es una
confirmación de que el arreglo funciona: es compatible con que funcione y también
con que falle y la gente abandone.

Ese punto ciego se cubre con la señal complementaria del §6.

---

## 3. Cómo leerlo en el panel

«Con filtro» y «sin filtro» se refieren al **filtro del panel de Plausible**, no
a ninguna opción del código: no hay nada activable ni desactivable en la
aplicación.

```
  SIN filtro  → el dashboard tal cual lo abres.
                Panel "Browser" = navegadores de TODAS las visitas.

  CON filtro  → pulsa GridLoadMoreManual en el panel "Goal Conversions".
                Aparece una píldora arriba (Goal is GridLoadMoreManual) y
                TODOS los paneles se recalculan sobre ese subconjunto.
                Panel "Browser" = navegadores SOLO de quien pulsó el botón.

  Quitarlo    → la X de la píldora.
```

Dos cifras que Plausible distingue y conviene no confundir:

- **Unique conversions** — visitantes distintos que pulsaron al menos una vez.
  Es la que hay que usar.
- **Total conversions** — pulsaciones totales. Una persona que pulsa dos veces
  para ver las 26 obras cuenta 2 aquí y 1 arriba.

Para el desglose por rejilla, el panel de propiedades (`grid`). Requiere haber
dado de alta la propiedad en
https://analytics.140d.art/140d.art/settings/properties — los eventos la guardan
igualmente, pero sin ese alta no aparece en el panel.

---

## 4. La interpretación correcta: tasa, no reparto

Comparar el **reparto** de navegadores con y sin filtro es una primera
aproximación, pero se distorsiona en cuanto un navegador tiene poco tráfico. Lo
correcto es normalizar:

```
                     visitantes de ESE navegador que pulsaron el botón
   tasa(navegador) = ──────────────────────────────────────────────────
                      visitantes de ESE navegador que vieron la rejilla
```

Y comparar esa tasa **entre navegadores**, no contra cero.

Ejemplo de lectura sana:

| Navegador | Visitantes en rejilla | Pulsaron | Tasa |
|---|---|---|---|
| Chrome | 420 | 38 | 9,0 % |
| Safari | 150 | 12 | 8,0 % |
| Samsung Internet | 60 | 6 | 10,0 % |

Tasas del mismo orden → el botón es sólo un botón. El observador funciona.

Ejemplo de lectura preocupante:

| Navegador | Visitantes en rejilla | Pulsaron | Tasa |
|---|---|---|---|
| Chrome | 420 | 34 | 8,1 % |
| Safari | 150 | 11 | 7,3 % |
| **Samsung Internet** | **60** | **41** | **68,3 %** |

Ahí no hay nada que interpretar: en ese motor la carga automática no se está
produciendo y el botón es lo único que salva la visita.

> Si tu versión del panel muestra una columna **CR** al aplicar el filtro de
> objetivo, esa columna ya es esta tasa y te ahorra la cuenta. El método manual
> de arriba funciona en cualquier versión.

---

## 5. Umbral de muestra: cuándo NO concluir nada

Con el tráfico de este sitio las cifras van a ser pequeñas, y en cifras pequeñas
el ruido imita perfectamente a la señal.

**Regla práctica:** no concluyas nada sobre un navegador hasta tener **al menos
10 pulsaciones de ese navegador**, y exige además que su tasa sea **como mínimo
el triple de la tasa global** antes de darlo por sospechoso.

El motivo, en números: si la tasa global es del 10 % y un navegador tiene 20
visitantes, lo esperado son 2 pulsaciones y la desviación típica es ~1,3. Ver 5
no significa nada. Ver 14 sí.

| Visitantes de ese navegador | Pulsaciones esperadas (tasa global 10 %) | A partir de aquí merece atención |
|---|---|---|
| 20 | 2 | 6 |
| 50 | 5 | 12 |
| 100 | 10 | 19 |
| 200 | 20 | 33 |

**Antes de mirar, deja pasar tráfico.** Una semana como mínimo; dos si el
navegador sospechoso es minoritario.

---

## 6. La señal complementaria que cubre el punto ciego

El tracker de Plausible v3 emite eventos `engagement` con **profundidad de
scroll** (`sd`, porcentaje de la página alcanzado). Verificado en el propio
script servido por la instancia.

Eso da un indicador **independiente y sin el falso negativo del §2**, porque lo
genera todo el mundo, también quien se va sin pulsar nada:

> Si en `/galeria` los visitantes de un navegador concreto se detienen
> sistemáticamente en una profundidad menor que el resto, es coherente con que
> se hayan topado con un muro que a los demás no les aparece.

Es una señal más ruidosa (la gente abandona por mil motivos) y **no sirve como
prueba por sí sola**. Su valor está en la combinación: pulsaciones
desproporcionadas **y** profundidad de scroll truncada en el mismo navegador es
un caso cerrado. Y profundidad truncada **sin** pulsaciones es exactamente el
escenario que el evento no puede ver.

---

## 7. Contaminación conocida — el evento sintético del 24/08

Durante la puesta en marcha se envió un evento de prueba desde la línea de
comandos, con un User-Agent de Samsung a propósito para validar el desglose por
navegador:

```
timestamp:  2026-08-24 17:08:54
name:       GridLoadMoreManual
browser:    Samsung Browser
meta.key:   ['grid']
meta.value: ['galeria']
```

**Está en las estadísticas reales y es del navegador justo bajo sospecha.** La
línea base no es 0 conversiones de Samsung: es 1. Con volumen se diluye sola,
pero las primeras 24-48 horas son precisamente cuando alguien va a mirar y puede
leerlo como la señal que busca.

Para evitarlo del todo, acota el rango del panel a partir del **25/08/2026**.

---

## 8. Qué hacer según lo que salga

| Lo que ves | Qué significa | Qué hacer |
|---|---|---|
| Tasas parecidas entre navegadores | El observador funciona; el botón es sólo un botón | Nada. Dejar la medición puesta (§10) |
| Tasa disparada en **un** navegador | La carga automática no se produce en ese motor | Preparar la depuración por USB (§9) contra ESE navegador |
| Tasa disparada en **todos** | El observador no funciona en ninguna parte | Comprobar que `GridLoadMore` se monta y que el centinela existe en el DOM: `document.querySelector('[aria-hidden="true"].h-px')` |
| Cero conversiones y cero visitas | La medición está rota, no el sitio | §11 |
| Cero conversiones con tráfico normal | Ambiguo — ver §2 | Mirar la profundidad de scroll (§6) antes de celebrar nada |
| Concentración en `galeria-autor` | Las fichas de artista son las páginas más cortas, donde menos recorrido hay para que el navegador oculte su barra | Coherente con el diagnóstico original; mismo tratamiento |

## 9. Si hay que ir más lejos: depuración por USB

Con un navegador señalado, el paso siguiente es el que se dejó aparcado al
diagnosticar: conectar el móvil por USB, abrir `chrome://inspect` desde el
portátil (Samsung Internet lo soporta), cargar `/galeria`, bajar hasta el final
sin subir en ningún momento y evaluar:

```js
({ chrome: document.documentElement.clientHeight - window.innerHeight,
   falta:  document.documentElement.scrollHeight - (window.innerHeight + window.scrollY) })
```

`chrome > 0` estando en el fondo confirma que el viewport visual y el de
maquetación difieren en ese navegador. Si además el observador no dispara con
600 px de margen, el problema es del `IntersectionObserver` de ese motor y no de
la medición de viewports — que es un diagnóstico distinto y aún no visto.

---

## 10. Consultas directas a ClickHouse

Para cuando el panel no baste. En el Mac mini:

```bash
cd ~/projects/plausible-ce
```

> Los nombres de columna no están verificados contra esta instancia.
> `docker compose exec plausible_events_db clickhouse-client --query "DESCRIBE TABLE plausible_events_db.events_v2"`
> los lista si alguna consulta falla.

**Últimas pulsaciones, con su rejilla:**

```bash
docker compose exec plausible_events_db clickhouse-client --query \
  "SELECT timestamp, browser, pathname, \"meta.value\"
     FROM plausible_events_db.events_v2
    WHERE name = 'GridLoadMoreManual'
    ORDER BY timestamp DESC LIMIT 20 FORMAT Vertical"
```

**Tasa por navegador (§4), últimos 30 días:**

```bash
docker compose exec plausible_events_db clickhouse-client --query \
  "SELECT browser,
          uniqExactIf(user_id, pathname LIKE '/galeria%' OR pathname LIKE '/tienda%') AS en_rejilla,
          uniqExactIf(user_id, name = 'GridLoadMoreManual') AS pulsaron,
          round(100 * pulsaron / nullIf(en_rejilla, 0), 1) AS tasa_pct
     FROM plausible_events_db.events_v2
    WHERE timestamp >= now() - INTERVAL 30 DAY
    GROUP BY browser
    ORDER BY en_rejilla DESC FORMAT PrettyCompact"
```

> ⚠️ **`user_id` no es estable entre días.** Plausible identifica al visitante
> como `hash(sal_diaria, IP, User-Agent, dominio)` y **la sal rota cada día**, a
> propósito, para no guardar identificadores persistentes. Un `uniqExact` sobre
> 30 días cuenta a la misma persona una vez por día que visitó, así que **no
> coincidirá con la cifra de visitantes del panel** y la infla.
>
> Para la **tasa** el efecto se compensa en buena parte, porque numerador y
> denominador se inflan por el mismo factor de visitas repetidas. Para cifras
> absolutas de visitantes, usa el panel. Si necesitas precisión, agrupa también
> por `toDate(timestamp)`.

---

## 11. Modos de fallo silencioso de la propia medición

Todos ellos producen «cero conversiones», que es indistinguible de «todo va
bien». Recórrelos antes de interpretar un cero como éxito.

| Fallo | Síntoma | Comprobación |
|---|---|---|
| El objetivo no está dado de alta | El evento se ingiere pero no aparece como conversión | https://analytics.140d.art/140d.art/settings/goals |
| La propiedad `grid` no está dada de alta | Conversiones sí, desglose por rejilla no | https://analytics.140d.art/140d.art/settings/properties |
| La constante del evento cambió | Nada se registra desde el despliegue en que cambió | `grep GRID_LOAD_MORE_EVENT client/lib/constants.js` frente al nombre del objetivo |
| El Mac mini está apagado o el DDNS no ha propagado | **Ninguna** analítica, ni visitas ni eventos. Sentry no ve nada: un script externo que no carga no es una excepción | ¿Hay visitas hoy en el panel? |
| ClickHouse por debajo de su suelo de memoria | `/api/event` responde `ok` y el evento se pierde entre el búfer y la tabla | `docker compose logs plausible` → `Code: 241 MEMORY_LIMIT_EXCEEDED`; ver `plausible-analytics.md` §2.4 |
| `NEXT_PUBLIC_APP_ENV=preprod` en el build de producción | El tracker no se carga en absoluto | Ver el `<head>` de 140d.art en producción |
| Bloqueadores de rastreadores | Infravaloración, y **sesgada**: correlaciona con el navegador, que es justo la dimensión que se está midiendo | No tiene arreglo. Sesga hacia abajo las tasas de los navegadores más «técnicos», no las de Samsung Internet |

---

## 12. Cuándo retirar la medición

**No la retires.** Cuesta una llamada de función, no escribe cookies ni
identificadores, y una vez que la distribución es sana se convierte en un
detector de regresiones: si dentro de un año un cambio de maquetación, una
actualización de Next o un navegador nuevo vuelven a romper el disparo
automático, la tasa de ese motor se dispara y hay dónde verlo.

Lo que sí conviene es **anotar la línea base** una vez haya muestra suficiente
—tasa global y por navegador— aquí mismo, para que la siguiente persona compare
contra algo en vez de contra su intuición.

| Fecha | Tasa global | Notas |
|---|---|---|
| _(pendiente: rellenar tras 1-2 semanas de tráfico)_ | | |
