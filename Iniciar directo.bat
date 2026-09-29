@echo off
REM Double-click on Windows to start ApliArte Directo.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Se abrira su web: descarga la version LTS, instalala y vuelve a hacer doble clic aqui.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)
call npm run directo
pause
