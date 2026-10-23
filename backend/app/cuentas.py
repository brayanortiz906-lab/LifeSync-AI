"""Cuentas de usuario: acceso con correo (verificación por código) o con Google.

Modelo de uso
-------------
* **Sin cuenta** (modo local): todo sigue en tu equipo, en la base SQLite, y
  no se sube absolutamente nada a ningún servidor. Es el usuario local (id 1).
* **Con cuenta**: entras con tu correo (recibiendo un código de verificación)
  o con tu cuenta de Google. Cada persona tiene sus datos aislados y puede
  guardar un respaldo en su cuenta personal de Google Drive.

Aislamiento
-----------
Todas las tablas de datos llevan ``usuario_id``. Un filtro de sesión de
SQLAlchemy (``do_orm_execute``) añade ``usuario_id = <usuario actual>`` a
todas las consultas, así que ningún router tiene que acordarse de filtrar.
"""
from __future__ import annotations

import hashlib
import os
import secrets
import smtplib
import ssl
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from email.message import EmailMessage

from fastapi import Depends, Header, HTTPException
from sqlalchemy import Boolean, Column, DateTime, Integer, String, event, select, func
from sqlalchemy.orm import Session as SASession

from .config import settings
from .connections import normalizar_proveedor, obtener_proveedor
from .database import Base, get_db
from .models import (
    AppSettings,
    ApprovalRequest,
    AuditLog,
    ChatMessage,
    ConexionIA,
    Event,
    LogEntry,
    Maintenance,
    Panel,
    PermisoPanel,
    PermisosCuenta,
    PolicySettings,
    Task,
)

#: Identificador del usuario local (sin cuenta).
USUARIO_LOCAL = 1

#: Usuario de la petición en curso (lo fija la dependencia `usuario_actual`).
_actual: ContextVar[int | None] = ContextVar("lifesync_usuario", default=None)

#: Modelos cuyos datos se aíslan por usuario.
MODELOS_AISLADOS = (
    Event, Task, LogEntry, Maintenance, ChatMessage, ConexionIA,
    AuditLog, ApprovalRequest, AppSettings, PolicySettings, PermisosCuenta,
)


# --------------------------------------------------------------------------- #
# Modelos
# --------------------------------------------------------------------------- #
class Usuario(Base):
    """Una persona con cuenta. Sin cuenta se usa el usuario local (id 1)."""

    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    correo = Column(String(180), unique=True, index=True, nullable=False)
    nombre = Column(String(80), default="")
    metodo = Column(String(20), default="email")     # email | google | local
    verificado = Column(Boolean, default=False)
    codigo_hash = Column(String(64), default="")
    codigo_expira = Column(DateTime, nullable=True)
    intentos = Column(Integer, default=0)
    #: Hash de la contrasena (pbkdf2). Vacio si la persona entro con Google
    #: o con un codigo de un solo uso.
    password_hash = Column(String(200), default="")
    #: Rol de la cuenta. "usuario" por defecto; "admin" solo si el servidor lo
    #: decide (ADMIN_EMAILS) o si un admin lo cambia desde el panel.
    #: NADIE puede elegir su rol al registrarse: el registro nunca lee este campo.
    rol = Column(String(20), default="usuario", index=True)
    #: Cuando esta activo, la cuenta no puede entrar (bloqueo por un admin).
    bloqueado = Column(Boolean, default=False)
    creado_en = Column(DateTime, default=datetime.now)
    ultimo_acceso = Column(DateTime, nullable=True)


class Sesion(Base):
    """Token de acceso de una persona (guardado hasheado, como una contraseña)."""

    __tablename__ = "sesiones"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    usuario_id = Column(Integer, index=True, nullable=False)
    creado_en = Column(DateTime, default=datetime.now)
    expira_en = Column(DateTime, nullable=True)
    agente = Column(String(160), default="")


# --------------------------------------------------------------------------- #
# Aislamiento por usuario (filtro automático de SQLAlchemy)
# --------------------------------------------------------------------------- #
_filtro_registrado = False


def registrar_filtro() -> None:
    """Registra (una sola vez) el filtro que aísla los datos por usuario."""
    global _filtro_registrado
    if _filtro_registrado:
        return

    @event.listens_for(SASession, "do_orm_execute")
    def _filtra_por_usuario(execute_state) -> None:  # pragma: no cover - hook
        if not execute_state.is_select:
            return
        uid = _actual.get()
        if uid is None:
            return
        for descripcion in execute_state.statement.column_descriptions:
            entidad = descripcion.get("entity")
            # `select(Event)` describe la clase; `join(...)` describe un Mapper.
            modelo = entidad if isinstance(entidad, type) else getattr(entidad, "class_", None)
            if modelo in MODELOS_AISLADOS and hasattr(modelo, "usuario_id"):
                execute_state.statement = execute_state.statement.where(
                    modelo.usuario_id == uid
                )

    @event.listens_for(SASession, "before_flush")
    def _completa_usuario(session, flush_context, instances) -> None:  # pragma: no cover
        uid = _actual.get()
        if uid is None:
            return
        for obj in session.new:
            if hasattr(obj, "usuario_id") and not getattr(obj, "usuario_id", None):
                obj.usuario_id = uid

    _filtro_registrado = True


def usuario_id_actual() -> int:
    """Id del usuario de la petición en curso (local si no hay sesión)."""
    return _actual.get() or USUARIO_LOCAL


def establecer_usuario(usuario_id: int | None) -> None:
    """Fija el usuario en curso (para tareas en segundo plano).

    El filtro de aislamiento usa un contextvar: en el autopilot (una tarea
    que corre sola) hay que indicar de quién son los datos que se tocan.
    """
    _actual.set(usuario_id)


# --------------------------------------------------------------------------- #
# Utilidades de código y correo
# --------------------------------------------------------------------------- #
def _hash(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- #
# Contrasenas (v19): la persona pone su correo y su contrasena, sin esperas
# --------------------------------------------------------------------------- #
_ITERACIONES_PBKDF2 = 120_000


def hash_password(password: str) -> str:
    """Guarda la contrasena como un hash con sal (nunca en texto plano)."""
    sal = os.urandom(16)
    derivado = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), sal, _ITERACIONES_PBKDF2
    )
    return f"pbkdf2${_ITERACIONES_PBKDF2}${sal.hex()}${derivado.hex()}"


def verificar_password(password: str, guardado: str) -> bool:
    """Comprueba una contrasena contra su hash (comparacion en tiempo constante)."""
    if not guardado or not password:
        return False
    try:
        _, iteraciones, sal_hex, esperado = guardado.split("$")
        derivado = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(sal_hex), int(iteraciones)
        )
    except (ValueError, TypeError):
        return False
    return secrets.compare_digest(derivado.hex(), esperado)


def registrar_con_password(
    db: SASession, correo: str, nombre: str, password: str
) -> tuple[Usuario, str, str]:
    """Crea la cuenta con contrasena y manda el codigo de verificacion.

    Devuelve (usuario, codigo, modo_envio). La contrasena sirve para entrar
    desde la primera vez; el codigo confirma que el correo es de la persona.
    """
    correo = correo.strip().lower()
    if "@" not in correo or "." not in correo.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Ese correo no parece válido.")
    if len(password or "") < 6:
        raise HTTPException(
            status_code=400,
            detail="La contrasena necesita al menos 6 caracteres.",
        )
    usuario = _buscar_o_crear(db, correo, nombre, "email")
    usuario.password_hash = hash_password(password)
    codigo = generar_codigo()
    usuario.codigo_hash = _hash(codigo)
    usuario.codigo_expira = datetime.now() + timedelta(minutes=15)
    usuario.intentos = 0
    db.flush()
    modo = enviar_codigo(correo, codigo, usuario.nombre, db=db)
    return usuario, codigo, modo


def entrar_con_password(
    db: SASession, correo: str, password: str
) -> tuple[Usuario | None, str]:
    """Entra con correo y contrasena.

    Devuelve (usuario, situacion) donde situacion es "ok", "no_existe",
    "mal_password" o "sin_verificar". Si la cuenta existe pero no esta
    verificada, se le reenvia el codigo (la persona no se queda afuera).
    """
    correo = correo.strip().lower()
    usuario = db.scalars(select(Usuario).where(Usuario.correo == correo)).first()
    if usuario is None:
        return None, "no_existe"
    if not verificar_password(password, usuario.password_hash or ""):
        return None, "mal_password"
    if not usuario.verificado:
        # Si ya hay un codigo vigente NO generamos otro: la persona escribe
        # el que ya tiene y no le inundamos el buzon ni el log.
        codigo_vigente = bool(
            usuario.codigo_hash
            and usuario.codigo_expira
            and usuario.codigo_expira > datetime.now()
        )
        if not codigo_vigente:
            codigo = generar_codigo()
            usuario.codigo_hash = _hash(codigo)
            usuario.codigo_expira = datetime.now() + timedelta(minutes=15)
            usuario.intentos = 0
            db.flush()
            enviar_codigo(correo, codigo, usuario.nombre, db=db)
        # v36: si la cuenta tiene contrasena, la persona YA demostro que es
        # ella: entra igual. El codigo solo confirma el buzon (para el
        # respaldo en Drive y los avisos). Si no tiene contrasena (entrada
        # solo por codigo), hace falta el codigo y se queda esperando.
        if (usuario.password_hash or "").strip():
            usuario.ultimo_acceso = datetime.now()
            db.flush()
            return usuario, "ok_sin_confirmar"
        return usuario, "sin_verificar"
    usuario.ultimo_acceso = datetime.now()
    db.flush()
    return usuario, "ok"


@contextmanager
def como_usuario(usuario_id: int):
    """Ejecuta un bloque viendo los datos de otra persona (paneles compartidos).

    El filtro de aislamiento usa un contextvar: cambiandolo temporalmente se
    leen los datos del dueño de un panel que nos fue compartido.
    """
    token = _actual.set(usuario_id)
    try:
        yield
    finally:
        _actual.reset(token)


def generar_codigo() -> str:
    """Código numérico de 6 dígitos (lo que la persona escribe en la web)."""
    return f"{secrets.randbelow(1_000_000):06d}"


def configuracion_smtp(db: SASession | None = None) -> dict[str, Any]:
    """Ajustes de correo EFECTIVOS del servidor.

    Primero mandan las variables del despliegue (SMTP_*); si no hay, se usan
    las que quien instalo la app guardo desde la propia aplicacion
    (tabla `configuracion_servidor`, clave cifrada).
    """
    datos: dict[str, Any] = {
        "host": (settings.smtp_host or "").strip(),
        "puerto": int(settings.smtp_port or 587),
        "usuario": (settings.smtp_user or "").strip(),
        "clave": settings.smtp_password or "",
        "desde": (settings.smtp_desde or "").strip(),
        "origen": "entorno" if (settings.smtp_host or "").strip() else "ninguno",
    }
    if datos["host"]:
        return datos
    if db is None:
        return datos
    try:
        from .models import ConfiguracionServidor

        fila = db.query(ConfiguracionServidor).order_by(ConfiguracionServidor.id).first()
    except Exception:
        return datos
    if fila is None or not (fila.smtp_host or "").strip():
        return datos
    clave = ""
    try:
        from .security import descifrar

        clave = descifrar(fila.smtp_password_cifrado) or ""
    except Exception:
        clave = ""
    datos.update(
        {
            "host": (fila.smtp_host or "").strip(),
            "puerto": int(fila.smtp_port or 587),
            "usuario": (fila.smtp_user or "").strip(),
            "clave": clave,
            "desde": (fila.smtp_desde or "").strip(),
            "origen": "app",
        }
    )
    return datos


def enviar_codigo_smtp_directo(
    destinatario: str,
    asunto: str,
    cuerpo: str,
    html: str,
    smtp: dict[str, Any],
) -> tuple[bool, str]:
    """Envia con SMTP. Devuelve (ok, mensaje)."""
    try:
        mensaje = EmailMessage()
        mensaje["Subject"] = asunto
        mensaje["From"] = smtp.get("desde") or smtp.get("usuario") or ""
        mensaje["To"] = destinatario
        mensaje.set_content(cuerpo)
        mensaje.add_alternative(html, subtype="html")
        with smtplib.SMTP(smtp["host"], int(smtp.get("puerto") or 587), timeout=20) as srv:
            srv.starttls(context=ssl.create_default_context())
            if smtp.get("usuario"):
                srv.login(smtp["usuario"], smtp.get("clave") or "")
            srv.send_message(mensaje)
        return True, "Enviado por correo."
    except Exception as exc:  # pragma: no cover - depende del SMTP
        print(f"[correo] no se pudo enviar a {destinatario}: {exc}")
        return False, f"No se pudo enviar por correo: {exc}"


def enviar_codigo(
    correo: str, codigo: str, nombre: str = "", db: SASession | None = None
) -> str:
    """Envia el codigo por correo.

    Devuelve 'brevo', 'resend', 'smtp', 'consola' o 'ninguno'.

    El codigo NUNCA se guarda en claro: en la base de datos solo queda su
    hash (SHA-256). Si alguien lee la base de datos, no puede usarlos para
    entrar. En produccion, ademas, el codigo no se devuelve en la respuesta
    de la API ni se imprime en el log del servidor.

    Se puede enviar con Brevo o Resend (una sola clave de API, sin SMTP) o
    con un servidor SMTP clasico; ver `app.correo`.
    """
    from . import correo as modulo_correo

    asunto = f"Tu codigo de acceso a {settings.app_name}"
    saludo = f"{(nombre or '').strip()} hola:" if (nombre or '').strip() else "Hola:"
    cuerpo = (
        f"{saludo}\n\n"
        f"Tu codigo para entrar a {settings.app_name} es:\n\n"
        f"    {codigo}\n\n"
        f"Vale por {settings.minutos_codigo} minutos y sirve una sola vez.\n"
        "Si no fuiste tu, ignora este mensaje: nadie puede entrar con el solo "
        "tener este correo.\n\n"
        "--\n"
        f"{settings.app_name} - Asistente Integral de Vida y Productividad"
    )
    html = f"""<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#0f172a;
font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e2e8f0">
  <div style="max-width:520px;margin:0 auto;background:#1e293b;border:1px solid #334155;
border-radius:16px;padding:28px">
    <div style="font-size:18px;font-weight:700;color:#c7d2fe">{settings.app_name}</div>
    <p style="margin:18px 0 6px;font-size:14px">{saludo}</p>
    <p style="margin:0 0 16px;font-size:14px">Tu codigo para entrar es:</p>
    <div style="font-size:30px;font-weight:800;letter-spacing:8px;text-align:center;
background:#0f172a;border:1px solid #4338ca;border-radius:12px;padding:16px;color:#a5b4fc">{codigo}</div>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">
      Vale por {settings.minutos_codigo} minutos y sirve una sola vez.
      Si no fuiste tu, ignora este mensaje: con este correo no se puede entrar sin el codigo.
    </p>
  </div>
</body></html>"""
    modo, mensaje = modulo_correo.enviar_correo(correo, asunto, cuerpo, html, db=db, nombre=nombre)
    if modo in ("brevo", "resend", "smtp"):
        print(f"[correo] codigo enviado a {correo} con {modo}")
        return modo
    if modo == "error":
        print(f"[correo] fallo al enviar a {correo}: {mensaje}")
        if settings.es_produccion:
            return "ninguno"
        return "consola"
    # Sin proveedor configurado.
    if settings.es_produccion:
        # En produccion NO se suelta el codigo por pantalla ni al log.
        print(f"[correo] no hay proveedor de correo configurado; no se puede enviar a {correo}")
        return "ninguno"
    # Modo desarrollo: el codigo se muestra en la respuesta (quien lo pide es
    # la propia persona). Al log NO se escribe: un codigo de acceso en el
    # log del servidor es una puerta abierta (quien lo lea entra).
    print(f"[correo] codigo de acceso generado para {correo} (6 digitos; no se escribe en el log)")
    return "consola"




# --------------------------------------------------------------------------- #
# Alta, verificación e inicio de sesión
# --------------------------------------------------------------------------- #
def _hay_algun_admin(db) -> bool:
    """Hay alguna cuenta con rol de administradora en esta instalacion?"""
    try:
        total = db.scalar(
            select(func.count())
            .select_from(Usuario)
            .where(Usuario.rol == "admin")
        )
        return int(total or 0) > 0
    except Exception:
        return False


def _buscar_o_crear(db: SASession, correo: str, nombre: str, metodo: str) -> Usuario:
    correo = correo.strip().lower()
    usuario = db.scalars(select(Usuario).where(Usuario.correo == correo)).first()
    if usuario is None:
        # El rol NUNCA se elige en el registro: solo nace 'admin' si el correo
        # esta en la lista de administradores del despliegue (ADMIN_EMAILS).
        # Asi nadie puede auto-asignarse permisos por la API.
        rol = "admin" if correo in settings.lista_admins else "usuario"
        # Primera cuenta de una instalacion nueva: queda como administradora si
        # todavia no hay ninguna. Asi el dueno de la app puede activar Google,
        # Outlook o GitHub PARA TODA LA GENTE desde la propia app, sin tener que
        # tocar variables de entorno en el despliegue.
        if rol == "usuario" and not _hay_algun_admin(db):
            rol = "admin"
        usuario = Usuario(
            correo=correo,
            nombre=nombre.strip()[:80],
            metodo=metodo,
            rol=rol,
        )
        db.add(usuario)
        db.flush()
    elif metodo == "google":
        # Un login con Google verifica el correo: es la misma cuenta.
        usuario.metodo = "google"
        usuario.verificado = True
        if nombre and not usuario.nombre:
            usuario.nombre = nombre.strip()[:80]
    return usuario


def solicitar_codigo(db: SASession, correo: str, nombre: str = "") -> tuple[Usuario, str, str]:
    """Crea (o reutiliza) la cuenta y devuelve (usuario, código, modo_envío)."""
    correo = correo.strip().lower()
    if "@" not in correo or "." not in correo.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Ese correo no parece válido.")
    usuario = _buscar_o_crear(db, correo, nombre, "email")
    # Freno de abuse: no se puede pedir un codigo tras otro sin esperar.
    if usuario.codigo_expira and usuario.codigo_expira > datetime.now():
        enviados_hace = (
            datetime.now() + timedelta(minutes=settings.minutos_codigo) - usuario.codigo_expira
        ).total_seconds()
        if enviados_hace < settings.segundos_entre_codigos:
            faltan = int(settings.segundos_entre_codigos - enviados_hace)
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Ya te enviamos un codigo hace poco. Espera {faltan} segundos "
                    "y pidalo otra vez (asi nadie puede inundarte el correo)."
                ),
            )
    codigo = generar_codigo()
    usuario.codigo_hash = _hash(codigo)
    usuario.codigo_expira = datetime.now() + timedelta(minutes=settings.minutos_codigo)
    usuario.intentos = 0
    db.flush()
    modo = enviar_codigo(correo, codigo, usuario.nombre, db=db)
    return usuario, codigo, modo


def verificar_codigo(db: SASession, correo: str, codigo: str) -> Usuario:
    """Comprueba el código y marca la cuenta como verificada."""
    correo = correo.strip().lower()
    usuario = db.scalars(select(Usuario).where(Usuario.correo == correo)).first()
    if usuario is None:
        raise HTTPException(status_code=404, detail="No encontramos esa cuenta. Pide un código nuevo.")
    if usuario.codigo_expira and usuario.codigo_expira < datetime.now():
        raise HTTPException(status_code=400, detail="El código expiró. Pide uno nuevo.")
    usuario.intentos = (usuario.intentos or 0) + 1
    if usuario.intentos > settings.max_intentos_codigo:
        # Se invalida el codigo: asi no se puede insistir con el mismo.
        usuario.codigo_hash = ""
        usuario.codigo_expira = None
        db.flush()
        raise HTTPException(
            status_code=429,
            detail=(
                "Demasiados intentos. El codigo quedo anulado: pide uno nuevo "
                "y revisa que sea el de tu correo."
            ),
        )
    if not secrets.compare_digest(usuario.codigo_hash or "", _hash(codigo.strip())):
        db.flush()
        raise HTTPException(status_code=400, detail="Ese código no es correcto. Revísalo e inténtalo otra vez.")
    usuario.verificado = True
    usuario.codigo_hash = ""
    usuario.codigo_expira = None
    usuario.intentos = 0
    usuario.ultimo_acceso = datetime.now()
    db.flush()
    return usuario


def entrar_con_cuenta(
    db: SASession, access_token: str, proveedor: str = "google_cuenta"
) -> Usuario:
    """Inicia sesion con el permiso que entrego el proveedor (Google, Outlook, GitHub)."""
    if not access_token:
        raise HTTPException(status_code=400, detail="Falta el permiso de la cuenta.")
    import httpx

    prov = obtener_proveedor(proveedor)
    urls: list[str] = []
    if prov and prov.userinfo_url:
        urls.append(prov.userinfo_url)
    if proveedor in ("google_cuenta", "chatgpt_cuenta"):
        urls += [
            "https://openidconnect.googleapis.com/v1/userinfo",
            "https://www.googleapis.com/oauth2/v3/userinfo",
        ]
    if proveedor == "github_cuenta":
        urls.append("https://api.github.com/user/emails")

    correo = ""
    nombre = ""
    with httpx.Client(timeout=20) as client:
        for url in urls:
            try:
                resp = client.get(url, headers={"Authorization": f"Bearer {access_token}"})
            except Exception:
                continue
            if resp.status_code != 200:
                continue
            try:
                datos = resp.json()
            except Exception:
                continue
            if isinstance(datos, list):  # /user/emails de GitHub
                for item in datos:
                    if item.get("primary") and item.get("email"):
                        correo = str(item["email"])
                        break
                if correo:
                    break
                continue
            correo = str(datos.get("email") or "")
            nombre = str(
                datos.get("name") or datos.get("given_name") or datos.get("login") or ""
            )
            if correo:
                break
    if not correo:
        raise HTTPException(
            status_code=400,
            detail=(
                "No pudimos leer tu correo. Vuelve a autorizar y comprueba que "
                "compartes el correo con la aplicacion."
            ),
        )
    metodo = "google" if proveedor == "google_cuenta" else proveedor.replace("_cuenta", "")
    usuario = _buscar_o_crear(db, correo, nombre, metodo)
    usuario.verificado = True
    usuario.ultimo_acceso = datetime.now()
    db.flush()
    return usuario


def entrar_con_google_id_token(
    db: SASession, id_token: str, client_id: str = ""
) -> Usuario:
    """Verifica el ID token de Google (del flujo GIS) y crea/loguea al usuario."""
    import httpx
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests

    if not client_id:
        # Intentar obtener el client_id configurado
        client_id = client_id_de(db, "google_cuenta")

    try:
        # Verificar el ID token con la librería oficial de Google
        request = requests.Request()
        idinfo = google_id_token.verify_oauth2_token(id_token, request, client_id)

        # El token es válido, extraer la información
        correo = idinfo.get("email", "")
        nombre = idinfo.get("name") or idinfo.get("given_name", "")
        if not correo:
            raise HTTPException(status_code=400, detail="El token no contiene correo electrónico")

        # Verificar que el email está verificado
        if not idinfo.get("email_verified"):
            raise HTTPException(status_code=400, detail="El correo no está verificado en Google")

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Token de Google inválido: {str(e)}",
        )

    # Crear o buscar el usuario
    usuario = _buscar_o_crear(db, correo, nombre, "google")
    usuario.verificado = True
    usuario.ultimo_acceso = datetime.now()
    db.flush()
    return usuario


def client_id_de(db: SASession, proveedor: str = "google_cuenta") -> str:
    """Client id del despliegue (nunca se le pide al usuario final).

    1) variable de entorno (GOOGLE_CLIENT_ID / OUTLOOK_CLIENT_ID / GITHUB_CLIENT_ID)
    2) el client id guardado (cifrado) en la conexion de ese proveedor
    3) el client id guardado por la persona en la app
    4) el client id PUBLICO publicado por el proyecto (bootstrap)

    El punto 4 es lo que hace que "solo con iniciar sesion" funcione: el
    identificador de cliente OAuth es publico (va incrustado en la app), asi
    que el despliegue puede publicarlo y la persona unicamente pulsa
    "Continuar con Google" y autoriza en el navegador.
    """
    from . import connections as con

    pid = normalizar_proveedor(proveedor)
    entorno = {
        "google_cuenta": settings.google_client_id,
        "outlook_cuenta": settings.outlook_client_id,
        "github_cuenta": settings.github_client_id,
    }.get(pid, "")
    if entorno.strip():
        return entorno.strip()
    # 2) La configuracion DEL SERVIDOR (la que guarda el administrador de la
    #    app). Es lo que hace que TODO EL MUNDO pueda entrar con Google,
    #    Outlook o GitHub: el identificador es publico y se configura una vez.
    try:
        from .models import ConfiguracionServidor

        servidor = db.scalars(
            select(ConfiguracionServidor).order_by(ConfiguracionServidor.id)
        ).first()
        if servidor is not None:
            del_servidor = {
                "google_cuenta": servidor.google_client_id,
                "outlook_cuenta": servidor.outlook_client_id,
                "github_cuenta": servidor.github_client_id,
            }.get(pid, "")
            if str(del_servidor or "").strip():
                return str(del_servidor).strip()
    except Exception:
        pass
    # Lo que la persona guardo desde la propia app (Conectar IA > configuracion
    # avanzada). Antes no se miraba aqui y el ID guardado no se usaba nunca.
    from .models import AppSettings

    app = db.scalars(
        select(AppSettings).where(AppSettings.usuario_id == usuario_id_actual())
    ).first()
    if app is not None:
        guardado_app = {
            "google_cuenta": app.google_client_id,
            "outlook_cuenta": app.outlook_client_id,
            "github_cuenta": app.github_client_id,
        }.get(pid, "")
        if (guardado_app or "").strip():
            return str(guardado_app).strip()
    from .models import ConexionIA

    conexion = db.scalars(
        select(ConexionIA)
        .where(ConexionIA.proveedor == pid)
        .order_by(ConexionIA.activa.desc(), ConexionIA.id.desc())
    ).first()
    if conexion is not None:
        cred = con.credenciales_desde_json(conexion.credenciales_cifradas)
        guardado = str(cred.get("client_id") or "").strip()
        if guardado:
            return guardado
    # 4) Identificador publico publicado por el proyecto: con esto la persona
    #    solo tiene que iniciar sesion, sin pegar ni configurar nada.
    try:
        from . import ia_local

        publico = str(ia_local.clientes_publicos().get(pid) or "").strip()
        if publico:
            return publico
    except Exception:
        pass
    raise HTTPException(
        status_code=400,
        detail=(
"Este servidor todavia no tiene activado el acceso con esa cuenta. "
            "Lo activa el dueno de la app en un solo paso (ayuda en 'Conectar IA > "
            "Ajustes tecnicos > Entrar con Google, Outlook o GitHub'). No te frena: "
            "entra con tu correo y tu contrasena, o sigue usando LifeAgente aqui."
        ),
    )




def crear_sesion(db: SASession, usuario: Usuario, agente: str = "") -> str:
    """Crea un token de acceso y lo devuelve (solo se ve una vez)."""
    token = secrets.token_urlsafe(32)
    sesion = Sesion(
        token_hash=_hash(token),
        usuario_id=usuario.id,
        expira_en=datetime.now() + timedelta(days=30),
        agente=agente[:160],
    )
    db.add(sesion)
    db.flush()
    return token


def _usuario_por_token(db: SASession, token: str) -> Usuario | None:
    if not token:
        return None
    sesion = db.scalars(select(Sesion).where(Sesion.token_hash == _hash(token))).first()
    if sesion is None:
        return None
    if sesion.expira_en and sesion.expira_en < datetime.now():
        db.delete(sesion)
        db.flush()
        return None
    return db.get(Usuario, sesion.usuario_id)


def cerrar_sesion(db: SASession, token: str) -> bool:
    sesion = db.scalars(select(Sesion).where(Sesion.token_hash == _hash(token))).first()
    if sesion is None:
        return False
    db.delete(sesion)
    db.flush()
    return True


# --------------------------------------------------------------------------- #
# Dependencias de FastAPI
# --------------------------------------------------------------------------- #
def usuario_actual(
    authorization: str | None = Header(default=None),
    db: SASession = Depends(get_db, scope="function"),
) -> Usuario:
    """Devuelve el usuario de la petición. Sin cabecera: usuario local."""
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    usuario = _usuario_por_token(db, token) if token else None
    if usuario is None:
        usuario = db.get(Usuario, USUARIO_LOCAL)
        if usuario is None:
            usuario = Usuario(
                id=USUARIO_LOCAL,
                correo="local@localhost",
                nombre="",
                metodo="local",
                verificado=True,
            )
            db.add(usuario)
            db.flush()
    _actual.set(usuario.id)
    return usuario


def salir_del_usuario() -> None:
    """Limpia el usuario de la petición (al terminar cada request)."""
    _actual.set(None)


def exigir_cuenta_verificada(usuario) -> None:
    """Impide guardar contenido si la cuenta no ha confirmado su correo.

    El usuario local (el que usa la app en su equipo sin registrarse) siempre
    puede guardar: es su propio computador.

    Excepcion (v36): una cuenta creada con CORREO Y CONTRASENA puede guardar
    aunque el servidor no tenga correo configurado. La contrasena ya es la
    prueba de que es la persona; el codigo solo sirve para confirmar que el
    buzon es suyo y asi poder usar el respaldo en Drive y los avisos por
    correo. Antes, sin servidor de correo, la cuenta quedaba bloqueada
    para siempre: un callejon sin salida.
    """
    if usuario is None:
        return
    if int(getattr(usuario, "id", 0) or 0) == USUARIO_LOCAL:
        return
    if getattr(usuario, "verificado", False):
        return
    if (getattr(usuario, "password_hash", "") or "").strip():
        # Tiene contrasena: puede usar la app. Solo faltan las funciones
        # que necesitan su buzon (respaldo en Drive, avisos por correo).
        return
    raise HTTPException(
        status_code=403,
        detail=(
            "Todavia no confirmaste tu correo, asi que todavia no puedes guardar contenido. "
            "Pide el codigo de 6 digitos y escribelo en la pantalla de acceso; en cuanto lo "
            "confirmes, se guarda todo lo que escribas."
        ),
    )


def usuario_verificado(usuario=Depends(usuario_actual)) -> Usuario:
    """Dependencia de FastAPI: solo deja pasar a cuentas confirmadas."""
    exigir_cuenta_verificada(usuario)
    return usuario


def exigir_admin(usuario) -> None:
    """Impide que alguien sin permisos de administrador entre.

    El rol se decide SOLO en el despliegue (ADMIN_EMAILS): el registro publico
    nunca puede crear administradores, y una cuenta bloqueada no entra.
    """
    if usuario is None:
        raise HTTPException(status_code=403, detail="Necesitas iniciar sesion.")
    if getattr(usuario, "bloqueado", False):
        raise HTTPException(
            status_code=403,
            detail="Esta cuenta esta bloqueada. Escribe al administrador de LifeAgente.",
        )
    # En una instalacion LOCAL (la que se descarga y corre en tu computador)
    # el unico usuario es el dueno de la maquina: el admin es el usuario local.
    if settings.perfil_efectivo == "local" and getattr(usuario, "id", 0) == 1:
        return
    if (getattr(usuario, "rol", "") or "") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Esta seccion es solo para administradores.",
        )


def usuario_admin(usuario=Depends(usuario_actual)) -> Usuario:
    """Dependencia de FastAPI: solo deja pasar a administradores."""
    exigir_admin(usuario)
    return usuario


# --------------------------------------------------------------------------- #
# Respaldo: snapshot en JSON (para Google Drive o descarga local)
# --------------------------------------------------------------------------- #
def snapshot(db: SASession) -> dict:
    """Exporta todos los datos del usuario actual a un JSON portable."""
    def filas(modelo, con_id: bool = False) -> list[dict]:
        out = []
        for obj in db.scalars(select(modelo)).all():
            datos = {}
            for col in modelo.__table__.columns:
                if col.name in ("id", "usuario_id") and not (con_id and col.name == "id"):
                    continue
                valor = getattr(obj, col.name)
                datos[col.name] = valor.isoformat() if hasattr(valor, "isoformat") else valor
            out.append(datos)
        return out

    return {
        "version": 2,
        "exportado_en": datetime.now().isoformat(),
        "eventos": filas(Event, con_id=True),
        "tareas": filas(Task, con_id=True),
        "registros": filas(LogEntry, con_id=True),
        "mantenimiento": filas(Maintenance, con_id=True),
        "chat": filas(ChatMessage, con_id=True),
        "paneles": filas(Panel, con_id=True),
        "permisos_panel": filas(PermisoPanel, con_id=True),
        "ajustes": filas(AppSettings),
        "politica": filas(PolicySettings),
        "conexiones": [
            {k: v for k, v in fila.items() if k != "credenciales_cifradas"}
            for fila in filas(ConexionIA)
        ],
    }


def _convertir_fechas(modelo, campos: dict) -> dict:
    """Convierte los ISO del snapshot en objetos fecha/hora de Python.

    Un snapshot guarda las fechas como texto ("2026-10-21T15:00:00"); SQLite
    no acepta texto en una columna DateTime y la peticion morria con un 500.
    """
    from datetime import date, datetime as _dt

    from sqlalchemy import Date as _Date
    from sqlalchemy import DateTime as _DateTime

    salida = dict(campos)
    for col in modelo.__table__.columns:
        valor = salida.get(col.name)
        if valor is None or not isinstance(valor, str):
            continue
        texto = valor.strip()
        if not texto:
            salida[col.name] = None
            continue
        try:
            if isinstance(col.type, _DateTime):
                salida[col.name] = _dt.fromisoformat(texto.replace("Z", ""))
            elif isinstance(col.type, _Date):
                salida[col.name] = date.fromisoformat(texto[:10])
        except ValueError:
            salida[col.name] = None
    return salida


def restaurar_snapshot(db: SASession, datos: dict) -> dict:
    """Restaura un snapshot (agenda, tareas, gastos y mantenimiento) sin romperse.

    Antes esto lanzaba un error 500 cuando el respaldo traia un bloque de
    estudio (la tarea apuntaba a un evento que no existia todavia) o cuando las
    fechas venian como texto. Ahora:
    * las fechas se convierten a fecha/hora reales,
    * los eventos se recrean primero y las tareas se apuntan a los nuevos,
    * lo que ya existe no se duplica,
    * si algo no se puede restaurar, se cuenta y se sigue.
    """
    from .models import Event, LogEntry, Maintenance, Panel, Task

    uid = usuario_id_actual() or USUARIO_LOCAL
    creados = {"eventos": 0, "tareas": 0, "registros": 0, "mantenimiento": 0, "paneles": 0}
    omitidos = 0

    # 1) Paneles: se recrean con el mismo nombre y se memoriza el id nuevo.
    mapa_paneles: dict[int, int] = {}
    for fila in datos.get("paneles", []) or []:
        nombre = str(fila.get("nombre") or "").strip()
        if not nombre:
            continue
        panel = db.scalars(
            select(Panel).where(Panel.nombre == nombre, Panel.usuario_id == uid)
        ).first()
        if panel is None:
            panel = Panel(
                nombre=nombre[:80],
                tipo=str(fila.get("tipo") or "agenda")[:24],
                color=str(fila.get("color") or "indigo")[:24],
                descripcion=str(fila.get("descripcion") or "")[:200],
                usuario_id=uid,
            )
            db.add(panel)
            db.flush()
            creados["paneles"] += 1
        if fila.get("id") is not None:
            mapa_paneles[int(fila["id"])] = panel.id

    def _panel_destino(valor):
        if valor is None:
            return None
        return mapa_paneles.get(int(valor))

    # 2) Eventos (primero: las tareas de estudio apuntan a un evento).
    mapa_eventos: dict[int, int] = {}
    for fila in datos.get("eventos", []) or []:
        campos = {
            k: v
            for k, v in fila.items()
            if hasattr(Event, k) and k not in ("id", "usuario_id")
        }
        if not campos.get("titulo"):
            omitidos += 1
            continue
        campos = _convertir_fechas(Event, campos)
        campos["panel_id"] = _panel_destino(fila.get("panel_id"))
        ya_existe = db.scalars(
            select(Event).where(
                Event.titulo.ilike(str(campos["titulo"])),
                Event.inicio == campos.get("inicio"),
            )
        ).first()
        if ya_existe is not None:
            mapa_eventos[int(fila.get("id", 0))] = ya_existe.id
            omitidos += 1
            continue
        evento = Event(**campos)
        db.add(evento)
        db.flush()
        if fila.get("id") is not None:
            mapa_eventos[int(fila["id"])] = evento.id
        creados["eventos"] += 1

    # 3) Tareas (el bloque de estudio se apunta al evento recien creado).
    for fila in datos.get("tareas", []) or []:
        campos = {
            k: v
            for k, v in fila.items()
            if hasattr(Task, k) and k not in ("id", "usuario_id")
        }
        if not campos.get("titulo"):
            omitidos += 1
            continue
        campos = _convertir_fechas(Task, campos)
        viejo = fila.get("tarea_id")
        campos["tarea_id"] = mapa_eventos.get(int(viejo)) if viejo is not None else None
        campos["panel_id"] = _panel_destino(fila.get("panel_id"))
        ya_existe = db.scalars(
            select(Task).where(
                Task.titulo.ilike(str(campos["titulo"])),
                Task.fecha_entrega == campos.get("fecha_entrega"),
            )
        ).first()
        if ya_existe is not None:
            omitidos += 1
            continue
        db.add(Task(**campos))
        creados["tareas"] += 1

    # 4) Gastos.
    for fila in datos.get("registros", []) or []:
        campos = {
            k: v
            for k, v in fila.items()
            if hasattr(LogEntry, k) and k not in ("id", "usuario_id")
        }
        if not campos.get("descripcion"):
            omitidos += 1
            continue
        campos = _convertir_fechas(LogEntry, campos)
        campos["panel_id"] = _panel_destino(fila.get("panel_id"))
        ya_existe = db.scalars(
            select(LogEntry).where(
                LogEntry.descripcion.ilike(str(campos["descripcion"])),
                LogEntry.fecha == campos.get("fecha"),
            )
        ).first()
        if ya_existe is not None:
            omitidos += 1
            continue
        db.add(LogEntry(**campos))
        creados["registros"] += 1

    # 5) Mantenimiento.
    for fila in datos.get("mantenimiento", []) or []:
        campos = {
            k: v
            for k, v in fila.items()
            if hasattr(Maintenance, k) and k not in ("id", "usuario_id")
        }
        if not campos.get("tarea"):
            omitidos += 1
            continue
        campos = _convertir_fechas(Maintenance, campos)
        campos["panel_id"] = _panel_destino(fila.get("panel_id"))
        ya_existe = db.scalars(
            select(Maintenance).where(
                Maintenance.tarea.ilike(str(campos["tarea"])),
                Maintenance.proxima_fecha == campos.get("proxima_fecha"),
            )
        ).first()
        if ya_existe is not None:
            omitidos += 1
            continue
        db.add(Maintenance(**campos))
        creados["mantenimiento"] += 1

    db.flush()
    return {"ok": True, "restaurados": creados, "omitidos": omitidos}


def fijar_usuario_de_peticion(db: SASession, authorization: str) -> int:
    """Fija el usuario de la peticion a partir de la cabecera Authorization.

    Sin cabecera (o con un token que no existe) se usa el usuario local: la
    aplicacion sigue funcionando en el equipo de la persona, sin cuenta.
    """
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    usuario = _usuario_por_token(db, token) if token else None
    if usuario is None:
        usuario = db.get(Usuario, USUARIO_LOCAL)
        if usuario is None:
            usuario = Usuario(
                id=USUARIO_LOCAL,
                correo="local@localhost",
                nombre="",
                metodo="local",
                verificado=True,
            )
            db.add(usuario)
            db.flush()
    _actual.set(usuario.id)
    return usuario.id
