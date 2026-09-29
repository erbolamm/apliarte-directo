/**
 * Signaling WebRTC del modo paseo (paso 3 de la cadena directo/tts-apliarte).
 *
 * La app móvil es el peer oferente (envía voz y cámara). El receptor HTML
 * servido por `directo/public/walk.html` es el peer respondedor (recibe y
 * pinta). Sin SFU: ambos peers están en la misma LAN y la oferta/answer/ICE
 * viajan por este WebSocket, no por un servidor de medios TURN/STUN.
 *
 * Tabla en memoria `Map<sessionId, { hostSocket, guestSocket }>`. No
 * persiste: el directo se reinicia con el centro, no tiene sentido guardar.
 *
 * El primer peer que llega a una sesión se considera el "guest" (el que
 * abre walk.html en el navegador del PC); el segundo es el "host" (la app
 * del móvil). Esta convención es arbitraria — lo único que importa es
 * reenviar mensajes al otro lado sin bucles. Si dos peers de la misma
 * aplicación llegan a la vez, el orden depende del orden de conexión;
 * los mensajes de signaling son idempotentes y renegociables, así que
 * una conexión cruzada no rompe nada, solo deja a ambos sin par.
 *
 * Mensajes:
 *   { type: 'join', sessionId }
 *   { type: 'offer', sessionId, sdp, sdpType }
 *   { type: 'answer', sessionId, sdp, sdpType }
 *   { type: 'ice-candidate', sessionId, candidate, sdpMid, sdpMLineIndex }
 *   { type: 'peer-joined', sessionId, role }   <- server → cliente
 *   { type: 'peer-left', sessionId, role }     <- server → cliente
 *   { type: 'peer-status', sessionId, ready }  <- server → cliente
 */

const PEER_ROLES = Object.freeze({ HOST: 'host', GUEST: 'guest' });

export class WalkSignaling {
  constructor({ onLog = () => {} } = {}) {
    /** Mapa de sesiones. sessionId (string) -> { sockets: [s, ...] } */
    this._sesiones = new Map();
    this._onLog = onLog;
  }

  /**
   * Maneja un socket entrante. Devuelve una función de limpieza que se
   * ejecuta en `close` para sacar al socket de la tabla.
   *
   * El servidor HTTP le pasa el `sessionId` por query (`?session=…`)
   * porque Socket.IO y `ws` necesitan handshake por URL.
   */
  manejar(socket, sessionIdBruto) {
    const sessionId = String(sessionIdBruto || '').trim();
    if (!sessionId) {
      socket.send(JSON.stringify({ type: 'error', reason: 'session_id_requerido' }));
      socket.close();
      return () => {};
    }

    let entrada = this._sesiones.get(sessionId);
    if (!entrada) {
      entrada = { sockets: [] };
      this._sesiones.set(sessionId, entrada);
    }

    // A partir del segundo socket, el primero pasa a ser guest y el
    // nuevo a host. La app siempre llega segunda (el walk.html se abre
    // antes), así que en la práctica la app es host.
    const rol = entrada.sockets.length === 0 ? PEER_ROLES.GUEST : PEER_ROLES.HOST;
    entrada.sockets.push(socket);

    socket.send(JSON.stringify({ type: 'peer-joined', sessionId, rol }));

    // Avisar al otro peer de que ya hay par disponible.
    const otro = entrada.sockets.find((s) => s !== socket);
    if (otro && otro.readyState === 1) {
      otro.send(JSON.stringify({ type: 'peer-status', sessionId, ready: true }));
    }

    const alRecibir = (crudo) => this._alRecibir(socket, sessionId, crudo);
    socket.on('message', alRecibir);

    const alCerrar = () => {
      socket.off('message', alRecibir);
      const idx = entrada.sockets.indexOf(socket);
      if (idx >= 0) entrada.sockets.splice(idx, 1);
      const restante = entrada.sockets.find((s) => s !== socket && s.readyState === 1);
      if (restante) {
        restante.send(JSON.stringify({ type: 'peer-left', sessionId, rol }));
      }
      if (entrada.sockets.length === 0) {
        this._sesiones.delete(sessionId);
      }
      this._onLog(`walk: sesión ${sessionId} cerrada (rol=${rol})`);
    };
    socket.on('close', alCerrar);
    socket.on('error', alCerrar);

    return alCerrar;
  }

  _alRecibir(socket, sessionId, crudo) {
    let msg;
    try {
      msg = JSON.parse(crudo.toString());
    } catch (_) {
      return;
    }
    const tipo = msg.type;
    if (!tipo) return;

    if (tipo === 'join') {
      // join es informativo en este protocolo; ya hicimos el manejo en
      // `manejar()`. Lo aceptamos silenciosamente.
      return;
    }

    // Cualquier mensaje de signaling se reenvía al OTRO peer de la sesión.
    const entrada = this._sesiones.get(sessionId);
    if (!entrada) return;
    const destinatario = entrada.sockets.find((s) => s !== socket && s.readyState === 1);
    if (!destinatario) {
      // No hay par todavía: el emisor debe reintentar al recibir peer-joined.
      return;
    }
    destinatario.send(JSON.stringify({ ...msg, sessionId }));
  }

  /** Para diagnóstico: cuántos peers activos. */
  contarPeers() {
    let total = 0;
    for (const entrada of this._sesiones.values()) total += entrada.sockets.length;
    return total;
  }
}