# LifeAgente AI - instalador local (.exe) para Windows.
# Se compila con:  pyinstaller desktop/LifeAgente.spec --noconfirm --clean
#
# El .exe lleva dentro:
#   - el motor de Python (no hace falta instalar Python);
#   - la API completa (backend/app);
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
    "app.main",
    "app.config",
    "app.database",
    "app.models",
    "app.schemas",
    "app.providers",
    "app.planner",
    "app.agent",
    "app.policy",
    "app.connections",
    "app.security",
    "app.seed",
    "app.cuentas",
    "app.permisos",
    "app.paneles",
    "app.ia_local",
    "app.routers.crud",
    "app.routers.agent",
    "app.routers.conexiones",
    "app.routers.cuentas",
    "app.routers.permisos",
    "app.routers.paneles",
    "app.routers.responsabilidad",
    "app.routers.inicio",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "sqlalchemy.dialects.sqlite",
    "cryptography.hazmat.primitives.fernet",
]

for paquete in ("uvicorn", "fastapi", "sqlalchemy", "pydantic", "pydantic_settings",
                "httpx", "cryptography", "anyio", "starlette"):
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
