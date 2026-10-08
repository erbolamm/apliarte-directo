# 📺 Guía Completa de Fuentes OBS y Sistema de Bienvenida — ApliArte Directo

> **Guía canónica de referencia para streamers, operadores de emisión y creadores de contenido.**  
> Explica al detalle todas las direcciones web de OBS, cómo organizarlas, qué ocurre cuando los espectadores escriben en el chat y cómo funciona el sistema de emisión soberano sin depender de servicios de terceros (como Botrix).

---

## 🧭 Índice Rápido
1. [Catálogo Completo de Direcciones para OBS Studio](#1-catálogo-completo-de-direcciones-para-obs-studio)
2. [Opciones Modulares: Escenario Integrado vs. Fuentes Sueltas](#2-opciones-modulares-escenario-integrado-vs-fuentes-sueltas)
3. [Controles de Zoom y Ajuste en Vivo (`+` / `−`)](#3-controles-de-zoom-y-ajuste-en-vivo---)
4. [Ciclo de Vida de Bienvenida: ¿Qué pasa cuando llegan usuarios?](#4-ciclo-de-vida-de-bienvenida-qué-pasa-cuando-llegan-usuarios)
5. [Chat Soberano y Botón del Ojo (👁️): Adiós a Botrix](#5-chat-soberano-y-botón-del-ojo-️-adiós-a-botrix)
6. [Resumen de Rutas y Compatibilidad del Panel](#6-resumen-de-rutas-y-compatibilidad-del-panel)

---

## 1. Catálogo Completo de Direcciones para OBS Studio

Todas las fuentes de OBS se agregan como **Fuente de Navegador** (Browser Source) en tu escena. Si emites en local, la dirección base es `http://127.0.0.1:7979`. Si emites desde un servidor VPS, sustituye `127.0.0.1:7979` por tu dominio o IP.

| Fuente | URL en OBS | Tamaño sugerido | Función principal |
| :--- | :--- | :---: | :--- |
| **Plano Integrado 3D** | `http://127.0.0.1:7979/plano?transparente=1` | `1920×1080` | Diorama 3D completo: personajes que hablan con tu voz (lip-sync), reloj digital, barra superior de contexto y tira inferior de avatares. |
| **Barra de Contexto Libre** | `http://127.0.0.1:7979/contexto.html` | `1920×120` (o libre) | Rótulo superior flotante transparente. Se actualiza automáticamente cuando escribes `!contexto <tema>` o lo cambias desde el panel. |
| **Tira de Avatares Libre** | `http://127.0.0.1:7979/avatares.html` | `1920×250` (o libre) | Tira transparente independiente de avatares que reaccionan a los comandos (`!cafe`, `!pesas`, etc.). Soporta modo horizontal y vertical. |
| **Overlay SMS y Mensajes** | `http://127.0.0.1:7979/sms-pantalla.html` | `1920×1080` | Buzón flotante en pantalla para mostrar notas SMS enviadas desde la tablet y mensajes destacados del chat de Twitch o YouTube (pulsando 👁️). |
| **Cámara Conmutable** | `http://127.0.0.1:7979/camara.html` | `1920×1080` (o PIP) | Conmutador inteligente: muestra el monigote animado por defecto y cambia suavemente a tu cámara real cuando la enciendes desde la tablet. Incluye el bocadillo de saludo en la parte superior. |
| **Fondo Animado** | `http://127.0.0.1:7979/fondo.html` | `1920×1080` | Escenarios temáticos y fondos de emisión (oficina, noche, código, música, tertulia). |
| **Tablero de Damas 3D** | `http://127.0.0.1:7979/damas.html` | `1920×1080` | Tablero de damas tridimensional interactivo para jugar en directo con la comunidad. |
| **Tren de la Conga** | `http://127.0.0.1:7979/conga.html` | `1920×1080` | Animación festiva de tren de avatares con música para celebraciones (`!conga`). |

---

## 2. Opciones Modulares: Escenario Integrado vs. Fuentes Sueltas

ApliArte Directo te permite elegir entre **dos filosofías de maquetación en OBS**:

### Opción A: Todo en Uno (Máxima sencillez)
Añade una única fuente de navegador en OBS con:
```text
http://127.0.0.1:7979/plano?transparente=1
```
En esta sola capa tienes el diorama 3D, el reloj, la barra superior de contexto y los avatares integrados. No necesitas configurar nada más.

### Opción B: Modular / Libre (Control total de posición)
Si prefieres colocar la barra de contexto arriba a la derecha, la tira de avatares en vertical en el lateral y el diorama en el centro:

1. **Plano sin duplicados**: Configura la fuente del plano con los parámetros `nocontexto=1` y `noavatares=1`:
   ```text
   http://127.0.0.1:7979/plano?transparente=1&nocontexto=1&noavatares=1
   ```
2. **Barra de contexto independiente**: Añade una fuente de navegador con:
   ```text
   http://127.0.0.1:7979/contexto.html
   ```
   Ubícala donde quieras en tu escena de OBS.
3. **Tira de avatares independiente**:
   - Modo horizontal (por defecto):
     ```text
     http://127.0.0.1:7979/avatares.html?modo=horizontal
     ```
   - Modo vertical (ideal para laterales de pantalla):
     ```text
     http://127.0.0.1:7979/avatares.html?modo=vertical
     ```

---

## 3. Controles de Zoom y Ajuste en Vivo (`+` / `−`)

Todas las fuentes flotantes (`/contexto.html`, `/avatares.html` y `/sms-pantalla.html`) incluyen botones discretos de zoom **`−`** y **`+`** en su esquina inferior derecha:

- **Modificación desde OBS**: Haz clic derecho sobre la fuente en el panel de Fuentes de OBS y selecciona **«Interactuar»**. Al pulsar **`+`** o **`−`**, el tamaño del texto y los elementos se adapta al instante.
- **Persistencia automática**: La escala elegida se guarda en el almacenamiento del navegador (`localStorage`) de esa fuente, por lo que mantendrá tu ajuste exacto entre directos y reinicios.
- **Diseño limpio para emisión**: Los botones se mimetizan de forma casi imperceptible para que nunca estorben la estética de tu directo.

---

## 4. Ciclo de Vida de Bienvenida: ¿Qué pasa cuando llegan usuarios?

ApliArte Directo incorpora un motor inteligente de bienvenida (`src/bienvenida-chat.js`) diseñado para dar calor a tu comunidad sin saturar la pantalla ni el chat.

### Paso 1: Detección del primer mensaje
Cuando un espectador escribe un mensaje en el chat de **Twitch** o de **YouTube Live Chat**, el servidor comprueba su historial:
- **Exclusiones de seguridad**: El streamer (`ja`, `apliarte`, `erbolamm`), el bot propio del canal y bots comunes (`nightbot`, `botrix`, `streamelements`, `wizebot`, `moobot`, etc.) quedan automáticamente fuera y nunca generan alertas de bienvenida.

### Paso 2: La regla de las 6 horas
- Si el usuario **no ha escrito hoy** (o han pasado más de 6 horas desde la última vez que se le saludó), se activa el evento de bienvenida.
- Durante las **6 horas siguientes** a ese saludo (`21.600.000 ms`), el usuario puede seguir escribiendo con total normalidad y el sistema no volverá a disparar mensajes de bienvenida.
- Pasadas 6 horas completas de su último saludo, si el espectador vuelve a escribir en un nuevo directo, el sistema le dará de nuevo la bienvenida.

### Paso 3: Protección contra avalanchas y Raids (Agrupación inteligente)
- **Cooldown entre saludos (10 segundos)**: Para evitar que un aluvión repentino de mensajes llene la pantalla de bocadillos, existe un descanso mínimo de 10 segundos entre emisiones de saludo.
- **Cola agrupada**: Si entran muchos espectadores nuevos en pocos segundos:
  1. El primer espectador recibe su saludo de inmediato.
  2. Los siguientes espectadores se van acumulando en una cola en memoria.
  3. Tras expirar los 10 segundos de descanso, el sistema drena la cola en un único saludo colectivo cortés y elegante:
     - En el chat: `¡Bienvenidos/as @user1, @user2 y 8 más al directo! 🎉`
     - En el bocadillo visual: `¡Bienvenidos, user1 y 9 más!`

### Paso 4: Saludo visual en pantalla
- En la fuente de cámara (`/camara.html`), aparece un **bocadillo de cómic animado** con el texto del saludo.
- **Ubicación optimizada**: El bocadillo se sitúa en la parte superior central de la cámara, garantizando que si tienes la cámara real encendida **no te tape la cara**.
- Desaparece suavemente tras unos segundos.

### Paso 5: Fiesta automática (`!fiesta`)
- Con el saludo de bienvenida, el sistema lanza automáticamente una lluvia de confeti y fiesta visual en el diorama 3D.
- **Filtro de seguridad de 30 segundos**: Para no saturar los efectos visuales, entre dos fiestas automáticas debe haber transcurrido un descanso mínimo de 30 segundos (`COOLDOWN_FIESTA_MS`).

### Paso 6: Persistencia en disco (`bienvenida-vistos.json`)
- El estado de usuarios vistos y sus marcas de tiempo se persiste en `${DATA_DIR}/panel/bienvenida-vistos.json`.
- Si reinicias el ordenador o relanzas el directo, el servidor lee el archivo y **recuerda a quién ha saludado en las últimas 6 horas**, limpiando automáticamente los registros más antiguos.

### Paso 7: Siempre activa
- La bienvenida está **siempre activa de serie en el servidor** para que nunca tengas que preocuparte de encenderla al iniciar directo.

---

## 5. Chat Soberano y Botón del Ojo (👁️): Adiós a Botrix

Anteriormente se utilizaba un widget externo de Botrix mediante iframe para visualizar el chat conjunto de varias plataformas. En la arquitectura actual de ApliArte Directo:

1. **Lector Nativo de YouTube (`src/youtube-livechat.js`)**: Lee el chat de YouTube en directo directamente a través de la API ligera InnerTube sin cuotas, sin tokens de Google Cloud y sin servicios intermedios.
2. **Lector Nativo de Twitch**: Conexión directa por WebSocket IRC (`wss://irc-ws.chat.twitch.tv`).
3. **El Botón del Ojo (👁️) en el Panel de Control (`/estudio`)**:
   - **En el Chat**: Abres el panel `http://127.0.0.1:7979/estudio` y tocas la pestaña **Chat** (icono `💬` en la barra inferior). Se abre directamente la lista propia de mensajes en vivo con el botón del ojo **`👁️`** en cada mensaje, sin tener que pulsar nada más.
   - **En el Buzón de SMS**: En la pestaña **SMS** (icono `✉️`), cada mensaje privado del buzón tiene también su botón **`👁️`** / **`En pantalla`**.
   - **Resultado en directo**: Al pulsar cualquier ojo **`👁️`**, el mensaje (o SMS) aparece al instante en OBS en la fuente de navegador `http://127.0.0.1:7979/sms-pantalla.html`, mostrando el avatar del usuario, su nombre y su texto destacado.
   - **Ocultar**: Vuelve a pulsar el ojo **`👁️`** o pulsa la `✕` en el banner superior de `/estudio` para quitarlo inmediatamente de la emisión.

---

## 6. Resumen de Rutas y Compatibilidad del Panel

Para evitar confusiones en el repositorio con versiones anteriores:

- **Panel Unificado Actual**: `http://127.0.0.1:7979/estudio`  
  Es la consola de mando oficial para PC, Mac, tablet o smartphone. Reúne en una sola interfaz reactiva:
  - Selector de escenas y capas visuales.
  - Conmutador de cámara de vídeo y monigote.
  - Relé de micrófono y audio sin retorno.
  - Editor del tema de directo (`!contexto`).
  - Gestión de avatares interactivos.
  - Envío y moderación de SMS y mensajes destacados en pantalla.
  - Lector unificado de chat con botón de ojo 👁️.
  - Interruptor maestro de bienvenida y fiestas.
- **Rutas Legadas de Compatibilidad**:  
  `/admin` y `/pizarra-plus` se mantienen operativas en el servidor como alias compatibles para dispositivos que tengan guardados enlaces antiguos, pero todo el desarrollo y nuevas funciones residen en `/estudio.html`.
