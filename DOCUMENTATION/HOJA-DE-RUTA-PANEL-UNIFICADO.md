# 🗺️ Hoja de Ruta y Auditoría: Panel Unificado de ApliArte Directo (`estudio.html`)

> **Mandato Canónico de Javier Mateo (2026-10-07)**:  
> Unificar la dualidad entre el panel antiguo (`admin.html`) y la pizarra (`pizarra-plus.html`) en un **único documento HTML limpio, moderno y compacto** (`estudio.html`).  
> **Regla de oro de seguridad**: NO se toca ni modifica nada del código actualmente en producción (`admin.html`, `pizarra-plus.html`). Todo se construye de forma limpia y nueva sobre una base auditada.  
> **Destinatario de este encargo**: Claude (`mr-claude`) para deliberación y ejecución estructurada.

---

## 📌 1. Principios y Requisitos Canónicos de Diseño

1. **Un solo HTML compacto y soberano**:
   - Archivo destino: `public/estudio.html` (o montado en `/estudio` / `/directo`).
   - Código limpio, semántico, sin librerías externas pesadas, responsive para PC de sobremesa, tablet (iPad) y móvil.
2. **Pantalla inicial de Bienvenida (Pre-arranque)**:
   - Cabecera oficial: *«Bienvenido a ApliArte Directo, by apliarte.com»*, con su favicon e identidad visual oficial.
   - Botón destacado: **«Arrancar Estudio»**.
3. **Validación previa de credenciales (Paso 0 obligatorio)**:
   - Antes de permitir arrancar, el sistema comprueba los requisitos mínimos. Si faltan credenciales indispensables (clave de emisión de Twitch `TWITCH_STREAM_KEY`, tokens API), **no se puede arrancar** y se exige introducirlas en ese momento.
   - La clave de YouTube (`YOUTUBE_STREAM_KEY`) es explícitamente **opcional**.
   - Cada campo de contraseña o clave confidencial incluye un botón de **ojo** para alternar entre ocultar (`type="password"`) y mostrar (`type="text"`).
4. **Fuentes OBS con botón de copia infalible**:
   - Explicación clara de qué fuentes añadir en OBS (Capa 3D de 1920×1080 y Cámara/Monigote).
   - Botón de **copiar garantizado** con doble mecanismo (Clipboard API nativo con fallback automático a `textarea` temporal y `execCommand('copy')` para garantizar funcionamiento en cualquier navegador o red local HTTP).
5. **Vista de Estudio en ejecución (Post-arranque)**:
   - Al pulsar arrancar, la vista principal es la **interfaz limpia del estudio** (el lienzo de dibujo táctil 16:9 con toggle de mostrar/ocultar y la barra de herramientas centrada con los conmutadores directos de 1 toque).
   - **Botón rojo de Apagar único**: situado arriba a la derecha (`#btn-apagar-estudio`), ejecuta el apagado limpio de servidores con modal de confirmación previa. **Será el único botón rojo** de toda la interfaz.
   - Toda la paleta visual se ajusta al **ApliArte Brand Kit** (`#005fa9`, `#0284c7`, `#1e293b`), con soporte completo de **Modo Claro** y **Modo Oscuro**.
6. **Menú de Ajustes (Settings) con navegación lateral profesional**:
   - Al pulsar la rueda dentada de Ajustes, se abre un panel moderno con **pestañas laterales ordenadas** en vez de apartados desordenados:
     1. 🔑 **Credenciales y APIs**
     2. 🎥 **Cámara y Vídeo**
     3. 🎙️ **Audio y Filtros**
     4. 🎭 **Escenario y Avatares 3D**
     5. 🤖 **Comandos de Bot y Listas**
     6. 🎨 **Apariencia y Sistema**

---

## 🔍 2. Auditoría Exhaustiva de Controles Actuales

Para asegurar que no falte ningún botón ni endpoint y que nada quede duplicado, a continuación se inventarían todos los elementos existentes en `public/admin.html` y `private/pizarra-plus.html`.

### A. Inventario de `public/admin.html` (Panel Antiguo)

| ID / Selector | Tipo | Función actual | Ubicación en Nuevo Panel (`estudio.html`) |
| --- | --- | --- | --- |
| `#btn-finalizar-emision` | Botón peligro | Finalizar directo y detener RTMP limpiamente | **Botón rojo único** arriba a la derecha con modal de confirmación. |
| `#btn-emision-pantalla-negra` | Botón negro | Pantalla negra con Wake Lock para ahorro OLED | Accesible desde la barra de herramientas o pestaña Sistema. |
| `#card-obs-fuentes-directo` | Sección | URLs de fuentes OBS (Plano, VDO, Micro, Chat) | **Pantalla de Bienvenida (Paso 0)** + Pestaña Ajustes → Sistema. |
| `.btn-copiar-obs` | Botones | Copiar enlaces de OBS al portapapeles | Reescritos con función de copia infalible con fallback. |
| `#btn-micro-toggle` | Botón primary/danger | Conmutar micrófono en vivo (WebRTC / WebSocket) | **Barra de herramientas**: Conmutador directo de 1 toque. |
| `#btn-toggle-micro-denoise` | Botón toggle | Supresión de ruido ambiental | Pestaña lateral: **Audio y Filtros**. |
| `#btn-toggle-micro-eco` | Botón toggle | Cancelación de eco acústico | Pestaña lateral: **Audio y Filtros**. |
| `#slider-micro-gain` | Input range | Ganancia de micrófono (0.5x – 3.0x) | Pestaña lateral: **Audio y Filtros**. |
| `.btn-gain-preset` | Botones | Presets de ganancia (0.8x, 1.5x, 2.2x) | Pestaña lateral: **Audio y Filtros**. |
| `#vumetro-bar`, `#vumetro-db` | Barra + Texto | Monitor de volumen en tiempo real | Pestaña lateral: **Audio y Filtros** (y badge opcional en barra). |
| `#btn-toggle-camara-modo` | Botón primary | Activar cámara de dispositivo hacia OBS | **Barra de herramientas**: Conmutador directo de 1 toque. |
| `#btn-apagar-camara` | Botón danger | Apagar cámara y volver a monigote en OBS | **Barra de herramientas**: Segundo toque en el botón de cámara. |
| `#btn-cam-facing-user` | Botón toggle | Seleccionar cámara frontal (selfie) | Pestaña lateral: **Cámara y Vídeo**. |
| `#btn-cam-facing-back` | Botón toggle | Seleccionar cámara trasera (ambiente) | Pestaña lateral: **Cámara y Vídeo**. |
| `#btn-cam-switch-toggle` | Botón | Conmutar rápidamente frontal/trasera | Pestaña lateral: **Cámara y Vídeo**. |
| `#select-camara-dispositivo` | Select | Elegir dispositivo de cámara físico | Pestaña lateral: **Cámara y Vídeo**. |
| `#select-camara-calidad` | Select | Resolución y bitrate de emisión (1080p, 720p, 480p) | Pestaña lateral: **Cámara y Vídeo**. |
| Botones Aspecto (16:9 / 1:1) | Botones | Alternar entre marco panorámico 16:9 y cuadrado 1:1 | Pestaña lateral: **Cámara y Vídeo**. |
| `#btn-toggle-camara-preview` | Botón toggle | Ocultar/mostrar vista previa local de cámara | Pestaña lateral: **Cámara y Vídeo**. |
| `#card-videos-directo` | Sección | Cola de vídeos para emitir en directo | Pestaña lateral: **Escenario y Avatares 3D**. |
| `#btn-toggle-modo` | Botón | Alternar Modo Claro / Modo Oscuro | Pestaña lateral: **Apariencia y Sistema** (o cabecera). |
| `.cat-btn` (`data-cat`) | Botones | Cambiar categoría en Twitch (Apps, Música, Arte...) | Pestaña lateral: **Escenario y Avatares 3D**. |
| `#tts-canal`, `#tts-voz` | Input / Select | Configurar canal y voz de Chat TTS | Pestaña lateral: **Audio y Filtros**. |
| `#btn-probar-tts` | Botón | Probar audio de síntesis de voz | Pestaña lateral: **Audio y Filtros**. |
| `#btn-tts-main-toggle` | Botón | Conmutar escucha en vivo de Chat TTS | **Barra de herramientas**: Conmutador directo de 1 toque. |
| Pestaña Chat (`#tab-chat`) | Main / Iframe | Chat de Twitch o Botrix embebido | Hoja lateral de Chat desplegable con `#btn-chat-view`. |
| Pestaña SMS (`#tab-sms`) | Main | Visualizar y proyectar mensajes SMS | Pestaña lateral: **Escenario y Avatares 3D**. |
| Pestaña Juegos (`#tab-juegos`) | Main | Panel de minijuegos para el chat | Pestaña lateral: **Comandos y Bot**. |
| Pestaña Comandos (`#tab-comandos`) | Main / Grid | Lista y edición de comandos del bot | Pestaña lateral: **Comandos y Bot** + Hoja rápida. |
| Modal Credenciales (`#modal-config-obs`) | Modal / Inputs | Claves de Twitch, YouTube, tokens API | **Paso 0 Bienvenida** + Pestaña lateral: **Credenciales y APIs**. |

---

### B. Inventario de `private/pizarra-plus.html` (Pizarra Táctil Actual)

| ID / Selector | Función | Ubicación en Nuevo Panel (`estudio.html`) |
| --- | --- | --- |
| `#draw-canvas` | Lienzo interactivo 16:9 de dibujo | **Área central del Estudio** (conmutador mostrar/ocultar). |
| `#toolbar` | Barra flotante de herramientas centrada | **Barra inferior de control directo**. |
| `#btn-toggle-board` | Desplegar o replegar lienzo de dibujo | Botón toggle en la barra. |
| `#btn-draw-panel` | Paleta de dibujo (16 colores, tamaños, goma) | Hoja/panel de dibujo desplegable. |
| `#btn-undo`, `#btn-redo` | Deshacer y rehacer trazos | Botones directos en la barra. |
| `#btn-clear` | Limpiar lienzo completo | Botón directo en la barra. |
| `#btn-device-camera` | 1 toque: activar cámara / apagar monigote | Botón directo en la barra con feedback `.danger`. |
| `#btn-tablet-mic` | 1 toque: activar / silenciar micrófono | Botón directo en la barra con feedback `.danger`. |
| `#btn-tts` | 1 toque: activar / parar voz de Chat TTS | Botón directo en la barra con feedback `.active`. |
| `#btn-commands-view` | Abre hoja de comandos favoritos (con «Ver todos») | Botón directo en la barra. |
| `#btn-chat-view` | Abre hoja de chat en vivo | Botón directo en la barra. |
| `#btn-obs-menu` | Abre hoja de escenas y fuentes OBS | Botón directo en la barra. |
| `#btn-settings` | Abre Ajustes | Botón rueda dentada que abre el panel lateral de Ajustes. |
| `#black-screen-overlay` | Cortina negra OLED con Wake Lock | Accesible desde Ajustes o atajo. |
| `#cmd-modal` | Asistente de parámetros de comando (`[usuario]`, etc.) | Diálogo modal centrado para comandos. |
| `#item-modal` | Añadir nuevo comando, usuario o canal rápido | Integrado en la pestaña Comandos y en el asistente. |

---

## 🛠️ 3. Arquitectura del Nuevo Panel Unificado (`estudio.html`)

### Estructura de Pantallas y Estados

```
[ Estado 1: Bienvenida y Verificación Previa ]
┌───────────────────────────────────────────────────────────────┐
│  ApliArte Directo — Bienvenido a ApliArte Directo, by apliarte.com │
│                                                               │
│  ⚠️ Configuración Previa Necesaria (Paso 0):                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Clave de emisión Twitch (Obligatoria): [ ****** ] 👁️   │  │
│  │ Clave de emisión YouTube (Opcional):    [ ****** ] 👁️   │  │
│  │ Token API Twitch (Obligatorio):         [ ****** ] 👁️   │  │
│  │ [ Guardar Credenciales ]                                │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  🎥 Fuentes para OBS Studio:                                  │
│  • Capa 3D (1920x1080):  http://127.0.0.1:7979/plano... [Copiar] │
│  • Cámara (1920x1080):   http://127.0.0.1:7979/camara...[Copiar] │
│                                                               │
│                   [ ▶ ARRANCAR ESTUDIO ]                      │
└───────────────────────────────────────────────────────────────┘
                               │
                               ▼ (Al arrancar con credenciales válidas)
[ Estado 2: Estudio en Ejecución ]
┌───────────────────────────────────────────────────────────────┐
│ ApliArte Directo                                [ 🛑 APAGAR ] │
│ ───────────────────────────────────────────────────────────── │
│                                                               │
│               [ LIENZO 16:9 DE LA PIZARRA ]                   │
│                                                               │
│                                                               │
│ ───────────────────────────────────────────────────────────── │
│   [Lienzo] [Lápiz] [Undo] [Redo] [Clear] | [📹] [🎙️] [🔊]   │
│                 | [⭐ Comandos] [💬 Chat] [🎥 OBS] [⚙️ Ajustes]│
└───────────────────────────────────────────────────────────────┘
                               │
                               ▼ (Al pulsar ⚙️ Ajustes)
[ Modal / Sheet: Ajustes con Navegación Lateral ]
┌───────────────────────────────────────────────────────────────┐
│ AJUSTES                                                   [✕] │
│ ┌───────────────┬───────────────────────────────────────────┐ │
│ │ 🔑 Claves     │ Clave de emisión Twitch: [ ****** ] 👁️    │ │
│ │ 🎥 Cámara     │ Clave de emisión YouTube: [ ****** ] 👁️   │ │
│ │ 🎙️ Audio      │ Token de Chat:           [ ****** ] 👁️    │ │
│ │ 🎭 3D/Escena  │                                           │ │
│ │ 🤖 Comandos   │ [ Guardar Cambios ]                       │ │
│ │ 🎨 Apariencia │                                           │ │
│ └───────────────┴───────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 📋 4. Plan de Acción por Fases para Claude (`mr-claude`)

### Fase 1: Estructura y Estilos Base en `public/estudio.html`
- Crear el nuevo archivo `public/estudio.html` sin tocar `admin.html` ni `pizarra-plus.html`.
- Incorporar variables CSS canónicas del Brand Kit de ApliArte (azul `#005fa9`, `#0284c7`, paleta oscura `#090d16` y `#131b2e`, paleta clara `#ffffff` y `#f8fafc`).
- Implementar la función infalible de copia al portapapeles con fallback seguro.
- Diseñar la pantalla de bienvenida y el contenedor principal del estudio.

### Fase 2: Lógica de Verificación Previa (Paso 0)
- Conectar con los endpoints `/api/directo/camara/config` y `/api/panel/credenciales`.
- Verificar si existen las credenciales obligatorias (`TWITCH_STREAM_KEY`, etc.).
- Bloquear el botón «Arrancar Estudio» hasta que las credenciales obligatorias estén cumplimentadas.
- Añadir el botón de ojo (`👁️`) en cada campo de contraseña para alternar visibilidad.

### Fase 3: Integración del Motor de Estudio y Botón de Apagado Único
- Integrar el lienzo de dibujo táctil y la barra de herramientas centrada con los 1-tap direct toggles (`#btn-device-camera`, `#btn-tablet-mic`, `#btn-tts`).
- Añadir en la esquina superior derecha el botón rojo de apagado (`#btn-apagar-estudio`), conectándolo al endpoint `/api/directo/finalizar` con diálogo de confirmación previo.
- Verificar que sea el **único botón rojo** de toda la interfaz.

### Fase 4: Panel de Ajustes con Pestañas Laterales Profesionales
- Implementar el componente de navegación lateral para el modal de Ajustes.
- Trasladar y reorganizar limpiamente todos los controles auditados de `admin.html`:
  - Pestaña 1: Credenciales y APIs (con botones de ojo).
  - Pestaña 2: Cámara y Vídeo (conmutación 16:9 vs 1:1, selector frontal/trasera, calidad).
  - Pestaña 3: Audio y Filtros (denoise, eco, ganancia con presets, vúmetro).
  - Pestaña 4: Escenario y Avatares 3D (escenas OBS, avatares, fondo animado).
  - Pestaña 5: Comandos y Bot (cuadrícula, parámetros, listas rápidas).
  - Pestaña 6: Apariencia y Sistema (toggle Claro/Oscuro, IPs de red local).

### Fase 5: Pruebas Automatizadas y Verificación Final
- Crear suite de tests `test/estudio.test.js`.
- Comprobar que todos los endpoints existentes responden y se sincronizan correctamente.
- Validar en navegador de PC (Chrome/Edge/Firefox) y en tablet (Safari en iPad / Chrome en Android).
