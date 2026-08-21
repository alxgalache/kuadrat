import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  // Antes sólo declaraba `title`, así que `description` y `alternates` caían a
  // las de la raíz: las CINCO páginas legales declaraban la portada como su
  // canónica, es decir, le decían al buscador que eran la home y que no debía
  // indexarlas por separado.
  //
  // El título tampoco repite la marca: la plantilla de la raíz ya añade
  // «| 140d», y ponerlo aquí daba «Términos y condiciones - 140d | 140d».
  title: 'Términos y condiciones',
  description:
    'Términos y condiciones de compra en 140d: proceso de pedido, precios, pagos, envíos, desistimiento y devoluciones de obra de arte original.',
  alternates: {
    canonical: '/legal/terminos-y-condiciones',
  },
}

export default function TermsPage() {
  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8 lg:px-10">
        <Link href="/" className="inline-block mb-10">
          <Image
            alt="140d Galería de Arte logo"
            src="/brand/140d.svg"
            width={120}
            height={24}
            className="h-6 w-auto"
          />
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Términos y Condiciones
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: Mayo 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Introducción</h2>
            <p className="mt-3">
              Estos Términos y Condiciones regulan el uso de nuestra plataforma web,
              incluyendo la participación en subastas en línea. Al acceder a nuestro sitio web o participar en una subasta,
              aceptas cumplir con estos términos en su totalidad. Si no estás de acuerdo con alguno de estos términos,
              te rogamos que no utilices nuestros servicios.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">SUBASTAS</h2>
            <h2 className="text-lg font-semibold text-gray-900">2. Participación en Subastas</h2>
            <p className="mt-3">
              Cada puja realizada en nuestra plataforma es vinculante e irrevocable. Al realizar una puja, el usuario se compromete
              a adquirir el artículo subastado en caso de resultar el pujador ganador, al precio de su puja final.
            </p>
            <p className="mt-3">
              El participante debe ser mayor de 18 años y tener capacidad legal para celebrar contratos.
              140d se reserva el derecho de solicitar verificación de identidad en cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Proceso de Puja</h2>
            <p className="mt-3">
              Para participar en una subasta, el usuario deberá registrarse proporcionando sus datos personales,
              dirección de entrega y un método de pago válido. Se realizará un cargo de validación de 1 EUR que será
              reembolsado automáticamente.
            </p>
            <p className="mt-3">
              Las pujas deben respetar el incremento mínimo establecido para cada artículo. El sistema anti-sniping
              puede extender la duración de la subasta si se recibe una puja en los últimos minutos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Pago y Entrega</h2>
            <p className="mt-3">
              El ganador de la subasta deberá completar el pago del importe total en un plazo máximo de 5 días hábiles
              desde la finalización de la subasta. El envío se realizará a la dirección indicada durante el registro.
            </p>
            <p className="mt-3">
              Los gastos de envío, si los hubiera, serán comunicados al participante antes de la subasta y se añadirán
              al precio final de adjudicación.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Cancelaciones y Devoluciones</h2>
            <p className="mt-3">
              Dado el carácter vinculante de las pujas, no se admiten cancelaciones una vez realizada la puja.
              El derecho de desistimiento no es aplicable a los bienes adquiridos en subastas públicas,
              de conformidad con la legislación vigente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">SORTEOS</h2>
            <h2 className="text-lg font-semibold text-gray-900">6. Participación en Sorteos</h2>
            <p className="mt-3">
              La participación en los sorteos organizados por 140d está abierta a personas mayores de 18 años con capacidad legal para celebrar contratos. Para inscribirse, el usuario deberá registrarse proporcionando sus datos personales, una dirección de entrega válida y un método de pago (tarjeta), que se utilizará para verificar la información de pago y como depósito de la participación.
            </p>
            <p className="mt-3">
              No se realizará ningún cargo en el momento de la inscripción: únicamente se efectuará el cargo correspondiente en caso de resultar ganador del sorteo, conforme a lo indicado en cada sorteo. 140d se reserva el derecho de solicitar verificación de identidad en cualquier momento y de excluir a los participantes que incumplan estos términos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Selección y Notificación del Ganador </h2>
            <p className="mt-3">
              El ganador de cada sorteo se determinará de forma aleatoria y automática mediante nuestro sistema en la fecha de cierre indicada para el sorteo. Cada participante válidamente inscrito tendrá las mismas probabilidades de resultar ganador.
            </p>
            <p className="mt-3">
              El ganador será notificado por correo electrónico a la dirección facilitada durante el registro. Si el ganador no respondiera o no pudiera completar el proceso en el plazo señalado en la notificación, 140d podrá seleccionar un nuevo ganador siguiendo el mismo procedimiento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Pago y Entrega del Premio </h2>
            <p className="mt-3">
              Una vez confirmado como ganador, se efectuará el cargo correspondiente en el método de pago facilitado durante la inscripción. El premio se enviará a la dirección indicada por el ganador durante el registro.
            </p>
            <p className="mt-3">
              Los gastos de envío, si los hubiera, se comunicarán al participante antes de la finalización del sorteo y se añadirán, en su caso, al importe a abonar. La entrega se realizará en los plazos habituales de la galería una vez confirmado el pago.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">9. Cancelaciones y Devoluciones </h2>
            <p className="mt-3">
              La inscripción en un sorteo podrá cancelarse por el usuario en cualquier momento antes de la fecha de cierre, sin coste alguno, dado que hasta ese momento no se ha efectuado ningún cargo. Una vez confirmado como ganador y realizado el cargo, no se admitirán cancelaciones, salvo en los supuestos previstos por la legislación vigente o cuando el producto recibido presente defectos o no se corresponda con su descripción.
            </p>
            <p>
              El proceso de devolución dentro del periodo de desistimiento se rige de igual forma que en la especificación del punto 13 de estos términos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">COMPRAS EN LA GALERÍA</h2>
            <h2 className="text-lg font-semibold text-gray-900">10. Proceso de compra</h2>
            <p className="mt-3">
              En la sección de compras de la galería, el usuario puede adquirir obras y productos disponibles de forma directa, sin necesidad de participar en una subasta o un sorteo. Para realizar una compra, el usuario deberá seleccionar los artículos deseados, proporcionar sus datos personales y una dirección de entrega, y completar el pago a través de los métodos habilitados en la plataforma.
            </p>
            <p className="mt-3">
              El contrato de compraventa se entenderá perfeccionado en el momento en que 140d confirme la aceptación del pedido mediante correo electrónico. 140d se reserva el derecho de rechazar o cancelar un pedido en caso de error manifiesto en el precio, falta de disponibilidad del artículo o sospecha de uso fraudulento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">11. Precios y Pago</h2>
            <p className="mt-3">
              Todos los precios mostrados en la plataforma se expresan en euros e incluyen los impuestos aplicables, salvo que se indique lo contrario. El pago se realizará en el momento de la compra a través de los métodos de pago disponibles en la web. 140d adopta medidas razonables para garantizar la seguridad de las transacciones y no almacena los datos completos de las tarjetas de pago.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">12. Envío y Entrega</h2>
            <p className="mt-3">
              Los pedidos se enviarán a la dirección indicada por el comprador durante el proceso de compra. Los gastos y plazos de envío se mostrarán antes de finalizar la compra y podrán variar en función del destino, las dimensiones y el valor de los artículos. 140d pondrá especial cuidado en el embalaje de las obras para garantizar su correcta conservación durante el transporte. El riesgo de pérdida o deterioro de los artículos se transmitirá al comprador en el momento de la entrega.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">13. Derecho de Desistimiento y Devoluciones </h2>
            <p className="mt-3">
              De conformidad con la legislación vigente en materia de consumidores y usuarios, el comprador dispone de un plazo de 14 días naturales, desde la recepción del producto, para desistir de la compra sin necesidad de justificación. Para ejercer este derecho, el usuario deberá comunicarlo a 140d a través del correo electrónico info@140d.art antes de que finalice dicho plazo.
            </p>
            <p className="mt-3">
              El producto deberá devolverse en su estado original, sin uso y con su embalaje, asumiendo el comprador los costes directos de devolución. Una vez recibido y comprobado el artículo, 140d reembolsará el importe abonado en un plazo máximo de 14 días naturales. Quedan excluidos del derecho de desistimiento los bienes adquiridos en subasta pública, conforme a lo dispuesto en el apartado de Subastas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">DISPOSICIONES GENERALES</h2>
            <h2 className="text-lg font-semibold text-gray-900">14. Responsabilidad</h2>
            <p className="mt-3">
              140d actúa como intermediario entre vendedores y compradores. Aunque realizamos esfuerzos razonables para verificar la autenticidad y el estado de los artículos, no podemos garantizar la exactitud de todas las descripciones proporcionadas por los vendedores.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">15. Modificaciones</h2>
            <p className="mt-3">
              Nos reservamos el derecho de modificar estos términos en cualquier momento. Las modificaciones entrarán en vigor desde su publicación en el sitio web. El uso continuado de la plataforma tras la publicación de cambios constituye la aceptación de estos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">16. Contacto</h2>
            <p className="mt-3">
              Para cualquier consulta relacionada con estos términos, puedes contactarnos a través de
              nuestro correo electrónico: info@140d.art
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
