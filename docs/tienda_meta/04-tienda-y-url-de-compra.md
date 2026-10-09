# 04 · Tienda y URL de compra

**Para qué:** la tienda es el escaparate público en Instagram (botón «Ver tienda» del perfil) y en Facebook, construido sobre el catálogo. Desde septiembre de 2025 toda compra termina en la web del vendedor, y **una tienda sin URL de compra no se muestra**.

**Cuándo:** con el catálogo cargado y sin errores (guía 03), con la guía 01 completa y con el código desplegado (la página `/cesta` tiene que existir).

**Tiempo:** 30 minutos de configuración. Después, la revisión de Meta, que puede ir de unos días a varias semanas.

## Cómo funciona la URL de compra

Cuando alguien toca «Comprar en el sitio web» en Instagram, Meta lo envía a la URL configurada con los productos elegidos:

```
https://140d.art/cesta?products=art_57%3A1%2Cother_4_v12%3A2&utm_source=IGShopping&utm_medium=Social&cart_origin=instagram
```

`%3A` es `:` y `%2C` es `,`. Es decir, la obra 57 (una unidad) y la variante 12 del producto 4 (dos unidades). La página `/cesta`:

1. Muestra los productos con foto, artista, cantidad, precio y subtotal.
2. **Sustituye la cesta** del comprador por esos productos, como pide Meta. Si ninguno está disponible, no la toca.
3. **Pide elegir el envío de cada obra**, con la misma ventana que la ficha. Si hay dos obras del mismo artista, la segunda reutiliza el envío de la primera. Los productos de la tienda calculan el envío en el paso siguiente.
4. Avisa de lo que ya no está disponible, por ejemplo una obra vendida en la última hora.
5. Con **Continuar con la compra** abre el cajón de compra de siempre, que admite pago sin registrarse y con Apple Pay o Google Pay.

El parámetro `coupon` se ignora: la web no tiene códigos de descuento. **No crees ofertas ni cupones en Commerce Manager.**

## Paso 1 · Probarla tú antes que Meta

1. Abre el feed `https://api.140d.art/api/feeds/meta-catalog.xml` y copia dos `<g:id>`: una obra (`art_…`) y, si hay, una variante de la tienda (`other_…_v…`).
2. Abre en el móvil `https://140d.art/cesta?products=<id_obra>%3A1%2C<id_tienda>%3A1`.
3. Comprueba esto:
   - [ ] Se ven los dos productos, con precio y subtotal
   - [ ] La obra pide «Elegir envío» y, al elegirlo, se añade a la cesta
   - [ ] **Continuar con la compra** abre el cajón con los dos productos
   - [ ] Puedes llegar al paso de pago sin iniciar sesión (no hace falta pagar)
   - [ ] Al recargar la página, la cesta no duplica nada
4. Prueba con un id que no exista, como `art_999999%3A1`: debe decir que no hay productos disponibles y no tocar la cesta.

## Paso 2 · Crear la tienda

1. En https://business.facebook.com/commerce → **Crear tienda** (o **Añadir tienda**).
2. Método de compra: **en tu sitio web** (es el único que existe hoy).
3. Canales de venta: la **cuenta de Instagram** de 140d y la **página de Facebook**. Ambos tienen que ser activos del porfolio con control total (guía 01).
4. Catálogo: `140d · Catálogo`.
5. Revisa los datos de la empresa y acepta el **Acuerdo para comerciantes**.
6. Si el asistente pide datos de atención al cliente o de devoluciones, usa estos:
   - **Correo de atención al cliente:** el de contacto de la galería.
   - **Política de devoluciones:** la página de la web que la explica (términos y condiciones o preguntas frecuentes).
   - **Envío:** si exige un perfil de envío, pon los plazos reales (3–5 días hábiles de preparación más el tránsito). **No pongas un precio de envío que no coincida con el que cobra la web.** Si lo exige y no hay forma de indicar «se calcula al pagar», consúltalo antes de inventar una cifra.

## Paso 3 · Configurar la URL de compra

1. **Commerce Manager → Configuración → General** (o **Configuración de la tienda → Detalles de la tienda**) → **URL de compra → Editar**.
2. URL: `https://140d.art/cesta`.
3. Marca **«Mi URL admite parámetros de producto y cupón (opcional)»**.
4. **Probar** (o **Validar**). Meta abre la URL con productos reales del catálogo. Comprueba que se ven los productos con precio y subtotal, como en el paso 1.
5. **Guardar.**

## Paso 4 · Vista previa

Antes de que la vea nadie, deja la tienda en **vista previa** u **oculta** (Configuración → General → Visibilidad de la tienda). Así solo la ven los administradores.

1. En la app de Instagram, con la cuenta de 140d, abre el perfil: debe aparecer **Ver tienda**.
2. Entra en una obra de la tienda → **Ver en el sitio web** (o **Comprar en el sitio web**). Debe abrir `140d.art/cesta` con esa obra.
3. Haz el recorrido completo hasta el paso de pago.

## Paso 5 · Enviar a revisión

1. Commerce Manager muestra una lista **«Configura tu tienda»**. Completa lo que falte y pulsa **Enviar para revisión**.
2. Meta revisa la cuenta, el dominio y los productos. **Puede tardar de unos días a varias semanas.** El estado está en Commerce Manager → **Resumen** o **Estado de la cuenta**.
3. Si la rechazan, el aviso dice el motivo. Los más habituales son estos:

   | Motivo | Qué hacer |
   |---|---|
   | Presencia insuficiente o cuenta nueva | Seguir publicando unas semanas y volver a solicitar (guía 01, paso 5) |
   | Dominio no verificado o enlaces a otro dominio | Guía 01, paso 3 |
   | Activos sin control total | Guía 01, paso 2 |
   | Productos que incumplen las políticas | Guía 06, «Obra rechazada» |

   Cada rechazo ofrece **Solicitar otra revisión**.

## Paso 6 · Publicar y activar las compras en Instagram

Con la tienda aprobada:

1. Commerce Manager → Configuración → Visibilidad: **Publicar** (o **Mostrar tienda**).
2. En la app de Instagram: **Configuración → Herramientas para empresas (o Herramientas para creadores y empresas) → Compras en Instagram**. Selecciona el catálogo `140d · Catálogo`. Esta opción solo aparece tras la aprobación.
3. Comprueba en el perfil, desde otra cuenta, que se ve **Ver tienda**.

## Lista de comprobación

- [ ] `/cesta` probada en el móvil con obra y tienda
- [ ] Tienda creada, con Instagram y Facebook como canales y el catálogo `140d · Catálogo`
- [ ] URL de compra `https://140d.art/cesta`, con parámetros de producto y cupón marcados, validada
- [ ] Recorrido completo probado en vista previa
- [ ] Enviada a revisión → aprobada
- [ ] Publicada, y **Compras en Instagram** activo en la app

Siguiente: [05 · Etiquetar y promocionar](05-etiquetar-y-promocionar.md).
