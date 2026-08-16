# page-render-caching Specification

## Purpose
Régimen de caché de render (ISR) de las páginas públicas de detalle. El cuello de botella medido en producción está en el renderizado de Next.js, no en la API ni en Turso, y la ruta de más tráfico —la ficha de obra— se estaba sirviendo dinámica y con `no-store`. Este spec fija qué rutas se cachean, qué hace falta para que realmente lo hagan, y qué rutas deben seguir sin cachearse nunca.

## Requirements

### Requirement: Las páginas públicas de detalle se sirven desde caché de render
Las rutas públicas de detalle de producto y de autor SHALL renderizarse mediante ISR y no en cada petición. Afecta a `client/app/galeria/p/[id]`, `client/app/galeria/autor/[authorSlug]`, `client/app/tienda/p/[id]` y `client/app/tienda/autor/[authorSlug]`.

#### Scenario: Segunda visita a la misma ficha dentro de la ventana de revalidación
- **WHEN** se pide dos veces la misma ficha de obra en menos de 300 segundos
- **THEN** la primera respuesta lleva `x-nextjs-cache: MISS` y la segunda `x-nextjs-cache: HIT`
- **THEN** ambas llevan `Cache-Control: s-maxage=300`
- **THEN** ninguna lleva `no-store` ni `must-revalidate`

#### Scenario: La ruta figura como cacheada en la compilación
- **WHEN** se ejecuta `next build`
- **THEN** las cuatro rutas aparecen en la tabla de rutas marcadas como cacheadas (`●`) y no como dinámicas (`ƒ`)

### Requirement: `revalidate` va acompañado de `generateStaticParams`
Toda ruta de segmento dinámico que declare `revalidate` SHALL exportar además `generateStaticParams`. `revalidate` por sí solo no saca a la ruta del renderizado dinámico.

#### Scenario: Sólo se declara revalidate
- **WHEN** una ruta `[param]` exporta `revalidate` pero no `generateStaticParams`
- **THEN** `next build` la marca `ƒ (Dynamic)` y la respuesta sale con `no-store`
- **THEN** la ruta NO cumple este requisito

### Requirement: No se prerenderiza contra la API en tiempo de compilación
`generateStaticParams` SHALL devolver una lista vacía en estas rutas, sin consultar la API.

#### Scenario: La API no responde durante la compilación
- **WHEN** se ejecuta `docker build` y la API no está disponible
- **THEN** la compilación termina correctamente
- **THEN** las páginas se generan bajo demanda en la primera visita

### Requirement: Las páginas privadas siguen sin cachearse
Las rutas de administración, pedidos y panel de vendedor SHALL seguir marcándose como no cacheables.

#### Scenario: Petición a una ruta privada
- **WHEN** se pide una ruta bajo `/admin`, `/orders` o `/seller`
- **THEN** la respuesta lleva `Cache-Control` con `private` y `no-store`
