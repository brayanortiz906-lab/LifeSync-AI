"""
IA Local - 18 motores detectados (Ollama, LM Studio, Jan, vLLM, etc.)
Descarga paralela con barra de progreso.
"""
import asyncio
import aiohttp
import json
import logging
import platform
import subprocess
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class MotorLocal:
    id: str
    nombre: str
    descripcion: str
    url_base: str
    modelos_url: str
    instalador: Optional[str] = None
    requiere_gpu: bool = False
    ram_min_gb: float = 2.0

MOTORES_LOCALES = [
    MotorLocal("ollama", "Ollama", "El estándar local", "http://localhost:11434", "/api/tags", "https://ollama.com/download", False, 4),
    MotorLocal("lmstudio", "LM Studio", "GUI amigable", "http://localhost:1234", "/v1/models", "https://lmstudio.ai", False, 4),
    MotorLocal("jan", "Jan", "Alternativa open source", "http://localhost:1337", "/v1/models", "https://jan.ai", False, 4),
    MotorLocal("vllm", "vLLM", "Alto rendimiento", "http://localhost:8000", "/v1/models", "https://vllm.ai", True, 8),
    MotorLocal("textgen", "Text-Gen-WebUI", "Interfaz completa", "http://localhost:5000", "/v1/models", "https://github.com/oobabooga/text-generation-webui", True, 8),
    MotorLocal("kobold", "KoboldCPP", "Optimizado gaming", "http://localhost:5001", "/v1/models", "https://github.com/LostRuins/koboldcpp", True, 6),
    MotorLocal("llamafile", "llamafile", "Ejecutable único", "http://localhost:8080", "/v1/models", "https://github.com/Mozilla-Ocho/llamafile", False, 4),
    MotorLocal("gpt4all", "GPT4All", "Privado y local", "http://localhost:4891", "/v1/models", "https://gpt4all.io", False, 4),
    MotorLocal("llamacpp", "llama.cpp server", "Servidor ligero", "http://localhost:8080", "/v1/models", "https://github.com/ggerganov/llama.cpp", False, 4),
    MotorLocal("mlx", "MLX (Apple Silicon)", "Nativo Apple", "http://localhost:8080", "/v1/models", "https://github.com/ml-explore/mlx", False, 8),
    MotorLocal("rust", "rustformers/llm", "Rust rápido", "http://localhost:8080", "/v1/models", "https://github.com/huggingface/candle", False, 4),
    MotorLocal("exllama", "ExLlamaV2", "CUDA optimizado", "http://localhost:8080", "/v1/models", "https://github.com/turboderp/exllamav2", True, 8),
    MotorLocal("ctrans", "ctransformers", "Python bindings", "http://localhost:8080", "/v1/models", "https://github.com/marella/ctransformers", False, 4),
    MotorLocal("onnx", "ONNX Runtime GenAI", "Multiplataforma", "http://localhost:8080", "/v1/models", "https://github.com/microsoft/onnxruntime-genai", False, 4),
    MotorLocal("tgi", "Text Generation Inference", "Producción", "http://localhost:8080", "/v1/models", "https://github.com/huggingface/text-generation-inference", True, 16),
    MotorLocal("xinference", "Xinference", "Distribuido", "http://localhost:9997", "/v1/models", "https://github.com/xorbitsai/inference", True, 8),
    MotorLocal("localai", "LocalAI", "API compatible OpenAI", "http://localhost:8080", "/v1/models", "https://github.com/go-skynet/LocalAI", False, 4),
    MotorLocal("fake", "Modo Demo (sin motor)", "Para pruebas", "", "", None, False, 0),
]

async def detectar_motores() -> List[Dict[str, Any]]:
    """Detecta qué motores están corriendo y sus modelos."""
    resultados = []
    async with aiohttp.ClientSession() as session:
        for motor in MOTORES_LOCALES:
            if motor.id == "fake":
                resultados.append({
                    "id": motor.id,
                    "nombre": motor.nombre,
                    "descripcion": motor.descripcion,
                    "activo": True,
                    "modelos": ["demo-model"],
                    "url": "",
                    "instalador": motor.instalador,
                    "requiere_gpu": motor.requiere_gpu,
                    "ram_min_gb": motor.ram_min_gb,
                })
                continue
            
            try:
                async with session.get(f"{motor.url_base}{motor.modelos_url}", timeout=aiohttp.ClientTimeout(total=3)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        modelos = []
                        if "models" in data:
                            modelos = [m["name"] if isinstance(m, dict) else m for m in data["models"]]
                        elif "data" in data:
                            modelos = [m["id"] if isinstance(m, dict) else m for m in data["data"]]
                        elif isinstance(data, list):
                            modelos = [m["name"] if isinstance(m, dict) else m for m in data]
                        
                        resultados.append({
                            "id": motor.id,
                            "nombre": motor.nombre,
                            "descripcion": motor.descripcion,
                            "activo": True,
                            "modelos": modelos[:20],
                            "url": motor.url_base,
                            "instalador": motor.instalador,
                            "requiere_gpu": motor.requiere_gpu,
                            "ram_min_gb": motor.ram_min_gb,
                        })
                    else:
                        resultados.append(_motor_inactivo(motor))
            except Exception:
                resultados.append(_motor_inactivo(motor))
    
    return resultados

def _motor_inactivo(motor: MotorLocal) -> Dict[str, Any]:
    return {
        "id": motor.id,
        "nombre": motor.nombre,
        "descripcion": motor.descripcion,
        "activo": False,
        "modelos": [],
        "url": motor.url_base,
        "instalador": motor.instalador,
        "requiere_gpu": motor.requiere_gpu,
        "ram_min_gb": motor.ram_min_gb,
    }

async function descargar_modelo(motor_id: str, modelo: str, progreso_cb=None) -> bool:
    """Descarga un modelo en el motor especificado."""
    motor = next((m for m in MOTORES_LOCALES if m.id == motor_id), None)
    if not motor:
        return False
    
    if motor.id == "ollama":
        return await _descargar_ollama(modelo, progreso_cb)
    elif motor.id in ["lmstudio", "jan", "vllm", "localai"]:
        return await _descargar_openai_compatible(motor.url_base, modelo, progreso_cb)
    return False

async function _descargar_ollama(modelo: str, progreso_cb=None) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ollama", "pull", modelo,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            if progreso_cb:
                await progreso_cb(line.decode().strip())
        await proc.wait()
        return proc.returncode == 0
    except Exception as e:
        logger.error(f"Error descargando {modelo} en Ollama: {e}")
        return False

async function _descargar_openai_compatible(base_url: str, modelo: str, progreso_cb=None) -> bool:
    # Estos motores suelen descargar automáticamente al hacer la primera request
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{base_url}/v1/chat/completions",
                json={"model": modelo, "messages": [{"role": "user", "content": "test"}], "max_tokens": 1},
                timeout=aiohttp.ClientTimeout(total=120)
            ) as resp:
                return resp.status in [200, 400]  # 400 puede ser error de formato pero modelo existe
    except Exception:
        return False

def get_info_sistema() -> Dict[str, Any]:
    """Info de RAM, CPU, GPU para recomendaciones."""
    import psutil
    ram = psutil.virtual_memory()
    return {
        "ram_total_gb": round(ram.total / (1024**3), 1),
        "ram_disponible_gb": round(ram.available / (1024**3), 1),
        "cpu_cores": psutil.cpu_count(logical=False),
        "cpu_threads": psutil.cpu_count(logical=True),
        "plataforma": platform.system(),
        "arquitectura": platform.machine(),
    }

def recomendar_modelo(ram_gb: float = None) -> Dict[str, Any]:
    """Recomienda modelo según RAM disponible."""
    if ram_gb is None:
        ram_gb = get_info_sistema()["ram_disponible_gb"]
    
    if ram_gb < 3:
        return {"modelo": "qwen2.5:0.5b", "tamano": "400 MB", "motor": "ollama", "razon": "Ultra ligero, solo texto, mejor batería"}
    elif ram_gb < 6:
        return {"modelo": "llama3.2:1b", "tamano": "1.3 GB", "motor": "ollama", "razon": "Equilibrio calidad/tamaño"}
    elif ram_gb < 10:
        return {"modelo": "gemma3:1b", "tamano": "815 MB", "motor": "ollama", "razon": "Más capaz que cabe"}
    else:
        return {"modelo": "llama3.1:8b", "tamano": "4.7 GB", "motor": "ollama", "razon": "Mejor calidad general"}