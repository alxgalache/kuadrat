const { db } = require('../config/database');

/**
 * Ordenación entrelazada por artista de los listados públicos de catálogo.
 *
 * El listado ordenaba por `created_at DESC, id DESC`. Como cada artista sube su
 * obra de una sentada, eso agrupa las obras por artista en bloques contiguos y
 * fija PARA SIEMPRE quién ocupa la primera fila: la exposición en la rejilla
 * —el activo más escaso de la galería— quedaba repartida por la fecha de alta.
 *
 * Aquí se produce el orden alternativo. Tres piezas, separadas a propósito:
 *
 *   getDeck(tipo)                 ← E/S, cacheable, NO depende de la semilla
 *   interleaveByArtist(baraja, s) ← función pura, sin E/S
 *   getOrderedPage(...)           ← recorta la ventana de la página
 *
 * El controlador hidrata después por clave primaria sólo los ids de la página.
 */

// La baraja no depende de la semilla, así que UNA entrada por tipo sirve a
// todos los visitantes. El desfase máximo entre el catálogo y lo que se muestra
// es este valor; ver `docs`/design.md para por qué no se invalida desde las
// escrituras.
const DECK_TTL_MS = 30 * 1000;

// Tope del `limit` en el camino con semilla. La hidratación gasta un parámetro
// por id en su `IN (...)` y SQLite tiene techo; 120 es además el máximo que el
// cliente pide de verdad (GRID_RESTORE_MAX_PAGES × DEFAULT_PAGE_SIZE, en la
// rehidratación de la restauración de scroll).
const MAX_SEEDED_LIMIT = 120;

// La semilla es un entero sin signo de 32 bits: lo que consume mulberry32 y lo
// que el cliente sortea con `Math.random()`.
const SEED_MAX = 4294967295;

// Tablas admitidas. El nombre se interpola en el SQL, así que NO puede venir de
// la petición: sólo de estas claves.
const TABLES = {
  art: 'art',
  other: 'others',
};

/**
 * Los mismos criterios que el listado cronológico, en UN solo sitio.
 *
 * Si el predicado de la baraja y el de la hidratación divergen, la baraja
 * contiene obras que la hidratación descarta —o al revés—, y la rejilla muestra
 * huecos permanentes en lugar de transitorios. El alias se parametriza porque
 * la baraja consulta la tabla desnuda y la hidratación la consulta con `JOIN`.
 */
function visibilityPredicate(alias) {
  const p = alias ? `${alias}.` : '';
  return `${p}visible = 1 AND ${p}is_sold = 0 AND ${p}status = 'approved' AND ${p}removed = 0
    AND (${p}for_auction = 0 OR ${p}for_auction IS NULL)
    AND (${p}for_draw = 0 OR ${p}for_draw IS NULL)`;
}

/**
 * Valida la semilla recibida en la query.
 *
 * Devuelve `null` —que significa «orden cronológico de siempre»— si falta, no
 * es un entero o se sale del rango. NO lanza: una semilla mal formada no puede
 * dejar la rejilla sin contenido, y tampoco se registra en el log, porque es un
 * valor público que cualquiera puede escribir en la URL.
 */
function parseSeed(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (!/^\d+$/.test(String(raw))) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > SEED_MAX) return null;
  return value;
}

/**
 * mulberry32: PRNG de 32 bits de estado, con avalancha real y reproducible
 * entre procesos.
 *
 * No se hace la aleatorización en SQL con `(id * semilla) % p` porque SQLite no
 * tiene función de hash ni operador XOR, y la permutación que induce ese
 * mezclador multiplicativo sobre un conjunto pequeño de ids NO es uniforme: es
 * la estructura de los tres huecos. El sesgo recaería justo sobre quién sale
 * primero, que es la propiedad por la que existe este módulo, y sería
 * invisible.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates con el generador dado. Uniforme sobre las n! permutaciones. */
function shuffleInPlace(items, rand) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

// Intentos de barajado por ronda antes de rebajar la exigencia. Con 4 artistas
// una permutación al azar cumple ambas restricciones una de cada cuatro veces,
// así que 40 deja la probabilidad de agotarlos en un valor despreciable; y
// agotarlos no rompe nada, sólo renuncia a la restricción de columna.
const INTENTOS_RONDA = 40;

// A partir de cuántos participantes se exige la restricción de columna. Ver
// `ordenDeRonda` para por qué con dos es imposible y con tres es contraproducente.
const MIN_PARTICIPANTES_COLUMNA = 4;

/**
 * Orden de los artistas dentro de UNA ronda.
 *
 * Dos restricciones, con prioridades distintas:
 *
 *  · FILA (dura). El primer artista de la ronda no puede ser el último de la
 *    anterior, o habría dos obras contiguas del mismo artista en el orden de
 *    lectura. Se garantiza siempre, con reparación si hace falta.
 *
 *  · COLUMNA (blanda). Ningún artista repite el mismo índice dentro de la ronda
 *    respecto de la ronda anterior — un «desarreglo» respecto del orden
 *    anterior. Es lo que evita que el grid dibuje bandas verticales, y hay que
 *    entender POR QUÉ es exactamente ésta la restricción que hace falta:
 *
 *      El reparto por rondas produce una secuencia periódica de periodo `m`
 *      (el tamaño de la ronda). Un grid de `c` columnas coloca en la misma
 *      columna las posiciones que distan `c`. Si `c === m`, «distar c» es
 *      «mismo índice dentro de la ronda»: cada artista queda CLAVADO en su
 *      columna, fila tras fila. Con `c !== m` no hay alineación posible y la
 *      columna va derivando sola. Así que `c === m` es el único caso en que la
 *      secuencia puede engancharse con la rejilla, y este desarreglo es su
 *      antídoto exacto — sin necesidad de que la API sepa cuántas columnas
 *      pinta el cliente, que además cambian con el breakpoint
 *      (`grid-cols-2` / `lg:grid-cols-4` en `ProductGrid.js`).
 *
 * NO se añaden más distancias prohibidas (por ejemplo la de 2 columnas) aunque
 * parezca gratis: con 4 artistas, exigir a la vez distancia 2 y distancia 4
 * deja sólo dos permutaciones válidas y FUERZA el primer elemento de cada
 * ronda, de modo que la primera columna acaba alternando siempre entre los dos
 * mismos artistas. Se cambiaría una banda por otra.
 *
 * Y por la misma razón la restricción de columna sólo se exige a partir de
 * CUATRO participantes (`MIN_PARTICIPANTES_COLUMNA`):
 *
 *   · Con 2, es imposible: el único desarreglo de dos elementos es el
 *     intercambio, y el intercambio pone en cabeza al último de la ronda
 *     anterior. Manda la fila. La alternancia ABAB resultante es además la
 *     única secuencia posible sin contigüidad, así que no se renuncia a nada.
 *   · Con 3, hay solución pero es ÚNICA (la rotación), y una solución única
 *     devuelve la secuencia a ser periódica — exactamente el defecto que esta
 *     restricción existe para evitar, sólo que en diagonal en vez de en
 *     vertical. Además protegería la distancia 3, y el grid nunca pinta tres
 *     columnas. Se prefiere el azar del barajado por ronda.
 *   · Con 4 o más hay permutaciones válidas de sobra y la restricción no
 *     determina nada.
 */
function ordenDeRonda(participantes, previo, rand) {
  const orden = shuffleInPlace(participantes.slice(), rand);

  // Un solo artista: no hay nada que ordenar ni forma de evitar la repetición.
  if (!previo || participantes.length < 2) return orden;

  const ultimoPrevio = previo[previo.length - 1];
  const rompeFila = (q) => q[0] !== ultimoPrevio;

  const exigirColumna = participantes.length >= MIN_PARTICIPANTES_COLUMNA;
  const comunes = Math.min(participantes.length, previo.length);
  const rompeColumna = (q) => {
    for (let j = 0; j < comunes; j += 1) {
      if (q[j] === previo[j]) return false;
    }
    return true;
  };

  let soloFila = null;
  let candidato = orden;
  for (let intento = 0; intento < INTENTOS_RONDA; intento += 1) {
    if (intento > 0) candidato = shuffleInPlace(participantes.slice(), rand);
    const fila = rompeFila(candidato);
    if (fila && (!exigirColumna || rompeColumna(candidato))) return candidato;
    if (fila && soloFila === null) soloFila = candidato;
  }

  if (soloFila !== null) return soloFila;

  // Reparación: se intercambian los dos primeros participantes ACTUALES —
  // nunca se reutiliza `previo`, que cuando la ronda encoge contiene artistas
  // ya agotados—. Con al menos dos artistas distintos esto saca siempre de la
  // cabeza al último de la ronda anterior, así que la restricción dura no se
  // incumple nunca.
  const t = candidato[0];
  candidato[0] = candidato[1];
  candidato[1] = t;
  return candidato;
}

/**
 * Entrelazado por rondas. FUNCIÓN PURA: misma baraja y misma semilla, misma
 * salida, en cualquier proceso.
 *
 * Baraja las obras de cada artista y reparte una obra de cada uno por ronda,
 * con el ORDEN DE ARTISTAS RESORTEADO EN CADA RONDA (ver `ordenDeRonda`). De la
 * construcción salen cuatro propiedades sin necesidad de ajustar nada:
 *
 *  · La primera posición es EQUIPROBABLE entre artistas (la primera ronda es un
 *    barajado sin restricciones). Es el objetivo del cambio.
 *  · Los `k` primeros elementos son de `k` artistas distintos.
 *  · Dos contiguos del mismo artista sólo pueden aparecer en la frontera entre
 *    rondas, y sólo cuando ya no queda más que un artista con obras — la
 *    excepción «por número de obras» que el cambio admite.
 *  · El grid no dibuja bandas verticales: la secuencia deja de ser periódica y,
 *    en el caso en que sí podría engancharse (tantas columnas como artistas),
 *    el desarreglo entre rondas lo impide.
 *
 * Se descartó el voraz «el que más le queda, distinto del anterior» (óptimo en
 * separación) porque la primera posición le tocaría SIEMPRE al artista con más
 * obras: cambiaría el sesgo por fecha de alta por un sesgo por tamaño de
 * catálogo, que es la misma injusticia con otro nombre.
 */
function interleaveByArtist(groups, seed) {
  const rand = mulberry32(seed);

  const decks = [];
  groups.forEach((ids) => {
    if (ids.length > 0) decks.push(ids.slice());
  });

  shuffleInPlace(decks, rand);
  decks.forEach((deck) => shuffleInPlace(deck, rand));

  const ordered = [];
  // Índices de los mazos que aún tienen obra. Se conserva el orden de la ronda
  // recién repartida: es contra ese orden contra el que se compara la
  // restricción de columna de la ronda siguiente.
  let participantes = decks.map((_, i) => i);
  let previo = null;
  let ronda = 0;

  while (participantes.length > 0) {
    const orden = ordenDeRonda(participantes, previo, rand);
    orden.forEach((i) => ordered.push(decks[i][ronda]));
    previo = orden;
    ronda += 1;
    participantes = orden.filter((i) => decks[i].length > ronda);
  }

  return ordered;
}

// tipo → { groups, total, expiresAt }
const deckCache = new Map();
// tipo → promesa en vuelo. Sin esto, N peticiones concurrentes con la caché
// caducada lanzan N consultas idénticas. Mismo patrón que la caché de token de
// `services/shipping/sendcloudAuth.js`.
const deckInFlight = new Map();

async function buildDeck(productType) {
  const table = TABLES[productType];
  if (!table) throw new Error(`Tipo de catálogo desconocido: ${productType}`);

  // El ORDER BY no es decorativo: es lo que hace que un catálogo que no ha
  // cambiado se rebaraje IDÉNTICO al caducar el TTL, y por tanto que la página
  // 3 pedida cinco minutos después de la página 1 pertenezca al mismo orden.
  const result = await db.execute(
    `SELECT id, seller_id FROM ${table} WHERE ${visibilityPredicate('')} ORDER BY seller_id, id DESC`
  );

  const groups = new Map();
  result.rows.forEach((row) => {
    // `seller_id` puede ser nulo (el listado hace LEFT JOIN y no filtra por
    // vendedor): esas filas forman su propio grupo en lugar de perderse.
    const key = row.seller_id === null ? 'sin-artista' : Number(row.seller_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(Number(row.id));
  });

  return { groups, total: result.rows.length, expiresAt: Date.now() + DECK_TTL_MS };
}

/** Baraja vigente del tipo pedido, de la caché o recién construida. */
async function getDeck(productType) {
  const cached = deckCache.get(productType);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const pending = deckInFlight.get(productType);
  if (pending) return pending;

  const promise = buildDeck(productType)
    .then((deck) => {
      deckCache.set(productType, deck);
      return deck;
    })
    .finally(() => {
      deckInFlight.delete(productType);
    });

  deckInFlight.set(productType, promise);
  return promise;
}

/**
 * Ventana de ids de la página pedida, ya entrelazada.
 *
 * `hasMore` se calcula sobre el total de la baraja y NO sobre las filas que la
 * hidratación consiga recuperar: una obra vendida hace veinte segundos deja un
 * hueco de una tarjeta, no debe cortar la paginación.
 */
async function getOrderedPage(productType, seed, page, limit) {
  const deck = await getDeck(productType);
  const safeLimit = Math.min(Math.max(limit, 1), MAX_SEEDED_LIMIT);
  // `page` se topa en 1 antes de multiplicar. Con un desplazamiento negativo,
  // `Array.slice` cuenta desde el FINAL: `?page=-2` devolvería la cola del
  // catálogo en lugar de la primera página. El camino cronológico no tiene ese
  // problema porque SQLite trata un OFFSET negativo como cero.
  const safePage = Math.max(page, 1);
  const offset = (safePage - 1) * safeLimit;
  const ordered = interleaveByArtist(deck.groups, seed);

  return {
    ids: ordered.slice(offset, offset + safeLimit),
    hasMore: ordered.length > offset + safeLimit,
    total: ordered.length,
  };
}

/**
 * Reordena las filas hidratadas según la lista de ids y descarta las que la
 * consulta de hidratación no haya devuelto (dejaron de ser publicables después
 * de construirse la baraja).
 */
function reorderByIds(rows, ids) {
  const porId = new Map(rows.map((row) => [Number(row.id), row]));
  return ids.map((id) => porId.get(id)).filter(Boolean);
}

/** Sólo para tests: obliga a reconstruir la baraja en la siguiente llamada. */
function __clearDeckCache() {
  deckCache.clear();
  deckInFlight.clear();
}

module.exports = {
  parseSeed,
  interleaveByArtist,
  ordenDeRonda,
  getDeck,
  getOrderedPage,
  reorderByIds,
  visibilityPredicate,
  mulberry32,
  shuffleInPlace,
  DECK_TTL_MS,
  MAX_SEEDED_LIMIT,
  SEED_MAX,
  __clearDeckCache,
};
