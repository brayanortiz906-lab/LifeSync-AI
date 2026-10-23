# LifeAgente AI v2.0 - instalador local (.exe) para Windows.
# Se compila con:  pyinstaller desktop/LifeAgente.spec --noconfirm --clean
#
# El .exe lleva dentro:
#   - el motor de Python (no hace falta instalar Python);
#   - la API completa (backend/app) con Supabase + Gemini BYOK;
#   - el System Prompt (shared/system_prompt.txt);
#   - la interfaz ya compilada (frontend/dist);
# y al arrancar crea la base de datos en %APPDATA%\LifeAgente.

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

RAIZ = Path(SPECPATH).parent
if RAIZ.name == "desktop":
    RAIZ = RAIZ.parent

datas = [
    (str(RAIZ / "shared" / "system_prompt.txt"), "shared"),
    (str(RAIZ / "frontend" / "dist"), "frontend/dist"),
    (str(RAIZ / "VERSION"), "."),
]

binarios = []
hiddenimports = [
    # App core v2.0
    "app.main",
    "app.config",
    "app.database",
    "app.models",
    "app.crypto",
    "app.supabase_client",
    # Auth
    "app.auth.supabase_auth",
    "app.auth.dependencies",
    "app.auth.schemas",
    # Services
    "app.services.gemini",
    "app.services.storage",
    "app.services.backup",
    # Routers
    "app.routers.auth",
    "app.routers.chat",
    "app.routers.accounts",
    "app.routers.events",
    "app.routers.tasks",
    "app.routers.panels",
    "app.routers.backups",
    # Uvicorn internals
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # DB drivers
    "sqlalchemy.dialects.postgresql",
    "asyncpg",
    # External libs
    "supabase",
    "cryptography.fernet",
    "google.generativeai",
    "pydantic",
    "pydantic_settings",
    "httpx",
    "anyio",
    "starlette",
]

for paquete in ("uvicorn", "fastapi", "sqlalchemy", "pydantic", "pydantic_settings",
                "httpx", "cryptography", "anyio", "starlette", "supabase"):
    try:
        d, b, h = collect_all(paquete)
        datas += d
        binarios += b
        hiddenimports += h
    except Exception:
        pass

a = Analysis(
    [str(RAIZ / "desktop" / "launcher.py")],
    pathex=[str(RAIZ / "backend")],
    binaries=binarios,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter.test", "matplotlib", "numpy", "pandas", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="LifeAgente",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    icon=None,
)