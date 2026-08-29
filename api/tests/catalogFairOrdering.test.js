/**
 * Ordenación entrelazada en los endpoints públicos de catálogo.
 *
 * Complementa a `catalogOrdering.test.js` (la función pura) recorriendo el
 * endpoint real: lo que se comprueba aquí es el cableado —validación de la
 * semilla, baraja, hidratación por clave primaria, `hasMore`— y sobre todo las
 * DOS propiedades que hacen que el cambio sea seguro:
 *
 *  · Recorrer todas las páginas con la misma semilla devuelve cada producto
 *    exactamente una vez. Es la garantía que `catalogPaginationOrdering.test.js`
 *    estableció para el orden cronológico, y que un orden nuevo podría haber
 *    roto sin ruido.
 *  · Sin semilla, o con filtro de autor, la respuesta es literalmente la de
 *    antes del cambio.
 *
 * La base de datos de test es una sola y no se limpia entre ficheros, así que
 * la baraja contiene también las filas de otras suites. Las aserciones están
 * escritas para ser ciertas con esas filas presentes: se afirma sobre el
 * conjunto sembrado aquí, o sobre invariantes globales que no dependen de qué
 * más haya en la tabla.
 */

const request = require('supertest');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const { __clearDeckCache } = require('../services/catalogOrdering');

// Mismo reparto que preproducción: 4 artistas con 9, 6, 6 y 5 obras.
const REPARTO = [9, 6, 6, 5];
const TOTAL = REPARTO.reduce((a, b) => a + b, 0);
const POR_PAGINA = 12;
const SEMILLA = 123456789;

async function crearVendedor(prefijo, indice) {
  const marca = `${prefijo}-${indice}-${Date.now()}`;
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, slug, visible)
          VALUES (?, ?, 'seller', ?, ?, 1)`,
    args: [`fair-${marca}@test.com`, 'x', `Artista ${marca}`, `fair-${marca}`],
  });
  return { id: Number(result.lastInsertRowid), slug: `fair-${marca}` };
}

/**
 * Siembra `REPARTO` sobre una tabla de catálogo y devuelve los vendedores y el
 * mapa id → vendedor, que es lo que permite comprobar el entrelazado sin
 * depender de qué más contenga la tabla.
 */
async function sembrarCatalogo(tabla, prefijo) {
  const vendedores = [];
  const artistaPorId = new Map();
  const idsSembrados = [];

  for (let v = 0; v < REPARTO.length; v += 1) {
    const vendedor = await crearVendedor(prefijo, v);
    vendedores.push(vendedor);

    for (let i = 0; i < REPARTO[v]; i += 1) {
      const result = await db.execute({
        sql: `INSERT INTO ${tabla}
                (seller_id, name, description, price, slug, visible, status)
              VALUES (?, ?, ?, ?, ?, 1, 'approved')`,
        args: [
          vendedor.id,
          `Pieza ${prefijo} ${v}-${i}`,
          'Descripción de prueba para la ordenación entrelazada.',
          100 + i,
          `${vendedor.slug}-pieza-${i}`,
        ],
      });
      const id = Number(result.lastInsertRowid);
      idsSembrados.push(id);
      artistaPorId.set(id, vendedor.id);
    }
  }

  // La baraja se cachea 30 s y puede haberse construido antes de esta siembra.
  __clearDeckCache();

  return { vendedores, artistaPorId, idsSembrados };
}

/** Recorre todas las páginas del endpoint con los parámetros dados. */
async function recorrer(endpoint, query, tope = 40) {
  const productos = [];
  const paginas = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= tope) {
    const res = await request(app)
      .get(endpoint)
      .query({ ...query, page, limit: query.limit ?? POR_PAGINA });

    expect(res.status).toBe(200);
    paginas.push(res.body.products);
    productos.push(...res.body.products);
    hasMore = res.body.hasMore;
    page += 1;
  }

  return { productos, paginas };
}

describe.each([
  { nombre: 'GET /api/art', endpoint: '/api/art', tabla: 'art', prefijo: 'art' },
  { nombre: 'GET /api/others', endpoint: '/api/others', tabla: 'others', prefijo: 'oth' },
])('$nombre — ordenación entrelazada por artista', ({ endpoint, tabla, prefijo }) => {
  let sembrado;

  beforeAll(async () => {
    sembrado = await sembrarCatalogo(tabla, prefijo);
  });

  beforeEach(() => {
    // Cada test parte de una baraja recién construida, para que el TTL no
    // introduzca dependencias de orden entre tests.
    __clearDeckCache();
  });

  describe('Garantía de paginación', () => {
    it('devuelve cada producto exactamente una vez al recorrer todas las páginas', async () => {
      const { productos } = await recorrer(endpoint, { seed: SEMILLA });
      const ids = productos.map((p) => Number(p.id));

      expect(new Set(ids).size).toBe(ids.length);

      const sembrados = ids.filter((id) => sembrado.artistaPorId.has(id));
      expect(sembrados.sort((a, b) => a - b)).toEqual(
        [...sembrado.idsSembrados].sort((a, b) => a - b)
      );
    });

    it('no solapa páginas: ningún producto aparece en dos páginas', async () => {
      const { paginas } = await recorrer(endpoint, { seed: SEMILLA });
      const vistos = new Set();
      paginas.flat().forEach((p) => {
        expect(vistos.has(Number(p.id))).toBe(false);
        vistos.add(Number(p.id));
      });
    });

    it('una petición de varias páginas devuelve el mismo prefijo que pedirlas de una en una', async () => {
      // Es el camino de la restauración de scroll: `page=1` con un `limit`
      // equivalente a N páginas.
      const grande = await request(app)
        .get(endpoint)
        .query({ page: 1, limit: POR_PAGINA * 2, seed: SEMILLA });
      expect(grande.status).toBe(200);

      const p1 = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed: SEMILLA });
      const p2 = await request(app).get(endpoint).query({ page: 2, limit: POR_PAGINA, seed: SEMILLA });

      expect(grande.body.products.map((p) => Number(p.id))).toEqual([
        ...p1.body.products.map((p) => Number(p.id)),
        ...p2.body.products.map((p) => Number(p.id)),
      ]);
    });

    it('una página negativa devuelve la primera, no la cola del catálogo', async () => {
      // `Array.slice` con inicio negativo cuenta desde el final: sin topar la
      // página, `?page=-2` serviría las últimas obras. El camino cronológico no
      // tiene el problema porque SQLite trata un OFFSET negativo como cero.
      const negativa = await request(app)
        .get(endpoint)
        .query({ page: -2, limit: POR_PAGINA, seed: SEMILLA });
      const primera = await request(app)
        .get(endpoint)
        .query({ page: 1, limit: POR_PAGINA, seed: SEMILLA });

      expect(negativa.status).toBe(200);
      expect(negativa.body.products.map((p) => p.id)).toEqual(
        primera.body.products.map((p) => p.id)
      );
    });

    it('una página posterior al final devuelve lista vacía sin error', async () => {
      const res = await request(app)
        .get(endpoint)
        .query({ page: 500, limit: POR_PAGINA, seed: SEMILLA });

      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
      expect(res.body.hasMore).toBe(false);
    });

    it('es determinista: la misma semilla devuelve el mismo orden', async () => {
      const uno = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed: SEMILLA });
      __clearDeckCache();
      const dos = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed: SEMILLA });

      expect(uno.body.products.map((p) => p.id)).toEqual(dos.body.products.map((p) => p.id));
    });
  });

  describe('Entrelazado', () => {
    it('no coloca dos productos contiguos del mismo artista mientras quede otro', async () => {
      const { productos } = await recorrer(endpoint, { seed: SEMILLA });
      const artistas = productos.map((p) => (p.seller_id === null ? 'nulo' : Number(p.seller_id)));

      for (let i = 1; i < artistas.length; i += 1) {
        if (artistas[i] !== artistas[i - 1]) continue;
        // Sólo admisible si desde aquí no queda nada de ningún otro artista.
        expect([...new Set(artistas.slice(i - 1))]).toEqual([artistas[i]]);
        break;
      }
    });

    it('las fronteras entre páginas no reciben trato distinto del resto de la secuencia', async () => {
      // El entrelazado se calcula sobre el catálogo COMPLETO, no sobre la
      // página: una implementación que barajara cada página por separado
      // cumpliría la invariante dentro de cada una y la rompería justo aquí.
      //
      // La condición es la misma que en el resto de la secuencia —una
      // repetición sólo es admisible si desde ahí no queda nada de ningún otro
      // artista—, no «nunca se repite»: con 9/6/6/5 la frontera entre la
      // página 2 y la 3 cae en la cola inevitable del artista con más obras.
      const { paginas, productos } = await recorrer(endpoint, { seed: SEMILLA });
      expect(paginas.length).toBeGreaterThan(1);

      const artistas = productos.map((p) => (p.seller_id === null ? 'nulo' : Number(p.seller_id)));

      let acumulado = 0;
      const fronteras = paginas.slice(0, -1).map((pagina) => {
        acumulado += pagina.length;
        return acumulado;
      });
      expect(fronteras.length).toBeGreaterThan(0);

      fronteras.forEach((i) => {
        if (i === 0 || i >= artistas.length) return;
        if (artistas[i] !== artistas[i - 1]) return;
        expect([...new Set(artistas.slice(i - 1))]).toEqual([artistas[i]]);
      });
    });

    it('semillas distintas producen primeras páginas distintas', async () => {
      const primeros = new Set();
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const res = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed });
        primeros.add(res.body.products.map((p) => p.id).join('|'));
      }
      expect(primeros.size).toBeGreaterThan(1);
    });

    it('reparte la primera posición entre varios artistas', async () => {
      const artistas = new Set();
      for (const seed of [11, 22, 33, 44, 55, 66, 77, 88, 99, 110, 121, 132]) {
        const res = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed });
        artistas.add(String(res.body.products[0]?.seller_id));
      }
      expect(artistas.size).toBeGreaterThan(1);
    });
  });

  describe('Compatibilidad', () => {
    it('sin semilla, el orden es el cronológico de siempre', async () => {
      const res = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA });
      expect(res.status).toBe(200);

      const filas = await db.execute(
        `SELECT id FROM ${tabla}
          WHERE visible = 1 AND is_sold = 0 AND status = 'approved' AND removed = 0
            AND (for_auction = 0 OR for_auction IS NULL)
            AND (for_draw = 0 OR for_draw IS NULL)
          ORDER BY created_at DESC, id DESC
          LIMIT ${POR_PAGINA}`
      );

      expect(res.body.products.map((p) => Number(p.id))).toEqual(
        filas.rows.map((r) => Number(r.id))
      );
    });

    it.each(['abc', '-1', '1.5', '4294967296', ''])(
      'con la semilla inválida %p responde 200 y en orden cronológico',
      async (seed) => {
        const conSemilla = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed });
        const sinSemilla = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA });

        expect(conSemilla.status).toBe(200);
        expect(conSemilla.body.products.map((p) => p.id)).toEqual(
          sinSemilla.body.products.map((p) => p.id)
        );
      }
    );

    it('con filtro de autor, la semilla se ignora y sólo salen sus productos', async () => {
      const vendedor = sembrado.vendedores[0];
      const conSemilla = await request(app)
        .get(endpoint)
        .query({ page: 1, limit: POR_PAGINA, author_slug: vendedor.slug, seed: SEMILLA });
      const sinSemilla = await request(app)
        .get(endpoint)
        .query({ page: 1, limit: POR_PAGINA, author_slug: vendedor.slug });

      expect(conSemilla.status).toBe(200);
      expect(conSemilla.body.products).toHaveLength(REPARTO[0]);
      conSemilla.body.products.forEach((p) => {
        expect(Number(p.seller_id)).toBe(vendedor.id);
      });
      expect(conSemilla.body.products.map((p) => p.id)).toEqual(
        sinSemilla.body.products.map((p) => p.id)
      );
    });

    it('mantiene la forma de la respuesta', async () => {
      const res = await request(app).get(endpoint).query({ page: 2, limit: POR_PAGINA, seed: SEMILLA });
      expect(res.body).toEqual(
        expect.objectContaining({ success: true, page: 2, hasMore: expect.any(Boolean) })
      );
      expect(Array.isArray(res.body.products)).toBe(true);
    });

    it('hidrata los mismos campos que el camino cronológico', async () => {
      const conSemilla = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed: SEMILLA });
      const sinSemilla = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA });

      expect(Object.keys(conSemilla.body.products[0]).sort()).toEqual(
        Object.keys(sinSemilla.body.products[0]).sort()
      );
    });
  });

  describe('Visibilidad', () => {
    it('un producto que deja de ser publicable no se muestra, y hasMore no se rompe', async () => {
      // La baraja se construye ANTES de retirar el producto, de modo que la
      // fila retirada sigue en ella: es exactamente la ventana de hasta 30 s
      // que el diseño acepta. La hidratación reaplica los filtros.
      const res = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed: SEMILLA });
      const victima = res.body.products.find((p) => sembrado.artistaPorId.has(Number(p.id)));
      expect(victima).toBeDefined();

      await db.execute({
        sql: `UPDATE ${tabla} SET visible = 0 WHERE id = ?`,
        args: [Number(victima.id)],
      });

      try {
        const conHueco = await request(app).get(endpoint).query({ page: 1, limit: POR_PAGINA, seed: SEMILLA });
        expect(conHueco.status).toBe(200);
        expect(conHueco.body.products.map((p) => Number(p.id))).not.toContain(Number(victima.id));
        expect(conHueco.body.products).toHaveLength(res.body.products.length - 1);
        expect(conHueco.body.hasMore).toBe(res.body.hasMore);
      } finally {
        await db.execute({
          sql: `UPDATE ${tabla} SET visible = 1 WHERE id = ?`,
          args: [Number(victima.id)],
        });
        __clearDeckCache();
      }
    });

    it('el catálogo entrelazado contiene exactamente los mismos productos que el cronológico', async () => {
      const entrelazado = await recorrer(endpoint, { seed: SEMILLA });
      const cronologico = await recorrer(endpoint, {});

      expect(entrelazado.productos.map((p) => Number(p.id)).sort((a, b) => a - b)).toEqual(
        cronologico.productos.map((p) => Number(p.id)).sort((a, b) => a - b)
      );
    });
  });
});

describe('Aislamiento de la baraja entre tipos de catálogo', () => {
  it('la obra y la tienda no comparten baraja', async () => {
    __clearDeckCache();
    const arte = await request(app).get('/api/art').query({ page: 1, limit: 50, seed: SEMILLA });
    const tienda = await request(app).get('/api/others').query({ page: 1, limit: 50, seed: SEMILLA });

    const idsArte = new Set(arte.body.products.map((p) => Number(p.id)));
    const filasArte = await db.execute(
      `SELECT id FROM art WHERE visible = 1 AND is_sold = 0 AND status = 'approved' AND removed = 0`
    );
    const publicables = new Set(filasArte.rows.map((r) => Number(r.id)));

    idsArte.forEach((id) => expect(publicables.has(id)).toBe(true));
    expect(tienda.status).toBe(200);
  });
});
