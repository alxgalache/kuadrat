/**
 * Orden total y estable en la paginación pública del catálogo.
 *
 * `art.created_at` y `others.created_at` son `DATETIME DEFAULT CURRENT_TIMESTAMP`,
 * y `CURRENT_TIMESTAMP` de SQLite tiene resolución de UN SEGUNDO. Dos filas
 * creadas en el mismo segundo empatan, y `ORDER BY created_at DESC` a secas deja
 * su orden relativo INDEFINIDO. Con paginación por LIMIT/OFFSET eso significa que
 * dos páginas consecutivas pueden devolver la misma fila y omitir otra, que no
 * aparecerá en ninguna página — con `hasMore` diciendo la verdad todo el rato.
 * La pérdida es silenciosa: nadie echa en falta lo que nunca ha visto.
 *
 * Dos tests, con papeles distintos, y hacen falta los dos:
 *
 *  1. El de comportamiento recorre el endpoint real y comprueba que cada fila
 *     sale exactamente una vez. Documenta la propiedad de extremo a extremo.
 *     Por sí solo NO es una red de seguridad: sin desempate el orden es
 *     indefinido, no necesariamente distinto, así que SQLite puede devolver el
 *     mismo plan para las dos consultas y el test pasaría por casualidad.
 *
 *  2. El estructural lee el código de los dos controladores y falla si la
 *     cláusula de ordenación del listado paginado no incluye un desempate por
 *     `id`. Es el que de verdad impide la regresión, y es el mismo papel que
 *     cumplen `editionInventory.test.js` y `passwordChangeInvalidation.test.js`.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('./helpers/app');
const { db } = require('../config/database');

// Todas las filas sembradas comparten esta marca de tiempo: es exactamente la
// forma en que SQLite escribe CURRENT_TIMESTAMP, y el empate es el escenario
// bajo prueba.
const EMPATE = '2026-08-24 10:00:00';
const SEMBRADAS = 13;
const POR_PAGINA = 5;

async function crearVendedor(sufijo) {
  const email = `pagination-${sufijo}-${Date.now()}@test.com`;
  const slug = `pagination-${sufijo}-${Date.now()}`;
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, slug, visible)
          VALUES (?, ?, 'seller', ?, ?, 1)`,
    args: [email, 'x', `Vendedor ${sufijo}`, slug],
  });
  return { id: Number(result.lastInsertRowid), slug };
}

/**
 * Recorre TODAS las páginas del listado filtrando por autor, que es lo que aísla
 * estas filas de las que hayan dejado los demás ficheros de la suite (la base de
 * datos de test es una sola y no se limpia entre ficheros).
 */
async function recorrerTodasLasPaginas(endpoint, authorSlug) {
  const ids = [];
  const paginas = [];
  let page = 1;
  let hasMore = true;

  // Tope defensivo: si el desempate desapareciera y el recorrido no avanzara,
  // el test debe fallar por la aserción, no colgarse en un bucle.
  while (hasMore && page <= 10) {
    const res = await request(app)
      .get(endpoint)
      .query({ page, limit: POR_PAGINA, author_slug: authorSlug });

    expect(res.status).toBe(200);
    paginas.push(res.body.products.map((p) => p.id));
    ids.push(...res.body.products.map((p) => p.id));
    hasMore = res.body.hasMore;
    page += 1;
  }

  return { ids, paginas };
}

describe('Paginación pública del catálogo — orden total', () => {
  describe('GET /api/art', () => {
    let vendedor;
    let idsSembrados;

    beforeAll(async () => {
      vendedor = await crearVendedor('art');
      idsSembrados = [];

      for (let i = 0; i < SEMBRADAS; i += 1) {
        const result = await db.execute({
          sql: `INSERT INTO art
                  (seller_id, name, description, price, slug, visible, status, created_at)
                VALUES (?, ?, ?, ?, ?, 1, 'approved', ?)`,
          args: [
            vendedor.id,
            `Obra empatada ${i}`,
            'Descripción de prueba para el orden de la paginación.',
            100 + i,
            `${vendedor.slug}-obra-${i}`,
            EMPATE,
          ],
        });
        idsSembrados.push(Number(result.lastInsertRowid));
      }
    });

    it('siembra todas las obras con la misma marca de tiempo', async () => {
      const result = await db.execute({
        sql: 'SELECT COUNT(DISTINCT created_at) AS marcas FROM art WHERE seller_id = ?',
        args: [vendedor.id],
      });
      expect(Number(result.rows[0].marcas)).toBe(1);
    });

    it('devuelve cada obra exactamente una vez al recorrer todas las páginas', async () => {
      const { ids } = await recorrerTodasLasPaginas('/api/art', vendedor.slug);

      expect(ids).toHaveLength(SEMBRADAS);
      expect(new Set(ids).size).toBe(SEMBRADAS);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        [...idsSembrados].sort((a, b) => a - b)
      );
    });

    it('reparte las obras en páginas del tamaño pedido, sin solape entre páginas', async () => {
      const { paginas } = await recorrerTodasLasPaginas('/api/art', vendedor.slug);

      expect(paginas.map((p) => p.length)).toEqual([5, 5, 3]);
      const vistos = new Set();
      paginas.flat().forEach((id) => {
        expect(vistos.has(id)).toBe(false);
        vistos.add(id);
      });
    });

    it('ordena las obras empatadas por id descendente', async () => {
      const { ids } = await recorrerTodasLasPaginas('/api/art', vendedor.slug);
      const descendente = [...ids].sort((a, b) => b - a);
      expect(ids).toEqual(descendente);
    });
  });

  describe('GET /api/others', () => {
    let vendedor;
    let idsSembrados;

    beforeAll(async () => {
      vendedor = await crearVendedor('others');
      idsSembrados = [];

      for (let i = 0; i < SEMBRADAS; i += 1) {
        const result = await db.execute({
          sql: `INSERT INTO others
                  (seller_id, name, description, price, slug, visible, status, created_at)
                VALUES (?, ?, ?, ?, ?, 1, 'approved', ?)`,
          args: [
            vendedor.id,
            `Producto empatado ${i}`,
            'Descripción de prueba para el orden de la paginación.',
            10 + i,
            `${vendedor.slug}-producto-${i}`,
            EMPATE,
          ],
        });
        idsSembrados.push(Number(result.lastInsertRowid));
      }
    });

    it('devuelve cada producto exactamente una vez al recorrer todas las páginas', async () => {
      const { ids } = await recorrerTodasLasPaginas('/api/others', vendedor.slug);

      expect(ids).toHaveLength(SEMBRADAS);
      expect(new Set(ids).size).toBe(SEMBRADAS);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        [...idsSembrados].sort((a, b) => a - b)
      );
    });
  });

  /**
   * La red de seguridad de verdad. Un empate sin desempate produce un orden
   * INDEFINIDO, no necesariamente incorrecto, así que los tests de arriba pueden
   * pasar por casualidad con el defecto presente. Éste lee la cláusula.
   */
  describe('Guardián estructural', () => {
    const CONTROLADORES = [
      { fichero: 'artController.js', alias: 'a' },
      { fichero: 'othersController.js', alias: 'o' },
    ];

    it.each(CONTROLADORES)(
      '$fichero ordena el listado paginado con un desempate por id',
      ({ fichero, alias }) => {
        const fuente = fs.readFileSync(
          path.join(__dirname, '..', 'controllers', fichero),
          'utf8'
        );

        // La única cláusula del fichero que va acompañada de LIMIT ? OFFSET ?
        // es la del listado público paginado.
        const paginadas = fuente
          .split('\n')
          .filter((linea) => linea.includes('LIMIT ? OFFSET ?'));

        expect(paginadas.length).toBeGreaterThan(0);

        paginadas.forEach((linea) => {
          expect(linea).toContain('ORDER BY');
          expect(linea).toContain(`${alias}.created_at DESC`);
          // Sin esto, dos filas con el mismo created_at pueden repetirse entre
          // páginas y otra desaparecer del catálogo sin dejar rastro.
          expect(linea).toContain(`${alias}.id DESC`);
        });
      }
    );
  });
});
