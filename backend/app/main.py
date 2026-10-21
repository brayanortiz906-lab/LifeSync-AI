"""LifeAgente AI — FastAPI.

Arranque:  python run.py     (http://localhost:8000/docs para ver la API)
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, SessionLocal, _migrar_sqlite, engine
from fastapi import Request
from .routers import agent as agent_router
from .routers import conexiones as conexiones_router
from .routers import cuentas as cuentas_router
from .routers import crud as crud_router
from .routers import permisos as permisos_router
from .routers import responsabilidad as responsabilidad_router
from .seed import sembrar


async def _tarea_autopiloto() -> None:
    """Cada 30 minutos: respaldo en Drive e importacion de la agenda.

    Esto es lo que hace que la app funcione "en la nube": el servidor trabaja
    solo con los permisos que la persona concedio, sin que nadie la abra.
    """
    import asyncio

    while True:
        await asyncio.sleep(1800)
        try:
            await asyncio.to_thread(_autopiloto_una_vez)
        except Exception as exc:  # pragma: no cover - nunca debe tumbar la app
            print(f"[autopiloto] fallo: {exc}")


def _autopiloto_una_vez() -> None:
    """Recorre las personas con autopiloto encendido y ejecuta su trabajo."""
    from .cuentas import Usuario, establecer_usuario
    from .permisos import ejecutar_autopiloto

    with SessionLocal() as db:
        personas = db.query(Usuario).filter(Usuario.id != 1).all()
        for persona in personas:
            establecer_usuario(persona.id)
            try:
                ejecutar_autopiloto(db)
                db.commit()
            except Exception as exc:  # pragma: no cover
                print(f"[autopiloto] {persona.correo}: {exc}")
                db.rollback()
            finally:
                establecer_usuario(None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Primero se crean las tablas y después se migran: la migración solo
    # afecta a bases ya existentes y, en una base nueva, `create_all` ya
    # deja todas las columnas al día.
    # v11: filtro de aislamiento por persona + tablas de cuentas.
    from .cuentas import registrar_filtro

    registrar_filtro()
    Base.metadata.create_all(bind=engine)
    _migrar_sqlite()
    # v12: si la persona ya tiene una IA local en su equipo, se conecta sola.
    try:
        from .routers.conexiones import autoconectar_al_arrancar

        await autoconectar_al_arrancar()
    except Exception as exc:  # pragma: no cover - nunca debe impedir arrancar
        print(f"[conexiones] no se pudo autoconectar: {exc}")
    with SessionLocal() as db:
        if sembrar(db):
            db.commit()
    # v16: el autopiloto trabaja en segundo plano (respaldo + agenda).
    tarea = asyncio.create_task(_tarea_autopiloto())
    try:
        yield
    finally:
        tarea.cancel()


app = FastAPI(
    title="LifeAgente AI",
    description="Asistente Integral de Vida y Productividad — API de eventos, tareas, bitácora y agente.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(crud_router.router)
app.include_router(agent_router.router)
app.include_router(responsabilidad_router.router)
app.include_router(conexiones_router.router)
app.include_router(cuentas_router.router)
app.include_router(permisos_router.router)


@app.middleware("http")
async def _conecta_persona(request: Request, call_next):
    """Fija quien es la persona de cada peticion (v11).

    Sin cabecera Authorization se usa el usuario local: la aplicacion sigue
    funcionando en el equipo, sin cuenta y sin subir nada a ningun sitio.
    """
    from .cuentas import fijar_usuario_de_peticion

    cabecera = request.headers.get("authorization", "")
    with SessionLocal() as db:
        fijar_usuario_de_peticion(db, cabecera)
    return await call_next(request)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "app": settings.app_name,
        "proveedor_por_defecto": settings.default_llm_provider,
        "modelo": settings.default_openai_model,
    }


# --------------------------------------------------------------------------- #
# Sirve el frontend compilado (build) si existe
# --------------------------------------------------------------------------- #
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        archivo = FRONTEND_DIST / full_path
        if full_path and archivo.is_file():
            return FileResponse(archivo)
        return FileResponse(FRONTEND_DIST / "index.html")
