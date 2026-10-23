"""LifeAgente AI — FastAPI con Supabase + Gemini (BYOK).

Arranque:  python run.py     (http://localhost:8000/docs para ver la API)
Despliegue: Docker → Render/Railway
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db, close_db
from app.routers import auth as auth_router
from app.routers import chat as chat_router
from app.routers import accounts as accounts_router
from app.routers import events as events_router
from app.routers import tasks as tasks_router
from app.routers import panels as panels_router
from app.routers import backups as backups_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializar DB (crear tablas si local)
    await init_db()
    print("[lifespan] DB inicializada")
    
    yield
    
    # Cerrar conexiones
    await close_db()
    print("[lifespan] DB cerrada")


app = FastAPI(
    title="LifeAgente AI",
    description="Asistente Integral de Vida y Productividad — API con Supabase Auth + PostgreSQL + Gemini BYOK",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers (API v1)
app.include_router(auth_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(chat_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(accounts_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(events_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(tasks_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(panels_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(backups_router.router, prefix=settings.API_V1_PREFIX)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log básico de requests."""
    import time
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    print(f"[{request.method}] {request.url.path} - {response.status_code} ({duration:.3f}s)")
    return response


@app.get("/health")
async def health():
    """Health check para Render/Railway."""
    return {
        "ok": True,
        "app": settings.APP_NAME,
        "version": "2.0.0",
        "environment": settings.ENVIRONMENT,
        "database": "supabase-postgresql",
        "auth": "supabase",
        "storage": "supabase-storage",
        "ai": "gemini-byok"
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Manejo global de errores."""
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Error interno del servidor. Intenta de nuevo en un momento.",
            "error": str(exc)[:200],
            "path": str(request.url.path),
        },
    )


# Sirve frontend compilado si existe
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str, request: Request):
        # API routes → 404 JSON
        if full_path.startswith("api/"):
            return JSONResponse(
                status_code=404,
                content={
                    "detail": f"Endpoint '{full_path}' no encontrado",
                    "path": full_path,
                    "method": request.method,
                },
            )
        
        # Non-GET → 405
        if request.method not in ("GET", "HEAD"):
            return JSONResponse(
                status_code=405,
                content={"detail": f"Método {request.method} no permitido en '{full_path}'"},
            )
        
        # Static file
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        
        # SPA fallback
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    async def root():
        return {
            "message": "LifeAgente API v2.0 - Frontend no compilado",
            "docs": "/docs",
            "health": "/health",
            "frontend": "Ejecuta 'npm run build' en frontend/ para compilar"
        }