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

## Inicio y fin del directo en YouTube

### Por qué YouTube a veces no salía en directo

El centro empuja el vídeo a YouTube con FFmpeg, igual que a Twitch. La diferencia está en el lado
de YouTube: allí el vídeo que llega necesita una **emisión** (el evento que ve el público) que lo
esté esperando.

- La documentación de YouTube dice que, desde septiembre de 2020, YouTube dejó de crear la emisión
  y el stream «por defecto» de cada canal y que solo admite emisiones creadas para cada directo.
  Cada emisión tiene que estar vinculada a un stream antes de poder empezar
  ([guía de migración de YouTube](https://developers.google.com/youtube/v3/live/guides/migration-guide-default-broadcasts)).
- La misma guía dice que el inicio y el fin automáticos son opcionales y hay que activarlos en cada
  emisión (`enableAutoStart` y `enableAutoStop`).

De ahí se deduce el fallo: si OBS empieza y no hay ninguna emisión esperando en esa clave, o la que
hay no tiene el inicio automático, YouTube puede no salir en público. Es una deducción a partir de
esa guía; la guía no describe ese caso con esas palabras y no se ha confirmado en el canal.

### Qué hace el centro al empezar OBS

Cada vez que OBS empieza a transmitir, el centro hace dos cosas a la vez:

1. **Twitch y los demás destinos** arrancan como siempre. No esperan a YouTube.
2. **YouTube**: antes de enviarle el vídeo, el centro pide por la API de YouTube que haya una
   emisión lista en la clave guardada:
   - si ya hay una emisión en directo o esperando en esa clave (con inicio automático), **la
     reutiliza**; es lo que ocurre cuando OBS reconecta tras un corte;
   - si no hay ninguna, **crea una**: pública, con inicio automático y fin automático, con el
     título y la descripción del directo anterior (o «Directo ApliArte» si no hay anterior), y la
     vincula a la clave guardada.

   Después arranca el reenvío a YouTube. La espera es de 8 segundos como mucho.

Solo se hace al empezar OBS. No se hace al entrar el vídeo de respaldo, al poner un vídeo a mano,
al parar un destino desde el panel ni cuando FFmpeg se reinicia tras una caída.

### Qué pasa durante la espera

Mientras YouTube espera a su emisión todavía no tiene FFmpeg, pero el centro lo cuenta como un
reenvío a punto de salir:

| Qué ocurre en la espera | Qué hace el centro |
| :--- | :--- |
| Cae el reenvío de otro destino (por ejemplo Twitch) | Reintenta ese destino, como en cualquier caída. No pone el vídeo de respaldo |
| OBS se cae o pierde la conexión | El reenvío a YouTube ya no sale. Con vídeo de respaldo, YouTube lo recibe igual que los demás destinos |
| Se detiene la transmisión en OBS o se finaliza la emisión desde el panel | El reenvío a YouTube ya no sale |
| Se pone un vídeo a mano | YouTube recibe ese vídeo y el reenvío pendiente ya no sale, aunque el vídeo termine antes que la espera |
| Se para YouTube desde el panel | El reenvío a YouTube ya no sale |
| OBS corta y vuelve a empezar | Vale la espera de la última vez que empezó; la anterior se descarta |

Una diferencia con el centro sin este paso: si OBS corta durante la espera, el centro no pasa al
respaldo en cuanto caen los reenvíos, porque en ese momento no sabe si ha caído OBS o solo un
destino. Pasa al respaldo cuando llega el aviso de corte (unos 3 segundos si el centro pudo acortar
ese aviso; el registro lo dice al empezar OBS).

### Si algo falla, el directo sigue

Esta ayuda nunca es un requisito. Si YouTube no contesta, no hay permiso, se acaba el cupo, no hay
red o pasa cualquier otra cosa:

- **Twitch no depende de este paso**: arranca sin esperarlo y, si su reenvío cae, se reintenta
  como siempre.
- **YouTube recibe el vídeo igual que antes de existir este paso**, con un retraso de 8 segundos
  como mucho. Que salga en público o no depende entonces de lo que haya en YouTube, como antes.
- Si el paso está apagado o YouTube no está conectado, no se hace ninguna petición y el reenvío a
  YouTube sale sin esa espera.

El registro del panel dice qué ha pasado en cada arranque:

| Mensaje en el registro | Qué significa | Qué hacer |
| :--- | :--- | :--- |
| `YouTube: emisión pública preparada…` | Se creó una emisión nueva y saldrá sola | Nada |
| `YouTube: ya había una emisión esperando y se reutiliza…` | Se aprovecha la que ya existía | Nada |
| `AVISO YouTube: la emisión de YouTube no es pública (privada / oculta)…` | La emisión reutilizada no la verá el público | Cambiar la visibilidad en YouTube Studio |
| `AVISO YouTube: no se ha podido saber si la emisión de YouTube es pública…` | YouTube no dijo la visibilidad | Comprobarla en YouTube Studio |
| `AVISO YouTube: esa emisión no tiene el fin automático…` | Al parar OBS, YouTube no la cerrará sola | Cerrarla en YouTube Studio al terminar |
| `YouTube: el inicio automático no está conectado…` | No se ha hecho la conexión con YouTube (se dice una vez) | Seguir «Conectar YouTube (una sola vez)», si se quiere |
| `YouTube: la preparación automática de la emisión está apagada (YOUTUBE_API=off)…` | Se apagó a propósito (se dice una vez). En las pruebas automáticas el paso también está apagado y el mensaje dice `(entorno de pruebas)` | Nada |
| `AVISO YouTube: el permiso de YouTube ha caducado o se ha retirado y hay que volver a conectar YouTube…` | El permiso guardado ya no vale | Repetir la conexión |
| `AVISO YouTube: YouTube no acepta el permiso guardado y hay que volver a conectar YouTube…` | YouTube rechaza el permiso o el cliente | Repetir la conexión |
| `AVISO YouTube: se ha agotado el cupo diario de peticiones a YouTube…` | Se gastó el cupo del día | Esperar al día siguiente |
| `AVISO YouTube: el canal de YouTube no tiene activada la emisión en directo…` | El canal no puede emitir en directo | Activarlo en YouTube |
| `AVISO YouTube: la clave de emisión guardada no es de ninguna emisión del canal de YouTube conectado…` | La clave del panel es de otro canal o ya no existe | Revisar la clave o conectar el canal correcto |
| `AVISO YouTube: no hay clave de emisión de YouTube guardada…` | Falta la clave | Guardarla en el panel |
| `AVISO YouTube: YouTube no respondió a tiempo…` | YouTube tardó más de lo permitido | Nada; mirar si YouTube salió |
| `AVISO YouTube: no se pudo contactar con YouTube…` | Fallo de red | Revisar la conexión |
| `AVISO YouTube: YouTube devolvió un error…` | Error del lado de YouTube | Mirar el detalle entre corchetes |
| `AVISO YouTube: YouTube respondió algo que no se esperaba…` | Respuesta que el centro no entiende | Avisar a quien mantiene el centro |
| `AVISO YouTube: falló la preparación dentro del propio centro…` | Error del propio centro | Avisar a quien mantiene el centro |

Todos los avisos de fallo terminan con «el directo sigue como siempre». Algunos añaden entre
corchetes un detalle técnico (por ejemplo `[HTTP 403 (quotaExceeded) en liveStreams.list]`), que
nunca contiene claves ni permisos.

El último resultado también sale en `GET /api/estado` y en el evento `estado` del panel, en el campo
`youtube`: `estado` (`preparada`, `no_configurada`, `desactivada` o `fallo`), `motivo`, `cuando`,
`reutilizada`, `privacidad` y `autoStop`. Vale `null` hasta el primer arranque de OBS.

### Conectar YouTube (una sola vez)

Hace falta una cuenta de Google con acceso al canal. Los nombres exactos de los menús de Google
Cloud cambian con el tiempo; aquí se describe qué hay que conseguir en cada paso.

1. Entra en la consola de Google Cloud y **crea un proyecto** (el nombre es libre).
2. En ese proyecto, **activa la API «YouTube Data API v3»**.
3. **Configura la pantalla de consentimiento de OAuth** del proyecto, para usuarios externos, y deja
   su estado de publicación en **«En producción»** («In production»). En «Prueba» («Testing»),
   Google caduca el permiso a los 7 días y habría que repetir la conexión cada semana
   ([documentación de OAuth 2.0 de Google](https://developers.google.com/identity/protocols/oauth2)).
   No se ha confirmado si, al pasar a producción, Google pide además verificar la aplicación.
4. **Crea un cliente de OAuth de tipo «Aplicación de escritorio»** («Desktop app»). Con un cliente
   de tipo web la conexión no funciona, y el programa lo rechaza con un mensaje claro.
5. **Descarga el archivo JSON** de ese cliente. Contiene un secreto: no lo compartas ni lo enseñes
   en pantalla.
6. En la carpeta del proyecto, ejecuta:

   ```bash
   node scripts/youtube-conectar.mjs <ruta-del-json>
   ```

7. Se abre el navegador con la página de permiso de Google. **Elige la cuenta del canal y acepta.**
   Cuando la página diga «YouTube conectado», ya está. Si el navegador no se abre solo, el programa
   muestra la dirección para copiarla a mano; solo en ese caso la enseña.

El programa espera el permiso 5 minutos. La conexión se repite únicamente si el permiso caduca o se
retira; el registro lo avisa con «hay que volver a conectar YouTube».

### Dónde quedan los secretos y cómo desconectar

- El permiso se guarda en `DATA_DIR/youtube-oauth.json` (`data/youtube-oauth.json` por defecto),
  con permisos `0600` y fuera de Git. Contiene el identificador y el secreto del cliente y el
  permiso permanente. El centro no los escribe en el registro, en el panel ni en `/api/estado`.
- El archivo JSON descargado de Google Cloud ya no hace falta después de conectar; guárdalo en un
  sitio seguro o bórralo.
- **Desconectar:** borra `youtube-oauth.json`, o retira el acceso de la aplicación en los ajustes de
  seguridad de la cuenta de Google. El centro sigue emitiendo como antes de esta función.
- **Apagarlo sin desconectar:** arranca el centro con `YOUTUBE_API=off` (por ejemplo
  `YOUTUBE_API=off npm run centro`). El centro no llama a YouTube y reenvía como antes.

### Cupo de la API

Cada arranque de OBS hace entre 4 y 6 llamadas a la API: 4 si reutiliza una emisión (buscar la
clave y tres listas de emisiones) y 6 si crea una (además, crearla y vincularla). Buscar la clave
puede necesitar más de una llamada si el canal tiene más de 50 claves. Si YouTube rechaza la
vinculación de la emisión recién creada, el centro hace una llamada más para borrarla; si la
vinculación se queda sin respuesta (plazo, red o error del servidor) no la borra, porque puede
haberse vinculado, y en ese caso puede quedar en el canal una emisión sin usar.

El gasto en unidades de cupo es una **estimación**: contando 1 unidad por llamada serían entre 4 y
6 unidades por arranque, sobre un cupo que se ha tomado como 10 000 unidades al día por proyecto.
Ni el coste de cada tipo de llamada ni ese cupo se han comprobado en la cuenta; las llamadas que
crean, vinculan o borran pueden costar más que las de consulta. El gasto real se ve en la consola de
Google Cloud. La documentación consultada no dice si el uso de la API es gratuito.

### Detener la transmisión en OBS cierra la emisión

| Qué ocurre | Qué hace el centro |
| :--- | :--- |
| Se detiene la transmisión en OBS a propósito | Corta el envío a **todos** los destinos y deja el centro en `detenido`. No arranca el respaldo |
| OBS se cae o pierde la conexión | Igual que antes: emite el vídeo de respaldo en bucle |

Al cortarse el envío, YouTube deja de recibir señal y cierra la emisión si esta tiene el fin
automático. Las emisiones que crea el centro lo tienen; si reutilizó una que no lo tiene, el
registro lo avisa al empezar. El botón de finalizar del panel sigue funcionando y hace lo mismo.

Límite conocido, sin comprobar con OBS real: si OBS da la transmisión por detenida él solo (por
ejemplo, tras agotar sus reintentos de reconexión), puede enviar el mismo aviso que una parada a
propósito. En ese caso el centro cerraría también el vídeo de respaldo.

El centro distingue los dos casos porque OBS avisa de la parada por su WebSocket (evento
`StreamStateChanged`). Por eso **hace falta el OBS Bridge**, con el servidor WebSocket de OBS
activado. Con `OBS_BRIDGE=off`, o si el bridge no está conectado a OBS, el centro no recibe ese
aviso y trata cualquier parada como un corte: con vídeo de respaldo configurado, el respaldo
arranca y hay que cerrar la emisión desde el panel.

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
│   ├── cierre-obs.js      decide si una parada de OBS cierra la emisión
│   ├── youtube-emision.js      pide la emisión de YouTube antes de reenviar, sin frenar nada
│   ├── youtube-api.js          cliente de la API de YouTube (crear, reutilizar y vincular la emisión)
│   ├── youtube-credenciales.js lee y guarda el permiso de YouTube (DATA_DIR/youtube-oauth.json)
│   └── relevo.js          margen entre matar el reenvío y arrancar el respaldo
├── scripts/
│   └── youtube-conectar.mjs    conexión única con YouTube (permiso de Google)
├── public/                panel (modo claro por defecto, interruptor sol/luna)
├── test/                  54 pruebas con node:test
└── medios/                vídeos de respaldo (fuera de Git)
```
