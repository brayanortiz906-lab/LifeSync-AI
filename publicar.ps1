# ==========================================================================
#  LifeAgente AI - publicar una mejora (del PC -> GitHub -> Render)
#
#  Uso:
#     powershell -ExecutionPolicy Bypass -File publicar.ps1 -Mensaje "fix(agenda): ..."
#
#  Que hace, en orden:
#     1. Comprueba que las 119 pruebas pasan y que la interfaz compila
#     2. Sube los cambios a GitHub (rama main del repo canonico)
#     3. Espera a que GitHub Actions termine (CI + publicacion de la web)
#     4. Te dice donde revisar el resultado (web y nube)
#
#  De aqui en adelante, Render reconstruye solo (autoDeploy: true).
# ==========================================================================

param(
  [string]$Mensaje = "",
  [switch]$SinPruebas
)

$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = "brayanortiz906-lab/LifeSync-AI"
$Servicio = "https://lifesync-ai-qs5t.onrender.com"
$Paginas = "https://brayanortiz906-lab.github.io/LifeSync-AI/"

function Titulo($t) {
  Write-Host ""
  Write-Host "==> $t" -ForegroundColor Cyan
}

function Ok($t)   { Write-Host "    [OK] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    [!] $t" -ForegroundColor Yellow }
function Error_($t) { Write-Host "    [X] $t" -ForegroundColor Red }

Set-Location $Raiz

# --------------------------------------------------------------------------- #
Titulo "1/4 Comprobando que todo esta bien"

if (-not $SinPruebas) {
  Write-Host "    pruebas del sistema..."
  $log = "$env:TEMP\lifeagente-smoke.log"
  & "$Raiz\backend\.venv\Scripts\python.exe" "$Raiz\backend\smoke.py" *> $log
  if ($LASTEXITCODE -ne 0) {
    Error_ "Las pruebas fallaron. Revisa $log"
    Get-Content $log -Tail 12
    exit 1
  }
  Ok "las 119 pruebas pasaron"

  Write-Host "    compilando la interfaz..."
  Push-Location "$Raiz\frontend"
  npm run build *> $env:TEMP\lifeagente-build.log
  $cod = $LASTEXITCODE
  Pop-Location
  if ($cod -ne 0) {
    Error_ "La interfaz no compila. Revisa $env:TEMP\lifeagente-build.log"
    Get-Content $env:TEMP\lifeagente-build.log -Tail 12
    exit 1
  }
  Ok "la interfaz compilo sin errores"
}

# --------------------------------------------------------------------------- #
Titulo "2/4 Subiendo los cambios a GitHub"

$pendientes = git status --porcelain
if (-not $pendientes) {
  Aviso "no hay cambios para publicar"
} else {
  Write-Host "    archivos con cambios:"
  $pendientes | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
  if (-not $Mensaje) {
    $Mensaje = Read-Host "    mensaje del commit"
  }
  if (-not $Mensaje) {
    Error_ "hace falta un mensaje de commit"
    exit 1
  }
  git add -A
  git commit -m $Mensaje
  if ($LASTEXITCODE -ne 0) { Error_ "el commit fallo"; exit 1 }
  Ok "commit creado"
}

git push upstream main
if ($LASTEXITCODE -ne 0) { Error_ "el push fallo (revisa los permisos del token)"; exit 1 }
Ok "subido a github.com/$Repo"

# --------------------------------------------------------------------------- #
Titulo "3/4 Esperando a GitHub Actions (CI + publicacion)"

$token = (Get-Content "$env:USERPROFILE\.lifesync\github-token.txt" -Raw).Trim()
$env:GH_TOKEN = $token

$runId = $null
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 6
  $json = gh run list --repo $Repo --limit 1 --json databaseId,status,conclusion 2>$null | ConvertFrom-Json
  if ($json) { $runId = $json[0].databaseId; break }
}
if (-not $runId) {
  Aviso "no se pudo leer el estado del workflow (revisa https://github.com/$Repo/actions)"
} else {
  for ($i = 0; $i -lt 40; $i++) {
    $json = gh run view $runId --repo $Repo --json status,conclusion 2>$null | ConvertFrom-Json
    if ($json.status -eq "completed") { break }
    Start-Sleep -Seconds 6
  }
  if ($json.status -eq "completed" -and $json.conclusion -eq "success") {
    Ok "GitHub Actions en verde (CI + publicacion de la web)"
  } else {
    Aviso "el workflow quedo en $($json.status)/$($json.conclusion). Mira: https://github.com/$Repo/actions"
  }
}

# --------------------------------------------------------------------------- #
Titulo "4/4 Listo"
Write-Host "    La web (GitHub Pages): $Paginas"
Write-Host "    La nube (Render):       $Servicio"
Write-Host ""
Write-Host "    Render reconstruye solo con cada push a main (autoDeploy: true)."
Write-Host "    Tarda 2-4 minutos. En el plan gratis se duerme a los 15 min de inactividad."
Write-Host "    Ojo: el disco de Render es efimero -> el almacen real de cada persona"
Write-Host "    es su Google Drive (respaldo automatico + recuperacion al entrar)."
Write-Host ""
