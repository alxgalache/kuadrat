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

El recorrido real, tal como lo muestra Commerce Manager en octubre de 2026:

1. En https://business.facebook.com/commerce, con el porfolio **140d Galería de arte** seleccionado arriba a la izquierda → **Activos** → **Cuentas comerciales → Añadir cuenta**. «Cuenta comercial» es el nombre actual de la tienda. No hay botón «Crear tienda».
2. **Empezar**, en el bloque «Crea una tienda para compartir tu catálogo con los clientes». Mercado primario: **España**.
3. «Configura tu tienda con una plataforma de socios»: **No uso estas plataformas** → Siguiente.
4. «¿Desde dónde quieres vender?» → **Elegir canales de venta**: marca la **página de Facebook** de 140d y la **cuenta de Instagram** que tiene vinculada.
5. **Seleccionar catálogo**: el que lee el feed de la API (guía 03).
6. **Vista previa** → revisa los datos de la empresa y acepta el **Acuerdo para comerciantes**.

> **Si en el punto 4 solo aparece «Crear página», no crees ninguna página.** Una página nueva sería una segunda «140d» sin seguidores ni historial, y Meta revisa la presencia de la cuenta. Que la página no aparezca significa que Commerce Manager no la considera tuya. Comprueba esto en https://business.facebook.com/settings, con el mismo porfolio:
>
> - **Cuentas → Páginas → la página de 140d:** debe decir que es **propiedad** del porfolio 140d Galería de arte. Si figura como compartida por otro porfolio o como «socio», el acceso es parcial y no sirve: el porfolio que la posee tiene que retirarla para que el de 140d la añada como propia (guía 01, paso 2).
> - **Esa misma página → Personas:** **tu usuario**, con el que has iniciado sesión en Commerce Manager, tiene que tener **control total**. Que esté la otra cuenta personal que la gestiona no basta. Si no estás, **Asignar personas** → tú → control total.
> - **Usuarios → Personas → tu usuario:** control total del porfolio.
> - **En la propia página de Facebook:** publicada, sin restricción de edad ni de países.
>
> Después cierra Commerce Manager, vuelve a entrar y repite desde **Añadir cuenta**. La página debería aparecer, con su Instagram vinculado.
>
> **Caso real (09/10/2026):** en «Personas» de la página aparecía «140d Galería de Arte **(You)**» con **icono de Instagram** y **acceso parcial**. Era la sesión iniciada **con la cuenta de Instagram**, no con Facebook. La solución es entrar en Commerce Manager **con el perfil de Facebook** que tiene acceso total (Alejandro Galache). Ese mismo perfil necesita además control total sobre el **catálogo** (Orígenes de datos → Catálogos → Personas) y sobre el **perfil de Instagram** (Cuentas → Perfiles de Instagram → Personas), o no aparecerán en el asistente.
6. Si el asistente pide datos de atención al cliente o de devoluciones, usa estos:
   - **Correo de atención al cliente:** el de contacto de la galería.
   - **Política de devoluciones:** la página de la web que la explica (términos y condiciones o preguntas frecuentes).
   - **Envío:** si exige un perfil de envío, pon los plazos reales (3–5 días hábiles de preparación más el tránsito). **No pongas un precio de envío que no coincida con el que cobra la web.** Si lo exige y no hay forma de indicar «se calcula al pagar», consúltalo antes de inventar una cifra.

## Paso 3 · Configurar la URL de compra

En la versión de octubre de 2026 no hay ningún campo llamado «URL de compra». Está dentro de **Detalles de la tienda**, con el nombre **Pago**, que mientras no se configura dice «No configurado».

1. **Commerce Manager → Configurar → General → Detalles de la tienda → Editar** → **Pago → Editar**. También puede llamarse «Finalizar compra» o «URL de pago».
2. Pago **en tu sitio web**. URL: `https://140d.art/cesta`.
3. Marca **«Mi URL admite parámetros de producto y cupón (opcional)»**.
4. **Probar** (o **Validar**). Meta abre la URL con productos reales del catálogo. Comprueba que se ven los productos con precio y subtotal, como en el paso 1.
5. **Guardar.**

En esa misma pantalla de **Configurar → General** revisa también:

- **Envíos y devoluciones → Devoluciones:** **14 días** naturales desde la recepción, con los gastos de devolución a cargo del comprador. Es lo que dicen los términos y condiciones (punto 13). El valor por defecto, «Sin periodo de devolución», es falso y Meta lo enseña al comprador.
- **Promoción de ofertas:** desactiva «Ofertas detectadas», «Eventos de ofertas» y «Nombres de eventos de temporada». 140d no tiene ofertas ni cupones, y así Meta no anuncia descuentos que no existen.
- **Canales de venta:** es normal que la página y el Instagram salgan «Oculto» mientras Meta revisa los productos recién conectados («no hay productos visibles aprobados»). Puede tardar de horas a un par de días. Revisa después **Catálogo → Artículos** y **Problemas**.

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

1. **Commerce Manager → Configurar → General → Canales de venta:** el desplegable de la página de Facebook y del perfil de Instagram en **«Visible»**, no «Oculto».
2. **Espera de 24 a 48 horas.** Que Commerce Manager muestre la tienda «aprobada y activa» no significa que las apps ya lo sepan. La activación en Instagram y Facebook se propaga después, y a veces tarda algún día más.
3. **Comprueba que funciona sin publicar nada:**
   - **Etiquetas:** en Instagram, empieza una publicación y llega a la última pantalla. Si aparece **«Etiquetar productos»** y al buscar salen las obras, Instagram Shopping está activo. Descarta la publicación.
   - **Sticker:** en una historia, el sticker **«Producto»** debe encontrar las obras.
   - **«Ver tienda»:** mira el perfil de 140d **desde otra cuenta**. Con la sesión de la propia cuenta de la tienda, a veces no se ve el botón aunque exista.
4. **El menú «Compras» de los ajustes de Instagram puede no existir.** Antes servía para elegir el catálogo. Con la tienda creada desde Commerce Manager, el catálogo ya está asignado, y en las versiones recientes de la app el menú no aparece o cambia de nombre. Si las etiquetas funcionan, no hace falta.
5. **Si a los 2–3 días las etiquetas siguen sin aparecer:** cierra y abre la sesión de Instagram y actualiza la app. Comprueba en **Catálogo → Artículos** que hay productos aprobados, no solo «en revisión». Si sigue igual, contacta con el soporte de Meta para empresas desde la Ayuda de Commerce Manager.

## Lista de comprobación

- [ ] `/cesta` probada en el móvil con obra y tienda
- [ ] Tienda creada, con Instagram y Facebook como canales y el catálogo de la guía 03 (en la cuenta de 140d se llama «140d»)
- [ ] URL de compra `https://140d.art/cesta`, con parámetros de producto y cupón marcados, validada
- [ ] Recorrido completo probado en vista previa
- [ ] Enviada a revisión → aprobada
- [ ] Canales «Visible» y, tras 24–48 h, **«Etiquetar productos»** disponible en Instagram

Siguiente: [05 · Etiquetar y promocionar](05-etiquetar-y-promocionar.md).
