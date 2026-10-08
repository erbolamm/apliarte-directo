# Centro de directo

Recibe la señal de OBS en un servidor RTMP local, la reenvía a varios destinos a la vez y, si OBS
se cae, emite un vídeo de respaldo en bucle para que la antena no se quede en negro.

La ingesta y el panel del centro escuchan solo en `127.0.0.1`. Al recibir OBS, los destinos configurados sí publican hacia Twitch y YouTube; comprueba las claves antes de iniciar.

> 🎬 **Overlay 3D Interactivo en Producción**: Toda la arquitectura, configuración de OBS (Browser Source), comandos de Twitch (#apliarte), adopción de avatares y despliegue en VPS para `https://directo.apliarte.com/` está documentada en detalle en:
> 👉 [**`DIRECTO_APLIARTE.md`**](./DIRECTO_APLIARTE.md)

## Alcance (decidido 2026-09-11)

Esta carpeta es el sitio para **código nuevo** relacionado con el directo: overlays HTML, paneles de
comandos de Twitch, integraciones con OBS, etc. La biblioteca de medios personales de
tu carpeta de medios de OBS (audios, vídeos, fondos, música, colección de escenas) **no se mueve
aquí**: sigue donde está. No se reorganiza ese árbol salvo que Javier lo pida explícitamente.

```
OBS ──rtmp──▶ centro :1935 ──┬──ffmpeg──▶ destino 1
                             └──ffmpeg──▶ destino 2
                                  ▲
                   si OBS cae ────┘  respaldo.mp4 en bucle
```

## Levantarlo

```bash
cd /ruta/a/apliarte-directo
npm install
npm run centro
```

- Panel: <http://127.0.0.1:8790>
- OBS publica en: `rtmp://127.0.0.1:1935/live/<lo-que-quieras>`

Se detiene con `Ctrl+C`. Al cerrar solo mata **los FFmpeg que ha lanzado él**; nunca toca procesos
ajenos del sistema.

## Seguridad de la entrada RTMP

El centro solo acepta señal de OBS desde este mismo equipo (`127.0.0.1:1935`). Si de verdad necesitas enviar desde otro equipo de tu red, arráncalo con `RTMP_BIND=0.0.0.0 npm run centro`, sabiendo que entonces cualquier aparato de esa red podría emitir en tus canales.

## Configuración

Se lee `config.local.json` si existe y, si no, `config.ejemplo.json`.
`config.local.json` está en `.gitignore` para ajustes opcionales de puertos o destinos. Un usuario nuevo no tiene que editarlo: `config.ejemplo.json` ya incluye Twitch y YouTube. Las claves se pegan en el panel privado de Directo, no en archivos de configuración.

```json
{
  "puertoRtmp": 1935,
  "puertoPanel": 8790,
  "rutaEntrada": "live",
  "respaldo": "medios/respaldo.mp4",
  "destinos": [
    { "nombre": "twitch", "url": "rtmp://live.twitch.tv/app", "variableClave": "CLAVE_TWITCH" },
    { "nombre": "youtube", "url": "rtmp://a.rtmp.youtube.com/live2", "variableClave": "CLAVE_YOUTUBE" }
  ]
}
```

### Claves de Twitch y YouTube: solo en el panel

1. Abre el panel privado de Directo (`/estudio`, o ruta antigua `/admin`), accede a **Config & OBS** y entra en **Credenciales & Red**.
2. En **Emisión Twitch / YouTube / WHIP**, pega las dos claves y pulsa **Guardar emisión**. Los campos quedan vacíos tras guardar; el estado muestra solo «guardada» o «pendiente».
3. Arranca el centro con `npm run centro`; en **Destinos de emisión** del mismo panel pulsa actualizar. OBS publica en `rtmp://127.0.0.1:1935/live/<nombre>`.

El panel guarda las claves en `DATA_DIR/config.json` (`data/config.json` por defecto), fuera de Git y con permisos `0600`. **El overlay y el centro deben usar el mismo `DATA_DIR` en el mismo equipo**; si el overlay se ejecuta en otro host o contenedor sin volumen compartido, el centro no verá las claves. El centro lee allí la clave al lanzar cada FFmpeg; `CLAVE_TWITCH` y `CLAVE_YOUTUBE` siguen disponibles como **fallback opcional**. El estado, la API y los registros nunca devuelven claves.

OBS Bridge usa por defecto el bus **local** `ws://127.0.0.1:${PORT:-7979}/ws`; si el overlay local escucha en otro puerto, usa `OBS_BRIDGE_WS_URL=ws://127.0.0.1:<puerto>/ws`. `OBS_BRIDGE=off npm run centro` desactiva el bridge sin afectar el restream. El bridge nunca apunta de forma predeterminada al dominio de producción.

**Origen de los destinos:** [Twitch documenta `rtmp://<ingest>/app/<clave>` y cita `live.twitch.tv` como host](https://help.twitch.tv/s/article/twitch-stream-key-faq?language=en_US). [YouTube documenta que la URL de ingesta primaria la asigna su control de directos/API](https://developers.google.com/youtube/v3/live/docs/liveStreams); el host `a.rtmp.youtube.com/live2` es un preset habitual, pero **no se pudo verificar como URL universal en documentación primaria oficial**. Comprueba en YouTube Studio que coincida con la URL de ingesta de tu evento antes de emitir; si difiere, cambia solo el destino en `config.local.json` (sin clave).

> ⚠️ Un destino sin `variableClave` emite a una URL sin nombre de flujo. Úsalo solo en pruebas locales.

## Probarlo sin emitir a ningún sitio real

```bash
# 1. Un destino de prueba que escucha en 1936 y no va a ninguna parte
node -e "const N=require('node-media-server');new N({rtmp:{port:1936,chunk_size:60000,gop_cache:false,ping:30,ping_timeout:60}}).run()"

# 2. Antes de arrancar, crea un config.local.json desechable con SOLO el
#    destino rtmp://127.0.0.1:1936/live y variableClave CLAVE_PRUEBA_LOCAL.
#    No ejecutes esta prueba con los destinos Twitch/YouTube configurados.
CLAVE_PRUEBA_LOCAL=flujo-de-prueba OBS_BRIDGE=off npm run centro

# 3. Una señal falsa que hace de OBS durante 9 segundos
ffmpeg -re -f lavfi -i "testsrc=s=640x360:r=25" -f lavfi -i "sine=frequency=220" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -t 9 \
  -f flv rtmp://127.0.0.1:1935/live/obs

# 4. Mirar el estado
curl -s http://127.0.0.1:8790/api/estado
```

Para generar un vídeo de respaldo de prueba:

```bash
ffmpeg -f lavfi -i "testsrc=s=1280x720:r=30:d=6" -f lavfi -i "sine=frequency=440:duration=6" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest medios/respaldo.mp4
```

## Overlay del código de hoy

`codigo-de-hoy.html` muestra en el directo el código que cambia cada día. **Basta editar el HTML**:
el valor está en la línea 17, bajo un comentario que lo señala. No necesita red, ni claves, ni
tocar la colección de escenas de OBS.

```js
const CODIGO_DE_HOY = "ESCRIBE-AQUI";   // ← cambia esto y guarda
```

### Añadirlo en OBS

1. En la escena, **+** → **Fuente de navegador** → nombre, por ejemplo «Código de hoy».
2. Marca **Archivo local** y elige:
   `public/codigo-de-hoy.html` (o usa la URL local `http://127.0.0.1:7979/codigo-de-hoy.html` si el servidor está en marcha)
3. Ancho **1920**, alto **1080**.
4. Tras cambiar el valor, pulsa **Actualizar** en las propiedades de la fuente. El texto cambia sin
   reiniciar OBS.

El fondo es **transparente a propósito**: un overlay se superpone al vídeo y no debe tapar la
escena. Por eso tampoco lleva el interruptor claro/oscuro del Kit de Marca — esa regla es para
landings y webs, y esto es una capa de composición de vídeo, no una página que alguien navegue.
La tarjeta lleva fondo propio semitransparente y contorno oscuro en el texto para que se lea tanto
sobre vídeo claro como oscuro.

### Leerlo desde Firebase: anotado, no hecho

Javier mantiene `codigoDehoy` en la consola de Firebase del proyecto `calcaapp`. Conectarlo
requeriría demostrar **coste monetario imposible**, según la regla de la oficina pública. Hoy se
entrega la versión local editable, que no depende de nada.

## Pruebas

```bash
npm test
```

Las pruebas de `node:test` cubren validación de configuración, aislamiento de claves, estados,
argumentos FFmpeg, OBS Bridge y el proxy de destinos sin arrancar el centro ni emitir.

## Estados

| Estado | Qué significa |
| :--- | :--- |
| `detenido` | Nadie publica y no hay nada emitiendo |
| `recibiendo` | OBS publica, los reenvíos aún no han arrancado |
| `reenviando` | Al menos un destino recibe la señal de OBS |
| `fallback` | OBS cayó; se emite el vídeo de respaldo |
| `error` | Todos los destinos han fallado |

Un destino caído **no tumba a los demás**: se marca en rojo con su motivo y el resto sigue.

## Dependencias, y por qué estas

| Paquete | Versión | Licencia | Última publicación | Por qué |
| :--- | :--- | :--- | :--- | :--- |
| `node-media-server` | 4.4.3 | Apache-2.0 | 2026-09-10 | Único servidor RTMP mantenido en Node puro |
| `express` | 5.2.1 | MIT | 2026-08-15 | Sirve el panel y cuatro rutas JSON |
| `socket.io` | 4.8.3 | MIT | 2025-12-23 | Estado en vivo sin recargar |

Todas comprobadas el 2026-09-11: mantenidas y con licencia compatible con la MIT del proyecto.
Las pruebas no añaden ninguna dependencia: usan `node:test`, que ya viene con Node.

## Dos cosas que hay que saber de node-media-server v4

Se descubrieron probando en vivo, y no están en su documentación.

1. **Los eventos emiten un solo argumento.** La v4 manda `(session)` con `session.streamPath`;
   la v3 mandaba `(id, streamPath)`. Usar la firma vieja deja la ruta en `undefined` y **tumba el
   proceso** en cuanto OBS publica. Lo absorbe `src/sesion-rtmp.js`.
2. **Tarda 30 segundos en avisar de que la señal cayó** (`PUBLISH_GRACE_MS`), para permitir que un
   cliente reconecte. En un directo eso son 30 segundos de negro, así que `src/gracia.js` lo baja a
   3. Toca una propiedad interna: si una versión futura la cambia, el centro **sigue funcionando** y
   lo avisa en el registro, en vez de romperse.

## Twitch: dónde se engancharía

El centro retransmite hacia Twitch mediante FFmpeg, pero no lee el chat de Twitch ni gestiona suscripciones. Esa parte corresponde al overlay, no al servidor RTMP.

## Estructura

```
directo/
├── src/
│   ├── server.js          arranque, ingesta RTMP, panel y cierre limpio
│   ├── configuracion.js   validación y enmascarado de claves
│   ├── estado.js          máquina de estados (pura, sin procesos)
│   ├── ffmpeg.js          construcción de las líneas de FFmpeg
│   ├── procesos.js        único sitio que lanza y mata FFmpeg
│   ├── sesion-rtmp.js     adaptador de los eventos de node-media-server
│   ├── gracia.js          acorta la ventana de gracia de 30 s
│   └── relevo.js          margen entre matar el reenvío y arrancar el respaldo
├── public/                panel (modo claro por defecto, interruptor sol/luna)
├── test/                  54 pruebas con node:test
└── medios/                vídeos de respaldo (fuera de Git)
```
