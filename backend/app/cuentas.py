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
from email.message import EmailMessage

from fastapi import Depends, Header, HTTPException
from sqlalchemy import Boolean, Column, DateTime, Integer, String, event, select
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
    modo = enviar_codigo(correo, codigo, usuario.nombre)
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
        codigo = generar_codigo()
        usuario.codigo_hash = _hash(codigo)
        usuario.codigo_expira = datetime.now() + timedelta(minutes=15)
        usuario.intentos = 0
        db.flush()
        enviar_codigo(correo, codigo, usuario.nombre)
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


def enviar_codigo(correo: str, codigo: str, nombre: str = "") -> str:
    """Envía el código por correo. Devuelve 'smtp', 'consola' o 'ninguno'."""
    asunto = "Tu código de acceso a LifeAgente AI"
    cuerpo = (
        f"{(nombre or '').strip()} hola:\n\n"
        f"Tu código para entrar a LifeAgente AI es:  {codigo}\n\n"
        "El código vale por 15 minutos. Si no fuiste tú, ignora este mensaje."
    )
    if settings.smtp_host:
        try:
            mensaje = EmailMessage()
            mensaje["Subject"] = asunto
            mensaje["From"] = settings.smtp_desde or settings.smtp_user
            mensaje["To"] = correo
            mensaje.set_content(cuerpo)
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as srv:
                srv.starttls(context=ssl.create_default_context())
                if settings.smtp_user:
                    srv.login(settings.smtp_user, settings.smtp_password)
                srv.send_message(mensaje)
            return "smtp"
        except Exception as exc:  # pragma: no cover - depende del SMTP
            print(f"[correo] no se pudo enviar a {correo}: {exc}")
            return "ninguno"
    # Sin SMTP configurado: el código se muestra en la respuesta (modo desarrollo).
    print(f"[correo] codigo de acceso para {correo}: {codigo}")
    return "consola"


# --------------------------------------------------------------------------- #
# Alta, verificación e inicio de sesión
# --------------------------------------------------------------------------- #
def _buscar_o_crear(db: SASession, correo: str, nombre: str, metodo: str) -> Usuario:
    correo = correo.strip().lower()
    usuario = db.scalars(select(Usuario).where(Usuario.correo == correo)).first()
    if usuario is None:
        usuario = Usuario(correo=correo, nombre=nombre.strip()[:80], metodo=metodo)
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
    codigo = generar_codigo()
    usuario.codigo_hash = _hash(codigo)
    usuario.codigo_expira = datetime.now() + timedelta(minutes=15)
    usuario.intentos = 0
    db.flush()
    modo = enviar_codigo(correo, codigo, usuario.nombre)
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
    if usuario.intentos > 6:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Espera unos minutos y pide un código nuevo.",
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


def client_id_de(db: SASession, proveedor: str = "google_cuenta") -> str:
    """Client id del despliegue (nunca se le pide al usuario final).

    1) variable de entorno (GOOGLE_CLIENT_ID / OUTLOOK_CLIENT_ID / GITHUB_CLIENT_ID)
    2) el client id guardado (cifrado) en la conexion de ese proveedor
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
    raise HTTPException(
        status_code=400,
        detail=(
            "El acceso con esa cuenta todavia no esta activado en este servidor "
            "(lo activa una sola vez quien lo instala). No te frena: entra con tu "
            "correo y tu contrasena, o sigue en este equipo."
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


# --------------------------------------------------------------------------- #
# Respaldo: snapshot en JSON (para Google Drive o descarga local)
# --------------------------------------------------------------------------- #
def snapshot(db: SASession) -> dict:
    """Exporta todos los datos del usuario actual a un JSON portable."""
    def filas(modelo) -> list[dict]:
        out = []
        for obj in db.scalars(select(modelo)).all():
            datos = {}
            for col in modelo.__table__.columns:
                if col.name in ("id", "usuario_id"):
                    continue
                valor = getattr(obj, col.name)
                datos[col.name] = valor.isoformat() if hasattr(valor, "isoformat") else valor
            out.append(datos)
        return out

    return {
        "version": 1,
        "exportado_en": datetime.now().isoformat(),
        "eventos": filas(Event),
        "tareas": filas(Task),
        "registros": filas(LogEntry),
        "mantenimiento": filas(Maintenance),
        "chat": filas(ChatMessage),
        "conexiones": [
            {k: v for k, v in fila.items() if k != "credenciales_cifradas"}
            for fila in filas(ConexionIA)
        ],
    }


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
