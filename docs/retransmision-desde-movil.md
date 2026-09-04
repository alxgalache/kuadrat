# Retransmitir un evento desde el móvil (consola del host)

Procedimiento operativo para retransmitir una conferencia o presentación desde
un teléfono montado en un trípode, usando los tres modos de vista del host.

Contexto técnico y decisiones de diseño: sección «Host Mobile Console for Agora
Broadcasts» de `CLAUDE.md` y `openspec/changes/agora-host-mobile-broadcast-modes`.

## Montaje de referencia

- Google Pixel 9 Pro en **horizontal**, sujeto al accesorio del trípode.
- Micrófonos DJI Mic 3 con el receptor conectado por **USB** al teléfono.
- Trípode de pie de hasta 185 cm.

## Antes del evento

1. **Marcar la casilla al crear el evento.** En `/admin/espacios/nuevo`, con
   **Proveedor de streaming = Agora** y **Modo de interacción = Stream (mano
   levantada)**, aparece «Consola móvil del host». Sin esa casilla el host solo
   dispone de la vista completa de siempre. Se puede marcar también después,
   editando el evento.

2. **Instalar el sitio en la pantalla de inicio del teléfono.** Este es el paso
   que más espacio recupera y no depende de nada durante la retransmisión.

   En Chrome para Android: menú ⋮ → **Añadir a pantalla de inicio**. Abierto
   después desde ese icono, el sitio no tiene barra de direcciones **en
   absoluto** y ningún gesto la hace aparecer.

   La alternativa es la pantalla completa nativa, que la consola pide al entrar
   —pero el usuario puede salirse de ella con un gesto del sistema y hay que
   volver a pedirla con el botón ⤢ del selector de vista. Las dos son
   compatibles; con el sitio instalado, la segunda deja de hacer falta.

   > No existe ninguna API que oculte permanentemente la barra de direcciones en
   > una pestaña normal de Chrome. Estas dos son las únicas vías reales.

3. **Conectar el receptor DJI antes de entrar en la sala**, para que aparezca en
   la lista de fuentes de audio desde el principio. Si se conecta con la consola
   ya abierta también se detecta, sin recargar.

## Durante el evento

Con el evento en directo, la vista del host muestra una barra **«Vista del
host»** con tres botones:

| Modo | Para qué |
|---|---|
| **Vista completa** | La de siempre: vídeo grande, rejilla de participantes, chat. Para el ordenador. |
| **Consola** | El panel de operación: vídeo pequeño a la izquierda con medidor de micrófono, y micrófono, cámara, altavoz y pantalla como tarjetas grandes a la derecha, más «Finalizar stream». Sin rejilla ni chat. |
| **Solo vídeo** | La imagen a pantalla completa, para comprobar el encuadre desde lejos con el teléfono en alto. |

Se salta entre los tres en cualquier orden y en cualquier momento; la
retransmisión no se corta al cambiar. El modo elegido se recuerda en ese
teléfono, así que **recargar la página a mitad de evento vuelve a la consola**
(la pantalla completa sí hay que volver a pedirla: el navegador exige un toque).

### Comprobar que se está emitiendo con el micrófono correcto

Es el error caro de este montaje. Bajo el vídeo de la consola hay un **medidor
de nivel**: si alguien habla por el DJI y la barra no se mueve, la fuente
seleccionada no es esa. Se cambia con el botón **⌄** de la tarjeta «Micrófono»,
que abre la lista de fuentes a pantalla completa.

### La pantalla ya no se apaga sola

Mientras la página de host está abierta y visible, la aplicación pide al sistema
que no apague la pantalla. No hay que tocar el ajuste de «tiempo de pantalla
encendida» del teléfono.

Funciona en Chrome para Android 84 o superior y **solo sobre HTTPS**, así que en
producción sí y en un entorno de pruebas servido por HTTP plano no. Si el
teléfono pasa a segundo plano, el sistema lo libera y la aplicación lo vuelve a
pedir al volver.

## Limitaciones conocidas

- **Compartir pantalla no está disponible en Chrome para Android.** La tarjeta
  «Pantalla» aparece en gris explicándolo. En el ordenador funciona con
  normalidad.
- **La salida de audio la elige el sistema**, no la aplicación: en Android no se
  puede seleccionar el altavoz desde el navegador. La tarjeta «Altavoz» aparece
  en gris. Para retransmitir es irrelevante — monitorizar el audio en el propio
  teléfono provocaría acoplamiento.
- **La consola es solo para eventos Agora en modo Stream.** Los eventos LiveKit
  y los de modo Reunión conservan su vista de siempre. (La pantalla que no se
  apaga sí aplica a todos.)
