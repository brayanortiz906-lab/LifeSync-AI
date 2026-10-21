"""Adaptadores de IA (BYOK — Bring Your Own Key).

Proveedores soportados:
  - "openai"  -> POST https://api.openai.com/v1/chat/completions   (GPT-4o / GPT-4.1 / ...)
  - "gemini"  -> POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
  - "mock"    -> Clasificador local por reglas (funciona SIN API Key: ideal para
                  demo y para el modo "sin conexión" del prototipo).

La clave NUNCA se guarda en el repositorio: viaja en el request (cabecera
Authorization) y, opcionalmente, se cifra en el servidor con AES/Fernet.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from .config import settings

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class ProviderError(RuntimeError):
    """Error de comunicación con el proveedor (red, key inválida, cuota, etc.)."""


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def _strip_acentos(txt: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", txt) if not unicodedata.combining(c)
    )


def extract_json(text: str) -> dict[str, Any]:
    """Extrae un objeto JSON de la respuesta del modelo (tolerante a vallas)."""
    if not text:
        raise ProviderError("El proveedor devolvió una respuesta vacía.")
    limpio = text.strip()
    limpio = re.sub(r"^```(?:json)?", "", limpio).strip()
    limpio = re.sub(r"```$", "", limpio).strip()
    try:
        return json.loads(limpio)
    except json.JSONDecodeError:
        pass
    inicio = limpio.find("{")
    fin = limpio.rfind("}")
    if inicio != -1 and fin > inicio:
        try:
            return json.loads(limpio[inicio : fin + 1])
        except json.JSONDecodeError:
            # Último recurso: JSON truncado (cerramos el objeto)
            try:
                return json.loads(limpio[inicio : fin + 1] + "}")
            except json.JSONDecodeError as exc:
                raise ProviderError(f"No fue posible parsear el JSON del modelo: {exc}") from exc
    raise ProviderError("El modelo no devolvió un objeto JSON válido.")


# --------------------------------------------------------------------------- #
# Proveedores remotos
# --------------------------------------------------------------------------- #
async def _call_openai(system: str, user: str, api_key: str, model: str, temperature: float) -> str:
    payload = {
        "model": model or settings.default_openai_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(OPENAI_URL, json=payload, headers=headers)
    if resp.status_code >= 400:
        raise ProviderError(f"OpenAI error {resp.status_code}: {resp.text[:400]}")
    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def _call_gemini(system: str, user: str, api_key: str, model: str, temperature: float) -> str:
    model_id = model or settings.default_gemini_model
    url = f"{GEMINI_BASE}/{model_id}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
        },
    }
    params = {"key": api_key}
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=payload, params=params)
    if resp.status_code >= 400:
        raise ProviderError(f"Gemini error {resp.status_code}: {resp.text[:400]}")
    data = resp.json()
    partes = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in partes)


# --------------------------------------------------------------------------- #
# Proveedor "mock": clasificador local por reglas (sin API Key)
# --------------------------------------------------------------------------- #
_RE_TIEMPO = re.compile(
    r"a\s*las\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|am|pm|p\.?\s*m\.?)?", re.IGNORECASE
)
_RE_MONTO = re.compile(
    r"(?:\$\s*|\bpor\s+|\bcosto\s*(?:de)?\s*|\bprecio\s*(?:de)?\s*|\bvalor\s*(?:de)?\s*|\bvale\s+)"
    r"(\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)"
    r"(?:\s*(k|miles|millones|pesos|bol[ií]var|d[oó]lares|usd|cop|d\b))?",
    re.IGNORECASE,
)
_RE_DIA = re.compile(r"\b(lunes|mar[tí]es|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b", re.IGNORECASE)

DIA_NUM = {"lunes": 0, "martes": 1, "miércoles": 2, "miercoles": 2, "jueves": 3,
           "viernes": 4, "sábado": 5, "sabado": 5, "domingo": 6}


def _detectar_fecha(texto: str, hoy: date) -> date:
    t = _strip_acentos(texto.lower())
    if "manana" in t or "mañana" in texto.lower():
        return hoy + timedelta(days=1)
    if "pasado manana" in t:
        return hoy + timedelta(days=2)
    if "ayer" in t:
        return hoy - timedelta(days=1)
    m = _RE_DIA.search(t)
    if m:
        objetivo = DIA_NUM.get(m.group(1), 0)
        delta = (objetivo - hoy.weekday()) % 7
        return hoy + timedelta(days=delta)
    return hoy


def _detectar_hora(texto: str, por_defecto: int = 15) -> tuple[int, int]:
    m = _RE_TIEMPO.search(texto)
    if not m:
        return por_defecto, 0
    hora = int(m.group(1))
    minuto = int(m.group(2) or 0)
    sufijo = (m.group(3) or "").lower().replace(".", "").strip()
    if sufijo in {"pm"} and hora < 12:
        hora += 12
    if sufijo in {"am"} and hora == 12:
        hora = 0
    return max(0, min(23, hora)), minuto


def _detectar_monto(texto: str) -> float | None:
    """Extrae un monto SOLO si hay contexto monetario explícito ($ / por / costo...)."""
    for m in _RE_MONTO.finditer(texto):
        crudo = m.group(1)
        try:
            if "." in crudo and "," in crudo:
                valor = float(crudo.replace(".", "").replace(",", "."))
            elif "." in crudo:
                partes = crudo.split(".")
                valor = float(crudo.replace(".", "")) if len(partes[-1]) == 3 else float(crudo.replace(".", ","))
            else:
                valor = float(crudo.replace(",", "."))
        except ValueError:
            continue
        sufijo = (m.group(2) or "").lower()
        if sufijo in {"k", "miles"}:
            valor *= 1000
        if sufijo == "m" or sufijo == "millones":
            valor *= 1_000_000
        if valor <= 0:
            continue
        return valor
    return None


def _clasificar(texto: str) -> str:
    t = _strip_acentos(texto.lower())
    if any(k in t for k in ("aceite", "mantenimiento", "service", "taller", "cambio de aceite",
                            "me toca", "vencid", "revision", "filtro", "freno", "neumático", "neumatico")):
        if any(k in t for k in ("pagu", "pague", "gast", "costo", "precio", "vale", "por $")):
            return "BITACORA_GASTO"
        return "MANTENIMIENTO"
    if any(k in t for k in ("entrega", "tarea", "examen", "quiz", "resumen", "apuntes", "material",
                            "profesor", "materia", "estudiar", "investigar", "deadline", "rendir")):
        return "TAREA_ACADEMICA"
    if any(k in t for k in ("gast", "tanque", "compre", "pagu", "pagar", "costo", "precio", "vale",
                            "factura", "servicio", "compra", "gasto")) or "$" in texto:
        return "BITACORA_GASTO"
    if any(k in t for k in ("cita", "reunion", "clase", "trabajo", "entren", "hora", "agenda",
                            "reorganiz", "replanific", "disponibilidad", "bloque", "a las")):
        return "CALENDARIO"
    return "CONVERSACION"


def _titulo_evento(texto: str) -> str:
    """Limpia el mensaje para obtener un título corto y legible."""
    limpio = texto.strip()
    # Verbos y adverbios iniciales
    limpio = re.sub(
        r"^\s*(hoy|ayer|mañana|manana|ahora|recien|recién)\s+", "", limpio, flags=re.IGNORECASE
    )
    limpio = re.sub(
        r"^\s*(tengo\s+que|tengo|necesito|necesito\s+hacer|debo|tuve\s+que|me\s+toca|me\s+gaste|"
        r"me\s+gasté|compre|compré|pague|pagué|pago|hay\s+que|hay)\s+",
        "", limpio, flags=re.IGNORECASE,
    )
    # Cláusula temporal final
    limpio = re.sub(
        r"\s+(a\s+las\s+.*|hoy|mañana|manana|ayer|el\s+lunes|el\s+martes|el\s+miércoles|"
        r"el\s+miercoles|el\s+jueves|el\s+viernes|el\s+sábado|el\s+sabado|el\s+domingo)$",
        "", limpio, flags=re.IGNORECASE,
    )
    # Cláusula monetaria final
    limpio = re.sub(
        r"\s+(por|value|costo|costo|precio)\s+(\$|\d).*$", "", limpio, flags=re.IGNORECASE
    )
    limpio = re.sub(r"\s+\$[\d.,]+.*$", "", limpio)
    limpio = re.sub(r"^(una?|el|la|los|las)\s+", "", limpio, flags=re.IGNORECASE)
    limpio = limpio.strip(" .,-–—")
    return (limpio[:60] or "Compromiso").capitalize()


def _mock_response(mensaje: str, hoy: date) -> dict[str, Any]:
    categoria = _clasificar(mensaje)
    acciones: list[dict[str, Any]] = []
    alertas: list[dict[str, Any]] = []
    respuesta = ""

    if categoria == "CALENDARIO":
        fecha = _detectar_fecha(mensaje, hoy)
        hora, minuto = _detectar_hora(mensaje)
        inicio = datetime.combine(fecha, datetime.min.time()).replace(hour=hora, minute=minuto)
        fin = inicio + timedelta(minutes=60)
        titulo = _titulo_evento(mensaje)
        acciones.append({
            "tipo": "crear_evento",
            "datos": {
                "titulo": titulo, "categoria": "personal",
                "inicio": inicio.isoformat(timespec="minutes"),
                "fin": fin.isoformat(timespec="minutes"),
                "inamovible": True, "notas": "", "fuente": "chat",
            },
            "motivo": "Compromiso informado por el usuario.",
        })
        acciones.append({
            "tipo": "replanificar_dia",
            "datos": {
                "fecha": fecha.isoformat(),
                "prioridad_reubicacion": "despues",
                "duracion_min": 60,
                "restricciones": {"no_antes_de": "07:00", "no_despues_de": "22:00", "evitar_dia": None},
                "bloques_a_organizar": [
                    {"titulo": "Estudio", "duracion_min": 60, "prioridad": "media", "categoria": "estudio"}
                ],
            },
            "motivo": "Liberar el hueco del nuevo compromiso.",
        })
        respuesta = (
            f"Listo: agendé \"{titulo}\" de {hora:02d}:{minuto:02d} a "
            f"{fin.strftime('%H:%M')} como compromiso inamovible y reorganice el resto del día."
        )

    elif categoria == "BITACORA_GASTO":
        monto = _detectar_monto(mensaje)
        fecha = _detectar_fecha(mensaje, hoy)
        t = _strip_acentos(mensaje.lower())
        if "tanque" in t or "gasolina" in t or "combustible" in t:
            cat = "combustible"
        elif "aceite" in t or "taller" in t or "reparacion" in t:
            cat = "mantenimiento"
        elif "comida" in t or "almuerzo" in t or "restaurante" in t:
            cat = "alimentacion"
        elif "servicio" in t or "internet" in t or "luz" in t or "agua" in t:
            cat = "servicios"
        elif "taxi" in t or "bus" in t or "transporte" in t or "parking" in t:
            cat = "transporte"
        else:
            cat = "otro"
        acciones.append({
            "tipo": "registrar_gasto",
            "datos": {
                "descripcion": _titulo_evento(mensaje),
                "monto": monto, "moneda": settings.default_currency, "categoria": cat,
                "fecha": fecha.isoformat(), "registrar_en_calendario": False, "notas": "",
            },
            "motivo": "Gasto informado por el usuario.",
        })
        monto_txt = f"{monto:,.0f} {settings.default_currency}" if monto else "sin monto"
        respuesta = f"Registré {monto_txt} en {cat.replace('_', ' ')} con fecha {fecha.isoformat()}."

    elif categoria == "TAREA_ACADEMICA":
        fecha = _detectar_fecha(mensaje, hoy)
        titulo = _titulo_evento(mensaje)
        acciones.append({
            "tipo": "crear_tarea",
            "datos": {
                "titulo": titulo, "materia": None, "fecha_entrega": fecha.isoformat(),
                "prioridad": "media", "minutos_estimados": 60, "estado": "pendiente",
                "material": "", "fuente": "chat",
            },
            "motivo": "Tarea académica detectada en el mensaje.",
        })
        respuesta = f"Creé la tarea \"{titulo}\" con entrega el {fecha.isoformat()}."

    elif categoria == "MANTENIMIENTO":
        fecha = _detectar_fecha(mensaje, hoy)
        t = _strip_acentos(mensaje.lower())
        tarea = "Cambio de aceite" if "aceite" in t else "Mantenimiento"
        acciones.append({
            "tipo": "programar_mantenimiento",
            "datos": {
                "activo": "moto" if "moto" in t else "otro",
                "tarea": tarea, "fecha": fecha.isoformat(), "hora": "09:00",
                "costo_estimado": None,
            },
            "motivo": "Mantenimiento solicitado por el usuario.",
        })
        alertas.append({"tipo": "mantenimiento_vencido", "texto": f"{tarea} programado para {fecha.isoformat()}.", "prioridad": "media"})
        respuesta = f"Programé \"{tarea}\" para el {fecha.isoformat()} a las 09:00."

    else:
        respuesta = (
            "Entendido. ¿Quieres que registre un gasto, agende un compromiso, "
            "cree una tarea académica o revise tu mantenimiento?"
        )

    return {
        "categoria": categoria,
        "intencion": categoria.lower(),
        "confianza": 0.82 if categoria != "CONVERSACION" else 0.95,
        "mensaje_usuario": respuesta,
        "requiere_confirmacion": False,
        "acciones": acciones,
        "alertas": alertas,
    }


# --------------------------------------------------------------------------- #
# Fachada
# --------------------------------------------------------------------------- #
async def complete(
    system: str,
    user: str,
    proveedor: str = "mock",
    api_key: str | None = None,
    modelo: str | None = None,
    temperature: float = 0.2,
    mensaje_original: str | None = None,
) -> str:
    """Llama al proveedor seleccionado y devuelve el texto de respuesta.

    `mensaje_original` es el texto crudo del usuario: el proveedor "mock" lo usa
    (en vez del prompt con contexto) para clasificar correctamente.
    """
    proveedor = (proveedor or "mock").lower()
    if proveedor == "mock":
        return json.dumps(_mock_response(mensaje_original or user, date.today()), ensure_ascii=False)

    if not api_key:
        raise ProviderError(
            f"El proveedor '{proveedor}' requiere una API Key. Configúrala en Ajustes o pega la tuya."
        )

    if proveedor == "openai":
        return await _call_openai(system, user, api_key, modelo or settings.default_openai_model, temperature)
    if proveedor in {"gemini", "google"}:
        return await _call_gemini(system, user, api_key, modelo or settings.default_gemini_model, temperature)

    raise ProviderError(f"Proveedor desconocido: '{proveedor}'")
