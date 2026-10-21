"""Endpoints de acceso: cuenta con correo (código de verificación) o con Google.

Rutas
-----
* ``POST /api/cuentas/codigo``      pide un código de 6 dígitos por correo.
* ``POST /api/cuentas/verificar``   valida el código y devuelve un token.
* ``POST /api/cuentas/google``      inicia sesión con el permiso de Google.
* ``GET  /api/cuentas/yo``          dice quién eres (o que eres local).
* ``POST /api/cuentas/salir``       cierra la sesión.
* ``GET  /api/cuentas/respaldo``    descarga todos tus datos en JSON.
* ``POST /api/cuentas/respaldo/drive``  guarda el respaldo en tu Google Drive.
* ``POST /api/cuentas/respaldo/restaurar``  restaura un respaldo.
"""
from __future__ import annotations

import json
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..cuentas import (
    USUARIO_LOCAL,
    cerrar_sesion,
    crear_sesion,
    entrar_con_google,
    enviar_codigo,
    snapshot,
    solicitar_codigo,
    usuario_actual,
    verificar_codigo,
)
from .. import connections as con
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/api/cuentas", tags=["cuentas"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class CodigoIn(BaseModel):
    correo: str = ""
    nombre: str = ""


class VerificarIn(BaseModel):
    correo: str = ""
    codigo: str = ""


class GoogleTerminarIn(BaseModel):
    """Cuerpo de 'ya autorice': solo hace falta el codigo del dispositivo."""

    device_code: str = ""


class GoogleIn(BaseModel):
    access_token: str = ""


class DriveIn(BaseModel):
    access_token: str = ""
    nombre: str = "lifesync-respaldo.json"


class RestaurarIn(BaseModel):
    datos: dict = {}


def _perfil(usuario) -> dict:
    return {
        "id": usuario.id,
        "correo": usuario.correo,
        "nombre": usuario.nombre,
        "metodo": usuario.metodo,
        "verificado": bool(usuario.verificado),
        "es_local": usuario.id == USUARIO_LOCAL,
    }


# --------------------------------------------------------------------------- #
# Acceso
# --------------------------------------------------------------------------- #
@router.post("/codigo")
def pedir_codigo(payload: CodigoIn, db: Session = Depends(get_db, scope="function")):
    """Crea la cuenta y manda el código de verificación."""
    usuario, codigo, modo = solicitar_codigo(db, payload.correo, payload.nombre)
    respuesta = {
        "ok": True,
        "modo": modo,
        "mensaje": (
            "Te enviamos un código de 6 dígitos a tu correo. Escribelo aquí abajo."
            if modo == "smtp"
            else "Tu servidor todavía no tiene configured el envío de correos, así que te mostramos el código aquí (modo desarrollo)."
        ),
        "correo": usuario.correo,
    }
    if modo == "consola":
        # En desarrollo el código se devuelve para poder probarlo sin SMTP.
        respuesta["codigo"] = codigo
    return respuesta


@router.post("/verificar")
def verificar(payload: VerificarIn, db: Session = Depends(get_db, scope="function")):
    """Comprueba el código y abre sesión."""
    usuario = verificar_codigo(db, payload.correo, payload.codigo)
    token = crear_sesion(db, usuario, "correo")
    return {"ok": True, "token": token, "usuario": _perfil(usuario)}


@router.post("/google")
def entrar_google(payload: GoogleIn, db: Session = Depends(get_db, scope="function")):
    """Entra con la cuenta de Google (usa el permiso que ya sabe ganar LifeSync)."""
    usuario = entrar_con_google(db, payload.access_token)
    token = crear_sesion(db, usuario, "google")
    return {"ok": True, "token": token, "usuario": _perfil(usuario)}


def _client_id_google(db: Session) -> str:
    """ID de cliente de Google configurado en el despliegue (una sola vez).

    Lo pone quien instala LifeSync (en Render o en el .env). El usuario final
    NUNCA ve este valor: solo pulsa "Continuar con Google" y autoriza.
    """
    if settings.google_client_id:
        return settings.google_client_id.strip()
    from ..models import ConexionIA

    conexion = db.scalars(
        select(ConexionIA)
        .where(ConexionIA.proveedor == "google_cuenta")
        .order_by(ConexionIA.activa.desc(), ConexionIA.id.desc())
    ).first()
    if conexion is not None:
        cred = con.credenciales_desde_json(conexion.credenciales_cifradas)
        client_id = str(cred.get("client_id") or "")
        if client_id:
            return client_id
    raise HTTPException(
        status_code=400,
        detail=(
            "Esta copia de LifeSync todavia no tiene el acceso con Google configurado. "
            "Lo activa una sola vez quien la instala (ayuda en 'Conectar IA > Configuracion avanzada'). "
            "Mientras tanto puedes entrar con tu correo o seguir en este equipo."
        ),
    )


@router.post("/google/iniciar")
def google_iniciar(db: Session = Depends(get_db, scope="function")):
    """Arranca el acceso con Google (sin pedirle nada al usuario)."""
    client_id = _client_id_google(db)
    try:
        datos = con.iniciar_autorizacion_cuenta("google_cuenta", client_id)
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        "user_code": datos["user_code"],
        "verification_uri": datos["verification_uri"],
        "intervalo": datos["intervalo"],
        "expira_en": datos["expira_en"],
        "device_code": datos["device_code"],
    }


@router.post("/google/terminar")
def google_terminar(payload: GoogleTerminarIn, db: Session = Depends(get_db, scope="function")):
    """Comprueba si la persona ya autorizo y abre su sesion."""
    client_id = _client_id_google(db)
    try:
        cred, mensaje = con.completar_autorizacion_cuenta(
            "google_cuenta", client_id, payload.device_code or ""
        )
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not cred:
        return {"ok": False, "mensaje": "Todavia falta que autorices en el navegador."}
    usuario = entrar_con_google(db, str(cred.get("access_token") or ""))
    token = crear_sesion(db, usuario, "google")
    return {"ok": True, "token": token, "usuario": _perfil(usuario)}


@router.post("/google/desde-conexion")
def entrar_google_desde_conexion(db: Session = Depends(get_db, scope="function")):
    """Entra con la cuenta de Google ya conectada en el Centro de Conexiones."""
    token = _token_de_google(db)
    usuario = entrar_con_google(db, token)
    token_sesion = crear_sesion(db, usuario, "google")
    return {"ok": True, "token": token_sesion, "usuario": _perfil(usuario)}


def _token_de_google(db: Session) -> str:
    """Permiso de Google guardado en la conexion activa del usuario."""
    from .. import connections as con
    from ..models import ConexionIA

    conexion = db.scalars(
        select(ConexionIA)
        .where(ConexionIA.proveedor == "google_cuenta")
        .order_by(ConexionIA.activa.desc(), ConexionIA.id.desc())
    ).first()
    if conexion is None:
        raise HTTPException(
            status_code=400,
            detail="Primero conecta tu cuenta de Google en 'Conectar IA' (boton 'Entrar con Google').",
        )
    cred = con.credenciales_desde_json(conexion.credenciales_cifradas)
    token = str(cred.get("access_token") or cred.get("api_key") or "")
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Tu conexion con Google no tiene permiso guardado. Vuelve a autorizarla.",
        )
    return token


@router.get("/yo")
def yo(usuario=Depends(usuario_actual)):
    """Quién es la persona de esta petición."""
    return {"ok": True, "usuario": _perfil(usuario)}


@router.post("/salir")
def salir(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db, scope="function"),
):
    """Cierra la sesión de este dispositivo."""
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    cerrar_sesion(db, token)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Respaldo
# --------------------------------------------------------------------------- #
@router.get("/respaldo")
def respaldo(db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_actual)):
    """Todos los datos de la persona, en JSON portable."""
    return snapshot(db)


@router.post("/respaldo/drive")
def respaldo_drive(payload: DriveIn, db: Session = Depends(get_db, scope="function")):
    """Guarda el respaldo en la cuenta de Google Drive de la persona."""
    if not payload.access_token:
        raise HTTPException(status_code=400, detail="Falta el permiso de Google.")
    datos = json.dumps(snapshot(db), ensure_ascii=False, indent=2).encode("utf-8")
    nombre = payload.nombre or "lifesync-respaldo.json"
    try:
        with httpx.Client(timeout=60) as client:
            resp = client.post(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                headers={"Authorization": f"Bearer {payload.access_token}"},
                files={
                    "metadata": (
                        "application/json",
                        json.dumps(
                            {"name": nombre, "mimeType": "application/json"}
                        ).encode("utf-8"),
                    ),
                    "file": ("application/json", datos),
                },
            )
    except Exception as exc:  # pragma: no cover - depende de la red
        raise HTTPException(status_code=502, detail=f"No se pudo contactar a Google Drive: {exc}") from exc
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail="Google Drive no aceptó el archivo. Revisa que hayas autorizado el acceso.",
        )
    info = resp.json()
    return {
        "ok": True,
        "archivo": info.get("name", nombre),
        "id": info.get("id", ""),
        "enlace": f"https://drive.google.com/file/d/{info.get('id', '')}/view",
    }


@router.post("/respaldo/drive/desde-conexion")
def respaldo_drive_desde_conexion(db: Session = Depends(get_db, scope="function")):
    """Guarda el respaldo en el Drive de la cuenta de Google ya conectada."""
    token = _token_de_google(db)
    return respaldo_drive(DriveIn(access_token=token), db)


@router.post("/respaldo/restaurar")
def restaurar(payload: RestaurarIn, db: Session = Depends(get_db, scope="function")):
    """Restaura un respaldo (eventos, tareas, gastos y mantenimiento)."""
    from ..models import Event, LogEntry, Maintenance, Task

    datos = payload.datos or {}
    creados = {"eventos": 0, "tareas": 0, "registros": 0, "mantenimiento": 0}
    for fila in datos.get("eventos", []):
        campos = {k: v for k, v in fila.items() if hasattr(Event, k)}
        if not campos.get("titulo"):
            continue
        db.add(Event(**campos))
        creados["eventos"] += 1
    for fila in datos.get("tareas", []):
        campos = {k: v for k, v in fila.items() if hasattr(Task, k)}
        if not campos.get("titulo"):
            continue
        db.add(Task(**campos))
        creados["tareas"] += 1
    for fila in datos.get("registros", []):
        campos = {k: v for k, v in fila.items() if hasattr(LogEntry, k)}
        if not campos.get("descripcion"):
            continue
        db.add(LogEntry(**campos))
        creados["registros"] += 1
    for fila in datos.get("mantenimiento", []):
        campos = {k: v for k, v in fila.items() if hasattr(Maintenance, k)}
        if not campos.get("tarea"):
            continue
        db.add(Maintenance(**campos))
        creados["mantenimiento"] += 1
    db.flush()
    return {"ok": True, "restaurados": creados}
