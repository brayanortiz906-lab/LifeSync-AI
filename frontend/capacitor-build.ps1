# LifeAgente AI - Build APK con Capacitor
# Uso: powershell -ExecutionPolicy Bypass -File frontend/capacitor-build.ps1

$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz

Write-Host ""
Write-Host "==> LifeAgente AI - Build APK (Capacitor)" -ForegroundColor Cyan
Write-Host "    Directorio: $Raiz" -ForegroundColor Gray

# 1. Verificar prerrequisitos
Write-Host "`n==> 1/6 Verificando prerrequisitos..." -ForegroundColor Cyan

$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java) {
    Write-Host "    [X] Java no encontrado. Instala JDK 21 (recomendado: Temurin o Eclipse Temurin)" -ForegroundColor Red
    exit 1
}
$javaVersion = java -version 2>&1 | Select-String "version"
Write-Host "    [OK] Java: $javaVersion" -ForegroundColor Green

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "    [X] Node.js no encontrado. Instala Node 20+" -ForegroundColor Red
    exit 1
}
$nodeVersion = node --version
Write-Host "    [OK] Node: $nodeVersion" -ForegroundColor Green

# 2. Instalar dependencias
Write-Host "`n==> 2/6 Instalando dependencias npm..." -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { Write-Host "    [X] npm ci falló" -ForegroundColor Red; exit 1 }
Write-Host "    [OK] Dependencias instaladas" -ForegroundColor Green

# 3. Build frontend
Write-Host "`n==> 3/6 Compilando frontend (Vite)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "    [X] Build frontend falló" -ForegroundColor Red; exit 1 }
Write-Host "    [OK] Frontend compilado en dist/" -ForegroundColor Green

# 4. Sincronizar Capacitor
Write-Host "`n==> 4/6 Sincronizando Capacitor (Android)..." -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "    [X] cap sync falló" -ForegroundColor Red; exit 1 }
Write-Host "    [OK] Capacitor sincronizado" -ForegroundColor Green

# 5. Build APK
Write-Host "`n==> 5/6 Compilando APK (Gradle)..." -ForegroundColor Cyan
$gradlePath = "$Raiz\android\gradlew.bat"
if (-not (Test-Path $gradlePath)) {
    Write-Host "    [X] No se encontró android/gradlew.bat. Ejecuta 'npx cap add android' primero." -ForegroundColor Red
    exit 1
}

# Build release APK
& $gradlePath assembleRelease -p "$Raiz\android"
if ($LASTEXITCODE -ne 0) { Write-Host "    [X] Gradle build falló" -ForegroundColor Red; exit 1 }

$apkPath = "$Raiz\android\app\build\outputs\apk\release\app-release-unsigned.apk"
if (-not (Test-Path $apkPath)) {
    # Buscar APK firmado si existe keystore
    $apkPath = "$Raiz\android\app\build\outputs\apk\release\app-release.apk"
}
if (-not (Test-Path $apkPath)) {
    Write-Host "    [X] APK no generado en $apkPath" -ForegroundColor Red
    exit 1
}

$apkSize = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
Write-Host "    [OK] APK generado: $apkSize MB" -ForegroundColor Green

# 6. Copiar a raíz para fácil acceso
Write-Host "`n==> 6/6 Copiando APK a raíz del proyecto..." -ForegroundColor Cyan
$destino = "$Raiz\LifeAgente.apk"
Copy-Item -Path $apkPath -Destination $destino -Force
Write-Host "    [OK] APK disponible en: $destino" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "BUILD APK COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "APK: $destino ($apkSize MB)"
Write-Host ""
Write-Host "Para instalar en dispositivo:" -ForegroundColor Cyan
Write-Host "  adb install -r $destino"
Write-Host ""
Write-Host "Para firmar (release a Play Store):" -ForegroundColor Cyan
Write-Host "  1. Genera keystore: keytool -genkey -v -keystore release-key.keystore -alias lifeagente -keyalg RSA -keysize 2048 -validity 10000"
Write-Host "  2. Edita android/app/build.gradle con signingConfig"
Write-Host "  3. Ejecuta: .\gradlew bundleRelease"
Write-Host ""
Write-Host "Para probar en emulador:" -ForegroundColor Cyan
Write-Host "  adb install -r $destino"
Write-Host ""