/**
 * Entrelazado por artista: la función pura.
 *
 * Aquí es donde de verdad se comprueba el cambio. `interleaveByArtist` no toca
 * la base de datos ni la petición, así que sus invariantes se pueden barrer
 * sobre miles de semillas en milisegundos — que es exactamente la razón por la
 * que la ordenación NO se hizo con aritmética dentro del SQL: allí «no hay dos
 * contiguos del mismo artista» sería una afirmación sobre una cadena de texto.
 *
 * Dos de estas comprobaciones son la definición del cambio y no deben
 * relajarse:
 *
 *  · El reparto de la PRIMERA posición. Si deja de ser uniforme, se ha
 *    sustituido el sesgo por fecha de alta (el defecto original) por un sesgo
 *    por tamaño de catálogo, que es la misma injusticia con otro nombre. Es lo
 *    que descarta el algoritmo voraz «el que más le queda».
 *  · La invariante de contigüidad, enunciada de forma exacta: una repetición en
 *    la posición `i` sólo es admisible si desde `i - 1` en adelante TODO
 *    pertenece a ese mismo artista, es decir, si era inevitable.
 */

const {
  interleaveByArtist,
  parseSeed,
  mulberry32,
  shuffleInPlace,
  SEED_MAX,
} = require('../services/catalogOrdering');

/** Reparto real de preproducción a 28/08/2026: 4 artistas, 26 obras. */
const REPARTO_REAL = { C: 9, A: 6, D: 6, L: 5 };

function construirBaraja(reparto) {
  const groups = new Map();
  Object.entries(reparto).forEach(([artista, n]) => {
    groups.set(
      artista,
      Array.from({ length: n }, (_, i) => `${artista}${i}`)
    );
  });
  return groups;
}

/** El artista al que pertenece un identificador sintético. */
const artistaDe = (id) => id.replace(/\d+$/, '');

function todosLosIds(reparto) {
  return Object.entries(reparto).flatMap(([artista, n]) =>
    Array.from({ length: n }, (_, i) => `${artista}${i}`)
  );
}

describe('interleaveByArtist', () => {
  describe('Corrección', () => {
    it('devuelve una permutación exacta de la entrada', () => {
      const baraja = construirBaraja(REPARTO_REAL);
      const esperados = todosLosIds(REPARTO_REAL).sort();

      for (let seed = 0; seed < 200; seed += 1) {
        const salida = interleaveByArtist(baraja, seed);
        expect(salida).toHaveLength(esperados.length);
        expect(new Set(salida).size).toBe(esperados.length);
        expect([...salida].sort()).toEqual(esperados);
      }
    });

    it('no muta la baraja recibida', () => {
      const baraja = construirBaraja(REPARTO_REAL);
      const antes = JSON.stringify([...baraja.entries()]);
      interleaveByArtist(baraja, 12345);
      expect(JSON.stringify([...baraja.entries()])).toBe(antes);
    });

    it('es determinista para la misma semilla', () => {
      const baraja = construirBaraja(REPARTO_REAL);
      [0, 1, 42, 999999, SEED_MAX].forEach((seed) => {
        expect(interleaveByArtist(baraja, seed)).toEqual(
          interleaveByArtist(baraja, seed)
        );
      });
    });

    it('produce órdenes distintos con semillas distintas', () => {
      const baraja = construirBaraja(REPARTO_REAL);
      const distintos = new Set();
      for (let seed = 0; seed < 50; seed += 1) {
        distintos.add(interleaveByArtist(baraja, seed).join('|'));
      }
      // 50 semillas sobre 26 obras: que salieran repetidos sería un defecto del
      // generador, no una casualidad.
      expect(distintos.size).toBe(50);
    });
  });

  describe('Entrelazado', () => {
    /**
     * Enunciado exacto: una repetición sólo es admisible cuando ya no queda
     * obra de ningún otro artista. Un round-robin lo cumple por construcción;
     * cualquier reescritura que no lo cumpla estaría agrupando de forma
     * evitable, que es el defecto que este cambio corrige.
     */
    const repartos = [
      { nombre: 'real (9/6/6/5)', reparto: REPARTO_REAL },
      { nombre: 'equilibrado (4/4/4)', reparto: { A: 4, B: 4, C: 4 } },
      { nombre: 'muy desigual (20/2/2)', reparto: { A: 20, B: 2, C: 2 } },
      { nombre: 'uno por artista (1/1/1/1/1)', reparto: { A: 1, B: 1, C: 1, D: 1, E: 1 } },
      { nombre: 'un solo artista (7)', reparto: { A: 7 } },
    ];

    it.each(repartos)(
      'con reparto $nombre, toda repetición es inevitable',
      ({ reparto }) => {
        const baraja = construirBaraja(reparto);

        for (let seed = 0; seed < 500; seed += 1) {
          const salida = interleaveByArtist(baraja, seed).map(artistaDe);
          for (let i = 1; i < salida.length; i += 1) {
            if (salida[i] !== salida[i - 1]) continue;
            const cola = new Set(salida.slice(i - 1));
            expect([...cola]).toEqual([salida[i]]);
            break;
          }
        }
      }
    );

    it('las k primeras posiciones son de k artistas distintos', () => {
      const baraja = construirBaraja(REPARTO_REAL);
      const k = Object.keys(REPARTO_REAL).length;

      for (let seed = 0; seed < 500; seed += 1) {
        const cabecera = interleaveByArtist(baraja, seed).slice(0, k).map(artistaDe);
        expect(new Set(cabecera).size).toBe(k);
      }
    });

    it('con el reparto real, las 23 primeras posiciones nunca repiten artista', () => {
      // 9 + 6 + 6 + 5: los tres artistas pequeños se agotan en la ronda 6, así
      // que la primera repetición posible está en la posición 23. Fija la
      // propiedad observable: las dos primeras páginas de 12 salen limpias.
      const baraja = construirBaraja(REPARTO_REAL);

      for (let seed = 0; seed < 1000; seed += 1) {
        const salida = interleaveByArtist(baraja, seed).map(artistaDe);
        for (let i = 1; i < 23; i += 1) {
          expect(salida[i]).not.toBe(salida[i - 1]);
        }
      }
    });
  });

  describe('Equidad de la primera posición', () => {
    it('reparte la primera posición por igual entre artistas, con independencia de cuántas obras tengan', () => {
      const baraja = construirBaraja(REPARTO_REAL);
      const artistas = Object.keys(REPARTO_REAL);
      const MUESTRAS = 8000;
      const conteo = Object.fromEntries(artistas.map((a) => [a, 0]));

      for (let seed = 0; seed < MUESTRAS; seed += 1) {
        conteo[artistaDe(interleaveByArtist(baraja, seed)[0])] += 1;
      }

      const esperado = MUESTRAS / artistas.length;
      artistas.forEach((artista) => {
        // Margen del 20 % sobre el valor esperado: holgado frente a la
        // fluctuación estadística (σ ≈ 39 sobre 2000) y estrecho frente al
        // sesgo que se quiere detectar — el voraz por tamaño daría 8000 y 0.
        expect(conteo[artista]).toBeGreaterThan(esperado * 0.8);
        expect(conteo[artista]).toBeLessThan(esperado * 1.2);
      });

      // Y en particular: el artista con 9 obras no sale primero más veces que
      // el que tiene 5.
      expect(Math.abs(conteo.C - conteo.L)).toBeLessThan(esperado * 0.25);
    });

    it('también baraja el orden interno de cada artista', () => {
      const baraja = construirBaraja(REPARTO_REAL);
      const primerasDeC = new Set();

      for (let seed = 0; seed < 200; seed += 1) {
        const primera = interleaveByArtist(baraja, seed).find((id) => artistaDe(id) === 'C');
        primerasDeC.add(primera);
      }

      // Las 9 obras de C deben poder encabezar su serie; si no, la primera
      // obra que subió cada artista tendría exposición garantizada para siempre.
      expect(primerasDeC.size).toBe(9);
    });
  });

  /**
   * Bandas verticales en la rejilla.
   *
   * El reparto por rondas con un orden de artistas FIJO produce una secuencia
   * periódica de periodo `m` (el tamaño de la ronda). Un grid de `c` columnas
   * pone en la misma columna las posiciones que distan `c`, de modo que con
   * `c === m` cada artista queda clavado en su columna, fila tras fila. Con 4
   * artistas y `lg:grid-cols-4` eso daba cuatro columnas monotemáticas, y como
   * la obra de cada artista tiene un estilo muy reconocible, el resultado era
   * visualmente peor que el agrupamiento que este cambio venía a corregir.
   *
   * `ProductGrid.js` pinta `grid-cols-2` y `lg:grid-cols-4`: son las dos
   * anchuras contra las que se comprueba.
   */
  describe('Sin bandas verticales en la rejilla', () => {
    const COLUMNAS_GRID = [2, 4];

    /** Artistas que ocupan cada columna, leyendo la secuencia por filas. */
    function porColumnas(secuencia, columnas) {
      const cols = Array.from({ length: columnas }, () => []);
      secuencia.forEach((artista, i) => cols[i % columnas].push(artista));
      return cols;
    }

    it('con tantas columnas como artistas no hay NINGÚN vecino vertical del mismo artista', () => {
      // Es la garantía exacta del desarreglo entre rondas, y sólo se puede
      // enunciar así cuando todas las rondas miden lo mismo (reparto parejo).
      const baraja = construirBaraja({ A: 5, B: 5, C: 5, D: 5 });

      for (let seed = 0; seed < 500; seed += 1) {
        const salida = interleaveByArtist(baraja, seed).map(artistaDe);
        for (let i = 4; i < salida.length; i += 1) {
          expect(salida[i]).not.toBe(salida[i - 4]);
        }
      }
    });

    it('con TRES artistas la restricción de columna se omite a propósito', () => {
      // Con tres participantes, «desarreglo respecto de la ronda anterior» más
      // «no empezar por el último de la anterior» tiene solución ÚNICA: la
      // rotación. Y una solución única devuelve la secuencia a ser periódica,
      // que es el defecto que la restricción existe para evitar — sólo que en
      // diagonal en lugar de en vertical. Además protegería la distancia 3, y
      // `ProductGrid` nunca pinta tres columnas. Se prefiere el azar.
      const baraja = construirBaraja({ A: 6, B: 6, C: 6 });
      const segundasRondas = new Set();

      for (let seed = 0; seed < 300; seed += 1) {
        segundasRondas.add(interleaveByArtist(baraja, seed).slice(3, 6).map(artistaDe).join(''));
      }

      // Con la restricción activada sólo habría UNA segunda ronda posible por
      // cada primera; sin ella, varias.
      expect(segundasRondas.size).toBeGreaterThan(3);
    });

    it.each([4, 5, 6, 8])(
      'con %i artistas parejos, distar el tamaño de la ronda nunca repite artista',
      (k) => {
        const reparto = Object.fromEntries(
          Array.from({ length: k }, (_, i) => [String.fromCharCode(65 + i), 4])
        );
        const baraja = construirBaraja(reparto);

        for (let seed = 0; seed < 200; seed += 1) {
          const salida = interleaveByArtist(baraja, seed).map(artistaDe);
          for (let i = k; i < salida.length; i += 1) {
            expect(salida[i]).not.toBe(salida[i - k]);
          }
        }
      }
    );

    it.each(COLUMNAS_GRID)(
      'con el reparto real y %i columnas, ninguna columna queda monopolizada por un artista',
      (columnas) => {
        const baraja = construirBaraja(REPARTO_REAL);

        for (let seed = 0; seed < 500; seed += 1) {
          const salida = interleaveByArtist(baraja, seed).map(artistaDe);
          // Se miran las primeras cinco filas: lo que un visitante ve de una
          // vez, y donde la banda resultaba evidente.
          porColumnas(salida.slice(0, columnas * 5), columnas).forEach((col) => {
            expect(new Set(col).size).toBeGreaterThan(1);
          });
        }
      }
    );

    it('con el reparto real y 4 columnas, los vecinos verticales iguales son residuales', () => {
      // No puede ser cero: las rondas dejan de medir 4 cuando los artistas se
      // van agotando y la alineación se rompe. Antes del cambio era del 100 %.
      const baraja = construirBaraja(REPARTO_REAL);
      let iguales = 0;
      let pares = 0;

      for (let seed = 0; seed < 2000; seed += 1) {
        const salida = interleaveByArtist(baraja, seed).map(artistaDe);
        for (let i = 4; i < salida.length; i += 1) {
          pares += 1;
          if (salida[i] === salida[i - 4]) iguales += 1;
        }
      }

      expect(iguales / pares).toBeLessThan(0.1);
    });

    it('la cabeza de cada ronda rota entre todos los artistas', () => {
      // Guarda contra la variante sobrerrestringida que se descartó: exigir a
      // la vez distancia 2 y distancia 4 con 4 artistas FUERZA el primer
      // elemento de cada ronda, y la primera columna acaba alternando siempre
      // entre los dos mismos artistas — una banda cambiada por otra.
      const baraja = construirBaraja({ A: 5, B: 5, C: 5, D: 5 });
      const enSegundaRonda = new Set();

      for (let seed = 0; seed < 500; seed += 1) {
        enSegundaRonda.add(artistaDe(interleaveByArtist(baraja, seed)[4]));
      }

      expect(enSegundaRonda.size).toBe(4);
    });

    it('la secuencia no es periódica: el orden de artistas cambia de una ronda a otra', () => {
      const baraja = construirBaraja({ A: 6, B: 6, C: 6, D: 6 });
      let rondasDistintas = 0;

      for (let seed = 0; seed < 200; seed += 1) {
        const salida = interleaveByArtist(baraja, seed).map(artistaDe);
        const r0 = salida.slice(0, 4).join('');
        const r1 = salida.slice(4, 8).join('');
        if (r0 !== r1) rondasDistintas += 1;
      }

      expect(rondasDistintas).toBe(200);
    });
  });

  describe('Casos límite', () => {
    it('baraja vacía', () => {
      expect(interleaveByArtist(new Map(), 7)).toEqual([]);
    });

    it('artista sin obras', () => {
      const baraja = new Map([['A', []], ['B', ['B0', 'B1']]]);
      expect(interleaveByArtist(baraja, 7).sort()).toEqual(['B0', 'B1']);
    });

    it('un solo producto', () => {
      expect(interleaveByArtist(new Map([['A', ['A0']]]), 7)).toEqual(['A0']);
    });
  });
});

/**
 * Escalabilidad: el algoritmo no está afinado para los cuatro artistas de hoy.
 *
 * Barre el espacio de repartos plausibles —de un artista a cincuenta, de obra
 * repartida a un artista que copa el catálogo— y comprueba en cada uno las
 * propiedades DURAS, que no dependen del reparto, y las BLANDAS allí donde son
 * matemáticamente alcanzables. Donde no lo son, el test lo dice y explica por
 * qué, en vez de callarse.
 */
describe('Escalabilidad del entrelazado', () => {
  const nombreArtista = (i) => `a${String(i).padStart(3, '0')}_`;
  const artistaDeGenerico = (id) => id.slice(0, id.indexOf('_') + 1);

  function repartoA(conteos) {
    const groups = new Map();
    conteos.forEach((n, i) => {
      groups.set(
        nombreArtista(i),
        Array.from({ length: n }, (_, j) => `${nombreArtista(i)}${j}`)
      );
    });
    return groups;
  }

  const ESCENARIOS = [
    { nombre: '1 artista, 12 obras', conteos: [12] },
    { nombre: '2 artistas parejos', conteos: [7, 7] },
    { nombre: '2 artistas desiguales', conteos: [15, 2] },
    { nombre: '3 artistas parejos', conteos: [6, 6, 6] },
    { nombre: '4 artistas (reparto real)', conteos: [9, 6, 6, 5] },
    { nombre: '5 artistas con cola', conteos: [20, 4, 3, 2, 1] },
    { nombre: '7 artistas parejos', conteos: [5, 5, 5, 5, 5, 5, 5] },
    { nombre: '10 artistas, obra dispar', conteos: [30, 18, 12, 9, 7, 5, 4, 3, 2, 1] },
    { nombre: '25 artistas con una obra cada uno', conteos: Array(25).fill(1) },
    { nombre: '50 artistas, 3 obras cada uno', conteos: Array(50).fill(3) },
    { nombre: 'un artista que copa el catálogo', conteos: [60, 2, 2, 1] },
  ];

  describe.each(ESCENARIOS)('$nombre', ({ conteos }) => {
    const groups = repartoA(conteos);
    const total = conteos.reduce((a, b) => a + b, 0);
    const k = conteos.length;

    it('devuelve siempre una permutación exacta del catálogo', () => {
      const esperados = [...groups.values()].flat().sort();
      for (let seed = 0; seed < 120; seed += 1) {
        const salida = interleaveByArtist(groups, seed);
        expect(salida).toHaveLength(total);
        expect([...salida].sort()).toEqual(esperados);
      }
    });

    it('toda repetición contigua es inevitable', () => {
      for (let seed = 0; seed < 120; seed += 1) {
        const salida = interleaveByArtist(groups, seed).map(artistaDeGenerico);
        for (let i = 1; i < salida.length; i += 1) {
          if (salida[i] !== salida[i - 1]) continue;
          expect([...new Set(salida.slice(i - 1))]).toEqual([salida[i]]);
          break;
        }
      }
    });

    it('los k primeros elementos son de k artistas distintos', () => {
      for (let seed = 0; seed < 120; seed += 1) {
        const cabecera = interleaveByArtist(groups, seed).slice(0, k).map(artistaDeGenerico);
        expect(new Set(cabecera).size).toBe(k);
      }
    });

    it('reparte la primera posición de forma uniforme entre artistas', () => {
      if (k < 2) return;
      const MUESTRAS = 300 * k;
      const conteo = new Map();
      for (let seed = 0; seed < MUESTRAS; seed += 1) {
        const primero = artistaDeGenerico(interleaveByArtist(groups, seed)[0]);
        conteo.set(primero, (conteo.get(primero) ?? 0) + 1);
      }

      // Todos los artistas encabezan alguna vez, ninguno acapara. Los márgenes
      // son holgados porque con k grande cada artista recibe pocas muestras.
      expect(conteo.size).toBe(k);
      const esperado = MUESTRAS / k;
      conteo.forEach((n) => {
        expect(n).toBeGreaterThan(esperado * 0.6);
        expect(n).toBeLessThan(esperado * 1.4);
      });
    });

    it.each([2, 4])('con %i columnas no produce más bandas que el azar puro', (columnas) => {
      // Con UN artista es trivialmente imposible evitar la banda, y con DOS lo
      // es también: la única secuencia sin contigüidad es la alternancia, que
      // fija la paridad de cada columna. No es una limitación del algoritmo
      // sino del reparto, y se documenta en `interleaveByArtist`.
      if (k < 3) return;

      // Sólo se mira la zona en la que aún quedan varios artistas por repartir.
      // A partir del momento en que sólo uno tiene obra, la columna la
      // monopoliza él porque no hay nada más que colocar; exigir lo contrario
      // sería exigir obra que no existe. Esa zona termina cuando se agota el
      // SEGUNDO artista más prolífico: hasta entonces cada ronda reparte al
      // menos dos.
      const [, segundo = 0] = [...conteos].sort((a, b) => b - a);
      const mezclado = conteos.reduce((suma, n) => suma + Math.min(n, segundo), 0);
      const filas = Math.min(5, Math.floor(mezclado / columnas));
      if (filas < 2) return;

      /** Fracción de columnas ocupadas por un solo artista. */
      function tasaDeBanda(secuencia) {
        let monopolizadas = 0;
        for (let col = 0; col < columnas; col += 1) {
          const celdas = [];
          for (let f = 0; f < filas; f += 1) celdas.push(secuencia[f * columnas + col]);
          if (new Set(celdas).size === 1) monopolizadas += 1;
        }
        return monopolizadas / columnas;
      }

      // El listón es el AZAR PURO sobre el mismo catálogo, no una constante
      // inventada: con pocos artistas una columna repetida es una coincidencia
      // esperable, y con muchos no lo es. Lo que este test niega es que el
      // algoritmo BANDEE MÁS que barajar sin ningún criterio — y lo hace
      // además sin las repeticiones horizontales que el azar sí produce.
      const plano = [...groups.values()].flat();
      let algoritmo = 0;
      let azar = 0;
      const MUESTRAS = 300;

      for (let seed = 0; seed < MUESTRAS; seed += 1) {
        algoritmo += tasaDeBanda(interleaveByArtist(groups, seed).map(artistaDeGenerico));
        azar += tasaDeBanda(
          shuffleInPlace(plano.slice(), mulberry32(seed + 900000)).map(artistaDeGenerico)
        );
      }

      expect(algoritmo / MUESTRAS).toBeLessThanOrEqual(azar / MUESTRAS + 0.05);
    });
  });

  it('con artistas parejos, distar el tamaño de la ronda nunca repite artista, sea cual sea k', () => {
    for (const k of [4, 5, 6, 9, 12, 20]) {
      const groups = repartoA(Array(k).fill(4));
      for (let seed = 0; seed < 60; seed += 1) {
        const salida = interleaveByArtist(groups, seed).map(artistaDeGenerico);
        for (let i = k; i < salida.length; i += 1) {
          expect(salida[i]).not.toBe(salida[i - k]);
        }
      }
    }
  });

  it('ordena un catálogo de 10.000 obras y 200 artistas en tiempo despreciable', () => {
    // El coste es lineal en el catálogo más un puñado de barajados por ronda.
    // Esta cota deja margen de sobra sin dejar de detectar una regresión a algo
    // cuadrático o a una búsqueda exhaustiva de permutaciones.
    const groups = repartoA(Array(200).fill(50));
    const inicio = Date.now();
    const salida = interleaveByArtist(groups, 4242);
    const ms = Date.now() - inicio;

    expect(salida).toHaveLength(10000);
    expect(new Set(salida).size).toBe(10000);
    expect(ms).toBeLessThan(500);
  });

  it('un catálogo grande y disparejo no degrada las invariantes', () => {
    // 120 artistas: uno con 300 obras y el resto con entre 1 y 12. Es la forma
    // que tendría la galería si un artista publicara mucho más que los demás.
    const conteos = [300, ...Array.from({ length: 119 }, (_, i) => (i % 12) + 1)];
    const groups = repartoA(conteos);
    const total = conteos.reduce((a, b) => a + b, 0);

    for (let seed = 0; seed < 20; seed += 1) {
      const salida = interleaveByArtist(groups, seed);
      expect(salida).toHaveLength(total);
      expect(new Set(salida).size).toBe(total);

      const artistas = salida.map(artistaDeGenerico);
      // La cabecera reparte: los 120 primeros son los 120 artistas.
      expect(new Set(artistas.slice(0, 120)).size).toBe(120);

      for (let i = 1; i < artistas.length; i += 1) {
        if (artistas[i] !== artistas[i - 1]) continue;
        expect([...new Set(artistas.slice(i - 1))]).toEqual([artistas[i]]);
        break;
      }
    }
  });
});

describe('parseSeed', () => {
  it.each([
    ['0', 0],
    ['1', 1],
    ['4294967295', SEED_MAX],
    [0, 0],
    [12345, 12345],
  ])('acepta %p', (entrada, esperado) => {
    expect(parseSeed(entrada)).toBe(esperado);
  });

  it.each([
    undefined,
    null,
    '',
    'abc',
    '-1',
    '1.5',
    '4294967296',
    '0x10',
    ' 12 ',
    ['1', '2'],
  ])('trata %p como ausente, sin lanzar', (entrada) => {
    expect(parseSeed(entrada)).toBeNull();
  });
});

describe('mulberry32', () => {
  it('produce la misma secuencia para la misma semilla', () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b());
  });

  it('produce valores en [0, 1)', () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 1000; i += 1) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffleInPlace reparte cada elemento por todas las posiciones', () => {
    // Un Fisher-Yates mal escrito (el error clásico: `rand() * n` en lugar de
    // `rand() * (i + 1)`) sigue produciendo permutaciones, pero sesgadas.
    const posiciones = [0, 0, 0, 0];
    for (let seed = 0; seed < 4000; seed += 1) {
      const arr = shuffleInPlace(['a', 'b', 'c', 'd'], mulberry32(seed));
      posiciones[arr.indexOf('a')] += 1;
    }
    posiciones.forEach((n) => {
      expect(n).toBeGreaterThan(1000 * 0.85);
      expect(n).toBeLessThan(1000 * 1.15);
    });
  });
});
