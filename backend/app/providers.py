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
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
OPENROUTER_BASE = "https://openrouter.ai/api/v1"
LMSTUDIO_BASE = "http://127.0.0.1:1234/v1"
OLLAMA_BASE = "http://127.0.0.1:11434"


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


async def _call_gemini(
    system: str, user: str, api_key: str, model: str, temperature: float,
    es_token_cuenta: bool = False,
) -> str:
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
    # El camino "cuenta" trae un access token OAuth: va en la cabecera, no en ?key=
    params = {} if es_token_cuenta else {"key": api_key}
    headers = {"Authorization": f"Bearer {api_key}"} if es_token_cuenta else {}
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=payload, params=params, headers=headers)
    if resp.status_code >= 400:
        raise ProviderError(f"Gemini error {resp.status_code}: {resp.text[:400]}")
    data = resp.json()
    partes = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in partes)


async def _call_anthropic(
    system: str, user: str, api_key: str, model: str, temperature: float
) -> str:
    """Adaptador Anthropic (Claude). La API exige 'system' fuera de 'messages'."""
    model_id = model or "claude-sonnet-4-5"
    payload = {
        "model": model_id,
        "max_tokens": 2048,
        "temperature": temperature,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(ANTHROPIC_URL, json=payload, headers=headers)
    if resp.status_code >= 400:
        raise ProviderError(f"Anthropic error {resp.status_code}: {resp.text[:400]}")
    data = resp.json()
    bloques = data.get("content", [])
    return "".join(b.get("text", "") for b in bloques if b.get("type") == "text")


async def _call_openai_compatible(
    system: str, user: str, api_key: str | None, model: str, temperature: float,
    base_url: str, nombre: str,
) -> str:
    """OpenRouter, LM Studio y cualquier servidor compatible con la API de OpenAI."""
    model_id = model or "gpt-4o-mini"
    payload = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(f"{base_url.rstrip('/')}/chat/completions", json=payload, headers=headers)
    if resp.status_code >= 400:
        raise ProviderError(f"{nombre} error {resp.status_code}: {resp.text[:400]}")
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise ProviderError(f"{nombre} devolvio una respuesta inesperada.") from exc


async def _call_ollama(system: str, user: str, model: str, temperature: float, base_url: str) -> str:
    """Ollama expone su propia API; usa /api/chat con formato JSON.

    Los modelos locales suelen correr con ventanas de contexto pequeñas (por
    defecto 4096-8192 tokens). El System Prompt completo + el contexto de la
    agenda no entran, y Ollama corta la conexion. Por eso se pide explicitamente
    una ventana mayor y, si aun asi falla, se recorta el prompt.
    """
    model_id = model or "llama3.1"

    async def _enviar(sys_prompt: str, num_ctx: int) -> str:
        payload = {
            "model": model_id,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "format": "json",
            "options": {"temperature": temperature, "num_ctx": num_ctx},
        }
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(f"{base_url.rstrip('/')}/api/chat", json=payload)
        if resp.status_code >= 400:
            raise ProviderError(f"Ollama error {resp.status_code}: {resp.text[:400]}")
        data = resp.json()
        contenido = data.get("message", {}).get("content", "")
        if not contenido:
            raise ProviderError("Ollama no devolvio contenido. Prueba con otro modelo.")
        return contenido

    try:
        return await _enviar(system, 16384)
    except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError) as exc:
        # Conexion cortada: casi siempre es el tamano del prompt. Se reintenta
        # con una version recortada antes de rendirse.
        try:
            return await _enviar(_recortar_prompt(system), 8192)
        except Exception:
            raise ProviderError(
                "No se pudo hablar con el modelo local. Es probable que el prompt "
                "sea muy grande para este modelo: prueba uno mas potente o revisa "
                "que Ollama tenga memoria suficiente."
            ) from exc
    except httpx.ReadTimeout as exc:
        raise ProviderError(
            "El modelo local tardo demasiado en responder. Prueba un modelo mas "
            "pequeno o con mas velocidad en tu computador."
        ) from exc


def _recortar_prompt(system: str, max_chars: int = 6000) -> str:
    """Version corta del System Prompt para motores con poca memoria.

    Conserva el contrato JSON (lo indispensable para parsear la respuesta) y
    descarta los ejemplos y las explicaciones largas.
    """
    if len(system) <= max_chars:
        return system
    marcador = "## 3. CONTRATO JSON"
    corte = system.find(marcador)
    if corte > 0:
        cabecera = system[:corte]
        resto = system[corte:]
        # Se conserva el contrato y se recortan las secciones finales.
        if len(resto) > max_chars - len(cabecera):
            resto = resto[: max_chars - len(cabecera)]
        return cabecera + resto
    return system[:max_chars]


# --------------------------------------------------------------------------- #
# Proveedor "mock": clasificador local por reglas (sin API Key)
# --------------------------------------------------------------------------- #
_RE_TIEMPO = re.compile(
    r"a\s*las\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|am|pm|p\.?\s*m\.?)?", re.IGNORECASE
)
_RE_MONTO = re.compile(
    r"(?:\$\s*|\bpor\s+|\bcosto\s*(?:de)?\s*|\bprecio\s*(?:de)?\s*|\bvalor\s*(?:de)?\s*|\bvale\s+"
    r"|\bgast\w*\s+|\bpagu\w*\s+|\bcompr\w*\s+|\bcobr\w*\s+|\bde\s+(?=\d))"
    r"(\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)"
    r"(?:\s*(millones|miles|mil|k|pesos|bol[ií]var|d[oó]lares|usd|cop|m\b|d\b))?",
    re.IGNORECASE,
)
_RE_DIA = re.compile(r"\b(lunes|mar[tí]es|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b", re.IGNORECASE)

# Conectores que separan intenciones distintas dentro de un mismo mensaje.
# La coma solo cuenta si NO separa digitos (para no romper "20,000").
_RE_CONECTOR = re.compile(
    r"\s*(?:;|\.(?=\s+[A-Za-zÁÉÍÓÚÑáéíóúñ])"
    r"|,\s+(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])"
    r"|\s+y\s|\s+además\s+|\s+también\s+|\s+luego\s+|\s+después\s+"
    r"|\s+pero\s+|\s+entonces\s+|\s+aparte\s+)\s*",
    re.IGNORECASE,
)
# Conectores que aparecen al inicio de un fragmento y hay que descartar.
_RE_CONECTOR_INICIAL = re.compile(
    r"^\s*(?:y|e|además|ademas|también|tambien|luego|después|despues|pero|entonces|aparte|"
    r"también|tambien)\s+",
    re.IGNORECASE,
)
_RE_REPLAN = re.compile(
    r"reorganiz|replanific|reordena|ordena|reacomoda|optimiza|distribuye|"
    r"arma\s+mi\s+d[ií]a|planifica|ajusta\s+mi\s+d[ií]a|organiza\s+mi\s+d[ií]a",
    re.IGNORECASE,
)
_RE_EVENTO_CON_DURACION = re.compile(
    r"taller|reparaci|visita|m[eé]dico|dentista|entrevista|examen\s+oral|"
    r"c[aá]mara|llamada|videollamada",
    re.IGNORECASE,
)

DIA_NUM = {"lunes": 0, "martes": 1, "miércoles": 2, "miercoles": 2, "jueves": 3,
           "viernes": 4, "sábado": 5, "sabado": 5, "domingo": 6}


def _detectar_fecha(texto: str, hoy: date) -> date:
    t = _strip_acentos(texto.lower())
    if "pasado manana" in t:
        return hoy + timedelta(days=2)
    if "manana" in t:
        return hoy + timedelta(days=1)
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
        if sufijo in {"k", "mil", "miles"}:
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
    if any(k in t for k in ("entrega", "entreg", "tarea", "tareas", "examen", "quiz", "resumen",
                            "apuntes", "material", "profesor", "materia", "estudiar", "investigar",
                            "deadline", "rendir", "parcial", "trabajo de", "seminario")):
        return "TAREA_ACADEMICA"
    if any(k in t for k in ("gast", "tanque", "compre", "pagu", "pagar", "costo", "precio", "vale",
                            "factura", "servicio", "compra", "gasto", "taxi", "bus ", "pasaje",
                            "almorz", "comida", "cena", "cafe", "pan", "tiquete", "uber")) or "$" in texto:
        return "BITACORA_GASTO"
    if any(k in t for k in ("cita", "reunion", "clase", "trabajo", "entren", "hora", "agenda",
                            "reorganiz", "replanific", "disponibilidad", "bloque", "a las")):
        return "CALENDARIO"
    return "CONVERSACION"


def _detectar_categoria_gasto(texto: str) -> str:
    """Deduce la categoría del gasto a partir del contexto del mensaje."""
    t = _strip_acentos(texto.lower())
    if "tanque" in t or "gasolina" in t or "combustible" in t:
        return "combustible"
    if "aceite" in t or "taller" in t or "reparacion" in t or "llanta" in t or "neuematico" in t:
        return "mantenimiento"
    if any(k in t for k in ("comida", "almuerzo", "restaurante", "cena", "desayuno", "café", "cafe", "pan")):
        return "alimentacion"
    if any(k in t for k in ("servicio", "internet", "luz", "agua", "celular", "plan", "suscripcion")):
        return "servicios"
    if any(k in t for k in ("taxi", "bus", "transporte", "parking", "tiquete", "pasaje", "vuelo", "gasolina")):
        return "transporte"
    if any(k in t for k in ("libro", "material", "matricula", "inscripcion", "universidad")):
        return "educacion"
    if any(k in t for k in ("medico", "medicina", "farmacia", "droga", "consulta")):
        return "salud"
    if any(k in t for k in ("cine", "concierto", "paseo", "fiesta", "bar", "discoteca")):
        return "ocio"
    return "otro"


def _detectar_activo(texto: str) -> str:
    """Deduce el activo (moto, carro, computador...) del que habla el mensaje."""
    t = _strip_acentos(texto.lower())
    for clave, valor in (
        ("moto", "moto"), ("motocicleta", "moto"), ("ciclomotor", "moto"),
        ("carro", "carro"), ("auto", "carro"), ("coche", "carro"),
        ("computador", "computador"), ("laptop", "computador"), ("pc", "computador"),
        ("bici", "bicicleta"), ("bicicleta", "bicicleta"),
        ("celular", "celular"), ("telefono", "celular"),
    ):
        if clave in t:
            return valor
    return "otro"


def _titulo_mantenimiento(texto: str) -> str:
    t = _strip_acentos(texto.lower())
    for clave, etiqueta in (
        ("cambio de aceite", "Cambio de aceite"),
        ("aceite", "Cambio de aceite"),
        ("filtro", "Cambio de filtro"),
        ("freno", "Revisión de frenos"),
        ("neumatico", "Cambio de neumáticos"),
        ("revision", "Revisión general"),
        ("service", "Service general"),
        ("taller", "Mantenimiento general"),
    ):
        if clave in t:
            return etiqueta
    return "Mantenimiento"


def _fragmentar(mensaje: str) -> list[str]:
    """Divide el mensaje en fragmentos que pueden ser intenciones distintas.

    Respeta los conectores naturales ("y", "además", "también", ";"...) pero
    nunca parte un número ("20,000") ni una frase sin conector.
    """
    partes = [p.strip() for p in _RE_CONECTOR.split(mensaje) if p and p.strip()]
    limpio: list[str] = []
    for p in partes:
        p = _RE_CONECTOR_INICIAL.sub("", p).strip(" .,;")
        if p:
            limpio.append(p)
    return limpio or [mensaje.strip()]


def _titulo_evento(texto: str) -> str:
    """Limpia el mensaje para obtener un título corto y legible."""
    limpio = texto.strip()
    # Verbos y adverbios iniciales
    limpio = re.sub(
        r"^\s*(hoy|ayer|mañana|manana|ahora|recien|recién)\s+", "", limpio, flags=re.IGNORECASE
    )
    limpio = re.sub(
        r"^\s*(tengo\s+que|tengo|necesito|necesito\s+hacer|debo|tuve\s+que|me\s+toca|me\s+gaste|"
        r"me\s+gasté|compre|compré|pague|pagué|pago|hay\s+que|hay|me\s+toca|me\s+gasté)\s+",
        "", limpio, flags=re.IGNORECASE,
    )
    # Día de la semana al inicio ("el viernes entrego el ensayo")
    limpio = re.sub(
        r"^\s*(?:el|los|la|las|este|esta|proximo|próximo|para\s+el)\s+"
        r"(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b\s*",
        "", limpio, flags=re.IGNORECASE,
    )
    # Cláusula temporal final
    limpio = re.sub(
        r"\s+(a\s+las\s+.*|hoy|mañana|manana|ayer|el\s+lunes|el\s+martes|el\s+miércoles|"
        r"el\s+miercoles|el\s+jueves|el\s+viernes|el\s+sábado|el\s+sabado|el\s+domingo|"
        r"lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)$",
        "", limpio, flags=re.IGNORECASE,
    )
    # Adverbios temporales en cualquier posición ("cita hoy a las 3")
    limpio = re.sub(r"\b(hoy|mañana|manana|ayer)\b\s*", " ", limpio, flags=re.IGNORECASE)
    # Cláusula monetaria final
    limpio = re.sub(
        r"\s+(por|value|costo|costo|precio)\s+(\$|\d).*$", "", limpio, flags=re.IGNORECASE
    )
    limpio = re.sub(r"\s+\$[\d.,]+.*$", "", limpio)
    limpio = re.sub(r"^(una?|el|la|los|las)\s+", "", limpio, flags=re.IGNORECASE)
    limpio = limpio.strip(" .,-–—")
    return (limpio[:60] or "Compromiso").capitalize()


def _acciones_calendario(fragmento: str, hoy: date) -> tuple[list[dict], list[dict], str]:
    """Construye las acciones de un fragmento de tipo CALENDARIO."""
    fecha = _detectar_fecha(fragmento, hoy)
    hora, minuto = _detectar_hora(fragmento)
    inicio = datetime.combine(fecha, datetime.min.time()).replace(hour=hora, minute=minuto)
    duracion = 120 if _RE_EVENTO_CON_DURACION.search(fragmento) else 60
    fin = inicio + timedelta(minutes=duracion)
    titulo = _titulo_evento(fragmento)
    acciones: list[dict] = [{
        "tipo": "crear_evento",
        "datos": {
            "titulo": titulo, "categoria": "personal",
            "inicio": inicio.isoformat(timespec="minutes"),
            "fin": fin.isoformat(timespec="minutes"),
            "inamovible": True, "notas": "", "fuente": "chat",
        },
        "motivo": "Compromiso informado por el usuario.",
    }]
    alertas: list[dict] = []
    respuesta = (
        f"Listo: agendé \"{titulo}\" de {hora:02d}:{minuto:02d} a "
        f"{fin.strftime('%H:%M')} como compromiso inamovible y reorganice el resto del día."
    )
    return acciones, alertas, respuesta


def _acciones_replan_para(fecha: date) -> dict:
    """Acción de reorganización del día (se añade una sola vez por fecha)."""
    return {
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
    }


def _acciones_replan(fragmento: str, hoy: date) -> tuple[list[dict], list[dict], str]:
    """Reorganiza el día sin crear eventos nuevos."""
    fecha = _detectar_fecha(fragmento, hoy)
    acciones = [{
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
        "motivo": "El usuario pidió reorganizar su día.",
    }]
    return acciones, [], f"Reorganicé tu día del {fecha.isoformat()} sin solapar tus compromisos inamovibles."


def _acciones_gasto(fragmento: str, hoy: date, contexto: str = "") -> tuple[list[dict], list[dict], str]:
    """Construye las acciones de un fragmento de tipo BITACORA_GASTO."""
    monto = _detectar_monto(fragmento)
    fecha = _detectar_fecha(fragmento, hoy)
    cat = _detectar_categoria_gasto(fragmento)
    acciones = [{
        "tipo": "registrar_gasto",
        "datos": {
            "descripcion": _titulo_evento(fragmento),
            "monto": monto, "moneda": settings.default_currency, "categoria": cat,
            "fecha": fecha.isoformat(), "registrar_en_calendario": False, "notas": "",
        },
        "motivo": "Gasto informado por el usuario.",
    }]
    alertas: list[dict] = []
    monto_txt = f"{monto:,.0f} {settings.default_currency}" if monto else "sin monto"
    respuesta = f"Registré {monto_txt} en {cat.replace('_', ' ')} con fecha {fecha.isoformat()}."

    # Cascada: si el gasto es de mantenimiento, se actualiza el registro del activo.
    if cat == "mantenimiento":
        activo = _detectar_activo(contexto or fragmento)
        tarea_mant = _titulo_mantenimiento(fragmento)
        proxima = fecha + timedelta(days=90)
        acciones.append({
            "tipo": "registrar_mantenimiento",
            "datos": {
                "activo": activo,
                "tarea": tarea_mant,
                "intervalo_dias": 90,
                "ultima_realizacion": fecha.isoformat(),
                "proxima_fecha": proxima.isoformat(),
                "costo_estimado": monto,
                "notas": "Actualizado automáticamente al detectar el gasto.",
            },
            "motivo": "El gasto corresponde a un mantenimiento; se reprograma el próximo servicio.",
        })
        alertas.append({
            "tipo": "mantenimiento_actualizado",
            "texto": f"Próximo {tarea_mant.lower()} ({activo}) el {proxima.isoformat()}.",
            "prioridad": "media",
        })
        respuesta += f" Además actualicé el próximo {tarea_mant.lower()} del {activo}."
    return acciones, alertas, respuesta


def _acciones_tarea(fragmento: str, hoy: date) -> tuple[list[dict], list[dict], str]:
    """Construye las acciones de un fragmento de tipo TARJA_ACADEMICA."""
    fecha = _detectar_fecha(fragmento, hoy)
    titulo = _titulo_evento(fragmento)
    minutos = 120 if any(k in _strip_acentos(fragmento.lower()) for k in ("ensayo", "trabajo", "examen", "proyecto")) else 60
    acciones = [{
        "tipo": "crear_tarea",
        "datos": {
            "titulo": titulo, "materia": None, "fecha_entrega": fecha.isoformat(),
            "prioridad": "media", "minutos_estimados": minutos, "estado": "pendiente",
            "material": "", "fuente": "chat",
        },
        "motivo": "Tarea académica detectada en el mensaje.",
    }]
    # Cascada: se agenda un bloque de estudio antes de la entrega.
    acciones.append({
        "tipo": "programar_estudio",
        "datos": {
            "titulo": f"Estudio: {titulo}",
            "categoria": "estudio",
            "inicio": datetime.combine(fecha, datetime.min.time()).replace(hour=18).isoformat(timespec="minutes"),
            "fin": datetime.combine(fecha, datetime.min.time()).replace(hour=19, minute=30).isoformat(timespec="minutes"),
            "material": "Bloque reservado automáticamente para completar la tarea.",
            "fuente": "chat",
        },
        "motivo": "Se agenda estudio automáticamente para la entrega.",
    })
    respuesta = f"Creé la tarea \"{titulo}\" con entrega el {fecha.isoformat()} y agendé un bloque de estudio."
    return acciones, [], respuesta


def _acciones_mantenimiento(fragmento: str, hoy: date, contexto: str = "") -> tuple[list[dict], list[dict], str]:
    """Construye las acciones de un fragmento de tipo MANTENIMIENTO."""
    fecha = _detectar_fecha(fragmento, hoy)
    tarea = _titulo_mantenimiento(fragmento)
    activo = _detectar_activo(contexto or fragmento)
    acciones = [{
        "tipo": "programar_mantenimiento",
        "datos": {
            "activo": activo,
            "tarea": tarea, "fecha": fecha.isoformat(), "hora": "09:00",
            "intervalo_dias": 90,
            "costo_estimado": _detectar_monto(fragmento),
        },
        "motivo": "Mantenimiento solicitado por el usuario.",
    }]
    alertas = [{
        "tipo": "mantenimiento_vencido",
        "texto": f"{tarea} programado para {fecha.isoformat()}.",
        "prioridad": "media",
    }]
    respuesta = f"Programé \"{tarea}\" del {activo} para el {fecha.isoformat()} a las 09:00."
    return acciones, alertas, respuesta

def respuesta_reglas(mensaje: str) -> dict[str, Any]:
    """Clasificador por reglas expuesto como API publica.

    Se usa como red de seguridad cuando el modelo elegido (sobre todo los
    locales o los "small") no devuelve el JSON del contrato: el mensaje del
    usuario se registra igual, en lugar de perderse en una conversacion vacia.
    """
    return _mock_response(mensaje, date.today())


def _mock_response(mensaje: str, hoy: date) -> dict[str, Any]:
    """Clasificador local multi-intención.

    Un solo mensaje puede contener varias intenciones ("tengo una cita a las 3
    y gasté 20 mil en gasolina"): se divide en fragmentos y se ejecuta una
    acción por cada intención detectada, no solo la primera.
    """
    fragmentos = _fragmentar(mensaje)
    acciones: list[dict[str, Any]] = []
    alertas: list[dict[str, Any]] = []
    respuestas: list[str] = []
    categorias: list[str] = []
    fechas_replan: set[str] = set()

    for frag in fragmentos:
        cat = _clasificar(frag)
        if cat == "CONVERSACION":
            continue

        # Petición explícita de reorganizar el día (no crear evento).
        if cat == "CALENDARIO" and _RE_REPLAN.search(frag) and not _RE_TIEMPO.search(frag):
            acc, al, txt = _acciones_replan(frag, hoy)
        elif cat == "CALENDARIO":
            acc, al, txt = _acciones_calendario(frag, hoy)
            # Tras agendar un compromiso inamovible se reorganiza el resto del día.
            fecha_evento = acc[0]["datos"]["inicio"][:10] if acc else ""
            if fecha_evento and fecha_evento not in fechas_replan:
                fechas_replan.add(fecha_evento)
                acc.append(_acciones_replan_para(date.fromisoformat(fecha_evento)))
        elif cat == "BITACORA_GASTO":
            acc, al, txt = _acciones_gasto(frag, hoy, contexto=mensaje)
        elif cat == "TAREA_ACADEMICA":
            acc, al, txt = _acciones_tarea(frag, hoy)
        else:
            acc, al, txt = _acciones_mantenimiento(frag, hoy, contexto=mensaje)

        acciones.extend(acc)
        alertas.extend(al)
        respuestas.append(txt)
        if cat not in categorias:
            categorias.append(cat)

    if not acciones:
        return {
            "categoria": "CONVERSACION",
            "intencion": "conversacion",
            "confianza": 0.95,
            "mensaje_usuario": (
                "Entendido. Dime qué quieres que registre: un gasto, un compromiso, "
                "una tarea académica o el mantenimiento, y lo hago de una."
            ),
            "requiere_confirmacion": False,
            "acciones": [],
            "alertas": [],
        }

    categoria = categorias[0]
    # Si hay varias intenciones, la confianza baja un poco (más ambigüedad).
    confianza = 0.9 if len(categorias) == 1 else 0.8
    return {
        "categoria": categoria,
        "intencion": "+".join(c.lower() for c in categorias),
        "confianza": confianza,
        "mensaje_usuario": " ".join(respuestas),
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
    base_url: str | None = None,
) -> str:
    """Llama al proveedor seleccionado y devuelve el texto de respuesta.

    `mensaje_original` es el texto crudo del usuario: el proveedor "mock" lo usa
    (en vez del prompt con contexto) para clasificar correctamente.

    `base_url` permite apuntar a motores locales (Ollama, LM Studio) o a
    cualquier servidor compatible con la API de OpenAI.
    """
    proveedor = (proveedor or "mock").lower()
    if proveedor in {"mock", "demo", "motor-local", "motorlocal"}:
        return json.dumps(_mock_response(mensaje_original or user, date.today()), ensure_ascii=False)

    # --- Motores locales: no requieren credenciales -------------------------
    if proveedor == "ollama":
        return await _call_ollama(
            system, user, modelo or "llama3.1", temperature, base_url or OLLAMA_BASE
        )
    if proveedor == "lmstudio":
        return await _call_openai_compatible(
            system, user, api_key, modelo or "llama-3.1-8b-instruct",
            temperature, base_url or LMSTUDIO_BASE, "LM Studio",
        )

    # --- Proveedores remotos: requieren credencial ---------------------------
    if not api_key:
        raise ProviderError(
            f"El proveedor '{proveedor}' requiere una API Key. Configúrala en Ajustes o pega la tuya."
        )

    if proveedor == "openai":
        return await _call_openai(system, user, api_key, modelo or settings.default_openai_model, temperature)
    if proveedor in {"gemini", "google", "google_cuenta"}:
        # El camino "cuenta" usa un access token OAuth (cabecera Bearer).
        es_cuenta = proveedor == "google_cuenta" or api_key.startswith("ya29.") or api_key.startswith("sk-sid:")
        return await _call_gemini(
            system, user, api_key, modelo or settings.default_gemini_model, temperature,
            es_token_cuenta=es_cuenta,
        )
    if proveedor in {"anthropic", "claude_cuenta"}:
        return await _call_anthropic(system, user, api_key, modelo or "claude-sonnet-4-5", temperature)
    if proveedor in {"chatgpt_cuenta"}:
        return await _call_openai(system, user, api_key, modelo or settings.default_openai_model, temperature)
    if proveedor == "openrouter":
        return await _call_openai_compatible(
            system, user, api_key, modelo or "openai/gpt-4o-mini",
            temperature, base_url or OPENROUTER_BASE, "OpenRouter",
        )

    raise ProviderError(f"Proveedor desconocido: '{proveedor}'")
