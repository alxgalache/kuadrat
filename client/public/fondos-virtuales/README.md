# Fondos virtuales de las salas Agora

Las imágenes de esta carpeta son el catálogo de fondos que host y asistentes pueden
aplicar a su webcam en los eventos con proveedor Agora (modos `broadcast` y `meeting`).

## Cómo añadir un fondo

1. **Deja el fichero de imagen en esta carpeta** cumpliendo los requisitos de abajo.
2. **Declara su entrada** en `client/lib/virtualBackgrounds.js`:

   ```js
   export const VIRTUAL_BACKGROUNDS = [
     { file: 'galeria-blanca.jpg', label: 'Galería blanca' },
   ];
   ```

   El `label` es lo que ve el usuario en el panel (en es-ES, con acentos); el orden
   del array es el orden en que aparecen las miniaturas.

Una imagen que esté en la carpeta pero **no** en el manifiesto no se muestra. Con el
manifiesto vacío el panel ofrece solo las opciones de desenfoque, que es un estado
válido y sin errores.

## Requisitos de las imágenes

| Requisito | Valor |
|---|---|
| Relación de aspecto | 16:9 |
| Resolución recomendada | 1280 × 720 |
| Ancho × alto | Debe dar un número **par** |
| Formato | JPG o WEBP |
| Peso | Por debajo de ~300 KB |
| Nombre del fichero | kebab-case, sin acentos ni espacios (`taller-artista.jpg`) |

**Por qué el producto ancho × alto debe ser par:** la extensión de fondo virtual de
Agora sube la imagen como textura WebGL y documenta el error
`texture bound to texture unit 2 is not renderable` con dimensiones incompatibles.
1280 × 720 = 921 600 lo cumple.

**Por qué el límite de peso:** el fichero se sirve entero a cada participante que
seleccione ese fondo, y su miniatura a todo el que abra el panel.

**Encuadre:** el fondo se compone con `fit: 'cover'` — llena el encuadre de la webcam
recortando y centrando, sin deformarse. Evita composiciones con elementos importantes
pegados a los bordes, porque pueden quedar fuera según la relación de aspecto de la
cámara de cada persona.
