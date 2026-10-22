"""LifeAgente AI — FastAPI.

Arranque:  python run.py     (http://localhost:8000/docs para ver la API)
"""
from __future__ import annotations

import asyncio
import os
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
from .routers import inicio as inicio_router
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


async def _tarea_guardado() -> None:
    """Cada 45 segundos: si la persona DEJO de escribir, se guarda en Drive.

    Este es el guardado con retardo (v21): no se sube a la nube a media
    escritura, se espera a que la persona termine de poner informacion.
    El intervalo era de 20 s: como el guardado real ya espera 45 s a que la
    persona pare, preguntar cada 20 s solo hacia gastar consultas.
    """
    import asyncio

    while True:
        await asyncio.sleep(45)
        try:
            await asyncio.to_thread(_guardar_una_vez)
        except Exception as exc:  # pragma: no cover - nunca debe tumbar la app
            print(f"[guardado] fallo: {exc}")


def _guardar_una_vez() -> None:
    """Guarda en Drive a quien dejo de escribir (v21)."""
    from .cuentas import establecer_usuario
    from .database import engine
    from .permisos import guardar_si_toca

    try:
        with engine.connect() as conn:
            filas = conn.exec_driver_sql(
                "SELECT DISTINCT usuario_id FROM permisos_cuenta WHERE cambios_pendientes = 1"
            ).fetchall()
    except Exception:  # pragma: no cover
        return
    if not filas:
        return
    from .database import SessionLocal

    with SessionLocal() as db:
        for (uid,) in filas:
            establecer_usuario(uid)
            try:
                guardar_si_toca(db)
                db.commit()
            except Exception as exc:  # pragma: no cover
                print(f"[guardado] usuario {uid}: {exc}")
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
    # v21: guardado con retardo (45 s despues de que la persona pare).
    tarea_guardado = asyncio.create_task(_tarea_guardado())
    try:
        yield
    finally:
        tarea.cancel()
        tarea_guardado.cancel()


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
app.include_router(inicio_router.router)


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


@app.api_route("/api/health", methods=["GET", "HEAD"])
def health():
    return {
        "ok": True,
        "app": settings.app_name,
        "version": settings.version,
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
    info["pendientes"] = _pendientes_del_despliegue()
    info["listo"] = all(p["estado"] == "listo" for p in info["pendientes"])
    return info


def _pendientes_del_despliegue() -> list[dict[str, str]]:
    """Lista de lo que el administrador del despliegue tiene que dejar listo.

    Se calcula con informacion real del servidor, no con suposiciones: asi la
    persona ve si falta el correo, el acceso con Google o el modo produccion.
    """
    pendientes: list[dict[str, str]] = []

    def anadir(titulo: str, estado: str, como: str) -> None:
        pendientes.append({"titulo": titulo, "estado": estado, "como": como})

    # 1. Modo produccion: si no, el codigo de acceso se muestra por pantalla.
    if settings.es_produccion:
        anadir("Modo produccion (APP_ENTORNO=produccion)", "listo", "Ya activo.")
    else:
        anadir(
            "Modo produccion (APP_ENTORNO=produccion)",
            "pendiente",
            "Ponlo en Render > Environment > APP_ENTORNO = produccion. "
            "Mientras no lo pongas, el codigo de verificacion se muestra en pantalla.",
        )

    # 2. Correo: para que el codigo de verificacion llegue de verdad.
    if settings.smtp_host:
        anadir("Correo para enviar el codigo de verificacion (SMTP)", "listo", "Configurado.")
    else:
        anadir(
            "Correo para enviar el codigo de verificacion (SMTP)",
            "pendiente",
            "Configuralo en 'Conectar IA > Ajustes tecnicos > Envio de correo' "
            "(o con SMTP_* en el panel de Render).",
        )

    # 3. Acceso con Google / Outlook / GitHub.
    if settings.google_client_id:
        anadir("Acceso con Google (GOOGLE_CLIENT_ID)", "listo", "Configurado.")
    else:
        anadir(
            "Acceso con Google (GOOGLE_CLIENT_ID)",
            "opcional",
            "Crea un ID de cliente OAuth de escritorio en Google Cloud y pegalo en "
            "'Conectar IA > Ajustes tecnicos' (o en el panel de Render).",
        )

    # 4. Origenes permitidos: la web de GitHub Pages necesita el suyo.
    permitidos = [o.strip().lower() for o in settings.cors_origin_list]
    if "https://brayanortiz906-lab.github.io" in permitidos:
        anadir("La web de GitHub Pages puede llamar a la API (CORS)", "listo", "Ya permitido.")
    else:
        anadir(
            "La web de GitHub Pages puede llamar a la API (CORS)",
            "pendiente",
            "En Render > Environment > CORS_ORIGINS, anade https://brayanortiz906-lab.github.io "
            "y haz Save & Deploy.",
        )

    # 5. Direccion de la API en la web publicada.
    url_api = (os.environ.get("VITE_API_URL") or "").strip()
    if not url_api or url_api.startswith("http"):
        anadir("Direccion de la API en la web publicada (VITE_API_URL)", "listo", "Correcta o vacia (misma ruta).")
    else:
        anadir(
            "Direccion de la API en la web publicada (VITE_API_URL)",
            "pendiente",
            "El valor actual no es una URL. Ponlo vacio (la API va en el mismo sitio) "
            "o con la direccion completa, y haz Save & Deploy.",
        )
    return pendientes


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
from .config import FRONTEND_DIST  # noqa: E402  (ruta resuelta para .exe y repo)

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


# El chequeo de salud de Render (y algunos balanceadores) pide HEAD "/",
# no solo GET. Sin esto responden 405 y el despliegue queda en_warning.
#
# Se atienden TODOS los metodos y el manejador se registra SIEMPRE (no solo
# cuando hay interfaz compilada) para que una llamada a una ruta de la API
# que no existe (o con el verbo equivocado) responda 404 con un mensaje
# claro, y no el 405 confuso de Starlette ("Method Not Allowed"), que es lo
# que veia la persona al crear su cuenta desde una interfaz servida en un
# sitio estatico (GitHub Pages) sin API detras.
@app.api_route(
    "/{full_path:path}",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
def spa(full_path: str, request: Request):
    # Rutas de la API que no existen (o a las que se llega con otro metodo):
    # 404 en JSON con un mensaje claro, no una pagina HTML ni el 405
    # confuso de Starlette.
    if full_path.startswith("api/"):
        return JSONResponse(
            status_code=404,
            content={
                "detail": (
                    f"El servicio '{full_path}' no responde a una peticion "
                    f"{request.method}. Revisa la direccion de la API que tiene "
                    "configurada la app (Conectar IA > Direccion de la API)."
                ),
                # Igual que en el manejador global: que ruta fallo y con que
                # metodo, para poder arreglarlo sin adivinar.
                "ruta": full_path,
                "metodo": request.method,
            },
        )
    if request.method not in ("GET", "HEAD"):
        return JSONResponse(
            status_code=405,
            content={
                "detail": (
                    f"El metodo {request.method} no esta permitido en '{full_path}'. "
                    "Si estas en GitHub Pages, la API no esta ahi: "
                    "pon su direccion en Conectar IA > Direccion de la API."
                )
            },
        )
    if not FRONTEND_DIST.exists():
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "La interfaz no esta compilada en este servidor. "
                    "Compila la interfaz (npm run build en frontend/) o usa la "
                    "direccion de la API en otro sitio (Conectar IA > Direccion de la API)."
                )
            },
        )
    archivo = FRONTEND_DIST / full_path
    if full_path and archivo.is_file():
        return FileResponse(archivo)
    return FileResponse(FRONTEND_DIST / "index.html")
