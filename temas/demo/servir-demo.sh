#!/usr/bin/env bash
# servir-demo.sh — levanta un mini servidor estático SOLO para el demo
# de temas. Sirve la carpeta directo/temas/ en localhost:8795. NO toca
# el puerto 8790 del centro de restream.
#
# Uso:
#   bash directo/temas/demo/servir-demo.sh
#   # abrir http://127.0.0.1:8795/demo/
#
# Pensado para python3, que viene preinstalado en macOS.

set -euo pipefail

PUERTO="${PUERTO:-8795}"
CARPETA="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Falta python3. Instálalo o usa cualquier servidor estático apuntando a:" >&2
  echo "  $CARPETA" >&2
  exit 1
fi

echo "Sirviendo $CARPETA en http://127.0.0.1:$PUERTO/"
echo "Abre el demo en http://127.0.0.1:$PUERTO/demo/"
echo "Para parar: Ctrl+C"
exec python3 -m http.server "$PUERTO" --bind 127.0.0.1 --directory "$CARPETA"