import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Aviso Legal - 140d',
}

export default function LegalNoticePage() {
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
          Aviso Legal
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: Mayo 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Identificación del Titular</h2>
            <p className="mt-3">
              En cumplimiento de lo establecido en el artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios
              de la Sociedad de la Información y del Comercio Electrónico (LSSICE), se ponen a disposición del
              usuario los siguientes datos identificativos del titular del sitio web:
            </p>
            <ul className="mt-3 space-y-1 list-none">
              <li><span className="font-medium">Denominación social:</span> 140D Servicios Digitales S.L.</li>
              <li><span className="font-medium">Nombre comercial:</span> 140d Galería de Arte</li>
              <li><span className="font-medium">CIF:</span> B88732599</li>
              <li><span className="font-medium">Domicilio social:</span> Paseo del Rector Esperabé 18 2ºB, 37008, Salamanca</li>
              <li><span className="font-medium">Correo electrónico de contacto:</span> info@140d.art</li>
              <li><span className="font-medium">Sitio web:</span> https://140d.art</li>
              <li><span className="font-medium">Datos de inscripción en el Registro Mercantil:</span> [TOMO, FOLIO, SECCIÓN, HOJA]</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Objeto y Ámbito de Aplicación</h2>
            <p className="mt-3">
              El presente Aviso Legal regula el acceso y uso del sitio web https://140d.art (en adelante, el
              &ldquo;Sitio Web&rdquo;) y de los contenidos y servicios puestos a disposición del usuario a través
              del mismo.
            </p>
            <p className="mt-3">
              El mero acceso al Sitio Web implica la aceptación plena y sin reservas del presente Aviso Legal,
              así como de los demás textos legales publicados: Política de Privacidad, Política de Cookies y
              Términos y Condiciones.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Condiciones de Acceso y Uso</h2>
            <p className="mt-3">
              El acceso general al Sitio Web es libre y gratuito. El acceso a determinadas funcionalidades
              (registro de usuario, participación en subastas, adquisición de obras o eventos en directo) requiere
              el registro previo conforme a las condiciones específicas de cada servicio.
            </p>
            <p className="mt-3">
              El usuario se compromete a hacer un uso lícito, diligente y conforme a la buena fe del Sitio Web,
              respetando en todo momento la normativa vigente y absteniéndose de cualquier actuación que pudiera
              causar daños o perjuicios al titular o a terceros.
            </p>
            <p className="mt-3">Queda expresamente prohibido:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Utilizar el Sitio Web con fines ilícitos, fraudulentos o contrarios al orden público.</li>
              <li>Introducir, difundir o publicar contenidos de carácter racista, xenófobo, obsceno, discriminatorio o que vulneren los derechos fundamentales de las personas.</li>
              <li>Alterar, bloquear o deteriorar el normal funcionamiento técnico del Sitio Web.</li>
              <li>Llevar a cabo acciones de scraping, extracción masiva de datos o cualquier otro proceso automatizado no autorizado.</li>
              <li>Hacerse pasar por otra persona o entidad de forma fraudulenta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Propiedad Intelectual e Industrial</h2>
            <p className="mt-3">
              Todos los contenidos del Sitio Web —incluyendo, a título enunciativo y no limitativo, textos,
              fotografías, imágenes, ilustraciones, logotipos, marcas, diseños gráficos, código fuente e
              interfaces de usuario— son titularidad de 140d Galería de Arte o de sus respectivos autores o
              cedentes, y se encuentran protegidos por la legislación española e internacional en materia de
              propiedad intelectual e industrial.
            </p>
            <p className="mt-3">
              Queda expresamente prohibida la reproducción, distribución, comunicación pública, transformación o
              cualquier otra forma de explotación de los contenidos del Sitio Web sin la autorización previa y
              por escrito del titular o, en su caso, del autor o cedente que ostente los derechos correspondientes.
            </p>
            <p className="mt-3">
              Las obras de arte publicadas en el Sitio Web son propiedad de sus respectivos artistas o de quienes
              ostenten los derechos sobre ellas. Su reproducción, distribución o comunicación pública sin
              autorización expresa del titular de los derechos constituye una infracción del Texto Refundido de
              la Ley de Propiedad Intelectual (Real Decreto Legislativo 1/1996, de 12 de abril).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Limitación de Responsabilidad</h2>
            <p className="mt-3">
              140d Galería de Arte no garantiza la disponibilidad continua e ininterrumpida del Sitio Web ni la
              ausencia de errores en sus contenidos. El titular se reserva el derecho de suspender, modificar o
              interrumpir el acceso al Sitio Web o a cualquiera de sus secciones en cualquier momento y sin
              previo aviso.
            </p>
            <p className="mt-3">140d Galería de Arte no asume responsabilidad por los daños o perjuicios que pudieran derivarse de:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Interrupciones o fallos en el acceso al Sitio Web causados por circunstancias ajenas a su control, incluyendo fallos de red, cortes en el suministro eléctrico o casos de fuerza mayor.</li>
              <li>El uso ilícito, negligente o contrario a las presentes condiciones que realicen los usuarios.</li>
              <li>La presencia de virus u otros elementos tecnológicos dañinos introducidos por terceros en los contenidos del Sitio Web.</li>
              <li>Los contenidos, servicios o productos accesibles a través de sitios web de terceros enlazados desde el Sitio Web.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Privacidad y Cookies</h2>
            <p className="mt-3">
              El tratamiento de los datos personales de los usuarios se rige por la Política de Privacidad de
              140d Galería de Arte, accesible en{' '}
              <Link href="/legal/politica-de-privacidad" className="underline">
                https://140d.art/legal/politica-de-privacidad
              </Link>.
            </p>
            <p className="mt-3">
              El uso de cookies en el Sitio Web se encuentra regulado en la Política de Cookies, accesible en{' '}
              <Link href="/legal/politica-de-cookies" className="underline">
                https://140d.art/legal/politica-de-cookies
              </Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Legislación Aplicable y Jurisdicción</h2>
            <p className="mt-3">
              El presente Aviso Legal se rige íntegramente por la legislación española. Para la resolución de
              cualquier controversia derivada del acceso o uso del Sitio Web, cuando una de las partes ostente
              la condición de consumidor o usuario, serán competentes los Juzgados y Tribunales del domicilio
              del consumidor, de conformidad con lo establecido en la normativa de protección de consumidores y
              usuarios. En las relaciones entre profesionales o empresarios, las partes se someten expresamente
              a los Juzgados y Tribunales de la ciudad de Salamanca, con renuncia a cualquier otro fuero que
              pudiera corresponderles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Actualización del Aviso Legal</h2>
            <p className="mt-3">
              140d Galería de Arte se reserva el derecho de modificar el presente Aviso Legal en cualquier
              momento, publicando la versión actualizada en el Sitio Web con indicación de la fecha de la
              última modificación. El acceso o uso continuado del Sitio Web tras la publicación de cualquier
              modificación implica la aceptación de la versión vigente en ese momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">9. Contacto</h2>
            <p className="mt-3">
              Para cualquier consulta relacionada con el presente Aviso Legal, puedes dirigirte a:{' '}
              <a href="mailto:info@140d.art" className="underline">info@140d.art</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
