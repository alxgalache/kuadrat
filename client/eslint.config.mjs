// Configuración de ESLint del cliente.
//
// Deliberadamente MÍNIMA: una sola regla. No extiende `next/core-web-vitals`
// ni ningún preset general.
//
// El motivo es que un preset sobre un código que nunca ha pasado por un linter
// escupe cientos de avisos preexistentes de golpe. Nadie los arregla, se
// normaliza ver la salida en rojo, y la primera regla que sí importaba queda
// enterrada entre el ruido. Un linter que siempre falla no impide nada.
//
// Añadir aquí un preset es una decisión aparte, que exige presupuesto para
// limpiar lo que saque. Lo que hay ahora sólo prohíbe UNA cosa, y esa
// prohibición se sostiene sola.

import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'out/**'],
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Los dos plugins se REGISTRAN pero no se activa ni una de sus reglas.
    // El código ya lleva `eslint-disable` de `react-hooks/exhaustive-deps` y
    // `@next/next/no-img-element` escritos cuando existía `next lint`, y ESLint
    // 9 da error ante un `eslint-disable` que nombra una regla desconocida.
    // Registrarlos hace que esos comentarios sigan siendo válidos sin encender
    // nada; borrarlos habría sido tirar información que vuelve a servir el día
    // que se adopte un preset.
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    // Corolario de lo anterior: con las reglas registradas pero apagadas, cada
    // uno de esos `eslint-disable` queda «sin usar» y ESLint avisa. Serían diez
    // avisos permanentes que no describen ningún defecto — el ruido que esta
    // configuración existe para no tener. Se apaga el aviso, no el comentario.
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // `dompurify` a secas exporta en Node una FACTORÍA que necesita una
      // ventana: `DOMPurify.sanitize` no existe fuera del navegador. Y
      // `'use client'` no protege, porque el primer render de un componente
      // cliente ocurre también en el servidor.
      //
      // Eso fue un 500 en `/coa` en producción: un certificado de autenticidad
      // que no se podía verificar con el móvil delante del comprador. El
      // import equivocado se construye sin una queja y se ejecuta bien en el
      // navegador; sólo se cae en el servidor, y sólo cuando la obra tiene
      // descripción. Por eso hace falta una regla y no un comentario.
      //
      // La prohibición NO se apoya en que el paquete no esté instalado: npm
      // aplana el árbol e `isomorphic-dompurify` lo arrastra como dependencia
      // transitiva, así que `node_modules/dompurify` existe y el import
      // resolvería perfectamente. Esta regla es lo único que lo impide.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'dompurify',
              message:
                'Usa isomorphic-dompurify: dompurify no expone sanitize() en el servidor y revienta el SSR. Ver client/components/SafeHTML.js.',
            },
          ],
        },
      ],
    },
  },
]
