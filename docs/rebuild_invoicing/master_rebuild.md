# gemini-conversation
Exported on: 11/4/2026, 17:39:32

---

**You:**
Tengo una duda con el modelo de negocio de una galería de arte online que estoy desarrollando. El modelo es: yo vendo una obra de un artista a un comprador. Yo como empresa hago y remito la factura con IVA (10% en REBU) al comprador final. De cada venta yo me quedo con una comisión del 25%.  Después, realizo el ingreso al artista del 75% restante, y el artista genera y me emite una factura para la comisión que yo me he quedado, aplicando también el IVA del 10%.  Este sistema me ha ayudado a plantearlo Claude. Pero hay algo que no me cuadra, porque no veo donde estaría la ganancia para mí.  Te pongo un ejemplo:   - pongo una obra a 1000 euros  - se compra y remito la factura  - de esos 1000 euros, yo me quedo con mi comisión (250) y otros 100 corresponderían al IVA del 10%  - hago la transferencia de 750 al artista, y el artista me emite una factura por el importe de la comisión que me quedo, incluido el IVA     
 Por favor, analiza la propuesta, dime si tendría sentido en un contexto de relación comercial donde yo fuera intermediario o comisionista, y dime qué es lo que no cuadra y como lo solucionarias o que ajustes harías

**Gemini:**
Es completamente normal que los números no te cuadren, porque **el modelo que te ha planteado Claude tiene un error de concepto fundamental**. De hecho, está planteado al revés en la parte de la facturación de la comisión, y además tiene algunas imprecisiones legales sobre cómo funciona el IVA y el REBU en España.

Vamos a desenredar esto para que tu negocio tenga sentido, sea legal y, lo más importante, sepas exactamente dónde está tu ganancia.

### ¿Qué es lo que NO cuadra en ese modelo?

1. **El "cruce" de facturas:** El artista no puede emitirte una factura a ti por una comisión que *tú* te estás quedando. La comisión es el pago por el servicio que tú le prestas al artista (vender su obra). Por tanto, si se factura una comisión, **eres tú quien debe emitir la factura al artista**, no al revés.
2. **El error del REBU y el 10%:** En el Régimen Especial de Bienes Usados (REBU), **el IVA nunca se desglosa en la factura** que se le entrega al comprador. La factura va por el total (ej. 1000€). Además, el IVA que pagas a Hacienda en el REBU se calcula sobre tu margen de beneficio, y en España el tipo que se aplica a ese margen es el general (**21%**), no el 10%.
3. **El IVA de la comisión:** Los servicios de intermediación comercial (cobrar una comisión por vender) tributan al **21% de IVA**, no al 10%. El 10% aplica a la venta de la obra por parte del propio creador (el artista).

---

### Cómo solucionarlo: Los 2 modelos reales

Para que tú puedas hacer la factura al comprador final (como me has indicado que quieres hacer), la ley española de IVA entiende que actúas como **Comisionista en nombre propio**. A efectos fiscales, es como si le compraras la obra al artista y se la revendieras al cliente en el mismo instante.

Aquí tienes cómo quedaría el modelo ajustado y 100% legal, usando tu ejemplo de los 1000€ y tu comisión del 25% (250€):

#### El Modelo Correcto (Comisionista en nombre propio con REBU)

En este modelo tú no facturas una "comisión" como tal, sino que tienes un **margen de beneficio** por compraventa.

**Paso 1: La venta al cliente**

* Tú emites la factura al comprador final por **1000€**.
* En esta factura **NO se desglosa el IVA**. Solo debe poner el precio total y una mención legal que diga: *"Régimen especial de los bienes usados, objetos de arte, antigüedades y objetos de colección"*.
* El comprador te paga a ti los 1000€.

**Paso 2: El pago al artista**

* El artista te emite una factura a ti por su parte (el 75% de la venta).
* Total a pagar al artista: **750€**.
* *Nota interna:* Como el artista es el creador, su factura llevará el 10% de IVA incluido en esos 750€ (es decir, la base imponible del artista son 681,82€ + 68,18€ de IVA = 750€).

**Paso 3: Tu ganancia y tus impuestos (El cálculo del REBU)**
Aquí es donde ves tu dinero. Tu margen bruto es la diferencia entre lo que cobraste (1000€) y lo que le pagaste al artista (750€).

* **Tu Margen Bruto:** 250€
* En el REBU, el IVA se paga a Hacienda solo sobre este margen, y se considera que el IVA (21%) ya está dentro de esos 250€.
* Para saber tu beneficio real neto, le sacamos el 21% a esos 250€ (250 / 1,21):

* **Tu beneficio real limpio:** 206,61€
* **IVA a ingresar a Hacienda (Modelo 303):** 43,39€

### Resumen de por qué ahora sí cuadra

* Tú controlas al cliente y la facturación.
* El artista cobra sus 750€ netos en banco.
* Tú te quedas con 250€ en el banco (de los cuales 206,61€ son tu ganancia real y 43,39€ son el IVA que le darás a Hacienda a final del trimestre).
* Todo es legal y no hay facturas de comisiones emitidas al revés.

¿Te gustaría que profundicemos en cómo debe ser exactamente la redacción de la factura que le tienes que pedir al artista en este modelo para evitar problemas con Hacienda?

---

**You:**
Perfecto. Vamos a ampliar la información con dos puntos más:    
 - En la web de la galería de arte online también voy a vender productos normales que no aplican dentro de las condiciones del rebu (láminas, objetos de decoración, etc) y a ofrecer servicios multimedia como charlas en directo vía stream o videollamada, que podrán ser de pago. Para estos productos o servicios, la comisión que me quedaría yo sería del 10%.    
 - Quiero que analicemos juntos si se podría dar el caso de que hubiera artistas adheridos a la galería de arte online que fueran personas físicas o particulares, en lugar de autónomos. En ese caso, la opción que me dió claude fue un modelo de autofacturación que permitiría este punto simpre que fuera algo puntual y que fuera un importe total anual menor que el salario mínimo interprofesional anual.    
 ¿Puedes analizar estos puntos y desarrollar una guía o esquema similar al que has desarrollado en el  mensaje anterior para estos casos? En él debes analizar la viabilidad de los puntos que te planteo y extender la explicación y la lógica relativa a estos casos.    
 Puedes preguntarme si te surge cualquier duda o consulta sobre el tema

**Gemini:**
Me alegra que estemos profundizando en esto, porque añadir diferentes tipos de productos y perfiles de artistas hace que la galería sea más completa, pero también añade capas legales que debes tener muy claras.

Te adelanto algo importante: **Claude te ha dado un consejo bastante peligroso en el segundo punto (el de los artistas particulares).** Ha mezclado las normas de la Seguridad Social con las de Hacienda, y eso es uno de los errores más comunes y arriesgados en el emprendimiento en España.

Vamos a desglosar ambos escenarios paso a paso para que tengas tu modelo de negocio blindado.

---

### Escenario 1: Productos "normales" y Servicios (Régimen General de IVA)

Como bien dices, las láminas, tazas, merchandising o servicios digitales (como charlas de pago) **no entran en el REBU**. Van por el Régimen General de IVA.

Si sigues actuando como "intermediario que cobra al cliente final y luego paga al creador", a ojos de Hacienda sigues siendo un **Comisionista en nombre propio**. La diferencia es que ahora el IVA sí se desglosa en todas partes.

**Ejemplo con una venta de 100€ (Base Imponible) y tu comisión del 10%:**

**Paso 1: La venta al cliente**

* Tú vendes la lámina por 100€ + 21% IVA.
* Tú emites la factura al comprador final por **121€** (desglosando: Base 100€ + IVA 21€).
* El cliente te paga 121€.

**Paso 2: El pago al creador**

* Tú te quedas tu 10% sobre la base imponible (10€).
* Por tanto, "le compras" el producto al creador por 90€ (Base).
* El creador te emite una factura a ti por **108,90€** (desglosando: Base 90€ + IVA 21% de 18,90€).
* Tú le transfieres 108,90€ al creador.

**Paso 3: Tu ganancia y tus impuestos**

* Tú cobraste 121€ en total. Pagaste 108,90€ al creador. Te quedan **12,10€** en el banco.
* Liquidación de IVA con Hacienda:

* IVA que tú cobraste al cliente (Repercutido): +21,00€
* IVA que tú pagaste al creador (Soportado): -18,90€
* **IVA a pagar a Hacienda:** 2,10€
* **Tu beneficio real limpio:** 12,10€ (en el banco) - 2,10€ (para Hacienda) = **10,00€** (Exactamente tu 10% de comisión).

*Aquí las cuentas cuadran a la perfección y de forma transparente.*

---

### Escenario 2: Artistas "Particulares" y el Mito del SMI

Aquí es donde debemos corregir la información que te dio Claude. Existe una enorme confusión en España entre **darse de alta en la Seguridad Social (pagar la cuota de autónomos)** y **darse de alta en Hacienda (para poder facturar)**.

1. **La regla del SMI (Salario Mínimo) NO aplica a Hacienda:** Es cierto que la Seguridad Social a veces hace la "vista gorda" y no te obliga a pagar la cuota mensual de autónomo si tu actividad no es "habitual" y ganas menos del SMI. **Pero Hacienda no funciona así.** Para Hacienda, si vendes algo con intención de lucro de forma recurrente (como tener obras en una galería online), estás realizando una Actividad Económica.
2. **Para emitir una factura, HAY que estar en Hacienda:** Da igual si el artista vende 50€ al año. Para poder emitirte la factura que tú necesitas (como vimos en el Paso 2 de ambos modelos), el artista **debe** estar dado de alta en el Censo de Empresarios de Hacienda (Modelo 036 o 037). Darse de alta en Hacienda es gratis, pero les obliga a presentar el IVA trimestral y el IRPF.
3. **El problema de la "Autofacturación":** La autofacturación no es un salvoconducto mágico para gente que no es autónoma. La autofacturación (cuyo nombre legal es *Facturación por el destinatario*) simplemente significa que **tú generas el PDF de la factura en nombre del artista** para ahorrarle trabajo administrativo.

* Para hacer esto, tiene que haber un acuerdo por escrito firmado entre tú y el artista.
* **El artista SIGUE teniendo que estar dado de alta en Hacienda**, porque esa factura que tú generas va a su nombre, lleva su DNI, y él es quien tiene que ingresar ese IVA a Hacienda en su declaración trimestral.

#### ¿Qué pasa si trabajas con un particular que se niega a darse de alta en Hacienda?

Si un particular te dice "yo no soy autónomo, no estoy en Hacienda y no te puedo dar factura", **tú no tienes forma legal de justificar que le has pagado ese dinero** (ese 75% o 90%).
Si le haces una transferencia sin factura, para Hacienda todo el ingreso de la venta (los 1000€ o los 100€) será beneficio tuyo, y tributarás impuestos por el total, arruinando tu negocio.

#### Solución para trabajar con particulares

La única vía 100% libre de riesgos para tu galería es exigir en tus Términos y Condiciones que **todo creador que venda a través de tu plataforma debe estar capacitado legalmente para emitir facturas** (es decir, dado de alta en Hacienda mediante el modelo 036/037, independientemente de si pagan o no la cuota de la Seguridad Social). Si quieres facilitarles la vida, puedes ofrecer el servicio de **Autofacturación** (tú les haces el papel), pero ellos tienen que hacerse cargo de sus impuestos.

---

Viendo que tu plataforma va a manejar diferentes regímenes de IVA (REBU por un lado, General por otro) y que vas a exigir ciertos requisitos legales a los artistas para que la maquinaria funcione sin problemas para ti...

**¿Tienes pensado cómo vas a automatizar a nivel técnico o contable esta separación de facturas y regímenes en tu web, o necesitas que hablemos sobre cómo plantear ese flujo en el software de tu tienda online?**

---

