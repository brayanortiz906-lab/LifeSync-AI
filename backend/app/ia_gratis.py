"""IA gratis (o con plan gratuito) y sistemas de agentes ya instalados.

Este modulo responde a dos preguntas practicas:

1. "Quiero una IA gratis": aqui esta el catalogo de servicios donde solo
   necesitas tu cuenta (o directamente nada) para empezar a usarlos.
   Todos los datos de las URLs se comprobaron contra los servidores reales.

2. "Ya tengo agentes en mi computador": aqui se detectan los programas de IA
   con interfaz o de linea de comandos (Claude Code, OpenCode, Codex, ...)
   y se explica como conectarlos con LifeAgente.
"""

from __future__ import annotations

import shutil
import subprocess
from typing import Any

# ---------------------------------------------------------------------------
# 1) IA gratis: solo necesitas tu cuenta (o nada)
# ---------------------------------------------------------------------------
# estilo: "openai" (compatible con la API de OpenAI), "gemini" (API nativa de
# Google) o "anthropic". base_url es donde vive el servicio.
SERVICIOS_GRATIS: list[dict[str, Any]] = [
    {
        "id": "pollinations",
        "nombre": "Pollinations AI",
        "icono": "🌸",
        "resumen": "La mas facil de todas: ni cuenta ni clave. Escribes y responde.",
        "plan": "Gratis, sin registro",
        "limites": "Uso libre, sin clave. Ideal para probar la app de una vez.",
        "pasos": [
            "No hace falta hacer nada: no hay cuenta ni clave que pegar.",
            "LifeAgente ya tiene la direccion puesta y la usa al vuelo.",
        ],
        "url_registro": "https://text.pollinations.ai/",
        "donde_clave": "Ninguna: no usa clave.",
        "base_url": "https://text.pollinations.ai/openai",
        "estilo": "openai",
        "modelo_sugerido": "openai-fast",
        "requiere_cuenta": False,
        "verificada": "2026-10-22",
    },
    {
        "id": "opencode_zen",
        "nombre": "OpenCode Zen (y OpenCode Go)",
        "icono": "🧑‍💻",
        "resumen": "El portal de modelos de OpenCode: entras con tu cuenta y ya tienes IA.",
        "plan": "Creditos de regalo al entrar; despues se recarga",
        "limites": "Una misma clave sirve para Zen y para Go (modelos de agentes).",
        "pasos": [
            "Entra en opencode.ai con tu cuenta de GitHub o Google.",
            "Abre la consola de modelos y crea una clave (empieza por sk-...).",
            "Pega la clave en LifeAgente: ya puedes elegir entre sus modelos.",
        ],
        "url_registro": "https://opencode.ai/auth",
        "donde_clave": "Consola de OpenCode (seccion API keys).",
        "base_url": "https://opencode.ai/zen/v1",
        "estilo": "openai",
        "modelo_sugerido": "",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "google_ai_studio",
        "nombre": "Google AI Studio (Gemini)",
        "icono": "🔵",
        "resumen": "Entra con tu cuenta de Google y copia una clave de Gemini.",
        "plan": "Gratis con tu cuenta de Google",
        "limites": "Generosa cuota gratuita de Gemini para uso personal.",
        "pasos": [
            "Entra en aistudio.google.com con tu cuenta de Google.",
            "Pulsa 'Create API key' y copia la clave (empieza por AIza...).",
            "Pegala en LifeAgente: Gemini queda conectado.",
        ],
        "url_registro": "https://aistudio.google.com/apikey",
        "donde_clave": "Google AI Studio > Get API key.",
        "base_url": "https://generativelanguage.googleapis.com",
        "estilo": "gemini",
        "modelo_sugerido": "gemini-2.0-flash",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "github_models",
        "nombre": "GitHub Models",
        "icono": "🐙",
        "resumen": "Modelos de IA gratis dentro de tu cuenta de GitHub.",
        "plan": "Gratis con tu cuenta de GitHub",
        "limites": "Peticiones limitadas por hora; suficiente para uso diario.",
        "pasos": [
            "Entra en github.com/settings/tokens y crea un token (classic).",
            "Dale permiso de lectura a los modelos publicos.",
            "Pegalo en LifeAgente: se conectan los modelos de GitHub.",
        ],
        "url_registro": "https://github.com/marketplace/models",
        "donde_clave": "GitHub > Settings > Developer settings > Personal access tokens.",
        "base_url": "https://models.github.ai/inference",
        "estilo": "openai",
        "modelo_sugerido": "openai/gpt-4o-mini",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "openrouter",
        "nombre": "OpenRouter",
        "icono": "🌐",
        "resumen": "Una sola entrada para cientos de IAs; hay modelos gratis.",
        "plan": "Gratis con cuenta (20 modelos :free al dia, sin tarjeta)",
        "limites": "Los modelos que terminan en :free no consumen saldo.",
        "pasos": [
            "Entra en openrouter.ai con Google o GitHub (boton 'Sign in with Google').",
            "Crea una clave en la pagina de claves.",
            "Pegala aqui: podras elegir entre 400+ modelos.",
        ],
        "url_registro": "https://openrouter.ai/keys",
        "donde_clave": "OpenRouter > Keys > Create key.",
        "base_url": "https://openrouter.ai/api/v1",
        "estilo": "openai",
        "modelo_sugerido": "",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "groq",
        "nombre": "Groq",
        "icono": "⚡",
        "resumen": "La IA mas rapida del mundo en sus servidores, con plan gratis.",
        "plan": "Gratis con cuenta de correo",
        "limites": "Cuota generosa de peticiones por minuto.",
        "pasos": [
            "Crea una cuenta en console.groq.com con tu correo.",
            "Abre la pagina de claves y crea una (empieza por gsk_...).",
            "Pegala aqui y elige un modelo de Groq.",
        ],
        "url_registro": "https://console.groq.com/keys",
        "donde_clave": "Groq Console > API Keys.",
        "base_url": "https://api.groq.com/openai/v1",
        "estilo": "openai",
        "modelo_sugerido": "llama-3.3-70b-versatile",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "cerebras",
        "nombre": "Cerebras",
        "icono": "🧠",
        "resumen": "Modelos rapidisimos servidos en silicio, con plan gratis.",
        "plan": "Gratis con cuenta",
        "limites": "Peticiones gratuitas por minuto y por hora.",
        "pasos": [
            "Crea una cuenta en cloud.cerebras.ai.",
            "Genera una clave en la seccion API Keys.",
            "Pegala aqui y elige su modelo.",
        ],
        "url_registro": "https://cloud.cerebras.ai",
        "donde_clave": "Cerebras Cloud > API Keys.",
        "base_url": "https://api.cerebras.ai/v1",
        "estilo": "openai",
        "modelo_sugerido": "llama3.1-8b",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "mistral",
        "nombre": "Mistral (Le Chat)",
        "icono": "🟠",
        "resumen": "La IA europea de Mistral, con plan gratuito para empezar.",
        "plan": "Gratis con cuenta",
        "limites": "Modelos pequeños y medianos gratis; los grandes cobran.",
        "pasos": [
            "Crea una cuenta en console.mistral.ai.",
            "Crea una clave en API keys.",
            "Pegala aqui.",
        ],
        "url_registro": "https://console.mistral.ai/api-keys",
        "donde_clave": "Mistral Console > API Keys.",
        "base_url": "https://api.mistral.ai/v1",
        "estilo": "openai",
        "modelo_sugerido": "mistral-small-latest",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "together",
        "nombre": "Together AI",
        "icono": "🤝",
        "resumen": "Muchos modelos de codigo y texto con un plan pequeno gratis.",
        "plan": "Creditos de regalo al registrarte",
        "limites": "Creditos limitados; se recargan paying.",
        "pasos": [
            "Crea una cuenta en api.together.ai.",
            "Crea una clave en API keys.",
            "Pegala aqui.",
        ],
        "url_registro": "https://api.together.ai/settings/api-keys",
        "donde_clave": "Together AI > API Keys.",
        "base_url": "https://api.together.xyz/v1",
        "estilo": "openai",
        "modelo_sugerido": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "nvidia",
        "nombre": "NVIDIA NIM",
        "icono": "🟩",
        "resumen": "Modelos de NVIDIA servidos gratis con tu cuenta de NVIDIA.",
        "plan": "Creditos gratis al registrarte",
        "limites": "Creditos de prueba; muy rapidos en sus GPU.",
        "pasos": [
            "Crea una cuenta en build.nvidia.com.",
            "Abre un playground y copia la clave (empieza por nvapi-...).",
            "Pegala aqui.",
        ],
        "url_registro": "https://build.nvidia.com",
        "donde_clave": "NVIDIA Build > tu playground > Get API key.",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "estilo": "openai",
        "modelo_sugerido": "meta/llama-3.3-70b-instruct",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
    {
        "id": "huggingface",
        "nombre": "Hugging Face",
        "icono": "🤗",
        "resumen": "Miles de modelos abiertos con un token gratuito de tu cuenta.",
        "plan": "Creditos de regalo al registrarte",
        "limites": "El router da acceso a miles de modelos con una sola clave.",
        "pasos": [
            "Crea una cuenta en huggingface.co.",
            "Crea un token de lectura en Settings > Access Tokens.",
            "Pegalo aqui.",
        ],
        "url_registro": "https://huggingface.co/settings/tokens",
        "donde_clave": "Hugging Face > Settings > Access Tokens.",
        "base_url": "https://router.huggingface.co/v1",
        "estilo": "openai",
        "modelo_sugerido": "",
        "requiere_cuenta": True,
        "verificada": "2026-10-22",
    },
]


# ---------------------------------------------------------------------------
# 2) Sistemas de agentes y programas de IA que ya estan en el computador
# ---------------------------------------------------------------------------
AGENTES_CONOCIDOS: list[dict[str, Any]] = [
    {
        "id": "opencode",
        "nombre": "OpenCode",
        "icono": "🧑‍💻",
        "binario": "opencode",
        "que_es": "Agente de programacion con interfaz y linea de comandos.",
        "como_se_conecta": "Ejecuta 'opencode serve' y LifeAgente lo usa como un motor mas.",
        "servidor": "http://127.0.0.1:4096/v1",
        "url": "https://opencode.ai",
    },
    {
        "id": "claude_code",
        "nombre": "Claude Code",
        "icono": "🟠",
        "binario": "claude",
        "que_es": "El agente de Anthropic en la terminal (tambien dentro de VS Code).",
        "como_se_conecta": "Entra con tu cuenta de Claude (claude.ai) o con una clave de Anthropic.",
        "servidor": "",
        "url": "https://claude.ai",
    },
    {
        "id": "codex",
        "nombre": "Codex CLI",
        "icono": "🧿",
        "binario": "codex",
        "que_es": "El agente de OpenAI en la terminal.",
        "como_se_conecta": "Entra con tu cuenta de ChatGPT o con una clave de OpenAI.",
        "servidor": "",
        "url": "https://chatgpt.com",
    },
    {
        "id": "gemini_cli",
        "nombre": "Gemini CLI",
        "icono": "🔵",
        "binario": "gemini",
        "que_es": "El agente de Google en la terminal.",
        "como_se_conecta": "Entra con tu cuenta de Google.",
        "servidor": "",
        "url": "https://github.com/google-gemini/gemini-cli",
    },
    {
        "id": "copilot",
        "nombre": "GitHub Copilot CLI",
        "icono": "🐙",
        "binario": "copilot",
        "que_es": "El asistente de codigo de GitHub en la terminal.",
        "como_se_conecta": "Entra con tu cuenta de GitHub.",
        "servidor": "",
        "url": "https://github.com/features/copilot",
    },
    {
        "id": "aider",
        "nombre": "Aider",
        "icono": "🛠️",
        "binario": "aider",
        "que_es": "Agente de programacion que edita tus archivos.",
        "como_se_conecta": "Con la IA de tu computador (Ollama) o con una clave de API.",
        "servidor": "",
        "url": "https://aider.chat",
    },
    {
        "id": "cline",
        "nombre": "Cline",
        "icono": "🧩",
        "binario": "cline",
        "que_es": "Agente dentro de Visual Studio Code.",
        "como_se_conecta": "Abre el panel de Cline y usa su propio acceso; LifeAgente se conecta aparte.",
        "servidor": "",
        "url": "https://cline.bot",
    },
    {
        "id": "roo",
        "nombre": "Roo Code",
        "icono": "🦘",
        "binario": "roo",
        "que_es": "Agente de codigo dentro de VS Code, muy personalizable.",
        "como_se_conecta": "Abre Roo Code en VS Code y conecta su proveedor.",
        "servidor": "",
        "url": "https://roocode.com",
    },
    {
        "id": "cursor",
        "nombre": "Cursor",
        "icono": "✳️",
        "binario": "cursor",
        "que_es": "Editor de codigo con IA integrada.",
        "como_se_conecta": "Entra con tu cuenta de Cursor para usarlo desde su propia app.",
        "servidor": "",
        "url": "https://cursor.com",
    },
    {
        "id": "windsurf",
        "nombre": "Windsurf",
        "icono": "🌊",
        "binario": "windsurf",
        "que_es": "Editor con agente (el ex Codeium).",
        "como_se_conecta": "Entra con tu cuenta de Windsurf desde su editor.",
        "servidor": "",
        "url": "https://windsurf.com",
    },
    {
        "id": "continue",
        "nombre": "Continue",
        "icono": "⏭️",
        "binario": "continue",
        "que_es": "Asistente de codigo para VS Code y JetBrains.",
        "como_se_conecta": "Su servidor local escucha en http://localhost:3000.",
        "servidor": "http://localhost:3000",
        "url": "https://continue.dev",
    },
    {
        "id": "mcp",
        "nombre": "Servidores MCP",
        "icono": "🔌",
        "binario": "",
        "que_es": "El idioma comun para conectar IAs con tus herramientas.",
        "como_se_conecta": "Anade el servidor MCP de LifeAgente en tu Claude Code, OpenCode o Cursor.",
        "servidor": "",
        "url": "https://modelcontextprotocol.io",
    },
]


def _version_de(ruta: str) -> str:
    """Lee la version de un programa (--version) sin bloquearse."""
    try:
        proceso = subprocess.run(
            [ruta, "--version"],
            capture_output=True,
            text=True,
            timeout=4,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        salida = (proceso.stdout or proceso.stderr or "").strip()
        return salida.splitlines()[0][:80] if salida else ""
    except Exception:
        return ""


def detectar_agentes_instalados() -> list[dict[str, Any]]:
    """Mira que programas de IA hay instalados en este computador.

    Devuelve la lista completa (instalados y no instalados) con la version
    cuando se puede leer, para que la persona vea que ya tiene todo y solo
    le falta conectarlo.
    """
    resultado: list[dict[str, Any]] = []
    for agente in AGENTES_CONOCIDOS:
        binario = agente.get("binario") or ""
        ruta = shutil.which(binario) if binario else ""
        version = _version_de(ruta) if ruta else ""
        resultado.append(
            {
                "id": agente["id"],
                "nombre": agente["nombre"],
                "icono": agente["icono"],
                "instalado": bool(ruta),
                "version": version,
                "ruta": ruta,
                "que_es": agente["que_es"],
                "como_se_conecta": agente["como_se_conecta"],
                "servidor": agente.get("servidor", ""),
                "url": agente.get("url", ""),
            }
        )
    return resultado


def catalogo_gratis() -> list[dict[str, Any]]:
    """El catalogo de IA gratis que se muestra en el Centro de Conexiones."""
    return [dict(servicio) for servicio in SERVICIOS_GRATIS]
