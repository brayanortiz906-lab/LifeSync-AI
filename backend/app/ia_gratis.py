"""
IA Gratis - 11 servicios gratuitos detectados automáticamente.
"""
import aiohttp
import asyncio
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class ServicioGratis:
    id: str
    nombre: str
    descripcion: str
    url_base: str
    modelos_url: str
    requiere_key: bool
    key_env: str
    limites: str
    web: str

SERVICIOS_GRATIS = [
    ServicioGratis(
        id="pollinations",
        nombre="Pollinations.AI",
        descripcion="Gratis ilimitado, sin key, modelos abiertos",
        url_base="https://text.pollinations.ai",
        modelos_url="/models",
        requiere_key=False,
        key_env="",
        limites="Sin límites conocidos",
        web="https://pollinations.ai"
    ),
    ServicioGratis(
        id="opencode",
        nombre="OpenCode Zen",
        descripcion="Proxy gratis a modelos OpenAI/Anthropic",
        url_base="https://api.opencode.ai",
        modelos_url="/v1/models",
        requiere_key=False,
        key_env="",
        limites="Rate limit generoso",
        web="https://opencode.ai"
    ),
    ServicioGratis(
        id="groq",
        nombre="Groq",
        descripcion="Inferencia ultra-rápida (LPU)",
        url_base="https://api.groq.com",
        modelos_url="/v1/models",
        requiere_key=True,
        key_env="GROQ_API_KEY",
        limites="14,400 req/día gratis",
        web="https://console.groq.com/keys"
    ),
    ServicioGratis(
        id="openrouter",
        nombre="OpenRouter",
        descripcion="Cientos de modelos, algunos gratis",
        url_base="https://openrouter.ai/api/v1",
        modelos_url="/models",
        requiere_key=True,
        key_env="OPENROUTER_API_KEY",
        limites="Créditos gratis diarios",
        web="https://openrouter.ai/keys"
    ),
    ServicioGratis(
        id="huggingface",
        nombre="Hugging Face Inference",
        descripcion="Modelos open source en la nube",
        url_base="https://api-inference.huggingface.co",
        modelos_url="/models",
        requiere_key=True,
        key_env="HF_API_KEY",
        limites="30,000 req/mes gratis",
        web="https://huggingface.co/settings/tokens"
    ),
    ServicioGratis(
        id="cohere",
        nombre="Cohere",
        descripcion="Command R+ y modelos de embeddings",
        url_base="https://api.cohere.ai",
        modelos_url="/v1/models",
        requiere_key=True,
        key_env="COHERE_API_KEY",
        limites="100 req/min gratis",
        web="https://dashboard.cohere.ai/api-keys"
    ),
    ServicioGratis(
        id="together",
        nombre="Together AI",
        descripcion="Modelos open source optimizados",
        url_base="https://api.together.xyz",
        modelos_url="/v1/models",
        requiere_key=True,
        key_env="TOGETHER_API_KEY",
        limites="$1 crédito gratis",
        web="https://api.together.xyz/settings/api-keys"
    ),
    ServicioGratis(
        id="deepinfra",
        nombre="DeepInfra",
        descripcion="Inferencia barata, modelos abiertos",
        url_base="https://api.deepinfra.com",
        modelos_url="/v1/models",
        requiere_key=True,
        key_env="DEEPINFRA_API_KEY",
        limites="Rate limit generoso",
        web="https://deepinfra.com/dash/api_keys"
    ),
    ServicioGratis(
        id="perplexity",
        nombre="Perplexity (pplx-api)",
        descripcion="Búsqueda + LLM (Sonar)",
        url_base="https://api.perplexity.ai",
        modelos_url="/models",
        requiere_key=True,
        key_env="PERPLEXITY_API_KEY",
        limites="Créditos gratis iniciales",
        web="https://www.perplexity.ai/settings/api"
    ),
    ServicioGratis(
        id="nvidia",
        nombre="NVIDIA NIM",
        descripcion="Modelos optimizados NVIDIA",
        url_base="https://integrate.api.nvidia.com/v1",
        modelos_url="/models",
        requiere_key=True,
        key_env="NVIDIA_API_KEY",
        limites="Gratis en desarrollo",
        web="https://build.nvidia.com/explore/discover"
    ),
    ServicioGratis(
        id="gemini",
        nombre="Google Gemini",
        descripcion="1.5 Flash/Pro - 1500 req/día gratis",
        url_base="https://generativelanguage.googleapis.com",
        modelos_url="/v1/models",
        requiere_key=True,
        key_env="GEMINI_API_KEY",
        limites="1500 req/día, 1M tokens/min",
        web="https://aistudio.google.com/apikey"
    ),
]

async def detectar_servicios(session: aiohttp.ClientSession = None) -> List[Dict[str, Any]]:
    """Detecta qué servicios gratuitos están configurados (tienen API key)."""
    resultados = []
    own_session = session is None
    if own_session:
        session = aiohttp.ClientSession()
    
    try:
        for svc in SERVICIOS_GRATIS:
            tiene_key = False
            modelos = []
            
            if not svc.requiere_key:
                tiene_key = True
                # Intentar listar modelos
                try:
                    async with session.get(f"{svc.url_base}{svc.modelos_url}", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            if "models" in data:
                                modelos = [m["id"] if isinstance(m, dict) else m for m in data["models"]]
                            elif "data" in data:
                                modelos = [m["id"] if isinstance(m, dict) else m for m in data["data"]]
                except Exception:
                    pass
            else:
                # Verificar si hay key en entorno (se hace en frontend/backend config)
                import os
                key = os.getenv(svc.key_env)
                if key:
                    tiene_key = True
            
            resultados.append({
                "id": svc.id,
                "nombre": svc.nombre,
                "descripcion": svc.descripcion,
                "configurado": tiene_key,
                "requiere_key": svc.requiere_key,
                "key_env": svc.key_env,
                "modelos": modelos[:15],
                "limites": svc.limites,
                "web": svc.web,
            })
    finally:
        if own_session:
            await session.close()
    
    return resultados

async def test_servicio(servicio_id: str, api_key: str = None) -> Dict[str, Any]:
    """Prueba un servicio específico."""
    svc = next((s for s in SERVICIOS_GRATIS if s.id == servicio_id), None)
    if not svc:
        return {"ok": False, "error": "Servicio no encontrado"}
    
    headers = {"Content-Type": "application/json"}
    if svc.requiere_key and api_key:
        if svc.id in ["gemini"]:
            headers["x-goog-api-key"] = api_key
        else:
            headers["Authorization"] = f"Bearer {api_key}"
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{svc.url_base}{svc.modelos_url}",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    modelos = []
                    if "models" in data:
                        modelos = [m["id"] if isinstance(m, dict) else m for m in data["models"]]
                    elif "data" in data:
                        modelos = [m["id"] if isinstance(m, dict) else m for m in data["data"]]
                    return {"ok": True, "modelos": modelos[:10]}
                else:
                    return {"ok": False, "error": f"HTTP {resp.status}", "status": resp.status}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_agentes_disponibles() -> List[Dict[str, Any]]:
    """12 agentes predefinidos para diferentes tareas."""
    return [
        {"id": "planner", "nombre": "Planificador", "descripcion": "Organiza tu día/semana, prioriza tareas", "modelo_preferido": "gemini-1.5-pro"},
        {"id": "analyst", "nombre": "Analista", "descripcion": "Analiza patrones, da insights de productividad", "modelo_preferido": "gemini-1.5-pro"},
        {"id": "writer", "nombre": "Escritor", "descripcion": "Redacta emails, notas, documentos", "modelo_preferido": "gemini-1.5-flash"},
        {"id": "coder", "nombre": "Programador", "descripcion": "Ayuda con código, debugging, arquitectura", "modelo_preferido": "gemini-1.5-pro"},
        {"id": "researcher", "nombre": "Investigador", "descripcion": "Busca info, resume papers, fact-check", "modelo_preferido": "perplexity"},
        {"id": "creative", "nombre": "Creativo", "descripcion": "Ideas, brainstorming, naming, copywriting", "modelo_preferido": "gemini-1.5-flash"},
        {"id": "teacher", "nombre": "Profesor", "descripcion": "Explica conceptos, crea ejercicios, tutorea", "modelo_preferido": "gemini-1.5-flash"},
        {"id": "translator", "nombre": "Traductor", "descripcion": "Traduce entre idiomas, localiza contenido", "modelo_preferido": "gemini-1.5-flash"},
        {"id": "summarizer", "nombre": "Resumidor", "descripcion": "Resume textos largos, extrae puntos clave", "modelo_preferido": "gemini-1.5-flash"},
        {"id": "coach", "nombre": "Coach", "descripcion": "Motivación, hábitos, metas, accountability", "modelo_preferido": "gemini-1.5-pro"},
        {"id": "finance", "nombre": "Finanzas", "descripcion": "Presupuestos, inversiones, análisis gastos", "modelo_preferido": "gemini-1.5-pro"},
        {"id": "health", "nombre": "Salud", "descripcion": "Ejercicio, nutrición, sueño, bienestar", "modelo_preferido": "gemini-1.5-flash"},
    ]