#!/usr/bin/env bash
cd /Users/apliarte/repos/apliarte-directo || exit 1
echo "════════════════════════════════════════════════════════════════"
echo "  🚀 INICIANDO TRABAJADOR CLAUDE CODE (OPUS 5.5) - APLIARTE DIRECTO"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Asignación: Documentación exhaustiva y revisión de Pizarra Excalidraw"
echo "Solicitado por: Javier Mateo (ApliArte / ErBolamm)"
echo ""
exec /Users/apliarte/.local/bin/claude --model opus "Hola Claude. Javier Mateo (ApliArte / ErBolamm) ha revisado la tarea y te da este feedback directo: 'dile que no se ha documentado y además no he visto la pestaña o terminal abierta has usado el Claude que tú tienes te he pedido que delegues la tarea a un trabajador claude que con OP 5.5 seguro que hace un trabajo mucho mejor'.

Tu misión como trabajador especializado con Claude Opus 5.5 es:
1. DOCUMENTACIÓN EN CÓDIGO (public/estudio.html):
   - Documentar con JSDoc y comentarios arquitectónicos exhaustivos y claros toda la sección de la pizarra estilo Excalidraw:
     * La barra cenital flotante (#board-topbar) con las herramientas y figuras.
     * El panel lateral flotante (#board-props) con la paleta de 16 colores vivos, los 4 presets táctiles (3px, 6px, 12px, 24px) y slider, captura OBS con intervalo de refresco, y confirmación de seguridad en 2 toques para limpiar lienzo.
     * El conmutador de pizarra en la botonera (#btn-draw-menu), explicando por qué se eliminaron los demás botones de dibujo sueltos de la barra inferior para tener una interfaz limpia.
     * El ciclo de vida: activación/reposo (board.active), sincronización con WebSocket (/pizarra-plus/ws), control de punteros (pointerOwner) y capas móviles (#layers-panel).
2. DOCUMENTO TÉCNICO DEDICADO:
   - Crear el documento técnico exhaustivo 'DOCUMENTATION/PIZARRA_EXCALIDRAW.md':
     * Arquitectura, diseño visual y experiencia de usuario estilo Excalidraw adaptada para streaming y tablet táctil.
     * Diagrama de componentes y eventos.
     * Protocolo de red y WebSocket de pizarra.
     * Guía de uso en directo para Javier.
3. ACTUALIZAR LA BITÁCORA:
   - Registrar en 'control-erbolamm/tareas/haciendo/ge--apliarte-directo--redineno-paleta-colores-y-estilo-pizarra--javier--normal--2026-10-10.md' que se ha realizado la documentación profunda en código y en DOCUMENTATION/.
4. VERIFICACIÓN:
   - Ejecutar 'npm test' para asegurar que el 100% de los tests sigan pasando impecablemente."
