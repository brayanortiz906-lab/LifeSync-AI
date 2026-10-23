"""Google Gemini integration - BYOK (cada usuario usa su propia API key)."""
import google.generativeai as genai
from google.generativeai.types import GenerateContentResponse
from typing import AsyncGenerator, Optional, List, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

# Modelos disponibles
GEMINI_MODELS = {
    "flash": "gemini-1.5-flash",
    "pro": "gemini-1.5-pro",
    "flash-8b": "gemini-1.5-flash-8b",
}
DEFAULT_MODEL = "gemini-1.5-flash"

SYSTEM_PROMPTS = {
    "default": """Eres LifeAgente, un asistente personal inteligente que ayuda a organizar eventos, tareas, 
    recordatorios y notas. Respondes en español de forma concisa y útil. 
    Tienes acceso a las herramientas del usuario (calendario, tareas, paneles) cuando sean relevantes.""",
    
    "planner": """Eres un planificador experto. Ayudas al usuario a organizar su tiempo, 
    priorizar tareas y crear planes accionables. Preguntas por clarificaciones cuando sea necesario.""",
    
    "analyst": """Analizas los datos del usuario (eventos, tareas, patrones) y das insights 
    accionables sobre productividad, balance vida-trabajo, y optimización de tiempo.""",
}

# Function Calling tools
GEMINI_TOOLS = [
    {
        "function_declarations": [
            {
                "name": "create_event",
                "description": "Crea un evento en el calendario del usuario",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "titulo": {"type": "STRING", "description": "Título del evento"},
                        "descripcion": {"type": "STRING", "description": "Descripción opcional"},
                        "inicio": {"type": "STRING", "description": "ISO 8601 datetime inicio"},
                        "fin": {"type": "STRING", "description": "ISO 8601 datetime fin"},
                        "todo_dia": {"type": "BOOLEAN", "description": "Evento de todo el día"},
                    },
                    "required": ["titulo", "inicio"]
                }
            },
            {
                "name": "create_task",
                "description": "Crea una tarea para el usuario",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "titulo": {"type": "STRING", "description": "Título de la tarea"},
                        "descripcion": {"type": "STRING", "description": "Descripción opcional"},
                        "fecha_vencimiento": {"type": "STRING", "description": "ISO 8601 datetime vencimiento"},
                        "prioridad": {"type": "INTEGER", "description": "0=normal, 1=alta, 2=urgente"},
                        "panel_id": {"type": "STRING", "description": "ID del panel opcional"},
                    },
                    "required": ["titulo"]
                }
            },
            {
                "name": "list_events",
                "description": "Lista eventos del usuario en un rango de fechas",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "desde": {"type": "STRING", "description": "ISO 8601 fecha inicio"},
                        "hasta": {"type": "STRING", "description": "ISO 8601 fecha fin"},
                    },
                    "required": ["desde", "hasta"]
                }
            },
            {
                "name": "list_tasks",
                "description": "Lista tareas del usuario",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "completada": {"type": "BOOLEAN", "description": "Filtrar por completadas"},
                        "panel_id": {"type": "STRING", "description": "Filtrar por panel"},
                    }
                }
            },
            {
                "name": "search_notes",
                "description": "Busca en notas/eventos/tareas por texto",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "query": {"type": "STRING", "description": "Término de búsqueda"},
                        "limit": {"type": "INTEGER", "description": "Máximo resultados", "default": 10}
                    },
                    "required": ["query"]
                }
            }
        ]
    }
]

class GeminiService:
    def __init__(self):
        self._models_cache: Dict[str, Any] = {}
    
    def _configure(self, api_key: str):
        """Configura Gemini con la API key del usuario."""
        genai.configure(api_key=api_key)
    
    def _get_model(self, model_name: str):
        if model_name not in self._models_cache:
            self._models_cache[model_name] = genai.GenerativeModel(
                model_name,
                generation_config=genai.GenerationConfig(
                    temperature=0.7,
                    top_p=0.9,
                    top_k=40,
                    max_output_tokens=8192,
                ),
                safety_settings=[
                    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                ],
                tools=GEMINI_TOOLS
            )
        return self._models_cache[model_name]
    
    async def generate(
        self,
        api_key: str,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system_prompt: str = None,
        history: List[Dict[str, str]] = None,
        stream: bool = False,
        **kwargs
    ) -> GenerateContentResponse | AsyncGenerator:
        """Genera respuesta (streaming o completa)."""
        self._configure(api_key)
        model_instance = self._get_model(model)
        
        chat_history = []
        if system_prompt:
            chat_history.append({"role": "user", "parts": [system_prompt]})
            chat_history.append({"role": "model", "parts": ["Entendido. ¿En qué te ayudo?"]})
        
        if history:
            chat_history.extend(history)
        
        chat = model_instance.start_chat(history=chat_history)
        
        if stream:
            return chat.send_message_async(prompt, stream=True)
        else:
            return await chat.send_message_async(prompt)
    
    async def generate_stream(
        self,
        api_key: str,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system_prompt: str = None,
        history: List[Dict[str, str]] = None,
    ) -> AsyncGenerator[str, None]:
        """Genera respuesta en streaming (yield chunks)."""
        response = await self.generate(
            api_key, prompt, model, system_prompt, history, stream=True
        )
        
        async for chunk in response:
            if chunk.text:
                yield chunk.text
    
    async def count_tokens(self, api_key: str, text: str, model: str = DEFAULT_MODEL) -> int:
        """Cuenta tokens aproximados."""
        self._configure(api_key)
        model_instance = self._get_model(model)
        result = await model_instance.count_tokens_async(text)
        return result.total_tokens
    
    async def embed_text(self, api_key: str, text: str, model: str = "text-embedding-004") -> List[float]:
        """Genera embeddings para búsqueda semántica."""
        self._configure(api_key)
        result = genai.embed_content(
            model=model,
            content=text,
            task_type="RETRIEVAL_DOCUMENT"
        )
        return result["embedding"]

# Instancia global (se usa pasando api_key por request)
gemini_service = GeminiService()

# Helper para obtener API key del usuario (desencriptada)
async def get_user_gemini_key(user_id: str) -> str | None:
    """Obtiene y desencripta la API key de Gemini del usuario."""
    from app.supabase_client import get_supabase_admin
    from app.crypto import decrypt_api_key
    
    client = get_supabase_admin()
    try:
        resp = client.table("usuarios").select("ai_api_keys").eq("id", user_id).single().execute()
        if resp.data and resp.data.get("ai_api_keys"):
            keys = resp.data["ai_api_keys"]
            # La key de Gemini suele guardarse como "gemini" o "google"
            encrypted = keys.get("gemini") or keys.get("google")
            if encrypted:
                return decrypt_api_key(encrypted)
    except Exception as e:
        logger.warning(f"Error obteniendo Gemini key: {e}")
    return None