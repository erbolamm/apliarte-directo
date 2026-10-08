# Encargo para Antigravity — bienvenida a quien escribe por primera vez

Fecha: 2026-10-08. **No empieces este encargo hasta haber terminado e informado el de `DOCUMENTATION/PROMPT_ANTIGRAVITY.md`.**

Los números de línea son del estado del repositorio el 2026-10-08, con cambios sin guardar. Compruébalos antes de fiarte.

## 1. Qué quiere Javier

Cuando alguien escribe en el chat de Twitch por primera vez en el directo:

1. El muñeco de la cámara lo saluda por su nombre con un bocadillo grande.
2. Se escribe un mensaje de bienvenida en el chat.
3. Se lanza la fiesta.

## 2. Lo que ya existe (comprobado, no lo explores de nuevo)

**El servidor ya está conectado al chat, pero no lo lee.**

- `server.js:436` pide las etiquetas (`CAP REQ :twitch.tv/tags ...`) y `server.js:439` entra en el canal.
- El manejador `server.js:442-455` solo escribe el mensaje en el registro, responde al PING y mira si el acceso fue bien. No separa las líneas por `\r\n` ni interpreta `PRIVMSG`.
- Trampa: `server.js:448` da la conexión por buena si el texto contiene `JOIN`. Un mensaje del chat con esa palabra también cuenta. No lo empeores.
- Esa conexión solo existe si hay token configurado (`server.js:424`) y no se abre durante las pruebas (`server.js:470`).

**Quien lee el chat hoy son las páginas, cada una por su cuenta:** `public/plano.html:3026-3070`, `public/estudio.html:2375`, `public/admin.html:3560`, `public/tts-twitch.html:572`, `public/index.html:2478`. El intérprete es `parsearIrcTwitch` en `public/js/tts-fuentes.js:55`.

**No hay ninguna lista de usuarios ya vistos.** Hay que crearla.

**Escribir en el chat:** `enviarATwitchChat(texto)` en `server.js:760-769`. No tiene límite de frecuencia ni limpia saltos de línea.

**La fiesta:**

- Desde el chat solo la puede lanzar Javier (`public/plano.html:2519-2525` y `:2927-2935`).
- El servidor puede lanzarla sin escribir nada en el chat: `broadcast({ type: 'comando_chat', comando: '!fiesta', usuario: 'ja' })`. La página lo recibe en `public/plano.html:3711-3712`.
- Dura 15 segundos. Lanzarla mientras hay una en marcha no hace nada (`test/fiesta.test.mjs:45`). No hace nada durante un juego (`oficina-3d/src/office/runtime.ts:1149`).

**El muñeco de la cámara (`public/camara.html`):**

- Es un SVG: `.ja-cam-avatar-svg`, dentro de `#ja-avatar-cam-box`, dentro de `#camera-container` (líneas 160-166).
- La boca se anima con `animarBocaJa(segundos)` (línea 358).
- **No tiene bocadillo.** Hay que crearlo.
- El contenedor mide 440x248 (320x320 en modo cuadrado) y recorta lo que se sale (`overflow: hidden`, líneas 23-43 y 82).
- Recibe mensajes en `conectarWs()` (línea 417).
- Bocadillo que sirve de modelo: `ActivityBubble` en `oficina-3d/src/components/FloorPlan.tsx:128-168`, con el reparto de líneas `wrapSpeech` (línea 105).

**Los tipos de mensaje nuevos hay que darlos de alta.** `src/ws-auth.js` descarta cualquier tipo que no esté en `PUBLIC_EVENTS` o `RESTRICTED_EVENTS` (líneas 86-120), incluso para el administrador. `vps-overlay/src/ws-auth.js` tiene que quedar idéntico: lo exige `test/vps-overlay-build.test.js`.

## 3. Cómo hacerlo

### Decisión ya tomada: se detecta en el servidor

No lo detectes en las páginas. Hay cinco leyendo el chat a la vez y saludarían cinco veces.

### Tarea 1 — Módulo `src/bienvenida-chat.js` (con pruebas primero)

Lógica pura, sin red ni reloj propios: se le pasa la hora. Tres piezas:

1. **Leer una línea del chat.** De una línea `PRIVMSG` con etiquetas saca usuario, nombre visible (`display-name`) y texto. Las demás líneas devuelven `null`. `tts-fuentes.js` es un módulo ES y `server.js` es CommonJS: no lo importes, escribe uno pequeño aquí.
2. **Saber si es nuevo.** Una lista de vistos en memoria. Devuelve verdadero solo la primera vez. Nunca son nuevos: el propio canal, el nick del bot (`twitchConfig.nick`), `ja`, `apliarte`, `erbolamm`, y una lista de bots conocidos en una constante (`nightbot`, `streamelements`, `moobot`, `botrix`, `fossabot`).
3. **Agrupar.** Si llegan varios nuevos en poco tiempo, salen juntos en un solo saludo ("Bienvenidos X, Y y 12 más"). Entre un saludo y el siguiente pasa un tiempo mínimo. Todos los tiempos y topes, en constantes con nombre.

"Nuevo" significa primera vez desde que arrancó el servidor. No uses la etiqueta `first-msg` de Twitch: significa primera vez en la vida del canal, que es otra cosa.

Pruebas que ejecuten el módulo, no que busquen texto:

- Una línea `PRIVMSG` real con etiquetas se interpreta bien.
- El segundo mensaje del mismo usuario no es nuevo. Mayúsculas y minúsculas cuentan igual.
- Los excluidos nunca son nuevos.
- 300 usuarios nuevos en dos segundos producen pocos saludos, no 300.
- Un nombre con `\r\n` o con `<script>` sale limpio.

### Tarea 2 — Enganchar el módulo en `server.js`

En el manejador de `server.js:442`: separa por `\r\n`, pasa cada línea al módulo. No toques la lógica de PING ni la de acceso.

Cuando toque saludar, tres acciones:

1. `broadcast({ type: 'saludo_chat', usuarios: [...], total: n })`.
2. `enviarATwitchChat(textoDeBienvenida)`. Quita `\r` y `\n` del texto antes.
3. `broadcast({ type: 'comando_chat', comando: '!fiesta', usuario: 'ja' })`. **No** envíes `!fiesta` como texto al chat: las páginas lo volverían a leer y se dispararía dos veces.

Da de alta `saludo_chat` en `PUBLIC_EVENTS` de `src/ws-auth.js` y copia el archivo igual a `vps-overlay/src/ws-auth.js`.

No toques `vps-overlay/server.js`.

### Tarea 3 — Bocadillo en `public/camara.html`

- Un bocadillo grande junto al muñeco, que quepa dentro del contenedor en los dos tamaños (440x248 y 320x320). No cambies el tamaño del contenedor ni quites el recorte: Javier tiene esa medida puesta en OBS.
- Al recibir `saludo_chat`: muestra el saludo con el nombre, mueve la boca con `animarBocaJa`, y lo oculta solo a los pocos segundos.
- Si llega otro saludo mientras hay uno en pantalla, espera su turno. Con tope de espera.
- **El nombre se escribe con `textContent` o como texto SVG. Nunca con `innerHTML`.**
- Solo se ve en modo muñeco. Con la cámara real encendida, no tapes la imagen: para y pregunta a Javier dónde lo quiere en ese caso.
- Copia el mismo cambio a `vps-overlay/public/camara.html`.

### Tarea 4 — Interruptor en el estudio

Un interruptor "Bienvenida a nuevos" en `public/estudio.html`, junto a los ajustes del chat. El servidor guarda el estado. Con el interruptor apagado no se hace ninguna de las tres acciones.

### Lo que decide Javier (prepara y para)

Antes de dar nada por cerrado, enséñale y espera su respuesta:

- El texto exacto de la bienvenida en el chat y el del bocadillo.
- Si el interruptor viene encendido o apagado de serie.
- Si quiere fiesta con cada saludo o como mucho una cada cierto tiempo. Propón un tiempo.
- Cómo queda el bocadillo en pantalla. Lo juzga él mirándolo.

## 4. Límites duros

- No borres ni muevas archivos.
- No toques `vps-overlay/` salvo las dos copias indicadas (`src/ws-auth.js` y `public/camara.html`).
- No cambies cómo se autoriza `!fiesta` desde el chat. Solo Javier sigue pudiendo lanzarla a mano.
- No envíes mensajes de prueba al chat real de Twitch. Las pruebas no usan la red.
- No hagas commit ni push sin que Javier lo pida.
- No toques `.env`, `config/`, `data/` ni `private/`.
- No modifiques ni elimines pruebas para que pasen.
- Si algo no cuadra con lo que ves, para y pregunta.

## 5. Cómo comprobar

```
npm test
```

Tiene que acabar en `fail 0`. Apunta el número de pruebas antes de empezar y después.

Pruebas que ya vigilan esta zona y no pueden romperse: `test/ws-auth.test.js`, `test/ws-handshake.integration.test.js`, `test/vps-overlay-build.test.js`, `test/raid-optimizacion.test.js`, `test/fiesta.test.mjs`, `test/paginas-sintaxis.test.js`, `test/estudio.test.js`.

## 6. Cómo informar

En español, frases cortas, sin jerga. Javier no es programador.

| Tarea | Estado (terminada / bloqueada / pendiente) | Pruebas antes | Pruebas después | Archivos tocados |
|---|---|---|---|---|

Debajo, pega las últimas 10 líneas de `npm test` y la salida de `git status --short`. Sin resumir.

Si una prueba pasaba antes y ahora no, eso va lo primero. Si has cambiado algo que este encargo no pedía, dilo.
