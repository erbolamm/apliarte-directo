# 📜 Contrato Canónico de Juegos del Directo (!trofeo y !traidor)

> **Ubicación Canónica**: `directo/CONTRATO_JUEGOS.md`  
> **Aprobado por**: Mesa Redonda Técnica (Claude, Grok, Codex, Pi y Agy) · 2026-09-25  
> **Propósito**: Fuente única de verdad técnica para los estados, eventos, payloads y fronteras de código entre los 3 especialistas. Prohibido alterar este contrato sin pasar por deliberación colegiada.

---

## 🏛️ 1. Fronteras de Archivos y Responsabilidades

| Especialista | Rama Git Worktree | Archivos Asignados (Estrictos) | Responsabilidad |
| :--- | :--- | :--- | :--- |
| 🟣 **Claude (`cl`)** | `wt/cl--directo--hub-juegos-overlay-3d--javier--urgente--2026-09-25` | `tareas/oficina-3d/src/office/runtime.ts`<br>`tareas/oficina-3d/src/interface.css`<br>`directo/public/plano.html` | Frontend 3D y overlay: Cartel 1 min de `!juego`, congelación de escena, silueta policial de tiza en sala de reuniones, colocación en círculo y render de bocadillos. **NO compila `dist/` en su worktree.** |
| 🟢 **Codex (`co`)** | `wt/co--directo--backend-panel-juegos-traidor--javier--urgente--2026-09-25` | `directo/src/server.js`<br>`directo/panel-twitch-comandos.html`<br>`directo/test/panel-twitch.test.js` | Backend seguro y panel privado: Sección «Juegos» para Javier, sorteo secreto del Traidor (aislado del feed público), gestión de estado y recuento de votos. |
| 🥧 **Pi (`pi`)** | `wt/pi--directo--parser-twitch-quorum-tests--javier--urgente--2026-09-25` | `directo/public/js/tts-fuentes.js`<br>`directo/test/tts-fuentes.test.js` | Funciones puras de parsing y TDD: Reconocimiento de `!trofeo`, `!traidor`, filtro numérico durante votación y cálculo de quórum de `avatarOwners` sin `ja`. |
| 🤖 **Agy (`ge`, Lead)** | `main` | Integración, bundles y VPS | Coordinación en Herdr `equipo-1`, fusión limpia, compilación única de `dist/` y despliegue al VPS `remote-72` bajo visto bueno de Javier. |

---

## 🔄 2. Máquina de Estados de Partida

```
[idle] ── (Javier escribe !juego) ──► [lobby_votacion (60s)]
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
            (Opción 1: !trofeo)                                 (Opción 2: !traidor)
                    │                                                   │
                    ▼                                                   ▼
         [trofeo_countdown (5s)]                              [traidor_intro (silueta + círculo)]
                    │                                                   │
                    ▼                                                   ▼
         [trofeo_running (220px/s)]                           [traidor_debate (300s / 5 min)]
                    │                                                   │
                    ▼                                                   ▼
         [trofeo_celebracion (8s)]                            [traidor_votacion (45s)]
                    │                                                   │
                    ▼                                                   ▼
               [retorno idle]                                  [traidor_expulsion]
                                                                        │
                                                  ┌─────────────────────┴─────────────────────┐
                                                  ▼                                           ▼
                                          (Era el Traidor)                             (Era Inocente)
                                                  │                                           │
                                                  ▼                                           ▼
                                      [traidor_expulsion (8s)]                    [traidor_expulsion (8s)]
                                                  │                                           │
                                                  ▼                                           ▼
                                        [finalizado (20s)]                         (¿Quedan 3 jugadores?)
                                      (Victoria Inocentes)                                ├── Sí ──► [muerte_subita (45s)]
                                                  │                                       └── No ──► [traidor_debate (300s)]
                                                  ▼
                                            [retorno idle]
```

---

## 🔒 3. Regla Sagrada de Privacidad del Traidor

1. **Aislamiento Total**: La identidad del Traidor **NUNCA** viaja en el payload de estado público, ni a `directo/public/plano.html`, ni a `/api/directo/comando`, ni a ningún evento accesible en OBS.
2. **Entrega Exclusiva**: El sorteo ocurre en `directo/src/server.js` y solo se expone mediante endpoint autenticado para el panel de Javier (`directo/panel-twitch-comandos.html`).
3. **Mecánica Humana**: Javier recibe la notificación privada en su panel y es Javier quien envía el susurro manual `/w @usuario` por Twitch.

---

## 📦 4. Esquema de Datos y Payloads JSON

### A. Estado Público del Juego (`GET /api/directo/juego/estado`)
Consumido por el overlay OBS (`plano.html` y `runtime.ts`):
```json
{
  "fase": "idle",
  "tiempoRestanteMs": 0,
  "quoromMinimo": 4,
  "espectadoresAdoptados": ["user1", "user2", "user3", "user4"],
  "juegoSeleccionado": null,
  "votos": { "1": 0, "2": 0, "3": 0, "4": 0 },
  "rondaTraidor": 1,
  "jugadoresVivos": ["co", "cl", "pi", "ge"],
  "ultimoExpulsado": null,
  "ganador": null
}
```

### B. Estado Privado de Javier (`GET /api/directo/juego/privado-javier`)
Consumido exclusivamente por `panel-twitch-comandos.html`:
```json
{
  "partidaActiva": true,
  "fase": "traidor_intro",
  "traidorSecreto": {
    "avatarId": "co",
    "twitchUser": "espectador_x"
  }
}
```

---

## 🧪 5. Protocolo de Pruebas Obligatorio

1. **Pi**: `npm test` en `directo/test/tts-fuentes.test.js` probando que el parser reconoce comandos válidos, rechaza comandos espurios durante la votación y solo deja pasar números enteros positivos.
2. **Codex**: Tests unitarios en `directo/test/panel-twitch.test.js` validando que el sorteo es aleatorio y que ningún endpoint público contiene la clave `traidorSecreto`.
3. **Claude**: Comprobación visual en el diorama 3D de que la congelación no descoordina las animaciones y que la silueta de tiza se renderiza exactamente en las coordenadas de la sala de reuniones.
