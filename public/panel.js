/* Panel del centro de directo. Solo pinta lo que manda el servidor: no deduce ni inventa estado. */
(() => {
  const $ = (id) => document.getElementById(id);
  const TEXTOS = {
    detenido: "detenido",
    recibiendo: "recibiendo señal",
    reenviando: "reenviando",
    fallback: "emitiendo respaldo",
    error: "error",
  };

  // ─── Tema: claro por defecto, elección recordada ───────────────────────────
  const botonTema = $("tema");
  const aplicarTema = (tema) => {
    document.documentElement.dataset.tema = tema;
    const oscuro = tema === "oscuro";
    botonTema.textContent = oscuro ? "🌙" : "☀️";
    botonTema.setAttribute("aria-pressed", String(oscuro));
    botonTema.setAttribute(
      "aria-label",
      oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
    );
  };
  try {
    aplicarTema(localStorage.getItem("directo-tema") || "claro");
  } catch {
    aplicarTema("claro");
  }
  botonTema.addEventListener("click", () => {
    const nuevo =
      document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro";
    aplicarTema(nuevo);
    try {
      localStorage.setItem("directo-tema", nuevo);
    } catch {
      /* modo privado */
    }
  });

  // ─── Pintado ───────────────────────────────────────────────────────────────
  const duracion = (s) => {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      r = s % 60;
    return h ? `${h}h ${m}m ${r}s` : m ? `${m}m ${r}s` : `${r}s`;
  };

  function pintar(datos) {
    $("bolita").className = `bolita ${datos.estado}`;
    $("estado-texto").textContent = TEXTOS[datos.estado] ?? datos.estado;

    $("r-obs").textContent = ["recibiendo", "reenviando"].includes(datos.estado)
      ? "activa"
      : "sin señal";
    $("r-tiempo").textContent = duracion(datos.segundosEmitiendo ?? 0);
    $("r-activos").textContent = String(
      (datos.destinos ?? []).filter((d) => d.pid).length,
    );
    $("r-respaldo").textContent = datos.tieneRespaldo
      ? "preparado"
      : "no configurado";

    const cuerpo = $("cuerpo-destinos");
    cuerpo.textContent = "";

    if (!datos.destinos?.length) {
      const fila = cuerpo.insertRow();
      const celda = fila.insertCell();
      celda.colSpan = 5;
      celda.className = "vacio";
      celda.textContent = "No hay destinos configurados.";
      return;
    }

    for (const d of datos.destinos) {
      const fila = cuerpo.insertRow();

      const cNombre = fila.insertCell();
      cNombre.dataset.etiqueta = "Destino";
      cNombre.textContent = d.nombre;

      const cUrl = fila.insertCell();
      cUrl.dataset.etiqueta = "URL";
      const code = document.createElement("code");
      code.textContent = d.url; // ya llega enmascarada desde el servidor
      cUrl.append(code);

      const cEstado = fila.insertCell();
      cEstado.dataset.etiqueta = "Estado";
      const pastilla = document.createElement("span");
      const clase = d.error ? "error" : (d.modo ?? "parado");
      pastilla.className = `pastilla ${clase}`;
      pastilla.textContent = d.error
        ? "error"
        : d.modo === "respaldo"
          ? "respaldo"
          : d.modo === "relay"
            ? "reenviando"
            : d.listo
              ? "listo"
              : "sin clave";
      cEstado.append(pastilla);
      if (d.error) {
        cEstado.append(" ");
        cEstado.append(document.createTextNode(d.error));
      }

      const cPid = fila.insertCell();
      cPid.dataset.etiqueta = "PID";
      cPid.textContent = d.pid ?? "—";

      const cAccion = fila.insertCell();
      cAccion.dataset.etiqueta = "Acción";
      const boton = document.createElement("button");
      boton.type = "button";
      boton.textContent = "Detener";
      boton.disabled = !d.pid;
      boton.addEventListener("click", () => {
        boton.disabled = true;
        fetch(`/api/destino/${encodeURIComponent(d.nombre)}/detener`, {
          method: "POST",
        }).catch(() => {
          boton.disabled = false;
        });
      });
      cAccion.append(boton);
    }
  }

  const pintarRegistro = (lineas) => {
    $("registro").textContent = (lineas ?? []).join("\n") || "—";
  };

  // ─── Conexión ──────────────────────────────────────────────────────────────
  const socket = io();
  function mostrarError(visible) {
    const pie = document.querySelector("footer.pie");
    if (pie) pie.style.display = visible ? "block" : "none";
  }

  socket.on("estado", (d) => {
    pintar(d);
    pintarRegistro(d.registro);
    mostrarError(Boolean(d.error));
  });
  socket.on("registro", (linea) => {
    const pre = $("registro");
    pre.textContent =
      pre.textContent === "—" ? linea : `${pre.textContent}\n${linea}`;
    pre.scrollTop = pre.scrollHeight;
  });
  socket.on("disconnect", () => {
    $("estado-texto").textContent = "sin conexión con el servidor";
    $("bolita").className = "bolita error";
    mostrarError(true);
  });

  fetch("/api/estado")
    .then((r) => r.json())
    .then((d) => {
      pintar(d);
      pintarRegistro(d.registro);
      mostrarError(Boolean(d.error));
    })
    .catch(() => {});
})();
