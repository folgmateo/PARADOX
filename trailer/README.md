# PARADOX — tráiler de gameplay

[Ver el tráiler](https://folgmateo.github.io/PARADOX/trailer/?v=3) · [Abrir el MP4](https://folgmateo.github.io/PARADOX/trailer/PARADOX-cinematic.mp4?v=3) · [Jugar](https://folgmateo.github.io/PARADOX/)

Montaje vertical de 30 segundos, 720 × 1280, 60 fps y música original a 144 BPM. La acción ocupa los primeros 27,5 segundos; el cierre invita a jugar sobre una partida en movimiento.

Las escenas muestran jugadas realizadas por controles automatizados sobre el motor original: recolección, combos ×5, ecos, un roce sin daño, un relé y el paso por la abertura de una ruptura. No se alteran las reglas, la puntuación ni las vidas. Los cortes emplean distintas partidas y cambios de velocidad. La cámara sigue al jugador, abre el plano para explicar el relé y usa perspectiva 3D sobre el gameplay 2D.

En el teléfono, pulsa **Descargar MP4**. Si se abre el reproductor del navegador, usa su menú de compartir para guardarlo.

Código Morse conservado:
```
-.. .- -. .. . .-.. .- / .- --. ..- .. .-.. .- .-. / - . / .- -- --- .-.-.
```

## Producción

- `index.html`: montaje, cámara y banda sonora; también reproduce el MP4 generado.
- `render.mjs`: exporta el vídeo y comprueba resolución, duración, fps, codecs, errores y eventos reales de gameplay.
- `render-manifest.json`: resultados de la exportación y huella de la fuente.
- El workflow genera y publica el MP4 y las vistas previas.
- El juego en la raíz mantiene su código original; esta carpeta contiene la publicidad.
