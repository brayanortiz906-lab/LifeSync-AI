"""LifeSync AI — FastAPI.

Arranque:  python run.py     (http://localhost:8000/docs para ver la API)
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, SessionLocal, _migrar_sqlite, engine
from .routers import agent as agent_router
from .routers import crud as crud_router
from .routers import responsabilidad as responsabilidad_router
from .seed import sembrar


@asynccontextmanager
async def lifespan(app: FastAPI):
    _migrar_sqlite()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if sembrar(db):
            db.commit()
    yield


app = FastAPI(
    title="LifeSync AI",
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
