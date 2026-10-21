@echo off
REM ==========================================================================
REM  LifeAgente AI - arranque rapido SIN instalar el .exe
REM  Ideal si ya descargaste el repositorio completo.
REM
REM  Crea el entorno, instala lo que falte, compila la interfaz, levanta el
REM  sistema, abre el navegador y apaga todo al cerrar la ventana.
REM ==========================================================================
setlocal
cd /d "%~dp0.."

echo.
echo  === LifeAgente AI: preparacion ===
echo.

REM --- 1. Python ---
where python >nul 2>nul
if errorlevel 1 (
  echo  [1/4] Python no esta instalado. Se instala con winget...
  winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements --silent
  echo  -> Vuelve a ejecutar este archivo cuando termine.
  pause
  exit /b 1
)

REM --- 2. entorno y dependencias ---
if not exist "backend\.venv\Scripts\python.exe" (
  echo  [2/4] Creando el entorno...
  python -m venv backend\.venv
)
echo  [2/4] Instalando dependencias...
backend\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
backend\.venv\Scripts\python.exe -m pip install --quiet -r backend\requirements.txt

REM --- 3. interfaz ---
where npm >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js no esta instalado: se usara la interfaz ya compilada si existe.
) else (
  if not exist "frontend\dist\index.html" (
    echo  [3/4] Compilando la interfaz...
    pushd frontend
    call npm install --silent
    call npm run build
    popd
  ) else (
    echo  [3/4] La interfaz ya esta compilada.
  )
)

REM --- 4. arrancar ---
echo  [4/4] Arrancando LifeAgente en http://127.0.0.1:8000
echo.
start "" http://127.0.0.1:8000
pushd backend
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
popd

echo.
echo LifeAgente se detuvo. Tus datos quedaron guardados en:
echo  %APPDATA%\LifeAgente
pause
