@echo off
REM ========================================================
REM ApliArte Directo - Lanzador para Windows (PC)
REM Doble clic para iniciar el servidor de streaming
REM ========================================================
cd /d "%~dp0"
title ApliArte Directo

where node >nul 2>nul
if errorlevel 1 (
  echo ========================================================
  echo [ERROR] Falta Node.js en este equipo.
  echo ========================================================
  echo.
  echo Para que ApliArte Directo funcione en tu PC:
  echo   1. Se abrira ahora mismo https://nodejs.org en tu navegador.
  echo   2. Descarga la version recomendada "LTS".
  echo   3. Instala el archivo descargado.
  echo   4. Vuelve a hacer doble clic en "Iniciar directo.bat".
  echo.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)

echo ========================================================
echo               INICIANDO APLIARTE DIRECTO
echo ========================================================
echo.
echo Comprobando entorno y arrancando servicios...
echo Si el Firewall de Windows te pide confirmacion:
echo    MARCA "Redes privadas" y pulsa "Permitir acceso".
echo.
call npm run directo
if errorlevel 1 (
  echo.
  echo [AVISO] El servidor se ha detenido.
  pause
)
