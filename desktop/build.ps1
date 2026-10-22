# Compila el instalador local LifeAgente.exe (Windows).
# Uso:  powershell -ExecutionPolicy Bypass -File desktop/build.ps1
#
# Pasos:
#   1. compila la interfaz (frontend/dist) si no existe o esta desactualizada;
#   2. crea un entorno con PyInstaller;
#   3. genera desktop/dist/LifeAgente.exe;
#   4. comprueba que arranca.

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

Write-Host "==> 1/4 Compilando la interfaz" -ForegroundColor Cyan
# Se compila SIEMPRE: si nos saltamos este paso, el .exe lleva una interfaz
# vieja dentro (fue el error de la v1.0.0: el .exe tenia el codigo de la
# v23 mientras la app web ya iba por la v37).
Push-Location frontend
npm ci
npm run build
Pop-Location
$version = (Get-Content (Join-Path $raiz "VERSION") -Raw).Trim()
Write-Host "    Interfaz compilada. Version: $version" -ForegroundColor Green

Write-Host "==> 2/4 Preparando PyInstaller" -ForegroundColor Cyan
$venv = ".venv-desktop"
if (-not (Test-Path "$venv\Scripts\python.exe")) {
    python -m venv $venv
}
& "$venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
# Las dependencias de la app tambien van aqui: PyInstaller tiene que poder
# encontrarlas (uvicorn, fastapi, sqlalchemy, cryptography...).
& "$venv\Scripts\python.exe" -m pip install --quiet -r backend\requirements.txt
& "$venv\Scripts\python.exe" -m pip install --quiet pyinstaller

Write-Host "==> 3/4 Generando el .exe" -ForegroundColor Cyan
& "$venv\Scripts\python.exe" -m PyInstaller desktop\LifeAgente.spec --noconfirm --clean --distpath desktop\dist --workpath desktop\build

$exe = "desktop\dist\LifeAgente.exe"
if (-not (Test-Path $exe)) {
    throw "No se genero el ejecutable: $exe"
}
$peso = [math]::Round((Get-Item $exe).Length / 1MB, 1)

Write-Host "==> 4/4 Comprobacion" -ForegroundColor Cyan
$version = & "$venv\Scripts\python.exe" -c "import sys; print('.'.join(map(str,sys.version_info[:3])))"
Write-Host "    Python $version · ejecutable de $peso MB · app $((Get-Content (Join-Path $raiz "VERSION") -Raw).Trim())" -ForegroundColor Green
Write-Host ""
Write-Host "LISTO: $exe" -ForegroundColor Green
Write-Host "Copia ese archivo donde quieras y doble clic para instalar." -ForegroundColor Green
