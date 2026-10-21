# ==========================================================================
#  LifeAgente AI - empaquetar el sistema completo para tenerlo local
#  Crea un ZIP con TODO el codigo, la documentacion y los scripts.
#  Util cuando quieras llevar el sistema a otro equipo, revisarlo offline
#  o guardarlo como copia de seguridad del proyecto.
#
#  Uso:  powershell -ExecutionPolicy Bypass -File empaquetar.ps1
# ==========================================================================

$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$Destino = Join-Path $Raiz "LifeAgente-AI-sistema.zip"
$Fecha = Get-Date -Format "yyyyMM-dd-HHmm"

Write-Host ""
Write-Host "==> Empaquetando LifeAgente AI" -ForegroundColor Cyan
Write-Host "    origen : $Raiz"
Write-Host "    destino: $Destino"

# Lo que NO entra en el paquete (pesado, generado o con secretos).
# OJO: NO se excluye frontend\dist -> la interfaz compilada si viaja en el
# paquete y asi el sistema arranca sin Node.
$ExcluirNombres = @(
  ".git", "node_modules", ".venv", ".venv-desktop", "__pycache__",
  ".pytest_cache", ".idea", ".vscode", "build", "LifeAgente-AI-sistema.zip"
)
# Rutas absolutas que se descartan (carpetas de compilacion del instalador).
$ExcluirRutas = @(
  (Join-Path $Raiz "desktop\build"),
  (Join-Path $Raiz "desktop\dist"),
  (Join-Path $Raiz ".venv-desktop")
)

# Copia temporal sin lo que no debe ir.
$Temporal = Join-Path $env:TEMP ("lifeagente-empaquete-" + $Fecha)
if (Test-Path $Temporal) { Remove-Item -Recurse -Force $Temporal }
New-Item -ItemType Directory -Force -Path $Temporal | Out-Null

Write-Host "==> 1/4 Copiando el sistema"
robocopy $Raiz $Temporal /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 `
  /XD $ExcluirNombres $ExcluirRutas /XF "*.db" "*.db-wal" "*.db-shm" ".env" "*.pyc" "*.manifest" "*.tsbuildinfo" | Out-Null
if ($LASTEXITCODE -gt 7) { Write-Host "Aviso de robocopy: $LASTEXITCODE (0-7 es normal)" -ForegroundColor DarkGray }

Write-Host "==> 2/4 Anadiendo el LEEME de la copia"
@"
Esta es una copia completa de LifeAgente AI.

  LEEME.txt .......... como tenerlo en tu equipo
  MANUAL-LOCAL.md .... el manual del sistema (que hace cada archivo)
  README.md .......... resumen del proyecto
  docs/ .............. documentacion por area

  Para arrancar: desktop\INICIAR.bat   (o compila el instalador con
  desktop\build.ps1 y tendras LifeAgente.exe)

  Copia generada el $Fecha
"@ | Set-Content -Path (Join-Path $Temporal "ESTA-ES-UNA-COPIA.txt") -Encoding UTF8

Write-Host "==> 3/4 Comprimiendo"
if (Test-Path $Destino) { Remove-Item -Force $Destino }
Compress-Archive -Path (Join-Path $Temporal "*") -DestinationPath $Destino -CompressionLevel Optimal

$Tam = (Get-Item $Destino).Length
Write-Host "==> 4/4 Listo: $([System.IO.Path]::GetFileName($Destino)) ($([math]::Round($Tam/1MB,1)) MB)" -ForegroundColor Green
Write-Host "    descomprime esa carpeta donde quieras y lee LEEME.txt" -ForegroundColor DarkGray

Remove-Item -Recurse -Force $Temporal -ErrorAction SilentlyContinue
Write-Host ""
