"""Permisos de la cuenta: lo que LifeAgente pide y la persona autoriza.

La idea: la persona entra con su cuenta (Google, Outlook...) y concede los
permisos **una sola vez**. A partir de ahi el sistema puede trabajar solo:

* ``drive``      -> guarda cada noche un respaldo de tu vida en tu Drive.
* ``calendario`` -> lee tu agenda de Google Calendar y la importa.
* ``correo``     -> te avisa por correo cuando el agente reorganiza tu dia.

Los tokens van cifrados (Fernet) y se renuevan solos con el ``refresh_token``,
asi que el sistema puede trabajar en segundo plano aunque nadie tenga la app
abierta (nube) y no vuelva a pedir permisos.
"""
from __future__ import annotations

import base64
import json
import urllib.parse
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AppSettings, Event, LogEntry, PermisosCuenta, Task
from .security import cifrar, descifrar

#: Catalogo de permisos. ``scope`` es lo que se pide al proveedor.
PERMISOS: list[dict[str, str]] = [
    {
        "id": "perfil",
        "titulo": "Saber quien eres",
        "descripcion": "Leemos tu nombre y tu correo para crear tu cuenta.",
        "por_que": "Sin esto no hay forma de saber que datos son tuyos.",
        "scope": "openid email profile",
        "icono": "persona",
    },
    {
        "id": "drive",
        "titulo": "Guardar tus respaldos en Google Drive",
        "descripcion": "Una copia de tu agenda, tareas y gastos queda en tu Drive.",
        "por_que": "Si se borra el equipo o el servidor, tus datos siguen intactos.",
        "scope": "https://www.googleapis.com/auth/drive.file",
        "icono": "nube",
    },
    {
        "id": "calendario",
        "titulo": "Leer tu agenda de Google Calendar",
        "descripcion": "Importamos tus eventos para que LifeAgente no te pida dos veces lo mismo.",
        "por_que": "Tu agenda real queda dentro de LifeAgente y se reorganiza sola.",
        "scope": "https://www.googleapis.com/auth/calendar.readonly",
        "icono": "calendario",
    },
    {
        "id": "correo",
        "titulo": "Avisarte por correo",
        "descripcion": "Te escribimos cuando el agente reorganiza tu dia o hay entregas proximas.",
        "por_que": "No dependes de tener la app abierta para enterarte.",
        "scope": "https://www.googleapis.com/auth/gmail.send",
        "icono": "correo",
    },
]

#: Todo lo que se pide de una vez al pulsar "Autorizar todo".
SCOPE_COMPLETO = " ".join(p["scope"] for p in PERMISOS)

#: Cada cuanto se hace el respaldo automatico (horas).
HORAS_RESPALDO = 12

#: Espera antes de guardar (v21). El sistema NO guarda mientras la persona
#: escribe: espera a que deje de poner informacion y entonces respalda.
SEGUNDOS_ESPERA = 45


# --------------------------------------------------------------------------- #
# Estado
# --------------------------------------------------------------------------- #
def _fila(db: Session, proveedor: str = "google_cuenta") -> PermisosCuenta | None:
    """Fila de permisos de la persona (el filtro de usuario la aplica solo)."""
    return db.scalars(
        select(PermisosCuenta)
        .where(PermisosCuenta.proveedor == proveedor)
        .order_by(PermisosCuenta.id.desc())
    ).first()


def _concedidos(scope: str) -> set[str]:
    return {s for s in (scope or "").split() if s}


def estado(db: Session) -> dict[str, Any]:
    """Permisos concedidos + configuracion del autopiloto."""
    fila = _fila(db)
    concedidos = _concedidos(fila.scope if fila is not None else "")
    lista = []
    for p in PERMISOS:
        lista.append(
            {
                "id": p["id"],
                "titulo": p["titulo"],
                "descripcion": p["descripcion"],
                "por_que": p["por_que"],
                "icono": p["icono"],
                "scope": p["scope"],
                "concedido": p["scope"] in concedidos,
            }
        )
    return {
        "conectado": bool(fila is not None and fila.access_token_cifrado),
        "proveedor": fila.proveedor if fila is not None else "google_cuenta",
        "correo": fila.correo if fila is not None else "",
        "permisos": lista,
        "autopiloto": {
            "activo": bool(fila.autopiloto) if fila is not None else False,
            "respaldo_auto": bool(fila.respaldo_auto) if fila is not None else True,
            "importar_calendario": bool(fila.importar_calendario) if fila is not None else True,
            "resumen_diario": bool(fila.resumen_diario) if fila is not None else False,
            "ultimo_respaldo": fila.ultimo_respaldo.isoformat() if fila is not None and fila.ultimo_respaldo else "",
            "proximo_respaldo": fila.proximo_respaldo.isoformat() if fila is not None and fila.proximo_respaldo else "",
            "cambios_pendientes": bool(fila.cambios_pendientes) if fila is not None else False,
            "ultimo_cambio": fila.ultimo_cambio.isoformat() if fila is not None and fila.ultimo_cambio else "",
            "guarda_en_segundos": _faltan_para_guardar(fila),
        },
    }


def _faltan_para_guardar(fila: PermisosCuenta | None) -> int:
    """Segundos que faltan para que el sistema guarde (0 si ya puede)."""
    if fila is None or not fila.cambios_pendientes:
        return 0
    if not fila.ultimo_cambio:
        return 0
    faltan = SEGUNDOS_ESPERA - int((datetime.now() - fila.ultimo_cambio).total_seconds())
    return max(0, faltan)


def ultimo_cambio_servidor(db: Session) -> datetime | None:
    """Cuando fue el ultimo cambio de esta persona en el servidor."""
    fila = _fila(db)
    if fila is not None and fila.ultimo_cambio:
        return fila.ultimo_cambio
    return None


def marcar_cambios(db: Session) -> bool:
    """La persona acaba de cambiar algo: hay que guardarlo, pero con retardo.

    Se llama desde `get_db` cada vez que una peticion escribe contenido. El
    sistema espera ``SEGUNDOS_ESPERA`` segundos (sin nuevos cambios) y entonces
    sube el respaldo a Drive: asi no se guarda a mitad de escritura.
    """
    fila = _fila(db)
    if fila is None:
        fila = PermisosCuenta(proveedor="google_cuenta")
        db.add(fila)
    fila.cambios_pendientes = True
    fila.ultimo_cambio = datetime.now()
    db.flush()
    return True


def pendiente_de_respaldo(db: Session) -> bool:
    """True si hay cambios y la persona ya dejo de escribir."""
    fila = _fila(db)
    if fila is None or not fila.cambios_pendientes:
        return False
    if not fila.ultimo_cambio:
        return True
    return (datetime.now() - fila.ultimo_cambio).total_seconds() >= SEGUNDOS_ESPERA


def guardar_si_toca(db: Session) -> dict[str, Any]:
    """Guarda en Drive si la persona ya dejo de escribir (v21)."""
    if not pendiente_de_respaldo(db):
        return {"ok": True, "guardado": False, "mensaje": "Todavia estas escribiendo; guardo cuando pares."}
    resultado = respaldar_drive(db)
    return {"ok": bool(resultado.get("ok")), "guardado": bool(resultado.get("ok")), **resultado}


# --------------------------------------------------------------------------- #
# Guardar y renovar
# --------------------------------------------------------------------------- #
def _scope_real(token: str) -> str:
    """Scopes que Google concedio de verdad (puede ser menos de lo pedido)."""
    if not token:
        return ""
    try:
        r = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"access_token": token},
            timeout=10.0,
        )
        if r.status_code == 200:
            return str(r.json().get("scope") or "")
    except Exception:
        pass
    return ""


def guardar_credenciales(db: Session, cred: dict[str, Any]) -> PermisosCuenta:
    """Guarda el permiso (cifrado) de la persona."""
    proveedor = str(cred.get("proveedor") or "google_cuenta")
    fila = _fila(db, proveedor)
    if fila is None:
        fila = PermisosCuenta(proveedor=proveedor)
        db.add(fila)
    access = str(cred.get("access_token") or "")
    refresh = str(cred.get("refresh_token") or "")
    if access:
        fila.access_token_cifrado = cifrar(access)
    if refresh:
        fila.refresh_token_cifrado = cifrar(refresh)
    if cred.get("client_id"):
        fila.client_id = str(cred["client_id"])
    if cred.get("email"):
        fila.correo = str(cred["email"])
    scope = str(cred.get("scope_real") or "") or SCOPE_COMPLETO
    granted = _concedidos(scope)
    # Solo damos por concedido lo que Google confirmo.
    concedidos = [p["scope"] for p in PERMISOS if p["scope"] in granted]
    fila.scope = " ".join(concedidos) if concedidos else scope
    db.flush()
    return fila


def _vigente(token: str) -> bool:
    """El permiso sigue vivo (si no hay red, no se invalida por error)."""
    if not token:
        return False
    try:
        r = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"access_token": token},
            timeout=8.0,
        )
        if r.status_code != 200:
            return False
        return int(r.json().get("expires_in") or 0) > 120
    except Exception:
        return True


def token_acceso(db: Session) -> str:
    """Permiso vigente: si caduca, lo renueva solo con el refresh_token."""
    fila = _fila(db)
    if fila is None or not fila.access_token_cifrado:
        return ""
    token = descifrar(fila.access_token_cifrado or "")
    if token and _vigente(token):
        return token
    if not fila.refresh_token_cifrado or not fila.client_id:
        return token
    try:
        r = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": fila.client_id,
                "refresh_token": descifrar(fila.refresh_token_cifrado),
                "grant_type": "refresh_token",
            },
            timeout=20.0,
        )
        if r.status_code == 200:
            nuevo = str(r.json().get("access_token") or "")
            if nuevo:
                fila.access_token_cifrado = cifrar(nuevo)
                db.flush()
                return nuevo
    except Exception:
        pass
    return token


# --------------------------------------------------------------------------- #
# Autopiloto: el sistema trabaja solo
# --------------------------------------------------------------------------- #
def activar_autopiloto(
    db: Session,
    activo: bool = True,
    respaldo_auto: bool = True,
    importar_calendario: bool = True,
    resumen_diario: bool = False,
) -> dict[str, Any]:
    """Enciende o apaga el trabajo automatico de esta persona."""
    fila = _fila(db)
    if fila is None:
        fila = PermisosCuenta(proveedor="google_cuenta")
        db.add(fila)
    fila.autopiloto = bool(activo)
    fila.respaldo_auto = bool(respaldo_auto)
    fila.importar_calendario = bool(importar_calendario)
    fila.resumen_diario = bool(resumen_diario)
    if fila.autopiloto and fila.proximo_respaldo is None:
        fila.proximo_respaldo = datetime.now() + timedelta(hours=1)
    db.flush()
    return estado(db)


def respaldar_drive(db: Session) -> dict[str, Any]:
    """Guarda una copia de toda la vida de la persona en su Google Drive."""
    from .cuentas import snapshot

    token = token_acceso(db)
    if not token:
        return {
            "ok": False,
            "mensaje": "Todavia no autorizaste el acceso a Google Drive.",
        }
    datos = json.dumps(snapshot(db), ensure_ascii=False, indent=2).encode("utf-8")
    # El nombre lleva fecha: asi Drive guarda el historial de respaldos.
    nombre = f"lifeagente-respaldo-{datetime.now().strftime('%Y-%m-%d-%H%M')}.json"
    try:
        with httpx.Client(timeout=60) as client:
            resp = client.post(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                headers={"Authorization": f"Bearer {token}"},
                files={
                    "metadata": (
                        "application/json",
                        json.dumps({"name": nombre, "mimeType": "application/json"}).encode("utf-8"),
                    ),
                    "file": ("application/json", datos),
                },
            )
    except Exception as exc:  # pragma: no cover - depende de la red
        return {"ok": False, "mensaje": f"No se pudo contactar a Google Drive: {exc}"}
    if resp.status_code >= 400:
        return {
            "ok": False,
            "mensaje": "Google Drive no acepto el archivo. Revisa que hayas autorizado el acceso.",
        }
    info = resp.json()
    fila = _fila(db)
    if fila is not None:
        fila.ultimo_respaldo = datetime.now()
        fila.proximo_respaldo = datetime.now() + timedelta(hours=HORAS_RESPALDO)
        # v21: ya esta guardado, no queda nada pendiente.
        fila.cambios_pendientes = False
        fila.ultimo_cambio = None
        db.flush()
    return {
        "ok": True,
        "archivo": info.get("name", nombre),
        "id": info.get("id", ""),
        "enlace": f"https://drive.google.com/file/d/{info.get('id', '')}/view",
    }


def listar_respaldos_drive(db: Session) -> list[dict[str, Any]]:
    """Los respaldos que la persona tiene guardados en su Drive (el mas nuevo primero)."""
    token = token_acceso(db)
    if not token:
        return []
    url = (
        "https://www.googleapis.com/drive/v3/files"
        "?q=" + urllib.parse.quote("name contains 'lifeagente-respaldo'")
        + "&orderBy=modifiedTime desc&pageSize=10&fields=files(id,name,modifiedTime,size)"
    )
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(url, headers={"Authorization": f"Bearer {token}"})
    except Exception:  # pragma: no cover - depende de la red
        return []
    if resp.status_code >= 400:
        return []
    try:
        archivos = resp.json().get("files", []) or []
    except Exception:
        return []
    return [
        {
            "id": f.get("id", ""),
            "nombre": f.get("name", ""),
            "modificado": f.get("modifiedTime", ""),
            "tamano": f.get("size", "0"),
        }
        for f in archivos
    ]


def restaurar_drive(db: Session) -> dict[str, Any] | None:
    """Descarga el ultimo respaldo de Drive.

    Devuelve ``{"datos": <snapshot>, "fecha": <datetime del archivo>}`` para que
    el llamador pueda comparar con lo que hay en el servidor (v21: el respaldo
    solo se aplica si es MAS NUEVO que el contenido del servidor).
    """
    token = token_acceso(db)
    if not token:
        return None
    respaldos = listar_respaldos_drive(db)
    if not respaldos:
        return None
    ultimo = respaldos[0]
    try:
        with httpx.Client(timeout=60) as client:
            resp = client.get(
                f"https://www.googleapis.com/drive/v3/files/{ultimo['id']}?alt=media",
                headers={"Authorization": f"Bearer {token}"},
            )
    except Exception:  # pragma: no cover - depende de la red
        return None
    if resp.status_code >= 400:
        return None
    try:
        datos = json.loads(resp.text)
    except Exception:
        return None
    return {
        "datos": datos,
        "fecha": _momento(str(ultimo.get("modificado") or "")),
        "archivo": ultimo.get("nombre", ""),
    }


def _momento(texto: str) -> datetime | None:
    if not texto:
        return None
    try:
        iso = texto.replace("Z", "+00:00")
        momento = datetime.fromisoformat(iso)
    except Exception:
        return None
    if momento.tzinfo is not None:
        momento = momento.astimezone().replace(tzinfo=None)
    return momento


def importar_calendario(db: Session, dias: int = 30) -> dict[str, Any]:
    """Trae los eventos de Google Calendar de los proximos dias."""
    token = token_acceso(db)
    if not token:
        return {
            "ok": False,
            "mensaje": "Todavia no autorizaste el acceso a Google Calendar.",
            "importados": 0,
        }
    ahora = datetime.now()
    fin = ahora + timedelta(days=max(1, dias))
    try:
        r = httpx.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            params={
                "timeMin": f"{ahora.isoformat()}Z",
                "timeMax": f"{fin.isoformat()}Z",
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 100,
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )
    except Exception as exc:  # pragma: no cover - depende de la red
        return {"ok": False, "mensaje": f"No se pudo contactar a Google Calendar: {exc}", "importados": 0}
    if r.status_code >= 400:
        return {
            "ok": False,
            "mensaje": "Google Calendar no respondio. Revisa el permiso de calendario.",
            "importados": 0,
        }
    items = r.json().get("items") or []
    importados = 0
    for item in items:
        titulo = str(item.get("summary") or "").strip()
        inicio = _momento(str((item.get("start") or {}).get("dateTime") or ""))
        if not titulo or inicio is None:
            continue
        ya_existe = db.scalars(
            select(Event).where(Event.titulo.ilike(titulo), Event.inicio == inicio)
        ).first()
        if ya_existe is not None:
            continue
        fin_evt = _momento(str((item.get("end") or {}).get("dateTime") or "")) or (inicio + timedelta(hours=1))
        if fin_evt <= inicio:
            fin_evt = inicio + timedelta(hours=1)
        db.add(
            Event(
                titulo=titulo,
                categoria="personal",
                inicio=inicio,
                fin=fin_evt,
                inamovible=True,
                notas="Importado de tu Google Calendar",
                fuente="google_calendar",
            )
        )
        importados += 1
    db.flush()
    return {"ok": True, "importados": importados, "revisados": len(items)}


def ejecutar_autopiloto(db: Session) -> dict[str, Any]:
    """El trabajo automatico: respaldo + importacion, sin que nadie toque nada."""
    fila = _fila(db)
    if fila is None or not fila.autopiloto:
        return {"ok": False, "mensaje": "El autopiloto esta apagado."}
    resumen: dict[str, Any] = {"respaldo": None, "calendario": None, "correo": None}
    ahora = datetime.now()
    # v21: si la persona dejo de escribir, se guarda YA (no esperamos 12 horas).
    toca_por_cambio = pendiente_de_respaldo(db)
    # Cada 12 horas se hace ademas el respaldo de seguridad y la importacion.
    toca_por_hora = fila.proximo_respaldo is None or fila.proximo_respaldo <= ahora
    if toca_por_cambio or toca_por_hora:
        if fila.respaldo_auto:
            resumen["respaldo"] = respaldar_drive(db)
        if fila.importar_calendario:
            resumen["calendario"] = importar_calendario(db)
        fila.proximo_respaldo = ahora + timedelta(hours=HORAS_RESPALDO)
        db.flush()
    else:
        # No tocaba todavia: se explica igual para que la persona sepa que
        # todo esta al dia (y no piense que fallo).
        resumen["respaldo"] = {
            "ok": True,
            "mensaje": "No tocaba: tus datos ya estan guardados de hace poco.",
        }
        resumen["calendario"] = {"ok": True, "mensaje": "No tocaba todavia.", "importados": 0}
    if fila.resumen_diario:
        resumen["correo"] = enviar_resumen_diario(db)
    return {"ok": True, "resumen": resumen}


# --------------------------------------------------------------------------- #
# Resumen del dia por correo (Gmail API: funciona aunque el servidor no pueda
# usar SMTP, como es el caso de los hosting gratuitos).
# --------------------------------------------------------------------------- #
_DIAS_ES = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def _texto_resumen_diario(db: Session) -> str:
    """Arma el texto del resumen: agenda de manana, tareas y gasto de ayer."""
    from .models import AppSettings, LogEntry, Task

    ahora = datetime.now()
    manana = (ahora + timedelta(days=1)).date()
    ayer = ahora.date()
    titulo_dia = f"{_DIAS_ES[manana.weekday()]} {manana.day:02d}"

    ajustes = db.scalars(select(AppSettings).order_by(AppSettings.id.desc())).first()
    nombre = (ajustes.nombre_usuario if ajustes is not None else "") or ""
    saludo = f"Hola {nombre}," if nombre else "Hola,"

    desde = datetime.combine(manana, datetime.min.time())
    hasta = datetime.combine(manana + timedelta(days=1), datetime.min.time())
    eventos = db.scalars(
        select(Event).where(Event.inicio >= desde, Event.inicio < hasta).order_by(Event.inicio)
    ).all()

    pendientes = db.scalars(
        select(Task).where(Task.estado != "completada").order_by(Task.fecha_entrega)
    ).all()

    gastos = db.scalars(select(LogEntry).where(LogEntry.fecha == ayer)).all()
    total_gastos = sum(float(g.monto or 0) for g in gastos)

    lineas = [saludo, "", f"Este es tu resumen de manana ({titulo_dia}).", ""]

    lineas.append("AGENDA")
    if eventos:
        for e in eventos:
            marca = " (fijo)" if e.inamovible else ""
            lineas.append(f"- {e.inicio.strftime('%H:%M')} {e.titulo}{marca}")
    else:
        lineas.append("- No tienes nada agendado. Dia libre.")
    lineas.append("")

    lineas.append(f"TAREAS PENDIENTES ({len(pendientes)})")
    if pendientes:
        for t in pendientes[:10]:
            vence = f" - vence {t.fecha_entrega.isoformat()}" if t.fecha_entrega else ""
            lineas.append(f"- {t.titulo} ({t.prioridad}){vence}")
    else:
        lineas.append("- Ninguna. Todo al dia.")
    lineas.append("")

    lineas.append("GASTOS DE AYER")
    if gastos:
        for g in gastos:
            lineas.append(f"- {g.descripcion}: {g.monto:,.0f} {g.moneda}")
        lineas.append(f"Total: {total_gastos:,.0f}")
    else:
        lineas.append("- Sin gastos registrados.")
    lineas.append("")
    lineas.append("Tu asistente LifeAgente AI.")
    return "\n".join(lineas)


def enviar_resumen_diario(db: Session) -> dict[str, Any]:
    """Envia por Gmail el resumen del dia siguiente."""
    fila = _fila(db)
    if fila is None or not fila.access_token_cifrado:
        return {"ok": False, "mensaje": "Todavia no autorizaste el acceso a Google."}
    if "gmail.send" not in (fila.scope or ""):
        return {
            "ok": False,
            "mensaje": "Falta el permiso de correo. Autoriza 'Avisarte por correo'.",
        }
    destinatario = (fila.correo or "").strip()
    if not destinatario:
        return {"ok": False, "mensaje": "No tenemos tu correo para enviarte el resumen."}
    token = token_acceso(db)
    if not token:
        return {"ok": False, "mensaje": "Tu permiso de Google caduco. Vuelve a autorizar."}
    cuerpo = _texto_resumen_diario(db)
    asunto = "Tu resumen de manana - LifeAgente AI"
    crudo = (
        f"To: {destinatario}\r\nSubject: {asunto}\r\n"
        f"Content-Type: text/plain; charset=utf-8\r\n\r\n{cuerpo}"
    )
    try:
        r = httpx.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"raw": base64.urlsafe_b64encode(crudo.encode("utf-8")).decode("ascii")},
            timeout=30.0,
        )
    except Exception as exc:  # pragma: no cover - depende de la red
        return {"ok": False, "mensaje": f"No se pudo enviar el correo: {exc}"}
    if r.status_code >= 400:
        return {
            "ok": False,
            "mensaje": "Gmail no acepto el correo. Revisa el permiso 'Avisarte por correo'.",
        }
    return {"ok": True, "mensaje": f"Resumen enviado a {destinatario}.", "cuerpo": cuerpo}


def ejecutar_autopiloto_para_todos() -> dict[str, Any]:
    """Ejecuta el trabajo automatico de todas las personas (tarea diaria)."""
    from .cuentas import Usuario, establecer_usuario
    from .database import SessionLocal

    resultados: list[dict[str, Any]] = []
    with SessionLocal() as db:
        personas = db.query(Usuario).filter(Usuario.id != 1).all()
        for persona in personas:
            establecer_usuario(persona.id)
            try:
                r = ejecutar_autopiloto(db)
                db.commit()
                if r.get("ok"):
                    resultados.append({"correo": persona.correo, "ok": True})
            except Exception as exc:  # pragma: no cover
                db.rollback()
                resultados.append({"correo": persona.correo, "ok": False, "error": str(exc)})
            finally:
                establecer_usuario(None)
    return {"ok": True, "total": len(resultados), "personas": resultados}
