// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  AQUÍ SE REDACTAN LAS GUÍAS. Es el único fichero que hay que tocar para  ║
// ║  escribirlas: la ruta, los metadatos, el JSON-LD, el sitemap y el        ║
// ║  llms.txt ya están hechos y se alimentan de aquí y de lib/guides.js.     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// FORMATO. Cada guía es un objeto con dos claves:
//
//   lead      Un ÚNICO párrafo que responde la pregunta del título. Es la parte
//             que más importa: los motores generativos citan este párrafo, y
//             para poder citarlo tiene que entenderse solo, sin el título y sin
//             el resto de la página. Escríbelo como si fuera la respuesta
//             completa a alguien que sólo va a leer eso. 2-4 frases.
//
//   sections  Lista de secciones. Cada una:
//               heading    Encabezado. Va como <h2>. Si puede formularse como
//                          pregunta, mejor: es lo que hace que la sección se
//                          pueda extraer como respuesta a esa pregunta.
//               paragraphs Lista de párrafos, cada uno una cadena de texto.
//
// ENLACES. Dentro de cualquier texto —`lead` o párrafo— se escriben así:
//
//     'Consulta la [guía de autenticidad](/guias/como-se-autentica-una-obra-con-nfc).'
//     'Escríbenos a [info@140d.art](mailto:info@140d.art).'
//     'Más en [la web de NXP](https://www.nxp.com).'
//
// Reglas:
//   · Ruta interna (empieza por `/`)  -> navegación sin recargar la página.
//   · `https://` -> se abre en pestaña nueva, con rel="noopener noreferrer".
//   · `mailto:`  -> correo.
//   · Cualquier otro destino se deja como texto visible, a propósito: así se
//     ve al revisar la página en lugar de desaparecer sin avisar.
//
// El destino NO aparece en los datos estructurados: al FAQPage sólo va el texto
// del enlace. No hace falta que hagas nada, lo hace la página.
//
// REGLAS que conviene no saltarse:
//
//   · No prometas nada que no digan las páginas legales (devoluciones, plazos,
//     garantías). Si la guía y los términos y condiciones se contradicen, gana
//     el problema, no la guía.
//   · No inventes cifras: ni número de artistas, ni plazos concretos de envío,
//     ni porcentajes de comisión, salvo que estén publicados en otro sitio del
//     sitio y coincidan.
//   · No anuncies envío fuera de España: está previsto, no disponible.
//   · Escribe en español (es-ES) y en segunda persona, como el resto del sitio.
//
// El texto de abajo es un MARCADOR DE POSICIÓN. Sustitúyelo. Mientras siga ahí,
// las páginas se ven y funcionan, pero no dicen nada útil.

export const GUIDE_CONTENT = {
  'como-comprar-arte-original-online': {
    lead:'Comprar una obra de arte original por internet es, esencialmente, comprobar ' +
      'cuatro cosas antes de pagar: que la obra es la que dice ser, en qué estado y ' +
      'con qué medidas llega, si es pieza única o forma parte de una edición, y cómo ' +
      'se gestiona el envío y la devolución.',
    sections: [
      {
        heading: '¿Cómo sé que la obra es auténtica?',
        paragraphs: [
            'Ofrecemos certificados de autenticidad (CoA) para todas las obras ' +
            'de arte de nuestro catálogo. Estos certificados están provistos de ' +
            'etiquetas físicas NFC NXP NTAG 424 DNA con Secure Dynamic Messaging que garantizan ' +
            'la autenticidad de la obra, ' +
            'con un ID único en cada escaneo que se valida en tiempo real contra la web ' +
            'de la galería. La verificación es criptográfica (AES-128 CMAC) y el chip cumple los ' +
            'estándares NFC ISO/IEC 14443, ISO/IEC 7816-4 y NFC Forum Type 4 Tag. ' +
            'Puedes consultar más información en la ' +
            '[guía sobre autenticidad de las obras](/guias/como-se-autentica-una-obra-con-nfc).',
        ],
      },
      {
        heading: '¿Qué debo mirar en la ficha de una obra?',
        paragraphs: [
            'Medidas, técnica, soporte, año, si es única o de edición, y si el precio ' +
            'incluye o no el envío. Todos estos detalles aparecen en la página de detalle ' +
            'de todas las obras de la galería.',
        ],
      },
      {
        heading: '¿Cómo llega la obra a casa?',
        paragraphs: [
            'La galería se encarga y compromete a realizar el embalaje de cada obra ' +
            'de la manera óptima de acuerdo a las especificaciones físicas de cada una de ellas. ' +
            'Siempre se elige para el envío el transportista más adecuado según el peso y volumen de la obra.',
        ],
      },
      {
        heading: '¿Puedo devolverla?',
        paragraphs: [
            'Por supuesto. Las devoluciones se rigen de conformidad con la legislación vigente en materia ' +
            'de consumidores y usuarios, y el comprador dispone de un plazo de 14 días naturales para solicitarla.',
        ],
      },
    ],
  },

  'que-es-una-edicion-limitada': {
    lead:
      'Una edición limitada es una obra que existe en un número fijo de ejemplares, ' +
      'decidido por el artista antes de producirla y que no se amplía después bajo ningún concepto. Cada ' +
      'ejemplar es original y va numerado; lo que la distingue de una reproducción es ' +
      'que el número de copias está cerrado y documentado, tanto en la web como criptográficamente a través ' +
      'de la etiqueta NFC en el certificado de autenticidad (CoA).',
    sections: [
      {
        heading: '¿En qué se diferencia de una obra única?',
        paragraphs: [
            'La obra única, como su nombre indica, existe de manera única en forma de un único ejemplar. ' +
            'Normalmente, el valor de una obra sigue un orden creciente dependiendo de si se trata de: ' +
            'reproducción abierta, edición limitada u obra única.',
        ],
      },
      {
        heading: '¿Qué significa la numeración?',
        paragraphs: [
            'El valor "x/y" (por ejemplo "Edición 3/15") indica el orden en que se ha comercializado ' +
            'cada ejemplar de una edición limitada de una obra. Una edición limitada puede tener ' +
            '"Pruebas de Artista", que son ejemplares que realiza el artista para su propio uso, como pruebas ' +
            'de concepto.',
        ],
      },
      {
        heading: '¿Cómo funcionan las ediciones en 140d?',
        paragraphs: [
            'En 140d, la ficha de una obra de edición limitada indica de cuántos ' +
            'ejemplares consta. Cada ejemplar lleva su propio certificado de ' +
            'autenticidad con el número correspondiente.',
        ],
      },
    ],
  },

  'como-se-autentica-una-obra-con-nfc': {
    lead:
      'Cada obra vendida en 140d incluye un certificado de autenticidad en papel con ' +
      'un chip NFC. Al acercar cualquier móvil, el chip genera un código distinto en ' +
      'cada lectura que el servidor de la galería verifica criptográficamente, de modo ' +
      'que el certificado no se puede duplicar ni reutilizar: una copia del papel no ' +
      'sirve de nada sin el chip, y el chip no repite nunca la misma respuesta.',
    sections: [
      {
        heading: '¿Qué es exactamente el certificado?',
        paragraphs: [
            'Es un documento impreso donde figura toda la información sobre la obra, ' +
            'como el título, el autor, el número de la edición, etc. ' +
            'Este documento en papel lleva un chip NFC, que genera un código distinto en ' +
            'cada lectura que el servidor de la galería verifica criptográficamente, de modo ' +
            'que el certificado no se puede duplicar ni reutilizar: una copia del papel no ' +
            'sirve de nada sin el chip, y el chip no repite nunca la misma respuesta.',
        ],
      },
      {
        heading: '¿Cómo lo compruebo?',
        paragraphs: [
            'Acerca el móvil al chip, sin instalar nada: el teléfono abre una página de ' +
            'la galería que te dice al momento si el certificado es válido. Si algo no ' +
            'cuadra —porque el código no es auténtico, porque el certificado se ha ' +
            'revocado o porque esa misma lectura ya se había usado antes— la página te ' +
            'lo indica en lugar de darlo por bueno.',
        ],
      },
      {
        heading: '¿Por qué no se puede falsificar?',
        paragraphs: [
            'El chip está programado con un sistema de autenticación NFC de alta seguridad basado en NXP NTAG 424 ' +
            'DNA, con criptografía AES-128, autenticación AES-CMAC conforme a NIST SP 800-38B, Secure Dynamic ' +
            'Messaging (SDM) y validación criptográfica dinámica por lectura. El chip dispone de certificación de ' +
            'seguridad Common Criteria EAL4 y cumple los estándares ISO/IEC 14443, ISO/IEC 7816-4 y NFC Forum Type ' +
            '4 Tag.',
        ],
      },
      {
        heading: '¿Y si pierdo el certificado o se daña?',
        paragraphs: [
          'Perder o dañar el certificado no pone en duda la autenticidad de tu obra: escríbenos y lo ' +
          'resolvemos. La galería anula el certificado perdido —queda marcado como no válido, de modo que ' +
          'a nadie le sirve si aparece— y emite uno nuevo para tu ejemplar.',
        ],
      },
    ],
  },

  'como-vender-tu-obra-en-una-galeria-online': {
    lead:
      'Para vender en una galería online necesitas obtener tu alta como artista, ' +
      'preparar bien la ficha de cada obra (buenas fotos, medidas, técnica y precio), ' +
      'y tener resueltos el embalaje y el cobro. En 140d el alta se solicita desde la ' +
      'página de contacto y, una vez aprobada, publicas y gestionas tu obra tú mismo. ' +
      'Desde la galería te ayudamos en todo momento en cualquier duda o gestión, realizándolas por ti ' +
      'para que tú solo tengas que preocuparte de la producción y de tu proceso creativo.',
    sections: [
      {
        heading: '¿Cómo solicito el alta?',
        paragraphs: [
            'Accediendo a la página de [contacto](/contacto) y rellenando el formulario ' +
            'de solicitud de alta como artista. O escribiendo un mail a [info@140d.art](mailto:info@140d.art).',
        ],
      },
      {
        heading: '¿Cómo fotografío y describo mi obra?',
        paragraphs: [
            'Tendrás soporte y asistencia en todo momento por parte de la galería. ' +
            'Debes intentar que las fotos sean en ambientes claros y que no se vean torcidas, y que sean de ' +
            'buena calidad. En cuanto a las descripciones, intenta que sean claras y concisas, y que incluyan ' +
            'información relevante sobre la obra.',
        ],
      },
      {
        heading: '¿Quién pone el precio y qué comisión se lleva la galería?',
        paragraphs: [
            'El precio de la obra lo fija el artista. En base a ese precio se aplica la comisión correspondiente ' +
            'a la galería, que es fijada y acordada dentro del contrato de colaboración del artista con la galería.',
        ],
      },
      {
        heading: '¿Cómo y cuándo cobro?',
        paragraphs: [
            'Los pagos se realizan por medio de la plataforma Stripe Connect. El dinero se liquida al ' +
            'final de cada día hábil (cumpliendo con los plazos legales y de posibles devoluciones, retrasos ' +
            'o reembolsos).',
        ],
      },
      {
        heading: '¿Quién se encarga del envío?',
        paragraphs: [
            'El artista no tiene que preocuparse de nada. La galería es la encargada en todo momento de la gestión ' +
            'de los envíos, embalaje de las obras, comunicación con los transportistas y clientes, y cualquier ' +
            'otra cosa relacionada con el envío, como la gestión de las devoluciones o reembolsos.',
        ],
      },
    ],
  },
}

export function getGuideContent(slug) {
  return GUIDE_CONTENT[slug] || null
}

// Señal de que una guía sigue sin redactar. La usa la página para marcarla
// `noindex`: publicar en Google y en los motores de IA una página que dice
// «[PENDIENTE DE REDACCIÓN]» es peor que no tenerla — la primera impresión de un
// rastreador es difícil de corregir, y una página vacía indexada arrastra la
// valoración del resto del sitio.
export function isPlaceholder(content) {
  if (!content) return true
  if (content.lead && content.lead.includes('[PENDIENTE DE REDACCIÓN]')) return true
  return (content.sections || []).some((s) =>
    (s.paragraphs || []).some((p) => p.includes('[PENDIENTE DE REDACCIÓN]')),
  )
}
