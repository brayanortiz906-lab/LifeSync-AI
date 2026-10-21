"""Endpoints del centro de conexiones de IA.

Permite conectar LifeAgente con "la cuenta de IA que ya tienes" sin exigir
conocimientos técnicos: el usuario elige un proveedor, el sistema le explica
en español que hacer, verifica la conexión y la deja activa.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import connections as con
from ..agent import _get_app_settings
from ..config import settings
from ..database import get_db
from ..models import ConexionIA
from ..schemas import (
    ConexionCreate,
    ConexionOut,
    ConexionTest,
    DetectarMotores,
    GoogleClienteIn,
    MotorLocal,
)
from ..security import cifrar

router = APIRouter(prefix="/api/conexiones", tags=["conexiones"])


# --------------------------------------------------------------------------- #
# Catálogo
# --------------------------------------------------------------------------- #
@router.get("/catalogo")
def catalogo():
    """Lista de proveedores con instrucciones en lenguaje llano."""
    return {"proveedores": con.listar_catalogo()}


@router.get("/locales")
async def detectar_locales(db: Session = Depends(get_db, scope="function")):
    """Busca motores de IA ya levantados en el equipo y conecta el primero.

    Si la persona ya tiene una IA local (Ollama, LM Studio, Jan...), LifeAgente
    se conecta solo: la app funciona sin configurar nada.
    """
    motores = await con.detectar_motores_locales()
    auto = await _autoconectar(db, motores)
    return {"motores": motores, "total": len(motores), "autoconectado": auto}


async def _autoconectar(db: Session, motores: list[dict]) -> dict | None:
    """Conecta el motor local detectado si la app todavia no usa uno real."""
    activa = db.scalars(select(ConexionIA).where(ConexionIA.activa)).first()
    if activa and activa.proveedor not in ("mock", "demo"):
        return None
    if not motores:
        return None
    motor = motores[0]
    prov = con.obtener_proveedor(motor["id"])
    if prov is None:
        return None
    modelo = (motor.get("modelos") or [prov.modelo_defecto])[0]
    credenciales = {"base_url": motor.get("base_url") or prov.base_url}
    conexion = db.scalars(
        select(ConexionIA).where(ConexionIA.proveedor == motor["id"])
    ).first()
    if conexion is None:
        conexion = ConexionIA(proveedor=motor["id"], nombre=f"{motor['nombre']} (detectado)")
        db.add(conexion)
    conexion.credenciales_cifradas = con.credenciales_a_json(credenciales)
    conexion.modo = "local"
    conexion.modelo = modelo
    conexion.nombre = conexion.nombre or f"{motor['nombre']} (detectado)"
    db.flush()
    ok, mensaje, _extra = await con.verificar_credenciales(
        motor["id"], credenciales, modelo
    )
    conexion.estado = "activa" if ok else "error"
    conexion.detalle_estado = mensaje
    conexion.verificada_en = datetime.now()
    db.flush()
    if ok:
        _activar(db, conexion, modelo)
        db.flush()
    return {
        "id": conexion.id,
        "proveedor": motor["id"],
        "nombre": motor["nombre"],
        "modelo": modelo,
        "ok": ok,
        "mensaje": mensaje,
    }


@router.post("/autoconectar")
async def autoconectar(db: Session = Depends(get_db, scope="function")):
    """Fuerza la conexion automatica con la IA local del equipo."""
    motores = await con.detectar_motores_locales(forzar=True)
    auto = await _autoconectar(db, motores)
    return {
        "ok": bool(auto and auto.get("ok")),
        "conexion": auto,
        "motores": len(motores),
    }


async def autoconectar_al_arrancar() -> None:
    """Al arrancar la API, conecta la IA local del equipo si la hay."""
    from ..database import SessionLocal

    with SessionLocal() as db:
        motores = await con.detectar_motores_locales()
        await _autoconectar(db, motores)
        db.commit()


@router.get("/modelos")
def modelos(proveedor: str = "openrouter"):
    """Catálogo de modelos que la persona puede elegir ("cualquier IA")."""
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
    """Crea o actualiza la conexión de un proveedor y la deja activa."""
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
        # Los motores locales (Ollama, LM Studio) ya traen su dirección: si el
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

    # La conexión activa pasa a ser la de este proveedor.
    _activar(db, existente, prov.modelo_defecto)
    db.flush()
    return _a_out(existente, db)


@router.post("/{conexion_id}/verificar", response_model=ConexionOut)
async def verificar(conexion_id: int, db: Session = Depends(get_db, scope="function")):
    """Prueba la conexión: llama al proveedor y reporta el resultado."""
    conexion = db.get(ConexionIA, conexion_id)
    if conexion is None:
        raise HTTPException(status_code=404, detail="Conexión no encontrada.")

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
        raise HTTPException(status_code=404, detail="Conexión no encontrada.")
    prov = con.obtener_proveedor(conexion.proveedor)
    _activar(db, conexion, conexion.modelo or (prov.modelo_defecto if prov else ""))
    db.flush()
    return _a_out(conexion, db)


# --------------------------------------------------------------------------- #
# Google: identificador público de la app para conectar cuentas sin jerga
# --------------------------------------------------------------------------- #
@router.get("/google/estado")
def google_estado(
    proveedor: str = "google_cuenta",
    db: Session = Depends(get_db, scope="function"),
):
    """Dice si esta copia de LifeAgente ya puede conectar esa cuenta.

    El "ID de cliente" de OAuth es un identificador PUBLICO (no es una
    contraseña ni un token). Basta con crearlo una vez en la consola del
    proveedor para que TODAS las personas que usen esta copia conecten su
    cuenta con un clic y sin copiar nada.
    """
    pid = con.normalizar_proveedor(proveedor)
    columna = {
        "google_cuenta": "google_client_id",
        "outlook_cuenta": "outlook_client_id",
        "github_cuenta": "github_client_id",
    }.get(pid, "google_client_id")
    app = _get_app_settings(db)
    guardado_app = str(getattr(app, columna, "") or "").strip()
    if guardado_app:
        nombre = (con.obtener_proveedor(pid).nombre if con.obtener_proveedor(pid) else pid)
        return {
            "configurado": True,
            "origen": "app",
            "proveedor": pid,
            "pista": f"LifeAgente ya tiene su ID de cliente de {nombre}. Puedes entrar con un clic.",
        }
    entorno = {
        "google_cuenta": settings.google_client_id,
        "outlook_cuenta": settings.outlook_client_id,
        "github_cuenta": settings.github_client_id,
    }.get(pid, "")
    if (entorno or "").strip():
        nombre = (con.obtener_proveedor(pid).nombre if con.obtener_proveedor(pid) else pid)
        return {
            "configurado": True,
            "origen": "servidor",
            "proveedor": pid,
            "pista": f"El servidor de LifeAgente ya tiene su ID de cliente de {nombre}.",
        }
    return {
        "configurado": False,
        "origen": "nada",
        "proveedor": pid,
        "pista": (
            f"Falta el ID de cliente de {pid.replace('_cuenta', '')}. Son unos caracteres "
            "publicos (no es tu contrasena) y se crea en 1 minuto en la consola del proveedor."
        ),
    }


@router.put("/google/estado")
def guardar_google_cliente(payload: GoogleClienteIn, db: Session = Depends(get_db, scope="function")):
    """Guarda (u olvida) el ID de cliente público de esta instalacion.

    Enviar el ID en blanco borra el que habia: así la persona puede empezar
    de cero si el ID era de otra aplicación.
    """
    client_id = (payload.client_id or "").strip()
    pid = con.normalizar_proveedor(payload.proveedor or "google_cuenta")
    columna = {
        "google_cuenta": "google_client_id",
        "outlook_cuenta": "outlook_client_id",
        "github_cuenta": "github_client_id",
    }.get(pid, "google_client_id")
    app = _get_app_settings(db)
    if not client_id:
        # Modo "olvidar": se limpia el identificador guardado.
        setattr(app, columna, "")
        db.flush()
        hay_en_servidor = bool(
            {
                "google_cuenta": settings.google_client_id,
                "outlook_cuenta": settings.outlook_client_id,
                "github_cuenta": settings.github_client_id,
            }.get(pid, "").strip()
        )
        return {
            "ok": True,
            "configurado": hay_en_servidor,
            "origen": "servidor" if hay_en_servidor else "nada",
            "proveedor": pid,
        }
    if len(client_id) < 10:
        raise HTTPException(
            status_code=400,
            detail=(
                "Ese ID de cliente no parece completo. Copialo de nuevo desde la consola del "
                "proveedor (debe terminar en .apps.googleusercontent.com) y pegalo entero."
            ),
        )
    setattr(app, columna, client_id)
    db.flush()
    return {"ok": True, "configurado": True, "origen": "app", "proveedor": pid}


# --------------------------------------------------------------------------- #
# Camino "con mi cuenta": OAuth 2.0 Device Authorization
# --------------------------------------------------------------------------- #
@router.post("/cuenta/iniciar")
def cuenta_iniciar(payload: ConexionTest, db: Session = Depends(get_db, scope="function")):
    """Arranca la autorización con cuenta: devuelve el código y el link."""
    client_id = (payload.client_id or "").strip()
    if not client_id:
        # Si la instalacion ya tiene su ID de cliente, no se le pide nada a la
        # persona: el acceso con la cuenta queda en un solo clic.
        app = _get_app_settings(db)
        pid = con.normalizar_proveedor(payload.proveedor or "google_cuenta")
        columna = {
            "google_cuenta": "google_client_id",
            "outlook_cuenta": "outlook_client_id",
            "github_cuenta": "github_client_id",
        }.get(pid, "google_client_id")
        client_id = str(getattr(app, columna, "") or "").strip()
        if not client_id:
            client_id = {
                "google_cuenta": settings.google_client_id,
                "outlook_cuenta": settings.outlook_client_id,
                "github_cuenta": settings.github_client_id,
            }.get(pid, "").strip()
    try:
        return con.iniciar_autorizacion_cuenta(payload.proveedor, client_id)
    except con.ErrorConexion as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/cuenta/terminar")
def cuenta_terminar(payload: ConexionTest, db: Session = Depends(get_db, scope="function")):
    """Consulta si el usuario ya autorizo y, si es así, guarda la conexión."""
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
        raise HTTPException(status_code=404, detail="Conexión no encontrada.")
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
    """Marca una conexión como activa y sincroniza AppSettings."""
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
