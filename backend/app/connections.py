"""Catalogo de proveedores de IA y flujo de conexion guiado.

Objetivo de diseno: que una persona sin conocimientos tecnicos pueda
conectar LifeSync con "la cuenta de IA que ya tiene" (ChatGPT, Claude,
Gemini, Copilot...) sin saber que es un token ni una API key.

Tres caminosofferidos por el producto:

  1. "Cuenta"   -> sesion/OAuth de la cuenta del usuario (ChatGPT, Claude.ai,
                    Google). El usuario hace login en su navegador y la app
                    queda conectada. Sin claves que copiar a mano.
  2. "Clave"    -> BYOK clasico: pega la clave de la consola del proveedor.
  3. "Local"    -> motor local (Ollama / LM Studio) en su propio equipo:
                    gratis, offline y sin ninguna credencial.
  4. "Demo"     -> asistente integrado (motor de reglas), cero configuracion.

Este modulo es la CAPA DE CATALOGO: describe cada proveedor (que necesita,
como se conecta, modelos sugeridos, enlaces oficiales) y valida conexiones.
La ejecucion real de los modelos vive en `providers.py`.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from .config import settings
from .security import cifrar, descifrar


# --------------------------------------------------------------------------- #
# Catalogo
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Proveedor:
    id: str
    nombre: str
    modo: str                    # api_key | cuenta | local | demo
    resumen: str                 # una frase, sin jerga
    icono: str                   # emoji para la UI
    requiere_pago: bool = False
    gratis: bool = False
    instrucciones: list[str] = field(default_factory=list)
    modelos: list[str] = field(default_factory=list)
    modelo_defecto: str = ""
    url_registro: str = ""
    base_url: str = ""
    pasos_ayuda: list[str] = field(default_factory=list)
    notas: str = ""
    # Flujo de "conectar con tu cuenta" (OAuth Device Authorization).
    # El usuario NUNCA ve un token: solo autoriza en el navegador y la app
    # se encarga de guardar el access token cifrado.
    device_auth_url: str = ""
    token_url: str = ""
    scope: str = ""
    url_client_id: str = ""

    def a_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "nombre": self.nombre,
            "modo": self.modo,
            "resumen": self.resumen,
            "icono": self.icono,
            "requiere_pago": self.requiere_pago,
            "gratis": self.gratis,
            "instrucciones": self.instrucciones,
            "modelos": self.modelos,
            "modelo_defecto": self.modelo_defecto,
            "url_registro": self.url_registro,
            "pasos_ayuda": self.pasos_ayuda,
            "notas": self.notas,
            "acepta_cuenta": bool(self.device_auth_url),
            "url_client_id": self.url_client_id,
        }


CATALOGO: dict[str, Proveedor] = {
    "openai": Proveedor(
        id="openai",
        nombre="OpenAI (ChatGPT)",
        modo="api_key",
        resumen="Conecta tu cuenta de OpenAI para usar GPT con razonamiento profundo.",
        icono="🧠",
        requiere_pago=True,
        instrucciones=[
            "Entra a la consola de OpenAI con tu cuenta.",
            "Abre el menu 'API keys' y crea una clave nueva.",
            "Copia la clave (empieza por 'sk-') y pegala aqui.",
        ],
        pasos_ayuda=[
            "La clave se pega una sola vez y queda cifrada en tu servidor.",
            "Costo: se cobra por uso (la API es distinta de la suscripción de ChatGPT).",
        ],
        modelos=["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
        modelo_defecto="gpt-4o-mini",
        url_registro="https://platform.openai.com/api-keys",
        base_url="https://api.openai.com/v1",
    ),
    "anthropic": Proveedor(
        id="anthropic",
        nombre="Anthropic (Claude)",
        modo="api_key",
        resumen="Usa los modelos Claude para textos largos y analisis cuidadosos.",
        icono="🟠",
        requiere_pago=True,
        instrucciones=[
            "Entra a console.anthropic.com con tu cuenta.",
            "Ve a 'API Keys' y pulsa 'Create Key'.",
            "Copia la clave (empieza por 'sk-ant-') y pegala aqui.",
        ],
        pasos_ayuda=[
            "Necesitas saldo en la consola de Anthropic (la API es aparte del Claude.ai).",
        ],
        modelos=["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
        modelo_defecto="claude-sonnet-4-5",
        url_registro="https://console.anthropic.com/settings/keys",
        base_url="https://api.anthropic.com/v1",
    ),
    "gemini": Proveedor(
        id="gemini",
        nombre="Google (Gemini)",
        modo="api_key",
        resumen="Conecta tu cuenta de Google y usa Gemini, con generoso plan gratis.",
        icono="🔵",
        gratis=True,
        instrucciones=[
            "Entra a Google AI Studio con tu cuenta de Google.",
            "Pulsa 'Get API key' y elige o crea un proyecto.",
            "Copia la clave y pegala aqui.",
        ],
        pasos_ayuda=[
            "Google AI Studio tiene cuota gratuita generosa para pruebas.",
        ],
        modelos=["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
        modelo_defecto="gemini-2.0-flash",
        url_registro="https://aistudio.google.com/apikey",
        base_url="https://generativelanguage.googleapis.com/v1beta",
    ),
    "openrouter": Proveedor(
        id="openrouter",
        nombre="OpenRouter",
        modo="api_key",
        resumen="Una sola clave te da acceso a Llama, Mistral, DeepSeek y mas de 300 modelos.",
        icono="🌐",
        requiere_pago=True,
        instrucciones=[
            "Crea una cuenta en OpenRouter.",
            "Abre 'Keys' y genera una clave.",
            "Pegala aqui: es la unica clave que necesitaras para todos los modelos.",
        ],
        pasos_ayuda=[
            "Ideal si quieres comparar modelos sin abrir mil cuentas.",
        ],
        modelos=["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5", "meta-llama/llama-3.3-70b-instruct"],
        modelo_defecto="openai/gpt-4o-mini",
        url_registro="https://openrouter.ai/keys",
        base_url="https://openrouter.ai/api/v1",
    ),
    "ollama": Proveedor(
        id="ollama",
        nombre="IA en tu computador (Ollama)",
        modo="local",
        resumen="Instala Ollama y usa una IA en tu PC: gratis, sin clave y sin internet.",
        icono="🏠",
        gratis=True,
        instrucciones=[
            "Instala Ollama desde ollama.com (Windows, Mac o Linux).",
            "En una terminal ejecuta: ollama pull llama3.1",
            "LifeSync detecta el servidor local automaticamente.",
        ],
        pasos_ayuda=[
            "Todo se queda en tu equipo: nada sale a internet.",
            "Requiere que Ollama este abierto mientras usas LifeSync.",
        ],
        modelos=["llama3.1", "llama3.2", "qwen2.5", "mistral", "gemma2"],
        modelo_defecto="llama3.1",
        url_registro="https://ollama.com/download",
        base_url="http://127.0.0.1:11434",
    ),
    "lmstudio": Proveedor(
        id="lmstudio",
        nombre="IA en tu computador (LM Studio)",
        modo="local",
        resumen="Interfaz grafica para correr modelos en tu PC, sin comandos ni claves.",
        icono="🎛️",
        gratis=True,
        instrucciones=[
            "Instala LM Studio desde lmstudio.ai.",
            "Descarga un modelo (por ejemplo Llama 3.1 8B).",
            "En LM Studio activa el servidor local en el puerto 1234.",
        ],
        pasos_ayuda=[
            "LifeSync busca solo en http://127.0.0.1:1234/v1.",
        ],
        modelos=["llama-3.1-8b-instruct", "qwen2.5-7b-instruct"],
        modelo_defecto="llama-3.1-8b-instruct",
        url_registro="https://lmstudio.ai/download",
        base_url="http://127.0.0.1:1234/v1",
    ),
    "demo": Proveedor(
        id="demo",
        nombre="Asistente demo (integrado)",
        modo="demo",
        resumen="Funciona ya mismo sin configurar nada. Ideal para conocer LifeSync.",
        icono="✨",
        gratis=True,
        instrucciones=[
            "No hay nada que configurar: elige esta opcion y listo.",
            "Entiende citas, tareas, gastos y mantenimiento en español.",
        ],
        pasos_ayuda=[
            "Es un clasificador por reglas: no usa internet ni IA generativa.",
        ],
        modelos=["motor-local"],
        modelo_defecto="motor-local",
    ),
    # ------------------------------------------------------------------ #
    # Camino "cuenta": el usuario autoriza con su cuenta en el navegador
    # y la app se encarga del token (nunca lo ve el usuario).
    # ------------------------------------------------------------------ #
    "google_cuenta": Proveedor(
        id="google_cuenta",
        nombre="Google (con mi cuenta de Google)",
        modo="cuenta",
        resumen="Entra con tu cuenta de Google y usa Gemini. Sin copiar claves.",
        icono="🔵",
        gratis=True,
        instrucciones=[
            "Abre el panel de Google Cloud (la cuenta con la que te registraste).",
            "Crea un proyecto y ve a 'APIs y servicios' > 'Credenciales'.",
            "Crea un 'ID de cliente OAuth' de tipo 'App de escritorio'.",
            "Copia el 'ID de cliente' (son unos caracteres, no es un token).",
            "Pegalo aqui y autorizare en el navegador con tu cuenta.",
        ],
        pasos_ayuda=[
            "LifeSync pide autorizacion en el navegador y guarda el permiso internamente.",
            "Tu contrasena nunca pasa por LifeSync: la escribes solo en Google.",
            "Puedes desconectar cuando quieras y el permiso se borra.",
        ],
        modelos=["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
        modelo_defecto="gemini-2.0-flash",
        url_registro="https://console.cloud.google.com/apis/credentials",
        url_client_id="https://console.cloud.google.com/apis/credentials",
        base_url="https://generativelanguage.googleapis.com/v1beta",
        device_auth_url="https://oauth2.googleapis.com/device/code",
        token_url="https://oauth2.googleapis.com/token",
        scope="https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email",
    ),
    "chatgpt_cuenta": Proveedor(
        id="chatgpt_cuenta",
        nombre="ChatGPT (con mi cuenta)",
        modo="cuenta",
        resumen="Entra con tu cuenta de ChatGPT y usa el modelo sin pegar claves.",
        icono="🧠",
        requiere_pago=True,
        instrucciones=[
            "Abre la pagina de aplicaciones de OpenAI.",
            "Registra una aplicacion de escritorio y copia el Client ID.",
            "Pegalo aqui y autorizare en el navegador con tu cuenta.",
        ],
        pasos_ayuda=[
            "Requiere plan de pago de ChatGPT para el acceso por cuenta.",
            "La app guarda el permiso cifrado; tu nunca copias un token.",
        ],
        modelos=["gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
        modelo_defecto="gpt-4o-mini",
        url_registro="https://platform.openai.com/apps",
        url_client_id="https://platform.openai.com/apps",
        base_url="https://api.openai.com/v1",
        device_auth_url="https://auth.openai.com/oauth/device/code",
        token_url="https://auth.openai.com/oauth/token",
        scope="openid profile email offline_access",
    ),
    "claude_cuenta": Proveedor(
        id="claude_cuenta",
        nombre="Claude (con mi suscripcion)",
        modo="cuenta",
        resumen="Usa tu suscripcion de Claude autorizando desde el navegador.",
        icono="🟠",
        requiere_pago=True,
        instrucciones=[
            "Abre el panel de aplicaciones de Anthropic.",
            "Crea una aplicacion de escritorio y copia el Client ID.",
            "Pegalo aqui y autorizare en el navegador con tu cuenta.",
        ],
        pasos_ayuda=[
            "Requiere suscripcion Claude Pro o Max para el acceso por cuenta.",
        ],
        modelos=["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
        modelo_defecto="claude-sonnet-4-5",
        url_registro="https://console.anthropic.com/settings/apps",
        url_client_id="https://console.anthropic.com/settings/apps",
        base_url="https://api.anthropic.com/v1",
        device_auth_url="https://console.anthropic.com/v1/oauth/device/code",
        token_url="https://console.anthropic.com/v1/oauth/token",
        scope="org:create_api_key user:profile user:inference",
    ),
}

#: Proveedores que la app sabe ejecutar de verdad.
PROVEEDORES_SOPORTADOS = {
    "openai", "anthropic", "gemini", "openrouter", "ollama", "lmstudio", "mock",
    "google_cuenta", "chatgpt_cuenta", "claude_cuenta",
}

#: Equivalencias de nombre -> id de catalogo.
ALIAS = {
    "google": "gemini",
    "googlegemini": "gemini",
    "claude": "anthropic",
    "chatgpt": "openai",
    "ollama-local": "ollama",
    "local": "ollama",
    "mock": "demo",
    "demo": "demo",
    "motor-local": "demo",
    # Atajos hacia el camino "con mi cuenta".
    "googlecuenta": "google_cuenta",
    "chatgptcuenta": "chatgpt_cuenta",
    "claudecuenta": "claude_cuenta",
    "cuenta": "google_cuenta",
}


def normalizar_proveedor(nombre: str | None) -> str:
    """Normaliza el nombre del proveedor a su id de catalogo."""
    if not nombre:
        return "demo"
    clave = nombre.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
    if clave in ALIAS:
        return ALIAS[clave]
    if clave in CATALOGO:
        return clave
    if clave in PROVEEDORES_SOPORTADOS:
        return clave
    return clave


def listar_catalogo() -> list[dict[str, Any]]:
    return [p.a_dict() for p in CATALOGO.values()]


def obtener_proveedor(nombre: str | None) -> Proveedor | None:
    return CATALOGO.get(normalizar_proveedor(nombre))


# --------------------------------------------------------------------------- #
# Deteccion automatica de motores locales
# --------------------------------------------------------------------------- #
_CACHE_MOTORES: dict[str, Any] = {"ts": 0.0, "valor": []}
_CACHE_TTL = 8.0


def detectar_motores_locales_sync(forzar: bool = False) -> list[dict[str, Any]]:
    """Variante sincrona (para endpoints que ya trabajan en hilo sync).

    Cachea el resultado unos segundos: el listado de conexiones lo invoca por
    cada conexion local y no tiene sentido interrogar los motores tan a menudo.
    """
    ahora = time.time()
    if not forzar and ahora - float(_CACHE_MOTORES["ts"]) < _CACHE_TTL:
        return list(_CACHE_MOTORES["valor"])
    candidatos = [
        ("ollama", "http://127.0.0.1:11434/api/tags", "Ollama"),
        ("lmstudio", "http://127.0.0.1:1234/v1/models", "LM Studio"),
    ]
    encontrados: list[dict[str, Any]] = []
    with httpx.Client(timeout=2.5) as client:
        for pid, url, nombre in candidatos:
            try:
                resp = client.get(url)
            except Exception:
                continue
            if resp.status_code >= 400:
                continue
            modelos: list[str] = []
            try:
                data = resp.json()
                if pid == "ollama":
                    modelos = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
                else:
                    modelos = [m.get("id", "") for m in data.get("data", []) if m.get("id")]
            except Exception:
                pass
            encontrados.append(
                {
                    "id": pid,
                    "nombre": nombre,
                    "url": url,
                    "modelos": modelos[:12],
                    "modelos_disponibles": len(modelos),
                }
            )
    _CACHE_MOTORES["ts"] = ahora
    _CACHE_MOTORES["valor"] = encontrados
    return list(encontrados)


async def detectar_motores_locales() -> list[dict[str, Any]]:
    """Busca servidores de IA locales (Ollama, LM Studio) ya levantados."""
    return detectar_motores_locales_sync()


# --------------------------------------------------------------------------- #
# Verificacion de credenciales
# --------------------------------------------------------------------------- #
async def verificar_credenciales(
    proveedor: str,
    credenciales: dict[str, Any] | None = None,
    modelo: str | None = None,
) -> tuple[bool, str, dict[str, Any]]:
    """Comprueba si las credenciales son validas. Devuelve (ok, mensaje, extra)."""
    pid = normalizar_proveedor(proveedor)
    cred = credenciales or {}
    extra: dict[str, Any] = {}

    if pid == "demo":
        return True, "Asistente demo listo. No requiere configuracion.", extra

    if pid == "ollama":
        base = (cred.get("base_url") or "http://127.0.0.1:11434").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=4) as client:
                resp = await client.get(f"{base}/api/tags")
            if resp.status_code >= 400:
                return False, f"Ollama respondio con error {resp.status_code}.", extra
            data = resp.json()
            nombres = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
            extra["modelos"] = nombres[:20]
            if not nombres:
                return False, "Ollama esta abierto pero no tiene modelos. Ejecuta 'ollama pull llama3.1'.", extra
            return True, f"Ollama detectada con {len(nombres)} modelo(s).", extra
        except Exception:
            return False, "No se encontro Ollama. Instalalo y dejalo abierto.", extra

    if pid == "lmstudio":
        base = (cred.get("base_url") or "http://127.0.0.1:1234/v1").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=4) as client:
                resp = await client.get(f"{base}/models")
            if resp.status_code >= 400:
                return False, f"LM Studio respondio con error {resp.status_code}.", extra
            data = resp.json()
            nombres = [m.get("id", "") for m in data.get("data", []) if m.get("id")]
            extra["modelos"] = nombres[:20]
            if not nombres:
                return False, "LM Studio responde pero no tiene modelos cargados.", extra
            return True, f"LM Studio detectada con {len(nombres)} modelo(s).", extra
        except Exception:
            return False, "No se encontro LM Studio. Activa el servidor local en LM Studio.", extra

    # Proveedores remotos: la credencial es una clave de API.
    clave = (cred.get("api_key") or "").strip()
    if not clave:
        return False, "Falta la clave de API.", extra

    modelo_prueba = modelo or CATALOGO[pid].modelo_defecto if pid in CATALOGO else modelo
    try:
        if pid == "anthropic":
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": clave,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": modelo_prueba or "claude-sonnet-4-5",
                        "max_tokens": 16,
                        "messages": [{"role": "user", "content": "ping"}],
                    },
                )
            if resp.status_code == 401:
                return False, "La clave fue rechazada. Revisala en la consola del proveedor.", extra
            if resp.status_code >= 400:
                return False, f"El proveedor respondio {resp.status_code}: {resp.text[:200]}", extra
            return True, "Credenciales validas. Claude responde correctamente.", extra

        # OpenAI y compatibles (openai, openrouter, gemini via OpenAI-compat no aplica)
        if pid == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo_prueba or 'gemini-2.0-flash'}:generateContent"
            async with httpx.AsyncClient(timeout=25) as client:
                resp = await client.post(
                    url,
                    params={"key": clave},
                    json={
                        "contents": [{"role": "user", "parts": [{"text": "ping"}]}],
                        "generationConfig": {"maxOutputTokens": 16},
                    },
                )
            if resp.status_code in (400, 403):
                return False, "La clave fue rechazada o el modelo no esta disponible.", extra
            if resp.status_code >= 400:
                return False, f"Gemini respondio {resp.status_code}: {resp.text[:200]}", extra
            return True, "Credenciales validas. Gemini responde correctamente.", extra

        base = CATALOGO[pid].base_url if pid in CATALOGO else "https://api.openai.com/v1"
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.get(
                f"{base.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {clave}"},
            )
        if resp.status_code == 401:
            return False, "La clave fue rechazada. Revisala en la consola del proveedor.", extra
        if resp.status_code >= 400:
            return False, f"El proveedor respondio {resp.status_code}: {resp.text[:200]}", extra
        return True, "Credenciales validas. El proveedor respondio correctamente.", extra
    except httpx.TimeoutException:
        return False, "El proveedor no respondio a tiempo. Revisa tu conexion a internet.", extra
    except Exception as exc:  # pragma: no cover - red
        return False, f"No se pudo verificar: {exc}", extra


# --------------------------------------------------------------------------- #
# Persistencia de conexiones
# --------------------------------------------------------------------------- #
def credenciales_a_json(cred: dict[str, Any]) -> str:
    """Cifra el bloque de credenciales para guardarlo en reposo."""
    return cifrar(json.dumps(cred, ensure_ascii=False))


def credenciales_desde_json(texto: str | None) -> dict[str, Any]:
    if not texto:
        return {}
    try:
        return json.loads(descifrar(texto))
    except Exception:
        return {}


def modo_por_proveedor(proveedor: str) -> str:
    prov = obtener_proveedor(proveedor)
    if prov:
        return prov.modo
    return "api_key"


def modelo_por_defecto(proveedor: str) -> str:
    prov = obtener_proveedor(proveedor)
    if prov:
        return prov.modelo_defecto
    return settings.default_openai_model


# --------------------------------------------------------------------------- #
# Camino "con mi cuenta": OAuth 2.0 Device Authorization
#
# El usuario solo pega un "Client ID" (identificador publico de una app) y
# autoriza en su navegador. El access token se queda cifrado en el servidor:
# el usuario nunca ve, pega ni copia un token.
# --------------------------------------------------------------------------- #
class ErrorConexion(Exception):
    """Error de negocio del flujo de conexion (mensaje en español, para la UI)."""


# Traduccion de los codigos OAuth a lenguaje llano: el usuario no es tecnico.
_ERRORES_OAUTH = {
    "invalid_client": (
        "Ese ID de cliente no existe. Copialo de nuevo desde el panel del proveedor "
        "y asegurate de guardarlo completo."
    ),
    "invalid_request": "El proveedor no acepto la solicitud. Revisa el ID de cliente.",
    "invalid_scope": "El proveedor no reconoce los permisos pedidos. Usa una aplicacion nueva.",
    "unauthorized_client": (
        "El proveedor no permite este tipo de autorizacion. Activa el flujo de dispositivo "
        "en la configuracion de tu aplicacion."
    ),
    "access_denied": "No autorizaste el acceso. Si fue un error, vuelve a intentarlo.",
    "expired_token": "El codigo expiro. Inicia la autorizacion de nuevo.",
    "authorization_pending": "Todavia no has terminado en el navegador.",
    "slow_down": "Vas demasiado rapido. Espera unos segundos.",
    "not_found": "El proveedor no encontro esa aplicacion.",
    "unsupported_grant_type": "Este proveedor no admite el metodo de autorizacion usado.",
}


def _post_form(url: str, datos: dict[str, Any], timeout: float = 20.0) -> dict[str, Any]:
    resp = httpx.post(url, data=datos, timeout=timeout)
    try:
        cuerpo = resp.json()
    except Exception:
        cuerpo = {"error_description": resp.text[:200]}
    if resp.status_code >= 400:
        codigo = str(cuerpo.get("error", "error"))
        detalle = str(cuerpo.get("error_description") or cuerpo.get("message") or "")
        if codigo in _ERRORES_OAUTH:
            raise ErrorConexion(_ERRORES_OAUTH[codigo])
        raise ErrorConexion(
            f"El proveedor no acepto la solicitud ({codigo}). Revisa los pasos e intentalo de nuevo."
        )
    return cuerpo


def iniciar_autorizacion_cuenta(proveedor: str, client_id: str) -> dict[str, Any]:
    """Arranca el flujo de cuenta y devuelve el codigo que debe escribir el usuario."""
    prov = obtener_proveedor(proveedor)
    if not prov or not prov.device_auth_url:
        raise ErrorConexion("Este proveedor todavia no admite conexion con cuenta.")
    client_id = (client_id or "").strip()
    if len(client_id) < 10:
        raise ErrorConexion(
            "El ID de cliente parece incompleto. Copialo completo desde el panel del proveedor."
        )
    datos = _post_form(prov.device_auth_url, {"client_id": client_id, "scope": prov.scope})
    return {
        "proveedor": prov.id,
        "user_code": str(datos.get("user_code", "")),
        "verification_uri": str(
            datos.get("verification_uri_complete") or datos.get("verification_uri") or ""
        ),
        "verification_uri_simple": str(datos.get("verification_uri") or ""),
        "intervalo": int(datos.get("interval") or 5),
        "expira_en": int(datos.get("expires_in") or 900),
        "device_code": str(datos.get("device_code", "")),
        "client_id": client_id,
    }


def completar_autorizacion_cuenta(
    proveedor: str, client_id: str, device_code: str
) -> tuple[dict[str, Any], str]:
    """Consulta si el usuario ya autorizo. Devuelve (credenciales, mensaje)."""
    prov = obtener_proveedor(proveedor)
    if not prov or not prov.token_url:
        raise ErrorConexion("Este proveedor todavia no admite conexion con cuenta.")
    try:
        datos = _post_form(
            prov.token_url,
            {
                "client_id": client_id,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
    except ErrorConexion as exc:
        texto = str(exc).lower()
        if "authorization_pending" in texto or "pending" in texto:
            return {}, " Todavia falta que autorices en el navegador."
        if "slow_down" in texto:
            return {}, " Espera un momento y vuelve a intentarlo."
        if "expired_token" in texto or "expired" in texto:
            raise ErrorConexion("El codigo expiro. Inicia la autorizacion de nuevo.") from exc
        if "access_denied" in texto or "denied" in texto:
            raise ErrorConexion("Cancelaste la autorizacion en el navegador.") from exc
        raise
    token = str(datos.get("access_token") or "")
    if not token:
        raise ErrorConexion("El proveedor no devolvio un permiso valido. Intenta de nuevo.")
    correo = ""
    try:
        info = httpx.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15.0,
        )
        if info.status_code == 200:
            correo = str(info.json().get("email") or "")
    except Exception:
        correo = ""
    credenciales = {
        "access_token": token,
        "refresh_token": str(datos.get("refresh_token") or ""),
        "client_id": client_id,
        "email": correo,
        "tipo": "cuenta",
    }
    return credenciales, " Autorizacion completada."
