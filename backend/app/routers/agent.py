"""Endpoints del agente: chat, ingesta de material académico y configuración."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import providers
from ..agent import _get_app_settings, aplicar_acciones, construir_contexto, procesar_mensaje
from ..config import settings
from ..database import get_db
from ..models import AppSettings, ChatMessage, Event, Task
from ..schemas import (
    AgentAction,
    ChatRequest,
    ChatResponse,
    IngestRequest,
    SettingsOut,
    SettingsUpdate,
)
from ..security import cifrar, descifrar

router = APIRouter(prefix="/api", tags=["agente"])


# --------------------------------------------------------------------------- #
# Chat con el agente
# --------------------------------------------------------------------------- #
@router.post("/agent/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    try:
        return await procesar_mensaje(db, payload)
    except providers.ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/agent/history")
def historial(limite: int = 50, db: Session = Depends(get_db)):
    msgs = db.scalars(
        select(ChatMessage).order_by(ChatMessage.id.desc()).limit(limite)
    ).all()
    return [
        {
            "id": m.id, "rol": m.rol, "contenido": m.contenido,
            "categoria": m.categoria,
            "payload": json.loads(m.payload) if m.payload else None,
            "creado_en": m.creado_en.isoformat() if m.creado_en else None,
        }
        for m in reversed(msgs)
    ]


@router.delete("/agent/history", status_code=204)
def limpiar_historial(db: Session = Depends(get_db)):
    for m in db.scalars(select(ChatMessage)).all():
        db.delete(m)


# --------------------------------------------------------------------------- #
# Ingesta académica (Notion / Classroom / PDF pegado)
# --------------------------------------------------------------------------- #
@router.post("/agent/ingest")
async def ingerir(payload: IngestRequest, db: Session = Depends(get_db)):
    """Resume el material, crea la tarea y agenda bloques de estudio."""
    app = _get_app_settings(db)
    proveedor = (payload.proveedor or app.proveedor or "mock").lower()
    modelo = payload.modelo or app.modelo or settings.default_openai_model
    api_key = payload.api_key or descifrar(app.api_key_cifrada)

    system = (
        "Eres un asistente académico. Extrae del material un resumen en español, "
        "3 a 5 ideas clave y 3 a 5 preguntas de estudio. "
        'Responde SOLO con este JSON: {"resumen": "...", "ideas_clave": ["..."], '
        '"preguntas_estudio": ["..."], "materia": "...", "titulo": "..."}'
    )
    user = f"MATERIAL:\n{payload.material}\n\nTÍTULO: {payload.titulo}"
    try:
        texto = await providers.complete(system, user, proveedor=proveedor, api_key=api_key, modelo=modelo)
        crudo = providers.extract_json(texto)
    except providers.ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    accion = AgentAction(
        tipo="resumir_material",
        datos={
            "titulo": crudo.get("titulo") or payload.titulo,
            "materia": crudo.get("materia") or payload.materia,
            "material": payload.material,
            "resumen": crudo.get("resumen") or "",
            "preguntas_estudio": crudo.get("preguntas_estudio") or [],
            "minutos_estudio": payload.minutos_estudio,
            "fecha_entrega": payload.fecha_entrega.isoformat() if payload.fecha_entrega else None,
            "fuente": payload.fuente,
        },
        motivo="Material importado desde el agente.",
    )
    resumen = aplicar_acciones(db, [accion])

    # Agenda un bloque de estudio en el primer hueco libre de mañana
    tarea_id = resumen["tareas_creadas"][0] if resumen["tareas_creadas"] else None
    if tarea_id:
        inicio = datetime.combine(date.today(), datetime.min.time()).replace(hour=18)
        while db.scalars(
            select(Event).where(Event.inicio < inicio + timedelta(hours=1)).where(Event.fin > inicio)
        ).first():
            inicio += timedelta(minutes=30)
        ev = Event(
            titulo=f"Estudio: {payload.titulo}"[:160], categoria="estudio",
            inicio=inicio, fin=inicio + timedelta(minutes=payload.minutos_estudio),
            inamovible=False, fuente=payload.fuente,
        )
        db.add(ev)
        db.flush()
        tarea = db.get(Task, tarea_id)
        if tarea is not None:
            tarea.tarea_id = ev.id

    return {
        "resumen": crudo.get("resumen"),
        "ideas_clave": crudo.get("ideas_clave", []),
        "preguntas_estudio": crudo.get("preguntas_estudio", []),
        "tarea_id": tarea_id,
        "evento_estudio_id": resumen.get("estudio_programado", [None])[-1],
        "proveedor": proveedor,
    }


# --------------------------------------------------------------------------- #
# Configuración (BYOK)
# --------------------------------------------------------------------------- #
@router.get("/settings", response_model=SettingsOut)
def leer_settings(db: Session = Depends(get_db)):
    app = _get_app_settings(db)
    return SettingsOut(
        proveedor=app.proveedor,
        modelo=app.modelo,
        moneda=app.moneda,
        inicio_jornada=app.inicio_jornada,
        fin_jornada=app.fin_jornada,
        tiene_api_key=bool(app.api_key_cifrada),
        proveedor_efectivo=app.proveedor if app.api_key_cifrada else "mock",
    )


@router.put("/settings", response_model=SettingsOut)
def guardar_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    app = _get_app_settings(db)
    if payload.proveedor:
        app.proveedor = payload.proveedor.lower()
    if payload.modelo:
        app.modelo = payload.modelo
    if payload.moneda:
        app.moneda = payload.moneda
    if payload.inicio_jornada:
        app.inicio_jornada = payload.inicio_jornada
    if payload.fin_jornada:
        app.fin_jornada = payload.fin_jornada
    if payload.borrar_api_key:
        app.api_key_cifrada = None
    if payload.api_key:
        app.api_key_cifrada = cifrar(payload.api_key)   # cifrada en reposo (Fernet)
    db.flush()
    return leer_settings(db)


@router.get("/context")
def contexto_actual(db: Session = Depends(get_db)):
    """Estado que el agente ve (útil para depurar y para la UI)."""
    return json.loads(construir_contexto(db))
