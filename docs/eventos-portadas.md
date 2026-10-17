# Portadas de los streams

Guía operativa del menú «Portadas» de los eventos en directo de Agora en modo stream (`broadcast`). Decisiones y motivos: `openspec/changes/agora-stage-covers` (archivado al terminar). Requisitos: `openspec/specs/agora-stage-covers`.

---

## 1. Qué son

Tres imágenes oscuras (fondo negro, texto blanco) que tapan la escena entera, igual para todo el público, en la sala y en la grabación. Son negras para que se lean como la pantalla de la retransmisión y no como parte de la página, que es blanca:

| Portada | Texto | Cuándo |
|---|---|---|
| **Inicio** | «Empezamos en breve» | Antes de empezar. **Se pone sola al iniciarse el evento**, a mano o automáticamente |
| **Intermedio** | «Volvemos enseguida» | En un descanso |
| **Final** | «Gracias por acompañarnos» | Al terminar, antes de pulsar «Finalizar stream» |

Solo existen en los streams de Agora. No hay portadas en las reuniones (`meeting`), en los eventos LiveKit ni en los pases de vídeo.

## 2. Quién y dónde

El **host** y el **admin co-presentador**, desde «Portadas»:

- **Escritorio:** junto a «Efectos», en la barra de controles.
- **Consola móvil del host:** la tarjeta «Portadas».
- **Móvil o tablet (vista compacta):** «Más» → «Portadas».

No hace falta tener la cámara encendida. La portada que se ve es la última que eligió cualquiera de los dos.

## 3. Qué pasa al poner una portada

Para que no se vea nada delante, al elegir una portada **se apagan**:

- las cámaras del host y del co-presentador;
- la pantalla compartida;
- la pizarra;
- **los micrófonos de los dos.** Así no se emite ni se graba una conversación privada durante un descanso.

Para hablar sobre la portada (por ejemplo, para despedirte con «Final» puesta), vuelve a encender el micrófono: la portada sigue puesta.

## 4. Cómo se quita

- Eligiendo «Ninguna».
- O, automáticamente, al **encender la cámara, compartir pantalla o activar la pizarra**: la portada desaparece para todos y el menú vuelve a «Ninguna».

Al pulsar «Finalizar stream» con una portada puesta, el evento termina como siempre.

## 5. En la grabación

Si el evento se graba, la grabación muestra la misma portada durante el mismo tiempo, con el audio de quien hable. Agora tarda unos segundos en aplicarla la primera vez, porque descarga la imagen.

Detalle en `docs/grabaciones-eventos.md`.

## 6. Cosas que conviene saber

- **Un reinicio de la API en pleno evento quita la portada**, como pasa con la pizarra. Vuelve a ponerla.
- **Quien entra tarde** ve la portada que esté puesta en ese momento.

## 7. Cambiar el diseño de una portada

Las imágenes publicadas **nunca se sobrescriben**: los navegadores y Agora las guardan en caché.

1. Edita su HTML en `docs/cortinillas/html/oscura/` y regenera el PNG en `docs/cortinillas/oscura/`. El `README.md` de esa carpeta tiene la orden de Chrome.
2. Conviértelo a JPG (calidad 85-90) con el siguiente número de versión: `client/public/cortinillas/intermedio-v3.jpg`.
3. Cambia el fichero en los dos catálogos, `api/utils/stageCovers.js` y `client/lib/stageCovers.js`, y el titular si cambia el texto.
4. Despliega API y cliente juntos. No borres la versión anterior: una grabación en curso podría estar usándola.
