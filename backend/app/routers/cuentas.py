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
    #: Nombre opcional: solo se usa si la cuenta todavia no existe.
    nombre: str = ""


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
def _mensaje_envio(modo: str) -> str:
    """Dice la verdad sobre como se envio (o no) el codigo.

    Antes la interfaz decia siempre "te enviamos el codigo a tu correo" y en
    realidad el servidor no lo habia enviado: la persona se quedaba esperando
    un correo que nunca llegaba.
    """
    if modo == "smtp":
        return "Te enviamos un codigo de 6 digitos a tu correo. Escribelo aqui abajo."
    if modo == "gmail":
        return "Te enviamos un codigo de 6 digitos con tu propio Gmail. Escribelo aqui abajo."
    if modo == "consola":
        return (
            "Este servidor todavia no esta configurado para enviar correos, asi que te "
            "mostramos el codigo aqui. Funciona igual: escribelo y entras."
        )
    return (
        "No pudimos enviarte el correo: este servidor todavia no esta configurado para "
        "enviar correos. Entra con Google, Outlook o GitHub (un clic, sin codigo) o sigue "
        "en este equipo."
    )


@router.post("/codigo")
def pedir_codigo(payload: CodigoIn, db: Session = Depends(get_db, scope="function")):
    """Crea la cuenta y manda el código de verificación."""
    usuario, codigo, modo = solicitar_codigo(db, payload.correo, payload.nombre)
    respuesta = {
        "ok": True,
        "modo": modo,
        "mensaje": _mensaje_envio(modo),
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
            else _mensaje_envio(modo)
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
            else _mensaje_envio(modo)
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
    if situacion == "ok_sin_confirmar":
        # Entra igual: la contrasena ya demuestra que es la persona. Lo que
        # falta es confirmar el buzon (para el respaldo en Drive y los avisos).
        return {
            "ok": True,
            "token": token,
            "usuario": _perfil(usuario),
            "accion": "entrar",
            "verificacion_pendiente": True,
            "mensaje": (
                "Entraste, pero tu correo sigue sin confirmar. Puedes usar la app igual; "
                "el codigo solo hace falta para el respaldo en Drive y los avisos."
            ),
        }
    return {"ok": True, "token": token, "usuario": _perfil(usuario)}


@router.post("/entrar-o-crear")
def entrar_o_crear(payload: EntrarIn, db: Session = Depends(get_db, scope="function")):
    """Un solo boton: si la cuenta existe entra, si no, la crea.

    Asi la persona no tiene que decidir "entrar" o "crear cuenta": escribe su
    correo y su contrasena, y el servidor hace lo que corresponda.
    """
    correo = payload.correo.strip().lower()
    usuario, situacion = entrar_con_password(db, correo, payload.password)
    if situacion == "ok":
        token = crear_sesion(db, usuario, "correo")
        return {
            "ok": True,
            "accion": "entrar",
            "token": token,
            "usuario": _perfil(usuario),
            "mensaje": f"Hola de nuevo, {usuario.nombre or 'bienvenido'}.",
        }
    if situacion == "ok_sin_confirmar":
        # Entra igual (la contrasena demuestra que es la persona); lo unico
        # pendiente es confirmar el buzon para el Drive y los avisos.
        token = crear_sesion(db, usuario, "correo")
        return {
            "ok": True,
            "accion": "entrar",
            "token": token,
            "usuario": _perfil(usuario),
            "verificacion_pendiente": True,
            "mensaje": (
                "Entraste, pero tu correo sigue sin confirmar. Puedes usar la app igual; "
                "el codigo solo hace falta para el respaldo en Drive y los avisos."
            ),
        }
    if situacion == "mal_password":
        raise HTTPException(
            status_code=401, detail="La contrasena no es correcta. Intentalo otra vez."
        )
    if situacion == "sin_verificar":
        # La cuenta existe pero falta confirmar el correo. Si todavia hay un
        # codigo vigente no enviamos otro (para no inundar el buzon): le
        # decimos a la persona que escriba el que ya tiene.
        if usuario.codigo_hash and usuario.codigo_expira and usuario.codigo_expira > datetime.now():
            return {
                "ok": True,
                "accion": "verificar",
                "modo": "pendiente",
                "correo": usuario.correo,
                "mensaje": (
                    "Tu cuenta esta creada pero falta confirmar el correo. "
                    "Escribe el codigo de 6 digitos que te enviamos."
                ),
            }
        usuario, codigo, modo = solicitar_codigo(db, correo, usuario.nombre)
        respuesta = {
            "ok": True,
            "accion": "verificar",
            "modo": modo,
            "correo": usuario.correo,
            "mensaje": (
                "Te reenviamos el codigo a tu correo. Escribelo para entrar."
                if modo == "smtp"
                else _mensaje_envio(modo)
            ),
        }
        if modo == "consola" and not settings.es_produccion:
            respuesta["codigo"] = codigo
        return respuesta
    # no_existe: creamos la cuenta con la contrasena que eligio.
    nombre = (payload.nombre or correo.split("@")[0]).strip()
    usuario, codigo, modo = registrar_con_password(db, correo, nombre, payload.password)
    respuesta = {
        "ok": True,
        "accion": "crear",
        "modo": modo,
        "correo": usuario.correo,
        "mensaje": (
            "Cuenta creada. Te enviamos un codigo de 6 digitos para confirmar tu correo."
            if modo == "smtp"
            else _mensaje_envio(modo)
        ),
    }
    if modo == "consola" and not settings.es_produccion:
        respuesta["codigo"] = codigo
    return respuesta


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
# Correo del servidor (solo administradores) - v36
# --------------------------------------------------------------------------- #
@router.get("/smtp")
def ver_smtp(usuario=Depends(usuario_admin)):
    """Como esta configurado el correo del servidor (nunca la clave)."""
    from ..models import ConfiguracionServidor

    fila = db_smtp_fila()
    guardada = bool(fila and (fila.smtp_host or "").strip())
    return {
        "ok": True,
        "configurado": bool((settings.smtp_host or "").strip()) or guardada,
        "origen": "entorno" if (settings.smtp_host or "").strip() else ("app" if guardada else "nada"),
        "host": (settings.smtp_host or "").strip() if settings.smtp_host else (fila.smtp_host if fila else ""),
        "puerto": int(settings.smtp_port or 587) if settings.smtp_host else (int(fila.smtp_port or 587) if fila else 587),
        "usuario": (settings.smtp_user or "").strip() if settings.smtp_host else (fila.smtp_user if fila else ""),
        "desde": (settings.smtp_desde or "").strip() if settings.smtp_host else (fila.smtp_desde if fila else ""),
        "tiene_clave": bool((settings.smtp_password or "").strip()) if settings.smtp_host else bool(fila and fila.smtp_password_cifrado),
    }


@router.put("/smtp")
def guardar_smtp(payload: dict, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_admin)):
    """Guarda el servidor de correo (clave cifrada) para que el codigo SI llegue."""
    from ..models import ConfiguracionServidor
    from ..security import cifrar

    host = str(payload.get("host") or "").strip()
    usuario_smtp = str(payload.get("usuario") or payload.get("user") or "").strip()
    # La clave puede venir como "clave" o como "password".
    clave = str(payload.get("clave") or payload.get("password") or "")
    fila = db.query(ConfiguracionServidor).order_by(ConfiguracionServidor.id).first()
    if fila is None:
        fila = ConfiguracionServidor()
        db.add(fila)
    if host:
        fila.smtp_host = host[:120]
    if payload.get("puerto"):
        try:
            fila.smtp_port = int(payload.get("puerto"))
        except Exception:
            fila.smtp_port = 587
    fila.smtp_user = usuario_smtp[:160]
    fila.smtp_desde = str(payload.get("desde") or "").strip()[:160]
    if clave:
        fila.smtp_password_cifrado = cifrar(clave)
    db.commit()
    return {
        "ok": True,
        "configurado": bool(fila.smtp_host),
        "origen": "app",
        "mensaje": "Correo configurado. A partir de ahora el codigo de verificacion si llega.",
    }


@router.post("/smtp/probar")
def probar_smtp(db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_admin)):
    """Envia un correo de prueba para confirmar que el servidor de correo sirve."""
    from ..cuentas import configuracion_smtp, enviar_codigo

    smtp = configuracion_smtp(db)
    if not smtp["host"]:
        raise HTTPException(status_code=400, detail="Todavia no hay ningun servidor de correo configurado.")
    modo = enviar_codigo(str(smtp["desde"] or smtp["usuario"] or "prueba@localhost"), "123456", "Prueba de LifeAgente", db=db)
    if modo == "smtp":
        return {"ok": True, "mensaje": f"Correo de prueba enviado a {smtp['desde'] or smtp['usuario']}."}
    raise HTTPException(status_code=502, detail="El servidor de correo no pudo enviar el mensaje. Revisa host, puerto y clave.")


# --------------------------------------------------------------------------- #
# Envio de correo SIN SMTP: Brevo o Resend (v39)
# --------------------------------------------------------------------------- #
@router.get("/correo")
def ver_correo(db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_admin)):
    """Estado del envio de correo: proveedor, si esta listo y NUNCA la clave."""
    from ..correo import catalogo_proveedores, resumen_configuracion

    return {"ok": True, "proveedores": catalogo_proveedores(), **resumen_configuracion(db)}


@router.put("/correo")
def guardar_correo(payload: dict, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_admin)):
    """Guarda el proveedor de correo (Brevo, Resend o SMTP) con su clave cifrada.

    Con Brevo o Resend basta UNA clave de API: sin puertos de correo, sin
    servidor SMTP y sin claves de aplicacion.
    """
    from ..correo import resumen_configuracion
    from ..models import ConfiguracionServidor
    from ..security import cifrar

    proveedor = str(payload.get("proveedor") or "smtp").strip().lower()
    if proveedor not in ("brevo", "resend", "smtp"):
        raise HTTPException(
            status_code=400,
            detail="Ese proveedor no existe. Usa Brevo (300 correos al dia), Resend (3.000 al mes) o SMTP.",
        )
    clave = str(payload.get("api_key") or payload.get("clave") or payload.get("password") or "").strip()
    remitente = str(payload.get("remitente") or payload.get("desde") or "").strip()
    fila = db.query(ConfiguracionServidor).order_by(ConfiguracionServidor.id).first()
    if fila is None:
        fila = ConfiguracionServidor()
        db.add(fila)
    fila.proveedor_correo = proveedor
    if remitente:
        fila.remitente = remitente[:160]
    if clave:
        fila.api_key_cifrada = cifrar(clave)
    if proveedor == "smtp":
        host = str(payload.get("host") or "").strip()
        if host:
            fila.smtp_host = host[:120]
        if payload.get("puerto"):
            try:
                fila.smtp_port = int(payload.get("puerto"))
            except Exception:
                fila.smtp_port = 587
        usuario_smtp = str(payload.get("usuario") or "").strip()
        if usuario_smtp:
            fila.smtp_user = usuario_smtp[:160]
        if remitente:
            fila.smtp_desde = remitente[:160]
        if clave:
            fila.smtp_password_cifrado = cifrar(clave)
    db.commit()
    return {
        "ok": True,
        "mensaje": "Correo configurado. A partir de ahora el codigo de verificacion si llega.",
        **resumen_configuracion(db),
    }


@router.post("/correo/probar")
def probar_correo(payload: dict, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_admin)):
    """Manda un correo de prueba para confirmar que el envio funciona."""
    from ..correo import enviar_correo, resumen_configuracion

    resumen = resumen_configuracion(db)
    destinatario = str(payload.get("correo") or "").strip() or str(resumen.get("remitente") or "").strip()
    if not destinatario:
        raise HTTPException(
            status_code=400,
            detail="Dinos a que correo mandamos la prueba (deja el campo 'correo' o pon un remitente).",
        )
    asunto = f"Prueba de correo de {settings.app_name}"
    texto = (
        "Este es un correo de prueba de LifeAgente AI.\n\n"
        "Si lo recibiste, el envio de correo funciona y el codigo de verificacion "
        "te llegara a tu bandeja."
    )
    html = (
        "<div style='font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;"
        "padding:24px;border-radius:12px'>"
        "<h3 style='color:#c7d2fe;margin:0 0 8px'>LifeAgente AI</h3>"
        "<p style='margin:0'>Este es un correo de prueba. Si lo recibiste, el envio "
        "de correo funciona y el codigo de verificacion te llegara.</p></div>"
    )
    modo, mensaje = enviar_correo(destinatario, asunto, texto, html, db=db)
    if modo in ("brevo", "resend", "smtp"):
        return {
            "ok": True,
            "modo": modo,
            "mensaje": f"Correo de prueba enviado a {destinatario} con {modo}. Revisa la bandeja de entrada y el correo no deseado.",
        }
    raise HTTPException(status_code=502, detail=mensaje or "No se pudo enviar el correo de prueba.")


def db_smtp_fila():
    """Fila de configuracion del servidor (la primera)."""
    from ..database import SessionLocal
    from ..models import ConfiguracionServidor

    with SessionLocal() as sesion:
        return sesion.query(ConfiguracionServidor).order_by(ConfiguracionServidor.id).first()


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


@router.post("/google/desde-conexion")
def entrar_google_desde_conexion(db: Session = Depends(get_db, scope="function")):
    """Entra con la cuenta de Google que ya esta conectada (sin volver a autorizar).

    La interfaz anuncia este camino desde hace tiempo, pero el endpoint no
    existia: al pulsarlo la API respondia 404.
    """
    from ..cuentas import entrar_con_cuenta
    from ..models import ConexionIA
    from ..security import descifrar

    conexion = (
        db.query(ConexionIA)
        .filter(ConexionIA.proveedor == "google_cuenta")
        .order_by(ConexionIA.activa.desc(), ConexionIA.id.desc())
        .first()
    )
    if conexion is None:
        raise HTTPException(
            status_code=400,
            detail="No hay ninguna cuenta de Google conectada. Entra con Google o con tu correo.",
        )
    cred = descifrar(conexion.credenciales_cifradas) or {}
    token = cred.get("access_token") or cred.get("api_key") or ""
    if not token:
        raise HTTPException(
            status_code=400,
            detail="La conexion de Google no tiene un token guardado. Vuelve a autorizar.",
        )
    try:
        usuario = entrar_con_cuenta(db, token, "google_cuenta")
    except Exception as exc:  # el token pudo caducar o estar revocado
        raise HTTPException(
            status_code=400,
            detail=f"No pudimos iniciar sesion con esa conexion de Google: {exc}"[:200],
        ) from exc
    if usuario is None:
        raise HTTPException(
            status_code=400,
            detail="No pudimos leer tu correo con esa conexion de Google. Vuelve a autorizar.",
        )
    return _perfil(usuario)


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


@router.get("/servidor/clientes")
def ver_clientes_servidor(
    db: Session = Depends(get_db, scope="function"), admin=Depends(usuario_admin)
):
    """Identificadores OAuth del SERVIDOR (son publicos) para entrar con Google, Outlook o GitHub."""
    from ..models import ConfiguracionServidor

    fila = db.scalars(select(ConfiguracionServidor).order_by(ConfiguracionServidor.id)).first()
    google = (fila.google_client_id if fila else "") or ""
    outlook = (fila.outlook_client_id if fila else "") or ""
    github = (fila.github_client_id if fila else "") or ""
    return {
        "ok": True,
        "google": google,
        "outlook": outlook,
        "github": github,
        "listo": bool(google or outlook or github),
        "mensaje": "Estos identificadores son publicos: no son tu contrasena ni un token privado.",
    }


@router.put("/servidor/clientes")
def guardar_clientes_servidor(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db, scope="function"),
    admin=Depends(usuario_admin),
):
    """Guarda los identificadores OAuth del servidor: valen para TODOS los usuarios."""
    from ..models import ConfiguracionServidor
    fila = db.scalars(select(ConfiguracionServidor).order_by(ConfiguracionServidor.id)).first()
    if fila is None:
        fila = ConfiguracionServidor()
        db.add(fila)
    cambios = []
    for clave, columna in (
        ("google", "google_client_id"),
        ("outlook", "outlook_client_id"),
        ("github", "github_client_id"),
    ):
        if clave not in payload:
            continue
        valor = str(payload.get(clave) or "").strip()
        setattr(fila, columna, valor)
        cambios.append(clave if valor else f"{clave} (borrado)")
    db.commit()
    return {
        "ok": True,
        "mensaje": (
            "Guardado. Ya toda la gente puede entrar con su cuenta."
            if cambios
            else "No se guardo nada: escribe al menos un identificador."
        ),
        "google": fila.google_client_id,
        "outlook": fila.outlook_client_id,
        "github": fila.github_client_id,
    }
