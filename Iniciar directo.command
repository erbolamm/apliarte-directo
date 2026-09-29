#!/bin/bash
# Double-click on macOS to start ApliArte Directo.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Falta Node.js. Se abrirá su web: descarga la versión LTS, instálala y vuelve a hacer doble clic aquí."
  open "https://nodejs.org"
  read -r -p "Pulsa Intro para cerrar…"
  exit 1
fi
npm run directo
read -r -p "ApliArte Directo se ha cerrado. Pulsa Intro para cerrar la ventana…"
