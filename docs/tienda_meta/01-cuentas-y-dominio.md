# 01 · Cuentas y dominio

**Para qué:** Commerce Manager solo deja crear la tienda si todo pertenece al mismo porfolio empresarial de Meta con control total. Eso incluye la página de Facebook, la cuenta de Instagram, el dominio y el conjunto de datos del píxel. Un acceso parcial es la causa más habitual de que la configuración se bloquee.

**Cuándo:** ahora. Esta guía no depende del código.

**Tiempo:** 30–60 minutos, más lo que tarde en aceptar la otra cuenta si la página está en ella.

## Paso 1 · Cuenta de Instagram profesional

1. En la app de Instagram, abre el perfil de 140d → **☰ → Configuración y actividad → Tipo de cuenta y herramientas**.
2. Debe ser una cuenta **profesional de empresa** (no de creador) y **pública**.
3. En el mismo menú, comprueba que está **conectada a la página de Facebook** de la galería.

## Paso 2 · Ordenar el porfolio empresarial

En https://business.facebook.com/settings (Configuración del negocio), con el porfolio de 140d seleccionado, revisa la sección **Cuentas**:

| Activo | Dónde | Qué comprobar |
|---|---|---|
| Página de Facebook | Cuentas → Páginas | Que aparece **como propiedad del porfolio**, no como «acceso compartido» |
| Cuenta de Instagram | Cuentas → Cuentas de Instagram | Que está añadida y vinculada a esa página |
| Cuenta publicitaria | Cuentas → Cuentas publicitarias | Que existe, aunque todavía no hagas anuncios |
| Conjunto de datos del píxel | Orígenes de datos → Conjuntos de datos | Que está el `1057434273433077` (140d.art) |

**La página de Facebook está hoy en otra cuenta personal.** Para pasarla al porfolio:

1. La persona que administra esa página tiene que ser también administradora del porfolio. Invítala en **Usuarios → Personas → Añadir** y asígnale control total del porfolio.
2. Esa persona, desde su sesión: **Cuentas → Páginas → Añadir → Añadir una página** e introduce el nombre o la URL de la página. Esto la pasa a propiedad del porfolio.
3. Si una página ya pertenece a otro porfolio, Meta no deja «añadirla», solo «solicitar acceso». Ese acceso es parcial, y no sirve: primero hay que retirarla del otro porfolio.
4. Asígnate a ti mismo **control total** de la página y de la cuenta de Instagram, en **Personas → (tu nombre) → Asignar activos**.

**Activa la verificación en dos pasos** en tu cuenta personal de Facebook. Meta la exige a los administradores de un porfolio con funciones de comercio.

## Paso 3 · Comprobar el dominio 140d.art

1. **Configuración del negocio → Seguridad de marca → Dominios.**
2. Si aparece `140d.art` con estado **Verificado**, no hay nada más que hacer.
3. Si no aparece, o aparece sin verificar:
   1. **Añadir → `140d.art`** y elige el método **Registro TXT de DNS**. Meta te da un valor `facebook-domain-verification=…`.
   2. En **GoDaddy → Mis productos → 140d.art → DNS → Añadir registro**, crea un registro **TXT**, con nombre `@` y el valor de Meta.
   3. **No borres ningún TXT que ya exista.** Ya hay uno `facebook-domain-verification` (puede ser de un intento anterior o de otro porfolio), uno `google-site-verification` del que depende Search Console y Merchant Center, y uno `pinterest-site-verification`. Si el `facebook-domain-verification` que hay no coincide con el que pide Meta, añade el nuevo **al lado**.
   4. Vuelve a Meta y pulsa **Verificar dominio**. El DNS puede tardar desde unos minutos hasta unas horas.

Meta exige que **las fichas de producto y la URL de compra estén en ese único dominio**. Las dos lo están: `https://140d.art/galeria/p/…`, `https://140d.art/tienda/p/…` y `https://140d.art/cesta`.

## Paso 4 · Comprobar que el píxel recibe eventos

El píxel y la API de conversiones ya están en producción. Solo se activan cuando el visitante acepta las cookies publicitarias.

1. Abre https://business.facebook.com/events_manager → conjunto de datos `1057434273433077` → **Resumen**.
2. En los últimos 7 días deben aparecer `PageView`, `ViewContent` y `AddToCart`, y `Purchase` si hubo ventas, con origen **Navegador** y **Servidor**.
3. Si no aparece nada, abre https://140d.art en una ventana de incógnito, acepta todas las cookies y navega por una obra. El evento debe aparecer en **Probar eventos** en unos segundos.

> En la consola del navegador pueden verse errores de CSP hacia dominios `*.on.aws` o `*.run.app`. Son de una configuración huérfana que el conjunto de datos tiene del lado de Meta, y no afectan a la medición. **No amplíes la CSP para quitarlos.**

## Paso 5 · «Presencia establecida»

Meta rechaza las cuentas recientes o con poca actividad. Antes de enviar la tienda a revisión (guía 04):

- publica con regularidad en el feed de Instagram durante unas semanas;
- mantén la cuenta pública, con la biografía completa y el enlace a `https://140d.art`;
- evita infracciones de las normas comunitarias.

## Lista de comprobación

- [ ] Instagram profesional de empresa, pública y conectada a la página
- [ ] Página de Facebook como **propiedad** del porfolio, con control total para ti
- [ ] Cuenta de Instagram, cuenta publicitaria y conjunto de datos dentro del porfolio
- [ ] Verificación en dos pasos activa
- [ ] `140d.art` **verificado** en Seguridad de marca → Dominios
- [ ] Eventos del píxel visibles en el Administrador de eventos

Siguiente: [02 · El feed de Meta](02-feed-de-meta.md).
