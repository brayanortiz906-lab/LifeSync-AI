"""LifeAgente AI — FastAPI.

Arranque:  python run.py     (http://localhost:8000/docs para ver la API)
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, SessionLocal, _migrar_sqlite, engine
from fastapi import Request
from .routers import agent as agent_router
from .routers import conexiones as conexiones_router
from .routers import paneles as paneles_router
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
    # Si la migracion falla (base muy vieja), la app debe ARRIBAR IGUAL: que un
    # error de esquema no deje al usuario sin servicio.
    try:
        _migrar_sqlite()
    except Exception as exc:  # pragma: no cover - nunca debe impedir arrancar
        print(f"[migracion] no se pudo actualizar el esquema: {exc}")
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
app.include_router(paneles_router.router)


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


@app.get("/api/diagnostico")
def diagnostico():
    """Autodiagnóstico: qué hay en la base de datos y si todo esta en orden.

    Sirve para detectar despliegues con el esquema viejo (la causa habitual de
    los errores 500) sin tener que mirar_logs del servidor.
    """
    from sqlalchemy import inspect as sa_inspect
    from sqlalchemy import text as sa_text

    info: dict = {"ok": True, "app": settings.app_name, "tablas": {}, "problemas": []}
    try:
        inspector = sa_inspect(engine)
        tablas = inspector.get_table_names()
        for tabla in tablas:
            info["tablas"][tabla] = len(inspector.get_columns(tabla))
        esperadas = [
            "usuarios", "events", "tasks", "log_entries", "maintenance_items",
            "chat_messages", "app_settings", "policy_settings", "audit_log",
            "approval_requests", "ai_connections", "permisos_cuenta",
            "paneles", "permisos_panel",
        ]
        for tabla in esperadas:
            if tabla not in info["tablas"]:
                info["problemas"].append(f"Falta la tabla {tabla}: la base esta incompleta.")
        with engine.connect() as conexion:
            try:
                total = conexion.execute(sa_text("SELECT COUNT(*) FROM usuarios")).scalar()
                info["usuarios"] = int(total or 0)
            except Exception as exc:
                info["problemas"].append(f"No se pudo leer la tabla de usuarios: {exc}")
        info["conexion"] = str(engine.url)
    except Exception as exc:  # pragma: no cover - autodiagnóstico
        info["ok"] = False
        info["problemas"].append(f"No se pudo inspeccionar la base de datos: {exc}")
    info["correos"] = bool(settings.smtp_host)
    info["google_configurado"] = bool(settings.google_client_id)
    return info


@app.exception_handler(Exception)
async def _error_global(request: Request, exc: Exception):
    """Ningun error debe verse como un 500 pelado: se explica en palabras."""
    import traceback

    print(f"[error] {request.method} {request.url.path}: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "El servidor tuvo un problema al procesar esa peticion. "
                "Ya lo registramos: prueba otra vez en un momento. "
                "Si sigue, revisa en 'Conectar IA > Direccion de la API' que la direccion "
                "sea la correcta."
            ),
            "error": str(exc)[:300],
            "ruta": request.url.path,
        },
    )


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
