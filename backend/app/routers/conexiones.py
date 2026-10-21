"""Endpoints del centro de conexiones de IA.

Permite conectar LifeSync con "la cuenta de IA que ya tienes" sin exigir
conocimientos tecnicos: el usuario elige un proveedor, el sistema le explica
en español que hacer, verifica la conexion y la deja activa.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import connections as con
from ..agent import _get_app_settings
from ..database import get_db
from ..models import ConexionIA
from ..schemas import (
    ConexionCreate,
    ConexionOut,
    ConexionTest,
    DetectarMotores,
    MotorLocal,
)
from ..security import cifrar

router = APIRouter(prefix="/api/conexiones", tags=["conexiones"])


# --------------------------------------------------------------------------- #
# Catalogo
# --------------------------------------------------------------------------- #
@router.get("/catalogo")
def catalogo():
    """Lista de proveedores con instrucciones en lenguaje llano."""
    return {"proveedores": con.listar_catalogo()}


@router.get("/locales")
async def detectar_locales():
    """Busca motores de IA ya levantados en el equipo del usuario."""
    motores = await con.detectar_motores_locales()
    return {"motores": motores, "total": len(motores)}


@router.get("/modelos")
def modelos(proveedor: str = "openrouter"):
    """Catalogo de modelos que la persona puede elegir ("cualquier IA")."""
    lista = con.listar_modelos_publicos(proveedor)
    familias: dict[str, int] = {}
    for m in lista:
        familias[m["familia"]] = familias.get(m["familia"], 0) + 1
    return {
        "proveedor": con.normalizar_proveedor(proveedor),
        "modelos": lista,
        "total": len(lista),
        "familias": [{"familia": k, "modelos": v} for k, v in sorted(familias.items())],
    }


# --------------------------------------------------------------------------- #
# Conexiones
# --------------------------------------------------------------------------- #
@router.get("")
def listar(db: Session = Depends(get_db, scope="function")):
    """Conexiones guardadas (nunca se expone la credencial en claro)."""
    filas = db.scalars(select(ConexionIA).order_by(ConexionIA.id)).all()
    return [_a_out(c, db) for c in filas]


@router.post("", response_model=ConexionOut)
def guardar(payload: ConexionCreate, db: Session = Depends(get_db, scope="function")):
    """Crea o actualiza la conexion de un proveedor y la deja activa."""
    pid = con.normalizar_proveedor(payload.proveedor)
    prov = con.obtener_proveedor(pid)
    if prov is None:
        raise HTTPException(status_code=400, detail=f"Proveedor desconocido: '{payload.proveedor}'")

    credenciales: dict = {}
    if payload.api_key:
        credenciales["api_key"] = payload.api_key.strip()
    if payload.base_url:
        credenciales["base_url"] = payload.base_url.strip()
    if payload.token:
        credenciales["token"] = payload.token.strip()
    if payload.email:
        credenciales["email"] = payload.email.strip()
    if not credenciales.get("base_url") and prov.base_url:
        # Los motores locales (Ollama, LM Studio) ya traen su direccion: si el
        # usuario no escribe nada, se usa la de por defecto.
        credenciales["base_url"] = prov.base_url

    existente = db.scalars(
        select(ConexionIA).where(ConexionIA.proveedor == pid)
    ).first()
    if existente is None:
        existente = ConexionIA(proveedor=pid)
        db.add(existente)
    else:
        if payload.reemplazar_credenciales:
            existente.credenciales_cifradas = None

    if credenciales:
        if existente.credenciales_cifradas:
            actual = con.credenciales_desde_json(existente.credenciales_cifradas)
            actual.update(credenciales)
            credenciales = actual
        existente.credenciales_cifradas = con.credenciales_a_json(credenciales)

    existente.nombre = payload.nombre or prov.nombre
    existente.modo = payload.modo or prov.modo
    existente.modelo = payload.modelo or prov.modelo_defecto
    existente.estado = "pendiente_verificacion"
    existente.detalle_estado = "Conectado. Falta verificar que responda."
    db.flush()

    # La conexion activa pasa a ser la de este proveedor.
    _activar(db, existente, prov.modelo_defecto)
    db.flush()
    return _a_out(existente, db)


@router.post("/{conexion_id}/verificar", response_model=ConexionOut)
async def verificar(conexion_id: int, db: Session = Depends(get_db, scope="function")):
    """Prueba la conexion: llama al proveedor y reporta el resultado."""
    conexion = db.get(ConexionIA, conexion_id)
    if conexion is None:
        raise HTTPException(status_code=404, detail="Conexion no encontrada.")

    cred = con.credenciales_desde_json(conexion.credenciales_cifradas)
    ok, mensaje, extra = await con.verificar_credenciales(
        conexion.proveedor, cred, conexion.modelo or None
    )
    conexion.estado = "activa" if ok else "error"
    conexion.detalle_estado = mensaje
    conexion.verificada_en = datetime.now()
    if extra.get("modelos") and not conexion.modelo:
        conexion.modelo = extra["modelos"][0]
    db.flush()
    if ok:
        _activar(db, conexion, conexion.modelo)
        db.flush()
    return _a_out(conexion, db)


@router.post("/verificar", response_model=ConexionTest)
async def verificar_sin_guardar(payload: ConexionTest):
    """Verifica credenciales al vuelo, sin persistir nada."""
    cred: dict = {}
    if payload.api_key:
        cred["api_key"] = payload.api_key.strip()
    if payload.base_url:
        cred["base_url"] = payload.base_url.strip()
    ok, mensaje, extra = await con.verificar_credenciales(
        payload.proveedor, cred, payload.modelo or None
    )
    return {"ok": ok, "mensaje": mensaje, "detalle": extra}


@router.post("/{conexion_id}/activar", response_model=ConexionOut)
def activar(conexion_id: int, db: Session = Depends(get_db, scope="function")):
    conexion = db.get(ConexionIA, conexion_id)
    if conexion is None:
        raise HTTPException(status_code=404, detail="Conexion no encontrada.")
    prov = con.obtener_proveedor(conexion.proveedor)
    _activar(db, conexion, conexion.modelo or (prov.modelo_defecto if prov else ""))
    db.flush()
    return _a_out(conexion, db)


# --------------------------------------------------------------------------- #
# Camino "con mi cuenta": OAuth 2.0 Device Authorization
# --------------------------------------------------------------------------- #
@router.post("/cuenta/iniciar")
def cuenta_iniciar(payload: ConexionTest):
    """Arranca la autorizacion con cuenta: devuelve el codigo y el link."""
    try:
        return con.iniciar_autorizacion_cuenta(payload.proveedor, payload.client_id or "")
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/cuenta/terminar")
def cuenta_terminar(payload: ConexionTest, db: Session = Depends(get_db, scope="function")):
    """Consulta si el usuario ya autorizo y, si es asi, guarda la conexion."""
    try:
        cred, mensaje = con.completar_autorizacion_cuenta(
            payload.proveedor, payload.client_id or "", payload.device_code or ""
        )
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not cred:
        return {"ok": False, "mensaje": mensaje.strip(), "conexion": None}

    prov = con.obtener_proveedor(payload.proveedor)
    nombre = f"{prov.nombre if prov else payload.proveedor}"
    if cred.get("email"):
        nombre = f"{nombre} ({cred['email']})"
    conexion = db.scalars(
        select(ConexionIA).where(ConexionIA.proveedor == payload.proveedor)
    ).first()
    if conexion is None:
        conexion = ConexionIA(proveedor=payload.proveedor, nombre=nombre)
        db.add(conexion)
    conexion.nombre = nombre
    conexion.modo = "cuenta"
    conexion.credenciales_cifradas = con.credenciales_a_json(cred)
    conexion.modelo = payload.modelo or (prov.modelo_defecto if prov else "")
    conexion.estado = "activa"
    conexion.detalle_estado = "Cuenta conectada. Autorizaste desde tu navegador."
    conexion.verificada_en = datetime.utcnow()
    conexion.activa = True
    db.flush()
    _activar(db, conexion, conexion.modelo)
    db.flush()
    return {"ok": True, "mensaje": mensaje.strip(), "conexion": _a_out(conexion, db)}


@router.delete("/{conexion_id}")
def eliminar(conexion_id: int, db: Session = Depends(get_db, scope="function")):
    conexion = db.get(ConexionIA, conexion_id)
    if conexion is None:
        raise HTTPException(status_code=404, detail="Conexion no encontrada.")
    era_activa = conexion.activa
    db.delete(conexion)
    db.flush()
    if era_activa:
        # Vuelve al asistente demo para que el chat nunca quede sin motor.
        app = _get_app_settings(db)
        app.proveedor = "mock"
        app.modelo = settings_default_model()
        app.api_key_cifrada = None
        db.flush()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def settings_default_model() -> str:
    from ..config import settings as s
    return s.default_openai_model


def _activar(db: Session, conexion: ConexionIA, modelo: str) -> None:
    """Marca una conexion como activa y sincroniza AppSettings."""
    for otra in db.scalars(select(ConexionIA)).all():
        otra.activa = False
    conexion.activa = True
    app = _get_app_settings(db)
    app.proveedor = conexion.proveedor
    app.modelo = conexion.modelo or modelo
    if conexion.estado != "error":
        conexion.estado = "activa"
    if conexion.credenciales_cifradas:
        cred = con.credenciales_desde_json(conexion.credenciales_cifradas)
        if cred.get("api_key"):
            app.api_key_cifrada = cifrar(cred["api_key"])
        else:
            app.api_key_cifrada = None


def _modelos_disponibles(conexion: ConexionIA, prov) -> list[str]:
    """Modelos reales: en motores locales, los detectados en el servidor."""
    if prov and prov.modo == "local":
        detectados = con.detectar_motores_locales_sync()
        for motor in detectados:
            if motor["id"] == conexion.proveedor and motor.get("modelos"):
                return motor["modelos"]
    return prov.modelos if prov else []


def _a_out(conexion: ConexionIA, db: Session) -> dict:
    prov = con.obtener_proveedor(conexion.proveedor)
    cred = con.credenciales_desde_json(conexion.credenciales_cifradas)
    return {
        "id": conexion.id,
        "proveedor": conexion.proveedor,
        "nombre": conexion.nombre,
        "modo": conexion.modo,
        "modelo": conexion.modelo,
        "activa": conexion.activa,
        "estado": conexion.estado,
        "detalle_estado": conexion.detalle_estado,
        "creada_en": conexion.creada_en.isoformat() if conexion.creada_en else None,
        "verificada_en": conexion.verificada_en.isoformat() if conexion.verificada_en else None,
        "tiene_credencial": bool(cred.get("api_key") or cred.get("token")),
        "base_url": cred.get("base_url") or (prov.base_url if prov else ""),
        "icono": prov.icono if prov else "🔌",
        "resumen": prov.resumen if prov else "",
        "instrucciones": prov.instrucciones if prov else [],
        "modelos_disponibles": _modelos_disponibles(conexion, prov),
    }
