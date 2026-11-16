# PARADOX — tráiler cinematográfico

[Ver el tráiler](https://folgmateo.github.io/PARADOX/trailer/) · [Abrir el MP4](https://folgmateo.github.io/PARADOX/trailer/PARADOX-cinematic.mp4) · [Jugar](https://folgmateo.github.io/PARADOX/)

Video vertical de 30 segundos, 720 × 1280, 60 fps, H.264 y audio AAC. Música electrónica original sintetizada a 128 BPM; cristal y cámara en 3D, gameplay real en 2D, tipografía animada y paleta cian/magenta.

En el teléfono, abre el tráiler y pulsa **Descargar MP4**. Si el navegador abre el archivo en su reproductor, usa su menú de compartir para guardarlo.

El código Morse del cierre se conserva literalmente:
```
-.. .- -. .. . .-.. .- / .- --. ..- .. .-.. .- .-. / - . / .- -- --- .-.-.
```

## Producción

- `index.html`: escena animada y composición musical; también reproduce el MP4 al estar disponible.
- `render.mjs`: renderiza cuadros deterministas y audio offline; valida duración, resolución, fps, codecs y errores de navegador.
- `render-manifest.json`: resultados y huella de la fuente utilizada.
- El workflow de GitHub Actions genera el MP4 y las vistas previas. Solo publica los cuatro archivos indicados en el paso final.
- El juego de la raíz conserva su código original. Los archivos de este directorio pertenecen a la publicidad.
