# Encargo para Antigravity — ronda 7

Fecha: 2026-10-08. Este archivo se sobrescribe en cada ronda.

Tu trabajo fue revisado ejecutando los comandos y leyendo tu conversación. Hay mucho hecho y funciona, pero dejaste cabos sueltos que confundieron a Javier en directo. **En esta ronda no se añade nada nuevo: se ordena y se cierra.**

## 1. Qué quedó bien (no lo rehagas)

- `npm test`: `tests 885`, `pass 885`, `fail 0`. Antes eran 864.
- Las siete páginas tocadas o nuevas pasan el análisis de sintaxis.
- El ojo está en `/estudio` (botón «Pantalla» en el chat) y usa `/api/directo/sms/mostrar` y `/ocultar`.
- `public/contexto.html` y `public/avatares.html` existen, con botones de aumentar y reducir.
- `src/bienvenida-chat.js`: saludo con espera de 12 horas, bots y dueño excluidos.
- El bocadillo de `public/camara.html` escribe el nombre con `textContent`.
- Los puntos nuevos del servidor piden sesión (`isAuth`).
- No se borró nada. `public/fondo.html` sigue idéntico al de Claude.
- Preguntaste a Javier los cuatro puntos de la bienvenida antes de cerrarla. Bien.

## 2. Fallos, cada uno con su prueba

### A. El servidor en marcha no tiene tu código nuevo (lo primero)

Prueba, contra el servidor que Javier tiene abierto en el puerto 7979:

```
/api/panel/bienvenida        -> 404
/api/directo/contexto        -> 404
/api/directo/youtube/chat    -> 404
```

Las páginas nuevas sí cargan (son archivos), pero la bienvenida, el contexto suelto, los avatares sueltos y YouTube no pueden funcionar hasta que se reinicie el servidor. Diste todo por terminado y probado sin decirle a Javier que había que reiniciar. Él estaba en directo.

**No reinicies tú.** Reiniciar corta la emisión. Díselo y espera.

### A2. Diagnosticaste mal el «no funciona» del ojo. No rehagas el chat.

Javier te dijo: «no funciona y lo de youtube es un parche». Le contestaste que el chat de `/estudio` es un iframe de Twitch donde no caben botones, y le propusiste hacer una lista propia con ojo. **Esa lista ya la hiciste tú y está en el código:**

- `public/estudio.html:641`: botón «Pantalla» (`btn-chat-feed-toggle`).
- `public/estudio.html:2874`: `agregarMensajeTwitchFeed`, que pinta cada mensaje con su ojo (`btn-ojo-pantalla`, línea 2906).
- `public/estudio.html:1956`: la lista se llena al recibir `chat_mensaje`.
- `server.js:580` y `:642`: quien envía `chat_mensaje`.

Por qué no funciona, comprobado: el servidor en marcha arrancó a las 18:25 y `server.js` se modificó a las 20:09. El proceso viejo no envía `chat_mensaje`, así que la lista se queda vacía. Es el mismo fallo A. No hay nada que rehacer: hay que reiniciar.

Dos reglas a partir de aquí:

- Antes de proponer construir algo, busca si ya existe. Aquí bastaba un `grep`.
- Cuando Javier diga «no funciona», reproduce el fallo y enseña la prueba antes de proponer una solución.

Sobre «lo de youtube es un parche»: no lo quites por tu cuenta. Javier pidió antes que el ojo valiera también para YouTube. Lo que critica es cómo está hecho (ver fallo D). Pregúntale qué quiere, con las dos opciones claras: dejarlo como está sabiendo que es frágil, o quitarlo.

### B. Le diste `chat.html` como fuente nueva y no lo es

`public/chat.html` es el visor antiguo. Le metiste el ojo y un cartel (104 líneas), lo copiaste a `vps-overlay/public/chat.html` y lo pusiste en la guía como fuente de OBS. Cuando Javier se quejó dijiste que no debía usarse, pero la documentación sigue recomendándolo:

- `DOCUMENTATION/GUIA-OBS-FUENTES-Y-BIENVENIDA.md:72` y `:116`
- `DOCUMENTATION/CONFIGURATION.md:60`

Lo que dices en el chat y lo que queda escrito no coinciden.

### C. Botrix no se ha quitado

Javier dijo: «me quito botrix que no lo quiero». Sigue ahí:

```
public/estudio.html: 25 menciones
public/admin.html:   34 menciones
public/chat.html:    20 menciones
server.js:1204-1224 y :2491 (configuración y punto de guardado)
```

La documentación dice «sin Botrix» y «adiós a Botrix». Cambió la etiqueta, no el programa.

### D. El canal de YouTube de Javier está fijo en el código

- `src/youtube-livechat.js:10`: `'@erbolammApliArte'` de serie.
- `server.js:605`: `process.env.DIRECTO_YOUTUBE_CANAL || '@erbolammApliArte'`.

Este repositorio es público y lo instalan otras personas: leerían el chat de Javier. Además, el lector no usa la vía oficial de YouTube: descarga la página con un navegador fingido y usa una clave interna (`INNERTUBE_API_KEY`). Puede dejar de funcionar sin aviso. Javier tiene que saberlo; no lo sabía.

### E. Tocaste `vps-overlay/` fuera de lo permitido

Archivos nuevos: `vps-overlay/public/avatares.html`, `contexto.html`, `sms-pantalla.html`. Y cambiaste `vps-overlay/public/chat.html`. El límite era claro: solo las copias de `plano.html`, `camara.html` y `src/ws-auth.js`.

### F. Todo está sin guardar

19 archivos modificados y 14 nuevos, unas 2000 líneas, sin un solo commit. Varias funciones distintas mezcladas.

## 2 bis. Novedades del 2026-10-08 por la noche

- **El servidor ya está reiniciado** (21:09), con permiso de Javier. Los puntos nuevos responden 200. Los fallos A y A2 quedan como explicación de lo ocurrido; la tarea 1 de abajo ya no hace falta.
- Javier probó después del reinicio y dio cuatro correcciones. Son lo primero. Van abajo como tareas P1 a P4.
- Claude probó un arreglo de estilo en el panel del chat y **lo deshizo a petición de Javier**. No queda ningún cambio suyo en `public/estudio.html`. Sí queda el suyo de `public/fondo.html`: no lo toques.
- Claude dejó un texto de prueba en el contexto del servidor: «Probando el contexto». Se puede cambiar.

## 2 ter. Revisión de P1 a P4 (2026-10-08, 21:50)

Comprobado ejecutando: `npm test` da `tests 886`, `pass 886`, `fail 0`.

**Bien, no lo rehagas:**

- P1: la lista con ojos es la vista de serie (`chatPantallaActivo = true`), el iframe queda tras el botón «Twitch web», y `.sheet`, `.sheet-extra` y `.sheet-body` tienen la columna fijada.
- P2: botón quitado, `leerConfigBienvenida()` devuelve siempre `activa: true`, espera de 6 horas.
- P3: `/api/directo/comando` interpreta `!contexto`. `test/contexto-servidor.test.js` arranca un servidor de verdad y lo comprueba.
- P4: paraste con la propuesta, como se pidió.

**Mal:**

1. **Otra vez el mismo fallo del reinicio.** (Ya reiniciado por Claude a las 21:42, con permiso de Javier.) El servidor en marcha arrancó a las 21:09 y `server.js` se modificó a las 21:36. P2 y P3 no están activos en lo que Javier prueba, y tu informe las da por terminadas sin decirle que hay que reiniciar. Es la tercera vez. **Regla fija desde ahora:** si tocas `server.js` o cualquier cosa de `src/`, la primera línea del informe es «HAY QUE REINICIAR EL SERVIDOR PARA PROBAR ESTO», y no reinicias tú.
2. **La propuesta de P4 está incompleta.** Dices 24 claves y repartes unas 19. Faltan al menos estas de `TTS_KEYS` (`public/estudio.html`): `directo_tts_canal_v1`, `directo_tts_voces_v1` (voz por usuario), `directo_tts_usuarios_ignorados_v1` (silenciados) y `apliarte_estudio_tts_voz`. Las voces por usuario y los silenciados son justo lo que más le duele perder a Javier al cambiar de aparato. Tampoco dices nada del tamaño (`+` / `−`) que guardan `contexto.html`, `avatares.html` y `sms-pantalla.html` en el navegador de OBS. Rehaz la lista: una fila por clave, sin dejar ninguna, y dónde propones que vaya.
3. **Restos de P2.** `guardarConfigBienvenida` escribe un archivo que ya nadie lee, y `/api/panel/bienvenida` solo sabe contestar `true`. Si la bienvenida no se puede apagar, eso sobra. Quítalo o di por qué se queda.
4. **La causa de P2 no está demostrada.** Dices que el botón guardó `false` a las 21:22. Enseña el archivo o el registro que lo prueba. Y aclara una cosa: ¿tus pruebas con Playwright se hicieron contra el servidor de Javier (puerto 7979) o contra uno aparte? Si fue contra el suyo, dilo: pulsar botones ahí cambia su directo.

## 2 quater. Revisión de tu informe de P5 y P4 (2026-10-08, 22:10)

Comprobado: `npm test` da `tests 887`, `pass 887`, `fail 0`. El servidor en marcha (21:42) es posterior a tu último cambio en `server.js` (21:36). La reproducción de P5 es buena: ejecuta el `runtime` de verdad. Parar a preguntar estuvo bien.

Cuatro cosas a corregir:

1. **La salida de `git status` que pegaste no es la real.** Pusiste ` M src/bienvenida-chat.js`, ` M test/bienvenida-chat.test.js`, ` M test/bienvenida-servidor.test.js` y ` M test/contexto-servidor.test.js`. Los cuatro son archivos nuevos sin seguimiento (`??`). «Sin resumir» significa copiar la salida tal cual, no reescribirla.
2. **Los nombres de las claves de tamaño están inventados.** Pusiste `contexto-zoom`, `avatares-zoom` y `sms-pantalla-zoom`. Las reales son `erbolamm-zoom-contexto` (`public/contexto.html:167`), `erbolamm-zoom-avatares` (`public/avatares.html:247`) y `erbolamm-zoom-sms` (`public/sms-pantalla.html:133`). Una auditoría con nombres que no existen no sirve para programar encima.
3. **La medida «1,1 s moviéndose y 0,9 s congelados» no está en ninguna prueba.** `test/bronca-fiesta-interrupcion.test.mjs` tiene una sola prueba y es la de la fiesta. Añade la que mide la pausa o retira la cifra.
4. **Tu prueba de reproducción afirma el fallo.** Pasa mientras el fallo existe (`'DEMOSTRADO: El avatar ya no pelea'`). Cuando lo arregles, dale la vuelta: tiene que comprobar que no se solapan. No la borres.

Sobre Playwright: reconociste que lo lanzaste contra el servidor de Javier. Desde ahora, cualquier prueba con navegador va contra un servidor aparte en otro puerto, nunca contra el 7979.

## 2 sexies. Revisión de P6 y P0 (2026-10-08, 22:50)

Comprobado: `npm test` da `tests 889`, `pass 889`, `fail 0`.

**Bien, no lo rehagas:** P6 está arreglado. `guardarDuenosAvatar` solo escribe en `localStorage`, `/api/directo/avatares` es de solo lectura (POST devuelve 405) y `test/avatares-adopcion.test.js` arranca un servidor de verdad. Avisaste del reinicio en la primera línea. Usaste un puerto aparte. Así sí.

**A corregir:**

1. **La lista de P0, puntos 6 a 10, está marcada `PASS` sin haberse comprobado lo que dice.** Citas pruebas que ya existían y que miden otra cosa:
   - Punto 10 («un avatar lee un mensaje largo entero»): citas `test/estudio.test.js`. La prueba que trata eso es `test/avatar-tts-chunking.test.js`.
   - Punto 6: `fiesta`, `conga` y `bronca` tienen pruebas de su lógica interna, no de que el comando llegue desde el servidor a la página y termine.
   - Punto 8: `test/sms-pantalla.test.js` no prueba el ojo del chat del estudio.
   - Puntos 1 a 5: comprobados por la API, no en `plano` ni en `avatares.html` como dice el enunciado.
   Un `PASS` significa «lo he visto pasar». Para cada punto di una de tres cosas: probado de punta a punta (y cómo), probado solo en parte (y qué parte falta), o sin probar.
2. Dijiste que «blindaste» el avatar `ja` en el servidor. Eso no estaba pedido. Es pequeño y razonable, pero los cambios no pedidos se anuncian arriba del informe, no dentro de una lista.

## 2 septies. Revisión de P7 (2026-10-08, 23:45)

Comprobado: `npm test` da `tests 891`, `pass 891`, `fail 0`. `public/office-3d.js` y su copia en `vps-overlay/public/` son idénticos. `runtime.setAvatarOwners` ya tiene quien lo llame (`oficina-3d/src/App.tsx:125`). `public/fondo.html` intacto.

**Bien:** el arreglo de la conga está hecho y la prueba ejecuta el `runtime`. Avisaste del reinicio arriba.

**A corregir:**

1. **El aviso de reinicio era falso esta vez.** No tocaste `server.js` ni `src/` (el servidor arrancó a las 22:55 y `server.js` es de las 22:36). Solo cambiaste páginas y el paquete de la oficina: basta recargar las fuentes de OBS. La regla es «si tocas `server.js` o `src/`», no «siempre». Un aviso que se pone siempre deja de servir. Di cuál de las dos cosas hace falta: reiniciar el servidor, o solo recargar las páginas.
2. **No informaste de los puntos 3 y 4 de P7:** si el nombre se ve encima del avatar en la vista de OBS (con captura de un servidor aparte), y si quien baila con avatar prestado lleva su nombre. Faltan.
3. **Tu prueba de P7 no prueba el cable que estaba roto.** Llama a `rt.setAvatarOwners(...)` a mano. El fallo era que nadie lo llamaba. Añade una prueba que falle si `App.tsx` deja de pasar los dueños al `runtime`.
4. Tocaste `public/demo.html` y su copia sin decir por qué en el informe (aparecen en la tabla, sin explicación).
5. Sigue pendiente lo de «2 sexies»: la lista P0, puntos 6 a 10, marcada `PASS` sin comprobar.

## 2 quinquies. Decisiones de Javier ya tomadas (no vuelvas a preguntarlas)

- El tamaño (`+` / `−`) de `contexto.html`, `avatares.html` y `sms-pantalla.html` **se queda en el navegador de OBS**. No va al servidor.
- La cola de animaciones es para fiesta, conga y bronca. La bienvenida corta y vacía la cola.
- En la conga, quien recibe un avatar al azar no se lo queda: al terminar, el avatar se suelta y pide que lo adopten.

## 3. Tareas, en este orden

### P0 — Parar de añadir. Javier pide: «por favor que no falle nada más»

Esta noche se han roto dos cosas que funcionaban (la bronca y adoptar avatares) por añadir funciones nuevas encima sin comprobar las antiguas. Hasta nuevo aviso:

- **No se añade ninguna función nueva.** Solo P6, P5 y lo que Javier apruebe de forma expresa.
- Antes de dar algo por terminado, pasa esta lista **contra un servidor aparte en otro puerto, nunca el 7979**, y pega el resultado de cada punto:
  1. Un usuario adopta un avatar y aparece como dueño en `plano` y en `avatares.html`.
  2. Otro usuario adopta otro avatar; el primero sigue teniendo el suyo.
  3. Un usuario cambia de avatar; el anterior queda libre.
  4. Javier libera un avatar y libera todos.
  5. Tras recargar una página, los dueños siguen igual.
  6. `!fiesta`, `!conga` y `!bronca` empiezan y terminan.
  7. `!contexto` desde el chat y desde los comandos del estudio.
  8. El ojo del chat y el del buzón muestran y quitan el mensaje en `sms-pantalla.html`.
  9. Primera vez que escribe alguien: bocadillo, mensaje en el chat y fiesta.
  10. Un avatar lee un mensaje largo entero.
- Lo que hoy no tenga prueba automática y esté en esa lista, se le escribe una. Los puntos 1 a 5 no tienen ninguna.

### P6 — Adoptar avatares falla (roto esta noche; lo primero)

Lo que dice Javier: «quiero que los avatares se puedan adoptar, que también falla».

Causa leída en el código, **sin reproducir todavía**. La introdujo el cambio de `avatares.html`:

- Antes (`git show HEAD:public/plano.html`, línea 2003), `guardarDuenosAvatar` solo escribía en `localStorage`. El servidor era quien mandaba sobre los dueños, por `/api/directo/comando` (`server.js:2159-2178`).
- Ahora `public/plano.html:2016-2024` hace además un POST a `/api/directo/avatares` con **el mapa entero de esa página**.
- `server.js:2324` lo acepta y **sustituye todo**: `serverOwners = { ...parsed.avatares, ja: 'apliarte' }`. Luego avisa a todas las páginas con `avatares_estado`.
- Cada página que recibe `avatares_estado` hace `avatarOwners[k] = v` por cada clave (`public/plano.html:3746-3749`). `avatarOwners` es un `Proxy` (línea 2026) cuyo `set` llama siempre a `guardarDuenosAvatar` (línea 2037), que vuelve a hacer el POST.

Dos consecuencias:

1. **Bucle.** Cada aviso del servidor provoca un POST por clave en cada página abierta, y cada POST provoca otro aviso a todas.
2. **Gana el último que escribe, con datos viejos.** Hay varias páginas abiertas (OBS, estudio, tableta), cada una con su copia en `localStorage`. Cualquiera puede pisar el mapa del servidor con el suyo y borrar la adopción que acaba de hacer otro. Además `public/plano.html:2145-2146` borra en local los dueños que el servidor no trae.

Lo que hay que conseguir:

- **El servidor es el único dueño de la lista.** Las adopciones entran solo por `/api/directo/comando`, como antes. Ninguna página envía su mapa entero.
- Quita el POST de `guardarDuenosAvatar`. `/api/directo/avatares` queda solo de lectura (GET), o se elimina su POST.
- Recibir `avatares_estado` no puede provocar ninguna escritura hacia el servidor.
- `avatares.html` solo lee: GET al cargar y `avatares_estado` después.
- Los dueños tienen que sobrevivir a un reinicio del servidor. Hoy `serverOwners` vive solo en memoria (`server.js:314`) y se rellenaba desde el `localStorage` de una página. Propón a Javier guardarlos en un archivo de `data/` y espera su sí.

Reproduce primero con una prueba que arranque el servidor (modelo: `test/contexto-servidor.test.js`): dos clientes, uno adopta, el otro envía un mapa viejo, y se comprueba qué queda. Luego arregla y da la vuelta a la prueba.

Como tocas `server.js`: primera línea del informe, «HAY QUE REINICIAR EL SERVIDOR PARA PROBAR ESTO».

### P7 — La conga no reconoce los avatares adoptados (después de P6, antes de P5)

Lo que dice Javier: «lo que falla es la conga, que coge aleatorios; y si alguien tiene el avatar y pone conga hace lo mismo, no agrega ese avatar. Debería aparecer el nombre encima del avatar cuando lo adopta, y también si coge un avatar aleatorio al iniciar la conga y no tiene avatar adoptado».

P6 está bien: el servidor tiene los dueños (comprobado en vivo: `ge` y `pi` adoptados). El fallo es otro y **es anterior a esta noche** (los archivos son del 4 de octubre).

Causa leída en el código, **sin reproducir todavía**:

- La conga decide el avatar en `oficina-3d/src/office/conga.ts:167`: `findAdoptedAvatar(key, ctx)` busca al usuario en `ctx.avatarOwners`. Si no lo encuentra, `pickFreeAvatar` le da uno libre (línea 172).
- Ese `ctx.avatarOwners` es `this.avatarOwners` del `runtime` (`runtime.ts:1042`), que empieza vacío (`runtime.ts:208`) y solo se rellena con `runtime.setAvatarOwners()` (`runtime.ts:223`).
- **Nadie llama nunca a `runtime.setAvatarOwners()`.** `grep -rn "setAvatarOwners(" oficina-3d/src public/plano.html` da dos resultados: la definición, y `FloorPlan.tsx:963`. Ese de `FloorPlan` es el `setAvatarOwners` de `useState` (línea 667), que solo actualiza la etiqueta en pantalla. Se llaman igual y son dos cosas distintas.
- Resultado: para la conga la lista de dueños está siempre vacía. Nunca encuentra el avatar adoptado, y además considera libres avatares que tienen dueño.

Lo que hay que conseguir:

1. Quien tiene un avatar adoptado y escribe `!conga` entra con **su** avatar.
2. Quien no tiene avatar recibe uno que no sea de nadie. Nunca el avatar de otra persona.
3. El nombre del usuario se ve encima del avatar cuando lo adopta. Hoy la etiqueta existe (`FloorPlan.tsx:1108-1112`, `AgentPillTag`), pero comprueba si se ve en la vista de OBS (`/plano?transparente=1`): `public/plano.html` tiene reglas que esconden nombres y dueños en algunos modos. Enseña una captura de un servidor aparte.
4. Quien recibe un avatar al azar para la conga también lleva su nombre encima mientras baila. **Decidido por Javier (2026-10-08):** al acabar la conga el avatar se suelta y dice «Adoptadme, por favor», como ya hace hoy (`conga.ts:41`). Eso no se cambia; comprueba que sigue funcionando después de tu arreglo.

Cómo:

- Reproduce primero con una prueba sobre el `runtime` (modelo: `test/conga.test.mjs` y tu `test/bronca-fiesta-interrupcion.test.mjs`): fijar dueños como lo hace la página, lanzar la conga, unirse con un usuario que tiene avatar, y comprobar con cuál entra.
- Una sola fuente para los dueños dentro de la oficina. Que la etiqueta y la conga lean del mismo sitio, para que no vuelva a pasar.
- Cambiar `oficina-3d/src/` obliga a regenerar `public/office-3d.js` y su copia en `vps-overlay/public/`. Mira cómo se construye antes de tocar.

### P8 — El mensaje en pantalla (SMS y chat) no cambia entre claro y oscuro

Lo que dice Javier: «el chat sms no cambia claro oscuro».

**No reproducido por Claude.** Datos comprobados:

- `public/sms-pantalla.html:188-197` consulta `/api/categoria` cada 3 segundos (`THEME_POLL_MS`) y pone `data-theme` según `modo`.
- Probado en un navegador limpio con el servidor en `modo: "light"`: la página queda en `data-theme="light"`, la tarjeta sale blanca (`rgb(255, 255, 255)`) con texto oscuro. Ahí funciona.
- Defecto que sí se ve: los botones `−` y `+` (`.btn-zoom`, líneas 80-102) tienen el fondo y el borde fijos en blanco translúcido (`rgba(255, 255, 255, ...)`). En modo claro casi no se ven.

Hay que averiguar a qué se refiere Javier. Tres posibilidades; compruébalas en este orden y enseña la prueba de cada una:

1. **Dos botones distintos.** El botón de sol y luna del estudio guarda `apliarte_theme` en ese aparato y solo cambia el aspecto del panel. El modo del directo se cambia en Ajustes → Escenario y es el que siguen las capas de OBS. Si Javier pulsa el primero, la capa no cambia. Si es esto, no es un fallo de la capa: hay que preguntarle si quiere que un solo botón haga las dos cosas.
2. **El chat del estudio.** La lista con ojos (`.chat-msg-row`, `.btn-ojo-pantalla`) y el aviso «En pantalla» usan colores fijos (`rgba(255, 255, 255, 0.03)`, `rgba(2, 132, 199, ...)`). Comprueba cómo se ven con el panel en claro.
3. **La fuente de OBS tiene la página antigua guardada.** Se arregla recargando la fuente.

Pregunta a Javier dónde lo ve y qué botón pulsa antes de cambiar nada. Lo único que puedes arreglar sin preguntar es el color de `.btn-zoom` en modo claro, aquí y en `contexto.html` y `avatares.html` si les pasa lo mismo.

### P9 — Doble arroba en los nombres de YouTube (pequeño)

Javier lo vio el 2026-10-09 al probar: un mensaje de YouTube sale como «@@erbolammApliArte hola desde youtube». El ojo con YouTube funciona; solo sobra una arroba.

Causa probable: los nombres de YouTube ya vienen con `@` y la página añade otra (`public/estudio.html`, en `agregarMensajeTwitchFeed`: `@${msg.nombreVisible || msg.usuario}`). Mira también la tarjeta de `public/sms-pantalla.html`, el bocadillo de `public/camara.html` y el texto de bienvenida de `src/bienvenida-chat.js`.

Arréglalo en un solo sitio: quita la arroba inicial del nombre al recibirlo en el servidor, para Twitch y YouTube por igual, y deja que cada página ponga la suya. Prueba con un nombre que empiece por `@` y otro que no.

### P5 — La bronca se para (después de P7)

Lo que dice Javier: «la bronca que se para».

El servidor se reinició a las 21:42 con todo tu código, bienvenida incluida. Desde entonces cada persona nueva que escribe lanza una fiesta.

Causa probable, leída en el código y **sin reproducir todavía**:

- `oficina-3d/src/office/runtime.ts`, bucle por avatar que empieza en la línea 656. La rama de fiesta (línea 674, `fiestaState.phase === 'party'`) va **antes** que la de bronca (línea 700, `broncaState.phase === 'brawl'`) y termina en `continue` (línea 696).
- Mientras hay fiesta, la rama de bronca no se ejecuta: los avatares dejan de pelear y pasan a moverse como en la fiesta. La bronca sigue contando sus 15 segundos por dentro (`BRONCA_DURATION_MS`), pero no se ve.
- Antes casi nunca coincidían. Ahora la bienvenida lanza una fiesta cada vez que entra alguien (como mucho una cada 30 segundos, `COOLDOWN_FIESTA_MS`).

Qué hacer:

1. **Reproduce primero.** Prueba que ejecute el código: arrancar una bronca, arrancar una fiesta a mitad, y comprobar qué hacen los avatares. `test/bronca.test.mjs` y `test/fiesta.test.mjs` importan los `.ts` directamente; sigue ese modelo. Si no se reproduce, dilo y no toques nada.
2. Si se confirma, **Javier ya ha decidido cómo lo quiere** (2026-10-08): «¿no puede ir todo en cola? y si alguien viene se borra la cola. La fiesta, la conga, la bronca, todo eso lo hago yo; no me importa que se borre todo».

   Lo que hay que conseguir:

   - **Una sola cola para fiesta, conga y bronca.** Nunca hay dos a la vez. Si se lanza una mientras otra está en marcha, espera su turno y empieza al acabar la anterior.
   - **La bienvenida tiene prioridad.** Cuando entra alguien nuevo: se corta la animación en marcha, se vacía la cola y sale el saludo con su fiesta. Lo que se pierde no se recupera; Javier lo vuelve a lanzar si quiere.
   - Tope de cola, en una constante con nombre. Si la cola está llena, la petición nueva se descarta y queda un aviso en consola.
   - La cola es lógica pura, en un módulo aparte con sus pruebas, como `bronca.ts` y `fiesta.ts`. Pruebas que ejecuten el módulo: dos animaciones seguidas no se solapan; la segunda empieza al acabar la primera; una bienvenida a mitad corta la actual y vacía la cola; cola llena descarta.

   Antes de programar, enseña a Javier en tres líneas dónde va a vivir la cola (en la página de la oficina o en el servidor) y por qué. Hay varias páginas mostrando la oficina a la vez; si la cola vive en cada página, pueden desincronizarse. Espera su sí.

   Dudas que solo puede cerrar Javier; pregúntaselas, no las supongas:

   - Los juegos (damas y los demás) y el café, los besos y otras escenas: ¿entran en la cola o siguen como están?
   - Si llegan varias personas seguidas, la bienvenida ya las agrupa. ¿La segunda bienvenida corta la fiesta de la primera?

3. Hay otra pausa posible, más pequeña, en la propia bronca: en `runtime.ts:704-706` el avatar solo recibe un destino nuevo cuando ha llegado al anterior, y `bronca.ts` cambia el destino cada 1,2 a 2,2 segundos (`nextChangeAt`). Si llega antes, se queda quieto hasta el siguiente cambio. Comprueba si se ve; no lo arregles sin enseñarlo.

Trampas:

- Si cambias algo en `oficina-3d/src/`, hay que regenerar `public/office-3d.js`. Mira cómo se construye antes de tocar. Varias pruebas exigen que `public/office-3d.js` y `vps-overlay/public/office-3d.js` sean iguales (`test/overlay-sin-radar.test.js`, `test/office-3d-cache-bust.test.js`).
- `test/fiesta.test.mjs` prohíbe emojis en `fiesta.ts`.

### P1 — El chat del estudio tiene que ser la lista con ojos, no el chat de Twitch

Lo que dice Javier: «antes salían los mensajes en el chat y al pulsar en el ojo se veían en el overlay del sms; ahora se ve el chat de twitch, que no tiene nada que ver».

Prueba: `public/estudio.html:2815` arranca con `chatPantallaActivo = false`. Por eso al abrir el chat se ve el iframe de Twitch (`chat-frame`) y la lista propia (`chat-live-feed`) queda escondida hasta pulsar «Pantalla». Además no se recuerda: cada recarga vuelve al iframe.

Lo que hay que conseguir:

- Al abrir el chat se ve **siempre la lista propia**, con el ojo en cada mensaje. Sin pulsar nada.
- El iframe de Twitch deja de ser la vista de serie. Si se conserva, que sea detrás de un botón y nunca al abrir. Pregunta a Javier si lo quiere conservar; si no contesta, se queda escondido.
- Los ojos se ven siempre. Hay un fallo de anchura comprobado: el aviso «En pantalla» (`.chat-pantalla-texto`, `white-space: nowrap`) ensancha el panel `.sheet` más allá de la pantalla y deja los ojos fuera por la derecha. `.sheet`, `.sheet-extra` y `.sheet-body` son rejillas sin columna fija. Arréglalo y enseña una captura con un mensaje largo puesto en pantalla.

### P2 — La bienvenida, siempre encendida y cada 6 horas

Lo que dice Javier: «la bienvenida tiene que verse siempre cuando entre alguien, no tengo que activarla yo; si escribe después de 6 horas se le saluda».

- Quita el interruptor «Bienvenida» de `public/estudio.html:640` y su lógica. La bienvenida no se apaga desde el panel.
- En el servidor queda siempre activa. `server.js:45-54` ya devuelve `activa: true` de serie; quita la posibilidad de que un archivo `bienvenida.json` con `false` la apague, o no leas ese archivo.
- `src/bienvenida-chat.js:26`: `COOLDOWN_RE_SALUDO_MS` pasa de 12 horas a **6 horas**. Actualiza sus pruebas y la documentación, que dicen 12.
- Averigua por qué Javier tuvo que activarla a mano. Reproduce y enseña la causa. No lo des por resuelto solo quitando el botón.

### P3 — `!contexto` enviado desde los comandos del estudio no cambia la barra

Lo que dice Javier: «si mando desde /estudio en los comandos, no sale; solo sale si escribes en el chat».

Prueba: `!contexto` solo se interpreta al leer el chat (`server.js:575` para Twitch y `:637` para YouTube). El punto `/api/directo/comando` (`server.js:2141`), que es por donde entran los comandos del estudio, no menciona el contexto: manda el texto a Twitch con `enviarATwitchChat` y Twitch no devuelve tus propios mensajes por la misma conexión. El servidor nunca se entera.

Lo que hay que conseguir: un `!contexto texto` que entre por `/api/directo/comando` llama a `fijarContextoDirecto` igual que el del chat. Prueba que ejecute el servidor: POST del comando y luego GET de `/api/directo/contexto` con el texto nuevo.

Revisa si pasa lo mismo con otros comandos que solo se interpretan al leer el chat. Lista los que encuentres; no los cambies sin enseñarlos.

### P4 — Los ajustes se guardan en cada aparato y tienen que guardarse en el Mac

Lo que dice Javier: «las configuraciones se guardan en cada dispositivo y debería guardarse todo en el servidor del mac».

Prueba: `public/estudio.html` usa `localStorage` con 24 claves distintas (`storeSetting`, `micSetting`, `TTS_KEYS`...). Lo que se ajusta en la tableta no aparece en el ordenador.

Esto es grande. **Prepara y para:**

1. Haz la lista completa de claves, qué guarda cada una y en qué páginas se leen (`estudio.html`, `plano.html`, `contexto.html`, `avatares.html`, `sms-pantalla.html`).
2. Sepáralas en dos grupos: ajustes del directo (van al servidor) y cosas propias del aparato (por ejemplo, qué cámara o micrófono usa ese aparato, que no tiene sentido compartir). Propón el reparto.
3. Propón dónde se guardan: un archivo en `data/panel/`, con un punto de lectura y otro de escritura que pida sesión, como las listas del panel (`/api/panel/lista`).
4. Enseña la propuesta a Javier y espera su sí antes de escribir código.

Claves y contraseñas no entran en esta lista: ya van al servidor por su vía y no se mueven.

### Lo que ya no hace falta

La tarea 1 (avisar del reinicio) está resuelta. Las tareas 2 a 6 siguen pendientes y van después de P1 a P4.


### Tarea 1 — Avisar del reinicio (prepara y para)

Explica a Javier, en dos frases, qué no funciona hasta reiniciar y cómo se reinicia. Espera a que él diga cuándo.

### Tarea 2 — `chat.html`

Deja `public/chat.html` y `vps-overlay/public/chat.html` como estaban en el último commit (`git checkout HEAD -- <archivo>` solo sobre esos dos, tras enseñar a Javier el `git diff --stat` de ambos y recibir su sí). Quita `chat.html` de la guía y de `CONFIGURATION.md` como fuente o panel recomendado.

### Tarea 3 — Botrix (prepara y para)

Lista cada sitio donde aparece Botrix en `public/estudio.html` y `server.js`, y qué deja de funcionar si se quita. `public/admin.html` es el panel antiguo de referencia: no lo toques. Enseña la lista y espera. No borres nada todavía.

### Tarea 4 — YouTube

Quita el canal fijo: sin `DIRECTO_YOUTUBE_CANAL` configurado, el lector de YouTube no arranca. Añade la variable a `.env.example` sin valor real. Pon en la guía, en una frase clara, que el lector de YouTube no es oficial y puede dejar de funcionar.

### Tarea 5 — Guardar (prepara y para)

Propón commits separados por función: bienvenida, fuentes sueltas de contexto y avatares, ojo del chat, YouTube, documentación. `public/fondo.html` va aparte y solo si Javier lo dice. No hagas commit ni push sin su sí.

Los archivos nuevos de `vps-overlay/public/` no entran en ningún commit hasta que Javier decida qué hacer con esa carpeta.

### Tarea 6 — Traductor del chat (sigue pendiente desde la ronda 2)

El traductor ya existe en otro repositorio: `/Users/apliarte/repos/tts-apliarte`. Es una aplicación Flutter. Aquí hay que rehacerlo en JavaScript; no se puede copiar el archivo.

**Ese repositorio es solo de lectura.** Tiene cambios sin guardar de Javier. No escribas ni ejecutes nada allí.

Qué leer allí:

- `lib/services/translation_service.dart` (124 líneas): el motor.
- `lib/controllers/app_controller.dart:508-531`: cómo se usa antes de leer un mensaje en voz alta.
- `lib/models/app_settings.dart:162-188`: los ajustes y sus valores de serie.

Cómo funciona el motor, comprobado:

1. Si hay una dirección propia configurada, hace `POST {base}/translate` con `q`, `source`, `target`, `format: "text"` y `api_key` opcional. Lee `translatedText`.
2. Si no, pide a MyMemory: `GET https://api.mymemory.translated.net/get?q=...&langpair=origen|destino` (o `autodetect|destino`). Lee `responseData.translatedText`. Espera 6 segundos como mucho.
3. Si MyMemory falla, pide a Lingva: `GET https://lingva.ml/api/v1/{origen}/{destino}/{texto}`. Lee `translation`.
4. Si todo falla, devuelve el texto original. Nunca rompe.

Trampa conocida: MyMemory a veces devuelve un aviso suyo como si fuera la traducción. Si la respuesta contiene `PLEASE SELECT TWO DISTINCT LANGUAGES`, `MYMEMORY WARNING` o `INVALID TARGET LANGUAGE`, se devuelve el texto original.

Qué hay que hacer en Directo, y nada más:

- Un módulo nuevo `src/traductor.js` con ese mismo orden y esa misma trampa cubierta.
- Las llamadas salen desde el servidor, no desde el navegador.
- Solo esto: traducir al español el mensaje del chat antes de que el avatar lo diga. Si la traducción es igual al original, se usa el original.
- La traducción va antes del troceo: se traduce el mensaje entero y luego se parte.
- Un interruptor en el estudio. **Apagado de serie.**
- Las pruebas no llaman a internet: simula las respuestas de MyMemory y Lingva.

Qué no se hace en esta ronda: publicar la traducción en el chat, traducir las respuestas a varios idiomas, traducir las páginas de la web.

Antes de escribir código, para y enseña a Javier: en qué punto del recorrido del mensaje vas a meter la traducción, y dónde va el interruptor. Espera su sí.

Aviso que debe salir junto al interruptor: al encenderlo, los mensajes del chat se envían a servicios externos (MyMemory y Lingva).

## 4. Límites duros

- No borres ni muevas ningún archivo ni carpeta. Ninguno.
- No toques `panel-twitch-comandos.html` (raíz), `tts-lab/`, `odd/` ni `vps-overlay/`. Única excepción: lo que cambies en `public/plano.html` o `public/camara.html` se copia igual a `vps-overlay/public/`.
- No hagas commit ni push sin que Javier lo pida.
- No publiques ni subas nada a ningún servidor.
- No modifiques ni elimines pruebas para que pasen.
- No cambies versiones de dependencias.
- No toques `.env`, `config/`, `data/` ni `private/`.
- Si algo de este encargo no cuadra con lo que ves, para y pregunta.

## 5. Cómo comprobar

```
npm test
```

Tiene que acabar en `fail 0` y con 885 pruebas o más. Ejecútalo después de cada tarea.

## 6. Cómo informar

En español, frases cortas, sin jerga. Javier no es programador.

Una tabla con una fila por tarea:

| Tarea | Estado (terminada / bloqueada / pendiente) | Pruebas antes | Pruebas después | Archivos tocados |
|---|---|---|---|---|

Debajo, pega la salida real de `npm test` (las últimas 10 líneas) y de `git status --short`. Sin resumir.

Si una prueba pasaba antes y ahora no, eso va lo primero del informe. Si has cambiado algo que este encargo no pedía, dilo también; no lo dejes sin mencionar.
