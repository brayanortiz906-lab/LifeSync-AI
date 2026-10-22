"""Envio de correo sin SMTP: Brevo y Resend.

Problema que resuelve: configurar un servidor SMTP (Gmail con clave de
aplicacion, puerto 587, etc.) es la parte que mas atraganta a quien instala la
app, y ademas los planes gratuitos de hosting suelen bloquean los puertos de
correo saliente. Brevo y Resend resuelven eso con UNA clave de API y llamadas
HTTP normales.

| Proveedor | Plan gratis | Clave en |
|---|---|---|
| Brevo | 300 correos al dia | https://app.brevo.com/settings/keys/api |
| Resend | 3.000 correos al mes | https://resend.com/api-keys |

Los dos tienen plan gratuito sin tarjeta. Ademas, el remitente debe estar
verificado en el panel del proveedor (te llega un correo de confirmacion).
"""
from __future__ import annotations

import os
from typing import Any

import httpx

from .config import settings

# --------------------------------------------------------------------------- #
# Catalogo de proveedores
# --------------------------------------------------------------------------- #
PROVEEDORES: dict[str, dict[str, Any]] = {
    "brevo": {
        "nombre": "Brevo",
        "resumen": "Mandamos el correo con su API. 300 correos al dia gratis, sin tarjeta.",
        "gratis": "300 correos al dia",
        "campo": "Clave de API de Brevo",
        "ayuda": "Entra a https://app.brevo.com/settings/keys/api y copia la clave 'API keys'.",
        "doc": "https://app.brevo.com/settings/keys/api",
        "env_clave": "BREVO_API_KEY",
        "env_remitente": "BREVO_REMITENTE",
        "url": "https://api.brevo.com/v3/smtp/email",
    },
    "resend": {
        "nombre": "Resend",
        "resumen": "Mandamos el correo con su API. 3.000 correos al mes gratis, sin tarjeta.",
        "gratis": "3.000 correos al mes",
        "campo": "Clave de API de Resend",
        "ayuda": "Entra a https://resend.com/api-keys y crea una clave.",
        "doc": "https://resend.com/api-keys",
        "env_clave": "RESEND_API_KEY",
        "env_remitente": "RESEND_REMITENTE",
        "url": "https://api.resend.com/emails",
    },
    "smtp": {
        "nombre": "Servidor SMTP (el clasico)",
        "resumen": "El metodo de siempre: servidor, puerto, usuario y clave.",
        "gratis": "Depende de tu correo",
        "campo": "Clave o clave de aplicacion",
        "ayuda": "Gmail: activa la verificacion en dos pasos y crea una 'clave de aplicacion'.",
        "doc": "https://support.google.com/mail/answer/185833",
        "env_clave": "SMTP_PASSWORD",
        "env_remitente": "SMTP_DESDE",
        "url": "",
    },
}

#: Orden en el que se prueban los proveedores configurados.
ORDEN = ("brevo", "resend", "smtp")


def catalogo_proveedores() -> list[dict[str, Any]]:
    """Lista de proveedores con su plan gratis y donde se saca la clave."""
    lista = []
    for pid in ORDEN:
        datos = dict(PROVEEDORES[pid])
        datos["id"] = pid
        lista.append(datos)
    return lista


def _traducir_error(mensaje: str) -> str:
    """Los errores de Brevo/Resend vienen en ingles: los traducimos."""
    m = (mensaje or "").strip()
    minus = m.lower()
    if "unauthorized" in minus or "invalid api key" in minus or "invalid_api_key" in minus:
        return "La clave no es valida. Copiala de nuevo desde el panel del proveedor."
    if "account" in minus and ("inactive" in minus or "suspended" in minus or "disabled" in minus):
        return "Tu cuenta del proveedor esta suspendida o sin activar: revisa su panel."
    if "sender" in minus and ("not" in minus and "verif" in minus):
        return "El remitente no esta verificado en el panel del proveedor. Verificalo (te llega un correo) e intentalo otra vez."
    if "quota" in minus or "limit" in minus or "too many" in minus:
        return "Se acabo la cuota gratuita del proveedor. Revisa su panel o cambia de proveedor."
    if "domain" in minus and "not" in minus:
        return "El dominio del remitente no esta verificado en el panel del proveedor."
    if "timeout" in minus or "timed out" in minus:
        return "El proveedor no respondio a tiempo. Intentalo otra vez en un momento."
    return m or "El proveedor no pudo enviar el correo."


# --------------------------------------------------------------------------- #
# Envio
# --------------------------------------------------------------------------- #
def _enviar_brevo(
    destinatario: str, asunto: str, texto: str, html: str, clave: str, remitente: str, nombre: str = ""
) -> tuple[bool, str]:
    cuerpo = {
        "sender": {"name": settings.app_name, "email": remitente},
        "to": [{"email": destinatario, **({"name": nombre} if nombre else {})}],
        "subject": asunto,
        "html": html,
        "text": texto,
    }
    try:
        with httpx.Client(timeout=15.0) as cliente:
            resp = cliente.post(
                "https://api.brevo.com/v3/smtp/email",
                json=cuerpo,
                headers={"api-key": clave, "Accept": "application/json"},
            )
    except Exception as exc:  # pragma: no cover - depende de la red
        return False, _traducir_error(str(exc))
    if resp.status_code < 400:
        return True, "Enviado con Brevo."
    detalle = ""
    try:
        cuerpo_resp = resp.json()
        detalle = cuerpo_resp.get("message") or cuerpo_resp.get("code") or ""
    except Exception:
        detalle = resp.text[:200]
    return False, _traducir_error(f"{detalle} (codigo {resp.status_code})")


def _enviar_resend(
    destinatario: str, asunto: str, texto: str, html: str, clave: str, remitente: str, nombre: str = ""
) -> tuple[bool, str]:
    desde = remitente
    if " " not in remitente and remitente:
        desde = f"{settings.app_name} <{remitente}>"
    cuerpo = {
        "from": desde,
        "to": [destinatario],
        "subject": asunto,
        "html": html,
        "text": texto,
    }
    try:
        with httpx.Client(timeout=15.0) as cliente:
            resp = cliente.post(
                "https://api.resend.com/emails",
                json=cuerpo,
                headers={"Authorization": f"Bearer {clave}", "Accept": "application/json"},
            )
    except Exception as exc:  # pragma: no cover - depende de la red
        return False, _traducir_error(str(exc))
    if resp.status_code < 400:
        return True, "Enviado con Resend."
    detalle = ""
    try:
        cuerpo_resp = resp.json()
        detalle = cuerpo_resp.get("message") or ""
    except Exception:
        detalle = resp.text[:200]
    return False, _traducir_error(f"{detalle} (codigo {resp.status_code})")


def enviar_con_proveedor(
    proveedor: str,
    destinatario: str,
    asunto: str,
    texto: str,
    html: str,
    clave: str,
    remitente: str,
    nombre: str = "",
) -> tuple[bool, str]:
    """Envia con UN proveedor concreto. Devuelve (ok, mensaje)."""
    if proveedor == "brevo":
        return _enviar_brevo(destinatario, asunto, texto, html, clave, remitente, nombre)
    if proveedor == "resend":
        return _enviar_resend(destinatario, asunto, texto, html, clave, remitente, nombre)
    return False, "Ese proveedor no se puede usar para enviar directamente."


# --------------------------------------------------------------------------- #
# Configuracion efectiva
# --------------------------------------------------------------------------- #
def _clave_de_entorno(proveedor: str) -> str:
    if proveedor == "brevo":
        return (settings.brevo_api_key or os.environ.get("BREVO_API_KEY") or "").strip()
    if proveedor == "resend":
        return (settings.resend_api_key or os.environ.get("RESEND_API_KEY") or "").strip()
    return ""


def _remitente_de_entorno(proveedor: str) -> str:
    if proveedor == "brevo":
        return (settings.brevo_remitente or os.environ.get("BREVO_REMITENTE") or "").strip()
    if proveedor == "resend":
        return (settings.resend_remitente or os.environ.get("RESEND_REMITENTE") or "").strip()
    return ""


def configuracion_correo(db: Any = None) -> dict[str, Any]:
    """Ajustes de correo EFECTIVOS: que proveedor se usa y con que clave.

    Prioridad: variables del despliegue > ajustes guardados en la app.
    Nunca devuelve la clave en claro si no hace falta: el resto de la app
    solo necesita saber si hay algo configurado.
    """
    from .cuentas import configuracion_smtp

    forzado = (settings.email_provider or os.environ.get("EMAIL_PROVIDER") or "").strip().lower()
    datos: dict[str, Any] = {
        "proveedor": "",
        "clave": "",
        "remitente": "",
        "origen": "ninguno",
        "smtp": configuracion_smtp(db),
    }
    # 1) Variables del despliegue.
    for pid in ORDEN:
        if pid == "smtp":
            continue
        clave = _clave_de_entorno(pid)
        if clave:
            datos.update(
                {
                    "proveedor": pid,
                    "clave": clave,
                    "remitente": _remitente_de_entorno(pid),
                    "origen": "entorno",
                }
            )
            break
    if forzado and forzado in PROVEEDORES:
        clave = _clave_de_entorno(forzado) or (datos["clave"] if datos["proveedor"] == forzado else "")
        remitente = _remitente_de_entorno(forzado) or (datos["remitente"] if datos["proveedor"] == forzado else "")
        if clave:
            datos.update({"proveedor": forzado, "clave": clave, "remitente": remitente, "origen": "entorno"})
    if datos["proveedor"]:
        return datos
    if datos["smtp"]["host"]:
        datos.update(
            {
                "proveedor": "smtp",
                "clave": datos["smtp"]["clave"],
                "remitente": datos["smtp"]["desde"],
                "origen": datos["smtp"]["origen"],
            }
        )
        return datos
    # 2) Ajustes guardados en la propia app.
    if db is None:
        return datos
    try:
        from .models import ConfiguracionServidor
        from .security import descifrar

        fila = db.query(ConfiguracionServidor).order_by(ConfiguracionServidor.id).first()
    except Exception:
        return datos
    if fila is None:
        return datos
    proveedor = (fila.proveedor_correo or "").strip().lower()
    clave = ""
    try:
        clave = descifrar(fila.api_key_cifrada) or ""
    except Exception:
        clave = ""
    if proveedor in ("brevo", "resend") and clave:
        datos.update(
            {
                "proveedor": proveedor,
                "clave": clave,
                "remitente": (fila.remitente or "").strip(),
                "origen": "app",
            }
        )
    return datos


def enviar_correo(
    destinatario: str,
    asunto: str,
    texto: str,
    html: str,
    db: Any = None,
    nombre: str = "",
) -> tuple[str, str]:
    """Envia un correo con el proveedor configurado.

    Devuelve (modo, mensaje) donde modo es 'brevo', 'resend', 'smtp',
    'consola', 'ninguno' o 'error'.
    """
    from .cuentas import enviar_codigo_smtp_directo

    config = configuracion_correo(db)
    proveedor = config.get("proveedor") or ""
    if proveedor in ("brevo", "resend"):
        ok, mensaje = enviar_con_proveedor(
            proveedor,
            destinatario,
            asunto,
            texto,
            html,
            config.get("clave") or "",
            config.get("remitente") or "",
            nombre,
        )
        if ok:
            return proveedor, mensaje
        # Si el proveedor elegido falla, probamos con otro que este listo.
        for otro in ORDEN:
            if otro == proveedor or otro == "smtp":
                continue
            clave_alt = _clave_de_entorno(otro)
            if not clave_alt:
                continue
            ok2, _ = enviar_con_proveedor(
                otro,
                destinatario,
                asunto,
                texto,
                html,
                clave_alt,
                _remitente_de_entorno(otro),
                nombre,
            )
            if ok2:
                return otro, f"{mensaje} (se envio con {PROVEEDORES[otro]['nombre']})"
        return "error", mensaje
    if proveedor == "smtp":
        ok, mensaje = enviar_codigo_smtp_directo(destinatario, asunto, texto, html, config["smtp"])
        return ("smtp", mensaje) if ok else ("error", mensaje)
    return "ninguno", "Este servidor todavia no tiene configurado el envio de correos."


def resumen_configuracion(db: Any = None) -> dict[str, Any]:
    """Lo que ve la interfaz: que proveedor hay, si esta listo, sin la clave."""
    config = configuracion_correo(db)
    proveedor = config.get("proveedor") or ""
    datos = PROVEEDORES.get(proveedor, {})
    return {
        "proveedor": proveedor,
        "proveedor_nombre": datos.get("nombre", "Sin configurar"),
        "resumen": datos.get("resumen", ""),
        "gratis": datos.get("gratis", ""),
        "campo": datos.get("campo", ""),
        "ayuda": datos.get("ayuda", ""),
        "doc": datos.get("doc", ""),
        "remitente": config.get("remitente") or "",
        "origen": config.get("origen", "ninguno"),
        "listo": bool(proveedor) and bool(config.get("clave") or config.get("smtp", {}).get("clave")),
        "smtp_host": config.get("smtp", {}).get("host", ""),
        "smtp_puerto": config.get("smtp", {}).get("puerto", 587),
        "smtp_usuario": config.get("smtp", {}).get("usuario", ""),
        "smtp_desde": config.get("smtp", {}).get("desde", ""),
    }
