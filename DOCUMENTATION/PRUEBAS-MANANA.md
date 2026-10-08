# Qué probar mañana

Escrito el 2026-10-09 a las 00:15, al cerrar el día. Todo lo de esta lista está guardado en git, pero **nadie lo ha visto funcionar en pantalla**: solo han pasado las pruebas automáticas (898 de 898). Por eso hay que probarlo.

## Antes de empezar

1. Cierra el directo si sigue abierto y arráncalo de nuevo con doble clic en **«Iniciar directo»**. Hace falta: el servidor que quedó encendido por la noche no tiene lo último (la fila de animaciones y el guardado de dueños).
2. En OBS, recarga todas las fuentes de navegador.
3. En la tableta entra siempre por esta dirección y recarga la página:
   `https://mac-mini-de-francisco.tailcf5766.ts.net:8446/estudio`

## Las pruebas

Marca cada una con **sí** o **no**. Si es no, apunta qué ves.

### 1. Adoptar avatares

- Alguien adopta un avatar desde el chat. Debe salir como dueño.
- Otra persona adopta otro. La primera conserva el suyo.
- Cierra el directo y vuelve a abrirlo. **Los dueños tienen que seguir ahí.** (Nuevo: antes se perdían.)

### 2. El nombre encima del avatar

- Al adoptar, el nombre del usuario se ve encima de su avatar en la vista de OBS.
- Esto no lo ha confirmado nadie. Es lo que más dudas tiene.

### 3. La conga

- Alguien con avatar adoptado escribe `!conga`. Entra con **su** avatar.
- Alguien sin avatar escribe `!conga`. Recibe uno que no es de nadie.
- Al terminar, el avatar prestado se suelta y dice «Adoptadme, por favor».

### 4. La bronca

- Lanza `!bronca`. Los avatares pelean sin quedarse quietos un segundo cada dos por tres.
- La bronca llega al final.

### 5. La fila de animaciones (nuevo)

- Lanza `!fiesta` y, mientras dura, `!bronca`. La bronca **espera** y empieza cuando acaba la fiesta. No se mezclan.
- Lo mismo con `!conga`.
- Mientras hay una en marcha, que alguien nuevo escriba en el chat. Se corta lo que hubiera, se vacía la fila y sale la bienvenida.

### 6. La bienvenida

- Alguien que no ha escrito hoy escribe en el chat. Salen tres cosas: el bocadillo del muñeco de la cámara, el mensaje en el chat y la fiesta.
- No hay que activarla. Ya no existe el botón.
- La misma persona vuelve a escribir: no se le saluda otra vez. Solo pasadas 6 horas.

### 7. El chat con ojos

- En `/estudio`, abre el chat. Se ve **la lista de mensajes con un ojo en cada uno**, sin pulsar nada. No el chat de Twitch.
- Los ojos se ven enteros, no cortados por la derecha.
- Pulsa un ojo. El mensaje sale en la capa de SMS de OBS. Púlsalo otra vez y se quita.

### 8. El contexto

- Escribe `!contexto probando` en el chat. Cambia la barra.
- Mándalo desde los comandos del estudio. También cambia. (Antes no.)

### 9. Claro y oscuro

- Cambia el modo del directo en Ajustes → Escenario. La tarjeta de SMS en OBS cambia en unos 3 segundos.
- Ojo: el botón de sol y luna de arriba **no** es ese. Ese solo cambia el aspecto del panel en ese aparato.
- Si aun así algo no cambia, apunta **dónde**: en la tarjeta de OBS o en la lista del chat del estudio.

### 10. La voz de los avatares

- Un mensaje largo se lee entero.
- Prueba el interruptor de tono en el estudio y decide cuál de los dos modos te gusta.

## Lo que sigue sin hacer

- Guardar los ajustes en el Mac en vez de en cada aparato. Hay propuesta; falta tu sí.
- Quitar Botrix.
- El canal de YouTube está escrito fijo en el código. Hay que quitarlo.
- Limpiar `chat.html`, el visor antiguo.
- El traductor del chat.
- Decidir qué hacer con la carpeta `vps-overlay`. Tiene tres archivos nuevos sin guardar a propósito.
- Subir a GitHub. Lo de esta noche está guardado solo en este ordenador.

## Dos cosas que debes saber

- **El lector del chat de YouTube no es oficial.** Se hace pasar por un navegador. Puede dejar de funcionar cualquier día.
- **El fondo nuevo** (`fondo.html`) está guardado en un commit aparte. Si no te gusta, se quita sin tocar nada más.

## Para empezar con el agente mañana

Dile esto, cambiando la lista por lo que te haya fallado:

> Lee `DOCUMENTATION/PROMPT_ANTIGRAVITY.md` y `DOCUMENTATION/PRUEBAS-MANANA.md`. No añadas nada nuevo. De las pruebas de ayer me han fallado estas: (pon aquí los números). Para cada una, reproduce el fallo primero y enséñame la prueba antes de arreglar nada.
