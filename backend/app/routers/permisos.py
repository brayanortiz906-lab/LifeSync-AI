"""Permisos y autopiloto: la persona autoriza una vez y el sistema trabaja solo.

Rutas
-----
* ``GET  /api/permisos``                  qué permisos tienes concedidos.
* ``POST /api/permisos/autorizar``        pide TODOS los permisos de una vez.
* ``POST /api/permisos/terminar``         comprueba si ya autorizaste.
* ``POST /api/permisos/autopiloto``        enciende o apaga el trabajo automatico.
* ``POST /api/permisos/autopiloto/ejecutar``  lo ejecuta ahora mismo.
* ``POST /api/permisos/respaldo``         respalda ahora en Google Drive.
* ``POST /api/permisos/importar-calendario`` importa tu agenda de Google.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import connections as con
from ..config import settings
from ..cuentas import client_id_de, usuario_actual
from ..database import get_db
from ..permisos import (
    SCOPE_COMPLETO,
    _scope_real,
    activar_autopiloto,
    ejecutar_autopiloto,
    estado,
    guardar_credenciales,
    guardar_si_toca,
    importar_calendario,
    respaldar_drive,
    enviar_resumen_diario,
    ejecutar_autopiloto_para_todos,
)

router = APIRouter(prefix="/api/permisos", tags=["permisos"])


class AutorizarIn(BaseModel):
    proveedor: str = "google_cuenta"


class TerminarIn(BaseModel):
    device_code: str = ""


class AutopilotoIn(BaseModel):
    activo: bool = True
    respaldo_auto: bool = True
    importar_calendario: bool = True
    resumen_diario: bool = True


@router.get("")
def ver(db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_actual)):
    """Permisos concedidos y configuracion del autopiloto."""
    return estado(db)


@router.post("/autorizar")
def autorizar(
    payload: AutorizarIn,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_actual),
):
    """Arranca la autorización pidiendo todos los permisos de una vez."""
    try:
        client_id = client_id_de(db, payload.proveedor)
        datos = con.iniciar_autorizacion_cuenta(
            payload.proveedor, client_id, scope_extra=SCOPE_COMPLETO
        )
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **datos}


@router.post("/terminar")
def terminar(
    payload: TerminarIn,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_actual),
):
    """Comprueba si la persona ya autorizo y guarda los permisos."""
    try:
        client_id = client_id_de(db, "google_cuenta")
        cred, mensaje = con.completar_autorizacion_cuenta(
            "google_cuenta", client_id, payload.device_code
        )
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not cred:
        return {"ok": False, "mensaje": mensaje.strip()}
    cred["scope_real"] = _scope_real(str(cred.get("access_token") or ""))
    cred["proveedor"] = "google_cuenta"
    guardar_credenciales(db, cred)
    # Al autorizar por primera vez se enciende el autopiloto: la idea es que
    # el sistema trabaje solo a partir de ahi.
    fila = estado(db)
    if not fila["autopiloto"]["activo"]:
        activar_autopiloto(
            db,
            activo=True,
            respaldo_auto=True,
            importar_calendario=True,
        )
    return {"ok": True, "estado": estado(db)}


@router.post("/autopiloto")
def autopiloto(
    payload: AutopilotoIn,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_actual),
):
    """Enciende o apaga el trabajo automatico de esta persona."""
    return activar_autopiloto(
        db,
        activo=payload.activo,
        respaldo_auto=payload.respaldo_auto,
        importar_calendario=payload.importar_calendario,
        resumen_diario=payload.resumen_diario,
    )


@router.post("/guardar")
def guardar(
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_actual),
):
    """Guarda en Drive si la persona ya dejo de escribir (guardado con retardo)."""
    return guardar_si_toca(db)


@router.post("/correo/resumen")
def correo_resumen(
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_actual),
):
    """Manda ahora el resumen del dia siguiente por correo."""
    return enviar_resumen_diario(db)


@router.post("/ejecutar-todos")
def ejecutar_todos(
    x_cron_token: str = Header(default="", alias="X-Cron-Token"),
):
    """Trabajo automatico de TODAS las personas (lo llama la tarea diaria).

    Se protege con `CRON_TOKEN` (variable de entorno del despliegue) para que
    solo quien administra el servidor pueda dispararlo.
    """
    if not settings.cron_token:
        raise HTTPException(
            status_code=403,
            detail="Este servidor no tiene configurado CRON_TOKEN. Configuralo en el despliegue.",
        )
    if x_cron_token != settings.cron_token:
        raise HTTPException(status_code=403, detail="Token de la tarea diaria incorrecto.")
    return ejecutar_autopiloto_para_todos()


@router.post("/autopiloto/ejecutar")
def ejecutar(
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_actual),
):
    """Ejecuta ahora lo que el sistema hace solo."""
    return ejecutar_autopiloto(db)


@router.post("/respaldo")
def respaldo(db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_actual)):
    """Guarda una copia de tu vida en tu Google Drive."""
    return respaldar_drive(db)


@router.post("/importar-calendario")
def importar(
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_actual),
):
    """Importa tu agenda de Google Calendar."""
    return importar_calendario(db)
