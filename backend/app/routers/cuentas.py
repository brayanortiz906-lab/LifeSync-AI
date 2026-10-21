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
from fastapi import APIRouter, Body, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..cuentas import (
    USUARIO_LOCAL,
    client_id_de,
    entrar_con_cuenta,
    entrar_con_password,
    cerrar_sesion,
    crear_sesion,
    entrar_con_cuenta,
    enviar_codigo,
    registrar_con_password,
    snapshot,
    solicitar_codigo,
    usuario_actual,
    usuario_admin,
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


class CuentaGoogleIn(BaseModel):
    """Peticion del flujo de acceso con cuenta (Google, Outlook, GitHub)."""

    proveedor: str = "google_cuenta"
    device_code: str = ""


class RegistroIn(BaseModel):
    correo: str = ""
    nombre: str = ""
    password: str = ""


class EntrarIn(BaseModel):
    correo: str = ""
    password: str = ""


def _perfil(usuario) -> dict:
    return {
        "id": usuario.id,
        "correo": usuario.correo,
        "nombre": usuario.nombre,
        "metodo": usuario.metodo,
        "verificado": bool(usuario.verificado),
        "es_local": usuario.id == USUARIO_LOCAL,
        "rol": getattr(usuario, "rol", "usuario") or "usuario",
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
            else (
                "Tu servidor todavía no tiene configurado el envío de correos, así que te "
                "mostramos el código aquí (modo desarrollo)."
                if modo == "consola"
                else "No pudimos enviar el correo. Escribe al administrador de LifeAgente "
                "o prueba con otra forma de entrar."
            )
        ),
        "correo": usuario.correo,
    }
    if modo == "consola" and not settings.es_produccion:
        # En desarrollo el codigo se devuelve para poder probarlo sin SMTP.
        # En produccion NUNCA sale por la respuesta (puede ser robado en la red).
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
    """Entra con la cuenta de Google (usa el permiso que ya sabe ganar LifeAgente)."""
    usuario = entrar_con_cuenta(db, payload.access_token, "google_cuenta")
    token = crear_sesion(db, usuario, "google")
    return {"ok": True, "token": token, "usuario": _perfil(usuario)}


def _client_id_google(db: Session) -> str:
    """ID de cliente de Google configurado en el despliegue (una sola vez).

    Lo pone quien instala LifeAgente (en Render o en el .env). El usuario final
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
            "El acceso con esa cuenta todavia no esta activado en este servidor "
            "(lo activa una sola vez quien lo instala). No te frena: entra con tu correo "
            "y tu contrasena, o sigue en este equipo."
        ),
    )


@router.post("/google/iniciar")
def google_iniciar(payload: CuentaGoogleIn, db: Session = Depends(get_db, scope="function")):
    """Arranca el inicio de sesion con cuenta: devuelve el codigo que hay que escribir."""
    try:
        client_id = client_id_de(db, payload.proveedor)
        datos = con.iniciar_autorizacion_cuenta(payload.proveedor, client_id)
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **datos}


@router.post("/google/terminar")
def google_terminar(payload: CuentaGoogleIn, db: Session = Depends(get_db, scope="function")):
    """Comprueba si la persona ya autorizo y abre sesion."""
    try:
        client_id = client_id_de(db, payload.proveedor)
        cred, mensaje = con.completar_autorizacion_cuenta(
            payload.proveedor, client_id, payload.device_code
        )
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not cred:
        return {"ok": False, "mensaje": mensaje.strip()}
    usuario = entrar_con_cuenta(db, cred.get("access_token", ""), payload.proveedor)
    token = crear_sesion(db, usuario, payload.proveedor)
    return {"ok": True, "token": token, "usuario": _perfil(usuario)}


@router.post("/reenviar-codigo")
def reenviar_codigo(payload: CodigoIn, db: Session = Depends(get_db, scope="function")):
    """Manda otra vez el codigo de verificacion (por correo o en pantalla)."""
    usuario, codigo, modo = solicitar_codigo(db, payload.correo, payload.nombre)
    respuesta = {
        "ok": True,
        "modo": modo,
        "correo": usuario.correo,
        "mensaje": (
            "Te enviamos un codigo nuevo a tu correo. Vale por 15 minutos."
            if modo == "smtp"
            else "Este servidor todavia no envia correos, asi que te mostramos el codigo aqui."
        ),
    }
    # El codigo solo se devuelve en desarrollo: en produccion NUNCA sale
    # por la respuesta ni por el log (si no, se podria robar en la red).
    if modo == "consola" and not settings.es_produccion:
        respuesta["codigo"] = codigo
    return respuesta


@router.get("/yo")
def yo(usuario=Depends(usuario_actual)):
    """Quién es la persona de esta petición."""
    return {"ok": True, "usuario": _perfil(usuario)}


# --------------------------------------------------------------------------- #
# Acceso con correo y contrasena (v19): sin esperas y sin limitaciones
# --------------------------------------------------------------------------- #
@router.post("/registro")
def registro(payload: RegistroIn, db: Session = Depends(get_db, scope="function")):
    """Crea tu cuenta con correo y contrasena y manda el codigo de verificacion.

    La contrasena sirve desde el primer momento; el codigo solo confirma que
    ese correo es tuyo (si el servidor no tiene SMTP configurado, el codigo
    se devuelve aqui para que puedas probarlo sin esperas).
    """
    usuario, codigo, modo = registrar_con_password(
        db, payload.correo, payload.nombre, payload.password
    )
    respuesta = {
        "ok": True,
        "modo": modo,
        "correo": usuario.correo,
        "mensaje": (
            "Cuenta creada. Te enviamos un codigo de 6 digitos para confirmar tu correo."
            if modo == "smtp"
            else "Cuenta creada. Este servidor todavia no envia correos: te mostramos el codigo aqui."
        ),
    }
    # El codigo solo se devuelve en desarrollo: en produccion NUNCA sale
    # por la respuesta ni por el log (si no, se podria robar en la red).
    if modo == "consola" and not settings.es_produccion:
        respuesta["codigo"] = codigo
    return respuesta


@router.post("/entrar")
def entrar(payload: EntrarIn, db: Session = Depends(get_db, scope="function")):
    """Entra con tu correo y tu contrasena."""
    usuario, situacion = entrar_con_password(db, payload.correo, payload.password)
    if situacion == "no_existe":
        raise HTTPException(
            status_code=404,
            detail="No encontramos esa cuenta. Creala con el boton de arriba.",
        )
    if situacion == "mal_password":
        raise HTTPException(
            status_code=401, detail="La contrasena no es correcta. Intentalo otra vez."
        )
    if situacion == "sin_verificar":
        raise HTTPException(
            status_code=403,
            detail=(
                "Tu cuenta existe pero falta confirmar el correo. "
                "Te reenviamos el codigo: escribelo para entrar."
            ),
        )
    token = crear_sesion(db, usuario, "correo")
    return {"ok": True, "token": token, "usuario": _perfil(usuario)}


@router.get("/proveedores")
def proveedores(db: Session = Depends(get_db, scope="function")):
    """Que cuentas se pueden usar para entrar y cuales estan activadas aqui.

    La interfaz usa esto para mostrar las opciones REALES (Google, Outlook,
    GitHub, cualquier correo) y para no dejar a nadie en un callejon sin
    salida: si un proveedor no esta activado, se ve de entrada que use su
    correo, que funciona siempre.
    """
    from ..connections import obtener_proveedor

    nombres = {
        "google_cuenta": ("Google", "Gmail, Google Workspace, cuentas escolares"),
        "outlook_cuenta": ("Outlook / Hotmail", "Hotmail, Outlook, Microsoft 365, cuentas escolares"),
        "github_cuenta": ("GitHub", "Cualquier cuenta de GitHub"),
    }
    salida: list[dict] = []
    for pid in ("google_cuenta", "outlook_cuenta", "github_cuenta"):
        prov = obtener_proveedor(pid)
        nombre, detalle = nombres.get(pid, (pid, ""))
        try:
            client_id_de(db, pid)
            disponible = True
        except HTTPException:
            disponible = False
        salida.append(
            {
                "id": pid,
                "nombre": nombre,
                "detalle": detalle,
                "icono": getattr(prov, "icono", "") or "",
                "disponible": disponible,
                "mensaje": (
                    "Un clic y ya estas dentro. No necesitas claves ni archivos."
                    if disponible
                    else "Este servidor todavia no lo tiene activado. Entra con tu correo: "
                    "funciona igual de bien."
                ),
                "url_registro": getattr(prov, "url_client_id", "") or getattr(prov, "url_registro", ""),
                "instrucciones": list(getattr(prov, "instrucciones", []) or []),
            }
        )
    return {
        "ok": True,
        "proveedores": salida,
        "correo": {
            "disponible": True,
            "mensaje": "Escribe tu correo y tu contrasena, o pide un codigo de un solo uso.",
        },
        "local": {
            "disponible": True,
            "mensaje": "Sin cuenta y sin subir nada: todo vive en tu computador.",
        },
    }


@router.get("/google/disponible")
def google_disponible(db: Session = Depends(get_db, scope="function")):
    """¿Este servidor tiene el acceso con Google activado?

    Así la interfaz no le muestra un error a la persona: si no está, le
    ofrece entrar con su correo (que funciona siempre).
    """
    try:
        client_id_de(db, "google_cuenta")
        disponible = True
    except HTTPException:
        disponible = False
    return {
        "ok": True,
        "disponible": disponible,
        "mensaje": (
            "Puedes entrar con Google con un solo clic."
            if disponible
            else "El acceso con Google todavia no esta activado en este servidor. "
            "Entra con tu correo y tu contrasena: funciona igual de bien."
        ),
    }


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
    from ..permisos import token_acceso

    token = token_acceso(db)
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Todavia no autorizaste el acceso a Google Drive.",
        )
    return respaldo_drive(DriveIn(access_token=token), db)


@router.post("/respaldo/restaurar")
def restaurar(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db, scope="function"),
):
    """Restaura un respaldo (eventos, tareas, gastos y mantenimiento).

    Acepta el snapshot tal cual o envuelto en {"datos": ...}. Nunca devuelve
    un error 500: si algo no se puede restaurar, lo cuenta y sigue.
    """
    from ..cuentas import restaurar_snapshot

    datos = payload.get("datos") if isinstance(payload.get("datos"), dict) else payload
    if not isinstance(datos, dict):
        datos = {}
    try:
        return restaurar_snapshot(db, datos)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - red de seguridad
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo restaurar el respaldo: {exc}",
        ) from exc


@router.post("/restaurar/drive")
def restaurar_desde_drive(db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_actual)):
    """Trae el ultimo respaldo de tu Google Drive y lo deja en tu cuenta."""
    from ..permisos import restaurar_drive
    from ..cuentas import restaurar_snapshot

    try:
        datos = restaurar_drive(db)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - depende de la red
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo leer tu Google Drive: {exc}",
        ) from exc
    if not datos:
        raise HTTPException(
            status_code=404,
            detail="No encontramos ningun respaldo en tu Drive. Autoriza el acceso a Drive e intenta otra vez.",
        )
    resultado = restaurar_snapshot(db, datos)
    resultado["origen"] = "google_drive"
    return resultado


@router.post("/sincronizar")
def sincronizar(db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_actual)):
    """Al entrar con tu cuenta: recupera de Drive lo que te falte.

    v21 (mejora A): ya no importa que el servidor este vacio o no. Se compara
    lo que hay aqui con el respaldo de Drive y se mete SOLO lo que falte (sin
    duplicar). Ademas, si tu contenido aqui es mas nuevo que el respaldo, no
    se toca nada (para no resucitar cosas que borraste).
    """
    from ..cuentas import restaurar_snapshot
    from ..permisos import restaurar_drive, ultimo_cambio_servidor

    try:
        respuesta = restaurar_drive(db)
    except Exception:
        respuesta = None
    if not respuesta or not respuesta.get("datos"):
        return {
            "ok": True,
            "restaurado": False,
            "mensaje": "Todavia no hay nada guardado en Drive para esta cuenta.",
        }
    fecha_respaldo = respuesta.get("fecha")
    ultimo_cambio = ultimo_cambio_servidor(db)
    if ultimo_cambio and fecha_respaldo and fecha_respaldo < ultimo_cambio:
        return {
            "ok": True,
            "restaurado": False,
            "mensaje": "Tu contenido de aqui es mas nuevo que el respaldo de Drive: no se toco nada.",
        }
    resultado = restaurar_snapshot(db, respuesta["datos"])
    restaurados = resultado.get("restaurados") or {}
    total = sum(int(v or 0) for v in restaurados.values())
    resultado["restaurado"] = True
    resultado["mensaje"] = (
        f"Recuperamos {total} cosa(s) de Google Drive."
        if total
        else "Tu contenido ya estaba al dia."
    )
    return resultado


# --------------------------------------------------------------------------- #
# Administracion de cuentas (v32)
# Solo un administrador del despliegue puede entrar aqui.
# --------------------------------------------------------------------------- #
class AdminUsuarioIn(BaseModel):
    """Cambios que puede aplicar un administrador sobre una cuenta."""
    rol: str | None = None
    bloqueado: bool | None = None


@router.get("/admin/usuarios")
def listar_usuarios(
    admin=Depends(usuario_admin),
    db: Session = Depends(get_db, scope="function"),
):
    """Lista las cuentas (sin codigos ni contrasenas: nunca se guardan en claro)."""
    from ..models import Usuario as ModeloUsuario

    cuentas = db.scalars(select(ModeloUsuario).order_by(ModeloUsuario.id)).all()
    return {
        "ok": True,
        "total": len(cuentas),
        "usuarios": [
            {
                "id": u.id,
                "correo": u.correo,
                "nombre": u.nombre,
                "metodo": u.metodo,
                "verificado": bool(u.verificado),
                "rol": getattr(u, "rol", "usuario") or "usuario",
                "bloqueado": bool(getattr(u, "bloqueado", False)),
                "creado_en": u.creado_en.isoformat() if u.creado_en else None,
                "ultimo_acceso": u.ultimo_acceso.isoformat() if u.ultimo_acceso else None,
            }
            for u in cuentas
        ],
    }


@router.patch("/admin/usuarios/{usuario_id}")
def editar_usuario(
    usuario_id: int,
    payload: AdminUsuarioIn,
    admin=Depends(usuario_admin),
    db: Session = Depends(get_db, scope="function"),
):
    """Cambia el rol o bloquea una cuenta. Queda auditado."""
    from ..models import AuditLog
    from ..models import Usuario as ModeloUsuario

    cuenta = db.get(ModeloUsuario, usuario_id)
    if cuenta is None:
        raise HTTPException(status_code=404, detail="No encontramos esa cuenta.")
    rol_anterior = getattr(cuenta, "rol", "usuario") or "usuario"
    bloqueado_anterior = bool(getattr(cuenta, "bloqueado", False))
    if payload.rol is not None:
        nuevo_rol = payload.rol.strip().lower()
        if nuevo_rol not in ("usuario", "admin"):
            raise HTTPException(
                status_code=400,
                detail="El rol solo puede ser 'usuario' o 'admin'.",
            )
        cuenta.rol = nuevo_rol
    if payload.bloqueado is not None:
        cuenta.bloqueado = bool(payload.bloqueado)
    db.add(
        AuditLog(
            actor="admin",
            tipo="cambio_politica",
            modulo="cuentas",
            entidad="usuario",
            entidad_id=str(cuenta.id),
            descripcion=(
                f"Admin cambio la cuenta {cuenta.correo}: rol {rol_anterior} -> "
                f"{getattr(cuenta, 'rol', 'usuario')}, bloqueado "
                f"{bloqueado_anterior} -> {bool(getattr(cuenta, 'bloqueado', False))}"
            ),
            reversible=True,
            resultado="ok",
        )
    )
    db.flush()
    return {
        "ok": True,
        "usuario": {
            "id": cuenta.id,
            "correo": cuenta.correo,
            "rol": getattr(cuenta, "rol", "usuario") or "usuario",
            "bloqueado": bool(getattr(cuenta, "bloqueado", False)),
        },
    }
