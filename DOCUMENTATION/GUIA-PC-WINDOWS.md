# 🖥️ Guía de Instalación y Uso en PC (Windows) — ApliArte Directo

> **Para cualquier streamer o creador de contenido que emite desde un PC con Windows.**  
> Esta guía explica paso a paso cómo descargar, arrancar y controlar tu estudio de emisión con avatares 3D interactivos, pizarra táctil en tablet/móvil y OBS Studio.

---

## 📋 ¿Qué es ApliArte Directo?

**ApliArte Directo** es una suite de streaming soberana, local y ligera diseñada para emitir a **Twitch y YouTube** desde tu ordenador con:

1. **Capa interactiva 3D en OBS**: avatares tridimensionales animados que reaccionan a tu voz (lip-sync), reloj digital, alertas y rótulos en tiempo real.
2. **Pizarra táctil para tablet o móvil (`/pizarra-plus`)**: controla tu directo desde el iPad o teléfono sin cambiar de ventana en el PC. Tienes a mano:
   - Activar y apagar la cámara de la tablet con un toque (emitiendo directamente a OBS o volviendo al monigote animado).
   - Silenciar o activar tu micrófono.
   - Activar o parar la voz del chat (Chat TTS).
   - Enviar comandos favoritos al bot de Twitch.
   - Dibujar y rotular en vivo sobre la emisión.
3. **Retransmisión dual local**: emite a Twitch y YouTube simultáneamente a través de un servidor RTMP interno ultra-eficiente sin duplicar el consumo de tu gráfica.

---

## ⚡ Requisitos Previos (Solo se instalan una vez)

Antes de empezar, necesitas dos programas gratuitos en tu PC con Windows:

### 1. Node.js (Motor de ejecución)
- Entra en [nodejs.org](https://nodejs.org) y descarga la versión recomendada **LTS**.
- Ejecuta el instalador `.msi` y pulsa «Siguiente» hasta completar la instalación.

### 2. OBS Studio
- Si aún no lo tienes, descárgalo e instálalo desde [obsproject.com](https://obsproject.com).

### 3. (Recomendado) ffmpeg para emitir a Twitch + YouTube a la vez
- Si quieres que el servidor retransmita tu directo a Twitch y YouTube simultáneamente:
  - Abre el menú Inicio de Windows, escribe **PowerShell** o **Terminal** y pulsa Intro.
  - Escribe el siguiente comando y pulsa Intro:
    ```powershell
    winget install ffmpeg
    ```
  - *(Si no tienes ffmpeg, ApliArte Directo funcionará perfectamente con la capa 3D, pizarra y avatares, emitiendo como siempre directamente desde OBS).*

---

## 🚀 Instalación y Primer Arranque en 3 Pasos

### Paso 1: Descargar el proyecto en tu PC
1. Descarga el repositorio:
   - Puedes descargarlo en formato ZIP pulsando el botón verde **«Code» → «Download ZIP»** en GitHub y descomprimirlo en una carpeta fija (por ejemplo en `C:\apliarte-directo` o en tu carpeta de usuario).
   - O si usas Git:
     ```bash
     git clone https://github.com/erbolamm/apliarte-directo.git
     ```

### Paso 2: Doble clic en `Iniciar directo.bat`
En la carpeta del proyecto verás el archivo:
```text
Iniciar directo.bat
```
Haz **doble clic** sobre él.

- La primera vez tardará entre 1 y 2 minutos mientras descarga e instala automáticamente las dependencias necesarias.
- **MUY IMPORTANTE (Aviso del Firewall de Windows)**:
  - Cuando se inicie por primera vez, Windows Defender mostrará una alerta preguntando:  
    *«El Firewall de Windows Defender ha bloqueado algunas características de Node.js»*.
  - **Debes marcar la casilla «Redes privadas, como las domésticas o del trabajo»**.
  - Pulsa **«Permitir acceso»**.
  - *(Esto es imprescindible para que tu tablet o teléfono móvil puedan conectarse a la pizarra táctil a través de la red Wi-Fi de tu casa).*

### Paso 3: Guardar tu contraseña maestra y enlaces
Al arrancar, el lanzador abrirá automáticamente tu navegador para que elijas tu contraseña privada del panel (guárdala en tu gestor de contraseñas o anótala).

En la ventana negra de la terminal verás un resumen con tus enlaces locales:
```text
✅ ApliArte Directo está funcionando. No cierres esta ventana mientras emites.

📱 Pizarra táctil (Tablet o Móvil en la misma red Wi-Fi):
   http://192.168.1.35:7979/pizarra-plus

En OBS, añade dos «Fuentes de navegador» de 1920 × 1080:
  • Capa (avatares y rótulos):  http://127.0.0.1:7979/plano?transparente=1
  • Cámara (conmutador monigote): http://127.0.0.1:7979/camara.html
  • Fondo animado:              http://127.0.0.1:7979/fondo.html

Panel de control (ordenador):   http://127.0.0.1:7979/admin
```

> 💡 **Consejo**: Deja la ventana negra de la terminal minimizada mientras dure tu directo. Al terminar, simplemente pulsa `Ctrl + C` o cierra la ventana.

---

## 🎬 Configurar OBS Studio en tu PC

Abre OBS Studio en tu ordenador y añade las fuentes a tu escena:

### 1. Fuente 1: Capa de Avatares 3D y Rótulos
1. En el panel de **Fuentes**, pulsa el icono **`+`** y elige **«Navegador»** (Browser Source).
2. Nómbrala `ApliArte - Capa 3D`.
3. Configura:
   - **URL**: `http://127.0.0.1:7979/plano?transparente=1`
   - **Ancho**: `1920`
   - **Alto**: `1080`
   - Marca la casilla **«Actualizar el navegador cuando la escena se active»**.
4. Pulsa **Aceptar**. Verás el escenario transparente con los personajes y el reloj.

### 2. Fuente 2: Cámara y Monigote (Conmutador inteligente)
1. Pulsa **`+`** y añade otra fuente de tipo **«Navegador»**.
2. Nómbrala `ApliArte - Cámara`.
3. Configura:
   - **URL**: `http://127.0.0.1:7979/camara.html`
   - **Ancho**: `1920` (o ajusta al tamaño y posición que prefieras en tu lienzo).
   - **Alto**: `1080`
4. Pulsa **Aceptar**. Mientras no actives la cámara desde la tablet, se mostrará el monigote animado de Javier. En cuanto toques el botón de cámara en la tablet, conmutará suavemente al vídeo en vivo.

### 3. (Opcional) Retransmisión simultánea a Twitch y YouTube
Si quieres emitir a las dos plataformas con una sola salida desde OBS:
1. En OBS, ve a **Ajustes → Emisión**.
2. **Servicio**: Selecciona `Personalizado...`
3. **Servidor**: `rtmp://127.0.0.1:1935/live`
4. **Clave de retransmisión**: escribe cualquier palabra (por ejemplo `directo`).
5. En tu panel de ApliArte (`http://127.0.0.1:7979/admin`), ve a la pestaña de configuración y pega tus claves de transmisión reales de Twitch y YouTube. El servidor de ApliArte distribuirá la señal a ambos sitios automáticamente.

---

## 📱 Conectar tu Tablet o Móvil (Pizarra Táctil)

Para controlar la emisión desde la tablet (iPad, tablet Android o smartphone):

1. Conecta la tablet a la **misma red Wi-Fi** que el PC.
2. Abre el navegador de la tablet (Safari en iPad o Chrome en Android).
3. Introduce la dirección que mostró la terminal al arrancar:
   ```text
   http://<IP-DE-TU-PC>:7979/pizarra-plus
   ```
   *(Por ejemplo: `http://192.168.1.35:7979/pizarra-plus`).*
4. **Guárdala en tu pantalla de inicio**:
   - En iPad / Safari: pulsa el botón Compartir y elige **«Añadir a la pantalla de inicio»**.
   - En Android / Chrome: pulsa los tres puntos y selecciona **«Instalar aplicación»** o **«Añadir a pantalla de inicio»**.
   - Se abrirá a pantalla completa como una aplicación táctil nativa.

### Controles táctiles de la Pizarra:
- **Icono Cámara**: 1 toque para encender tu cámara frontal emitiendo a OBS. Otro toque para apagarla y volver al monigote en OBS.
- **Icono Micrófono**: 1 toque para silenciar o desmutear el micrófono.
- **Icono TTS (Altavoz)**: 1 toque para encender o apagar la lectura por voz del chat.
- **Icono Comandos**: abre tu lista de comandos favoritos del bot con respuestas automáticas.
- **Icono Pizarra (Pantalla)**: despliega el lienzo táctil para dibujar, hacer esquemas o rotular en vivo sobre la retransmisión.
- **Icono Ajustes (Rueda dentada)**: abre el panel completo para cambiar formatos de cámara (16:9 o 1:1 cuadrado), filtros de audio o gestionar avatares.

---

## ❓ Solución de Problemas Frecuentes en Windows

### 1. La tablet no carga la página de la pizarra (`No se puede acceder a este sitio`)
- **Causa más habitual**: El perfil de red de Windows está configurado como «Pública» en vez de «Privada», bloqueando las conexiones entrantes de la Wi-Fi.
- **Solución**:
  1. En tu PC, abre **Configuración de Windows → Red e Internet → Wi-Fi** (o Ethernet).
  2. Haz clic en el nombre de tu red y asegúrate de seleccionar **«Red privada»**.
  3. Comprueba que el PC y la tablet están conectados al mismo router.

### 2. Error `El puerto 7979 ya está en uso`
- **Causa**: Ya había otra ventana de ApliArte Directo abierta anteriormente.
- **Solución**:
  - Abre el Administrador de Tareas de Windows (`Ctrl + Shift + Esc`).
  - Busca en la lista de procesos **«Node.js: Server-side JavaScript»**, selecciónalo y pulsa **«Finalizar tarea»**.
  - Vuelve a ejecutar `Iniciar directo.bat`.

### 3. ¿Cómo saber cuál es la IP de mi PC manualmente?
- Pulsa la tecla `Windows + R`, escribe `cmd` y pulsa Intro.
- Escribe `ipconfig` y busca la línea que dice **Dirección IPv4** (suele empezar por `192.168.1.X` o `192.168.0.X`).
- Esa es la IP que debes escribir en la tablet: `http://192.168.1.X:7979/pizarra-plus`.

---

## 🏁 Rutina Diaria de Emisión en PC

Una vez configurado todo la primera vez, tu rutina diaria para hacer directo será simplemente:

1. **Doble clic en `Iniciar directo.bat`** en tu PC.
2. **Abrir la Pizarra en la tablet** tocando el icono de la pantalla de inicio.
3. **Abrir OBS Studio** y pulsar **«Iniciar transmisión»**.
4. ¡A disfrutar del directo con tu comunidad!
