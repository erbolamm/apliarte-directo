# Guía: Acceso Seguro HTTPS y Tailscale para Micrófono y Cámara en Tablet

Esta guía documenta la arquitectura técnica y los pasos de configuración para utilizar una tableta (iPad en iPadOS o tablet Android) como superficie de control con micrófono y cámara inalámbricos en **ApliArte Directo**.

---

## 1. El Problema Técnico: Contexto Seguro (W3C Secure Contexts)

Al acceder al panel de control (`/estudio`) desde una tableta a través de la red local mediante HTTP simple (por ejemplo, `http://192.168.1.22:7979/estudio`):

1. **Restricción de los navegadores**: Los navegadores modernos (Safari en iPadOS/iOS y Chrome en Android) implementan estrictamente la especificación W3C *Secure Contexts*.
2. **Bloqueo de hardware**: Bajo un contexto no seguro (`window.isSecureContext === false`), la API `navigator.mediaDevices.getUserMedia` queda completamente deshabilitada o inaccesible.
3. **Efecto en el panel**:
   - El botón del micrófono muestra la advertencia: *«Este navegador no permite usar el micrófono aquí (hace falta HTTPS o localhost)»*.
   - El selector de dispositivos no puede enumerar las cámaras ni los micrófonos disponibles.
   - El portapapeles asíncrono (`navigator.clipboard`) queda restringido.

> [!IMPORTANT]
> Los navegadores consideran seguro el origen `localhost` y `127.0.0.1` en la máquina local donde corre el servidor, pero **NO** las IPs de la red local privada (como `192.168.1.x`) cuando se accede desde otro dispositivo.

---

## 2. Solución Canónica: Tailscale Serve con HTTPS (Recomendada)

La solución oficial y definitiva en ApliArte Directo es utilizar **Tailscale Serve** en el Mac mini. Tailscale proporciona un nombre de dominio DNS público seguro (`.ts.net`) respaldado por un certificado TLS auténtico emitido por **Let's Encrypt**.

### Dirección de acceso:
```text
https://mac-mini-de-francisco.tailcf5766.ts.net:8446/estudio
```

### Ventajas:
- **Certificado TLS 100% válido**: Sin pantallas de advertencia de «Sitio no seguro» ni excepciones de seguridad.
- **Acceso a hardware**: `window.isSecureContext` es `true`, por lo que Safari y Chrome permiten el uso pleno del micrófono y la cámara.
- **WebSocket seguro (WSS)**: El flujo de datos y audio PCM viaja encriptado sin interferencias de proxies locales.
- **Sin configuración en el router**: No requiere abrir puertos ni gestionar DNS dinámico.

---

## 3. Paso a Paso: Configuración en iPad (Safari / iPadOS)

1. **Instalar Tailscale**:
   - Descarga la aplicación oficial **Tailscale** desde la App Store en el iPad.
   - Inicia sesión con la cuenta de Tailscale del ecosistema (`erbolamm@`).
   - Activa el interruptor de conexión VPN en la app de Tailscale.
   - *Verificación*: En el Mac mini, ejecutando `tailscale status` se confirma la presencia del iPad (por ejemplo `ipad-gen-6` con IP `100.110.106.1`).

2. **Abrir el Estudio en Safari**:
   - Abre Safari en el iPad y navega a:
     `https://mac-mini-de-francisco.tailcf5766.ts.net:8446/estudio`
   - La página cargará con candado verde/seguro de inmediato.

3. **Activar el Micrófono**:
   - Pulsa el icono del micrófono en la barra superior.
   - Safari mostrará el diálogo nativo de permisos del sistema:
     *«"mac-mini-de-francisco.tailcf5766.ts.net" desea acceder al micrófono»*.
   - Pulsa **Permitir**.
   - El botón cambiará a rojo activo con el aviso *«Micrófono en antena»*.
   - Safari recordará este permiso para futuras sesiones en este dominio.

4. **Activar la Cámara**:
   - Pulsa el botón de la cámara o ve a **Ajustes → Cámara**.
   - Selecciona la cámara deseada (Frontal, Trasera o una externa conectada al iPad).
   - El flujo de vídeo se enviará directamente hacia VDO.Ninja y OBS sin restricciones de permisos.

---

## 4. Solución Alternativa: Chrome en Android (sin Tailscale)

Si se utiliza una tableta Android con Google Chrome y no se dispone de la aplicación de Tailscale, Chrome permite habilitar manualmente excepciones para orígenes locales:

1. En la tableta Android, abre Google Chrome.
2. Escribe en la barra de direcciones:
   ```text
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```
3. En el campo de texto que aparece, introduce la URL local del servidor:
   ```text
   http://192.168.1.22:7979
   ```
   *(Sustituye por la IP local real del Mac mini visible en Ajustes → Red).*
4. Cambia el selector a la derecha a **Enabled**.
5. Pulsa el botón azul **Relaunch** en la parte inferior para reiniciar Chrome.
6. Abre `http://192.168.1.22:7979/estudio`: Chrome considerará este origen como seguro (`isSecureContext === true`) y solicitará permiso para el micrófono y la cámara normalmente.

> [!NOTE]
> Esta alternativa **no es aplicable en iPadOS/iOS**, ya que Apple no permite acceder a flags de WebKit en Safari ni en ningún navegador de su App Store. Para iPad, Tailscale Serve HTTPS es la vía mandatoria.

---

## 5. Evaluación Técnica: Certificados Locales Autofirmados (mkcert)

Durante la investigación técnica se evaluó el uso de certificados autofirmados locales generados con `mkcert` para la IP local (`https://192.168.1.22:7979`):

- **Inconvenientes detectados**:
  1. En iPadOS es obligatorio generar un archivo `.mobileconfig`, transferirlo vía AirDrop o correo, instalarlo en Ajustes → Perfil descargado, y posteriormente navegar a *Ajustes → General → Información → Ajustes de confianza de certificados* para habilitar la «Confianza total».
  2. Si el router reinicia o asigna una nueva IP por DHCP al Mac mini, el certificado deja de coincidir y vuelve a fallar.
  3. Los navegadores móviles modernos a menudo rechazan certificados emitidos directamente para IPs numéricas sin nombres SAN válidos.
- **Conclusión**: Tailscale Serve supera en todos los aspectos a los certificados autofirmados al ofrecer certificados válidos de Let's Encrypt con renovación automática y nombre de dominio estable.

---

## 6. Flujo de Audio hacia OBS Studio

Cuando el micrófono de la tableta está en antena:

```
[ Tableta (Safari / Chrome) ]
      │
      │ 1. Audio capturado vía getUserMedia
      │ 2. ScriptProcessor convierte a Int16 PCM (4096 muestras @ 24kHz)
      │ 3. Filtro de puerta de ruido y ganancia aplicada
      │
      ▼  (WebSocket seguro /wss con evento 'voz_pcm')
[ Servidor ApliArte Directo (:7979 / :8446) ]
      │
      │ 4. Difusión broadcast a clientes conectados
      │
      ├───────────────────────────────────────────┐
      ▼                                           ▼
[ OBS: micro-obs.html ]                  [ OBS: plano.html ]
- Reproduce PCM en Web Audio API         - Analiza RMS de audio
- Vúmetro activo y monitorización        - Sincroniza movimiento de boca
- Control de audio vía mezclador OBS       del avatar en 3D
```

### Configuración requerida en OBS Studio:
1. Añade una fuente de tipo **Navegador**.
2. Nombre: `Micrófono Estudio`
3. URL: `http://localhost:7979/micro-obs.html`
4. Ancho: `480`, Alto: `240`
5. **Crucial**: Marca la casilla **«Controlar audio vía OBS»**.
6. En el mezclador de audio de OBS, la fuente aparecerá con su fader independiente para ajustar niveles y aplicar filtros de compresión/ecualización de OBS.
