Estoy desarrollando una galería de arte online. No estoy utilizando ningún framework de e-commerce específico. Estoy programado la aplicación desde cero y realizando la integración de Stripe a través de la API.
Me gustaría obtener más información acerca de la funcionalidad Stripe Connect, ya que mi idea o modelo de negocio consistirá en ofrecer mi plataforma a diferentes artistas, y obtener una comisión por cada obra vendida, para el restante de la cantidad pagarlo a cada artista. Para esto creo que encajaría la opción de Stripe Connect usando cuentas Express.
​
¿Podrían darme más información acerca del funcionamiento de este caso de uso (Stripe Connect con cuentas Express) y cómo encajaría en mi modelo de negocio anteriormente descrito? O si por el contrario habría alguna aproximación o funcionalidad que pudiera encajar más con mi planteamiento.
​
Asimismo, me gustaría saber las especificaciones del servicio en términos legales, fiscales y contables (por ejemplo. cómo se gestionarían las facturas de los pagos a los diferentes artistas y si tanto las facturas que yo emitiría al comprador de la obra, como la que me emitiría el artista deberían llevar retención de IVA; o si sería imprescindible que los artistas a los que envío los pagos estuvieran constituidos como autónomos o personas jurídicas (sociedades) o es posible que fueran personas físicas (particulares))
Stripe Connect con cuentas Express encaja perfectamente con tu modelo de negocio de galería de arte online. Te explico cómo funciona y qué debes considerar:

Cómo funciona Stripe Connect con cuentas Express para tu caso
Modelo de marketplace: Tu plataforma actuaría como un marketplace donde:

Tú eres el merchant of record (responsable legal de las transacciones)
Los compradores pagan a tu plataforma
Tú cobras una comisión por cada venta
El resto del importe se transfiere automáticamente a cada artista
Ventajas de las cuentas Express:

Integración sencilla: Menor esfuerzo de desarrollo que las cuentas Custom
Onboarding gestionado por Stripe: Los artistas completan su verificación a través de interfaces de Stripe
Express Dashboard: Cada artista tiene acceso a un panel simplificado para ver sus ventas y pagos
Actualizaciones automáticas: Stripe gestiona los cambios regulatorios sin que tengas que modificar tu integración
Flujo de pagos: Puedes usar destination charges o separate charges and transfers:

El cliente paga en tu plataforma
Tú cobras tu comisión mediante application_fee
El resto se transfiere automáticamente a la cuenta del artista
Consideraciones legales, fiscales y contables
Importante: Stripe Connect no proporciona asesoramiento legal o fiscal. Debes consultar con un asesor fiscal profesional para tu situación específica en España.

Aspectos clave a considerar:

Facturación y IVA:

Como merchant of record, normalmente tú emites la factura al comprador
El tratamiento del IVA depende de la estructura legal que establezcas con los artistas
Stripe Tax puede ayudarte a calcular y recaudar IVA automáticamente
Tipo de cuenta de los artistas:

Las cuentas Express soportan tanto personas físicas (individuals) como empresas (autónomos, sociedades)
Los artistas pueden registrarse como particulares, aunque esto puede tener implicaciones fiscales
Stripe requiere verificación de identidad según el volumen de transacciones
Verificación y requisitos:

Para España, Stripe requiere información de verificación según el tipo de negocio
Los artistas necesitarán proporcionar información fiscal (NIF/CIF) y datos bancarios
Puedes consultar los requisitos específicos de verificación por país
Informes fiscales:

Stripe proporciona informes de transacciones
Existen integraciones con partners como Taxually para automatizar la gestión fiscal
Alternativas a considerar
Si bien Express es una buena opción, también podrías evaluar:

Cuentas Standard: Si tus artistas ya tienen experiencia con pagos online
Cuentas Custom: Si necesitas una experiencia completamente personalizada (requiere más desarrollo)
Próximos pasos recomendados
Consulta con un asesor fiscal sobre la estructura legal óptima para tu marketplace
Revisa la guía interactiva de plataformas de Stripe
Explora el Blueprint de Marketplace en tu Dashboard de prueba
Lee la guía completa para construir un marketplace
¿Tienes alguna pregunta específica sobre la implementación técnica o necesitas más información sobre algún aspecto en particular?

Estoy empezando mi empresa y mi cuenta de stripe es nueva (creo que usa accounts v2). He visto en la documentación oficial que para el caso de accounts v2 no aplicaría estos tres tipos de cuenta. En su lugar, se me indica esto en la documentación oficial:
​
Nuevas integraciones de Connect
La información de esta página se aplica únicamente a plataformas que ya utilizan tipos de cuentas conectadas heredadas. Si estás configurando una nueva plataforma Connect, o tu integración utiliza la API Accounts v2, consulta laGuía interactiva de plataformas. Si tu integración actual utiliza la API Accounts v1, consulta la sección Diseña una integración avanzada.
​
¿Es esto correcto? Necesito más información en este aspecto
Tienes razón. Para las nuevas integraciones de Connect, Stripe recomienda usar la API Accounts v2 en lugar de los tipos de cuenta heredados (Standard, Express, Custom). La documentación que mencionas es correcta.

Accounts v2 vs tipos de cuenta heredados
Con Accounts v2, en lugar de elegir entre Standard/Express/Custom, defines las configuraciones que asignas a cada cuenta conectada:

Configuración merchant: Permite que la cuenta acepte pagos de clientes (incluye capacidades como card_payments)
Configuración recipient: Permite que la cuenta reciba transferencias desde tu plataforma (incluye stripe_balance.stripe_transfers)
Configuración customer: Permite cobrar a la cuenta conectada como si fuera un cliente (útil para suscripciones SaaS)
Tu caso de uso: Galería de arte con comisiones
Para tu modelo de negocio (marketplace de arte con comisiones), la configuración recomendada sería:

Asignar configuración recipient a las cuentas de los artistas
Usar destination charges o separate charges and transfers para:
Cobrar al comprador en tu plataforma
Transferir el importe menos tu comisión al artista
Retener tu comisión como application fee
Cómo funciona
Un comprador paga 1.000€ por una obra en tu plataforma
Creas un cargo en tu cuenta de plataforma
Transfieres 850€ a la cuenta del artista (configuración recipient)
Retienes 150€ como tu comisión (application fee)
Aspectos legales, fiscales y contables
Importante: No puedo proporcionar asesoramiento legal o fiscal. Debes consultar con un asesor fiscal español, pero te comparto información general:

Facturación y IVA
Como marketplace (merchant of record), tú emites la factura al comprador con IVA incluido
Los artistas te facturan a ti por sus servicios/obras
El tratamiento del IVA depende de si los artistas son:
Autónomos/empresas: Aplican IVA en sus facturas (salvo excepciones)
Particulares: No pueden emitir facturas con IVA
Personas físicas vs autónomos
Stripe Connect requiere verificación de identidad de las cuentas conectadas, pero:

Sí es posible que sean personas físicas (particulares) en muchos países
Sin embargo, las obligaciones fiscales locales pueden requerir que se den de alta como autónomos si superan ciertos umbrales de ingresos
En España, actividades económicas habituales suelen requerir alta en autónomos
Stripe Tax
Stripe ofrece Stripe Tax para ayudar con el cálculo y recaudación de IVA en Europa, que puede integrarse con Connect.

Próximos pasos recomendados
Consulta la Guía interactiva de plataformas para configurar tu integración específica
Revisa la guía de marketplace con Accounts v2
Consulta con un asesor fiscal español sobre:
Obligaciones de facturación
Tratamiento del IVA
Requisitos para los artistas (autónomos vs particulares)
Retenciones aplicables