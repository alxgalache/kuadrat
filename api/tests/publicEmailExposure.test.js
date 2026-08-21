/**
 * Invariante de código fuente: ninguna consulta de un endpoint PÚBLICO puede
 * seleccionar la columna `email` de `users`.
 *
 * El defecto que cierra esta prueba: `GET /api/art`, `/api/others`,
 * `/api/products` y sus fichas hacían `SELECT a.*, u.email as seller_email`, y
 * `GET /api/users/authors` (listado y ficha) devolvía `email` directamente.
 * Ninguna de esas rutas exige autenticación, así que el correo de la cuenta de
 * cada artista viajaba en una respuesta pública — y ningún consumidor lo usaba.
 *
 * Se comprueba sobre el FUENTE y no sobre la respuesta HTTP a propósito, igual
 * que `editionInventory.test.js` y `passwordChangeInvalidation.test.js`: una
 * prueba de integración sólo cubre la ruta que se haya acordado probar, mientras
 * que esto falla en cuanto alguien añada la columna a cualquier consulta de
 * estos controladores, incluida una nueva.
 *
 * El correo del artista para uso público es `email_contact`, que el artista
 * rellena a sabiendas de que se muestra. Esa columna sí puede seleccionarse.
 */

const fs = require('fs');
const path = require('path');

const CONTROLLERS_DIR = path.join(__dirname, '..', 'controllers');

// Controladores que sirven exclusivamente rutas públicas de catálogo y de
// autores. Los de admin, vendedor, pedidos y webhooks quedan fuera: ahí el
// correo es necesario y la ruta está autenticada.
const PUBLIC_CONTROLLERS = [
  'artController.js',
  'othersController.js',
  'productsController.js',
  'usersController.js',
];

// Coincide con `u.email`, `users.email` o `email` sueltos dentro de una lista de
// columnas SELECT, pero NO con `email_contact`, `email_verified`, etc. El
// `(?![_a-zA-Z])` es lo que separa la columna de sus parientes con prefijo
// común: sin él, `email_contact` daría un falso positivo y la prueba se
// convertiría en ruido que alguien acabaría desactivando.
const EMAIL_COLUMN = /(?:^|[\s,(])(?:[a-z]+\.)?email(?![_a-zA-Z])/i;

// Sólo interesa la LISTA DE COLUMNAS, es decir, el tramo entre `SELECT` y el
// primer `FROM`. Delimitarlo así y no «desde que veo SELECT hasta que se acabe
// el bloque» es lo que evita los falsos positivos: la primera versión de esta
// prueba marcaba la cadena
//   'Failed to send new product notification email'
// —prosa de un log, en JavaScript, a doscientas líneas de cualquier consulta—
// porque seguía considerándose dentro de la región SQL. Una prueba que falla
// por eso se acaba desactivando.
function selectColumnLists(source) {
  const out = [];
  const re = /\bSELECT\b([\s\S]*?)\bFROM\b/gi;
  let m;

  while ((m = re.exec(source)) !== null) {
    const columns = m[1];
    // Número de línea donde empieza el SELECT, para que el fallo sea navegable.
    const line = source.slice(0, m.index).split('\n').length;
    out.push({ line, columns });
  }

  return out;
}

describe('el correo del artista no viaja en respuestas públicas', () => {
  it.each(PUBLIC_CONTROLLERS)(
    '%s no selecciona la columna email de users',
    (file) => {
      const source = fs.readFileSync(path.join(CONTROLLERS_DIR, file), 'utf8');

      const offenders = selectColumnLists(source)
        .map(({ line, columns }) => ({
          line,
          // Los comentarios SQL (--) y JS (//) dentro de la lista de columnas
          // explican precisamente por qué la columna no está.
          columns: columns
            .split('\n')
            .filter((l) => !/^\s*(--|\/\/|\*)/.test(l))
            .join('\n'),
        }))
        .filter(({ columns }) => EMAIL_COLUMN.test(columns));

      const detail = offenders
        .map(({ line, columns }) => `  ${file}:${line}  SELECT ${columns.trim().slice(0, 120)}`)
        .join('\n');

      expect(
        offenders.length === 0 ? '' : `\nColumna email en consulta pública:\n${detail}\n`,
      ).toBe('');
    },
  );

  it('la expresión distingue email de email_contact', () => {
    // Sin esta comprobación, un ajuste del patrón podría relajarlo hasta que ya
    // no detecte nada, y la prueba seguiría pasando sin proteger nada.
    expect(EMAIL_COLUMN.test('          u.email,')).toBe(true);
    expect(EMAIL_COLUMN.test('          email,')).toBe(true);
    expect(EMAIL_COLUMN.test('  u.email as seller_email,')).toBe(true);
    expect(EMAIL_COLUMN.test('SELECT email FROM users')).toBe(true);

    expect(EMAIL_COLUMN.test('          u.email_contact,')).toBe(false);
    expect(EMAIL_COLUMN.test('          email_contact,')).toBe(false);
    expect(EMAIL_COLUMN.test('          u.email_verified,')).toBe(false);
  });
});
