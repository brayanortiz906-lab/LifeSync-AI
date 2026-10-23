"""
IA Móvil - Detección de RAM/núcleos → recomendación modelo.
Para PanelIaMovil.tsx con barra de progreso.
"""
import platform
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# Modelos optimizados por RAM (en GB)
MODELOS_POR_RAM = [
    # (ram_min_gb, modelo, tamaño, motor, descripción)
    (0, 2.5, "qwen2.5:0.5b", "400 MB", "ollama", "Ultra ligero, solo texto, mejor batería"),
    (2.5, 4, "qwen2.5:0.5b", "400 MB", "ollama", "Ultra ligero, solo texto"),
    (4, 6, "llama3.2:1b", "1.3 GB", "ollama", "Equilibrio calidad/tamaño"),
    (6, 8, "gemma3:1b", "815 MB", "ollama", "Más capaz que cabe"),
    (8, 12, "phi3:3.8b", "2.3 GB", "ollama", "Buen razonamiento"),
    (12, 16, "llama3.1:8b", "4.7 GB", "ollama", "Mejor calidad general"),
    (16, 24, "llama3.1:8b-instruct-q4", "4.7 GB", "ollama", "Calidad + cuantización"),
    (24, 999, "llama3.1:70b-q4", "~40 GB", "ollama/vllm", "Máxima calidad (requiere GPU)"),
]

MODELOS_ALTERNATIVOS = {
    "muy_poco_ram": [
        {"modelo": "qwen2.5:0.5b", "tamano": "400 MB", "motor": "ollama", "ram_min": 2},
        {"modelo": "smollm:135m", "tamano": "100 MB", "motor": "ollama", "ram_min": 1},
        {"modelo": "tinyllama:1.1b", "tamano": "650 MB", "motor": "ollama", "ram_min": 2},
    ],
    "apple_silicon": [
        {"modelo": "llama3.2:3b", "tamano": "2 GB", "motor": "ollama/mlx", "ram_min": 4},
        {"modelo": "gemma3:4b", "tamano": "2.5 GB", "motor": "ollama/mlx", "ram_min": 6},
        {"modelo": "qwen2.5:7b", "tamano": "4.4 GB", "motor": "ollama/mlx", "ram_min": 8},
    ],
    "con_gpu": [
        {"modelo": "llama3.1:8b", "tamano": "4.7 GB", "motor": "ollama/vllm", "ram_min": 8, "vram_min": 6},
        {"modelo": "qwen2.5:14b", "tamano": "8 GB", "motor": "ollama/vllm", "ram_min": 12, "vram_min": 10},
        {"modelo": "llama3.1:70b-q4", "tamano": "40 GB", "motor": "vllm", "ram_min": 32, "vram_min": 24},
    ]
}

def detectar_hardware() -> Dict[str, Any]:
    """Detecta RAM, CPU, GPU, plataforma."""
    try:
        import psutil
        import torch
        
        ram = psutil.virtual_memory()
        ram_gb = round(ram.total / (1024**3), 1)
        ram_disponible = round(ram.available / (1024**3), 1)
        
        cpu_cores = psutil.cpu_count(logical=False)
        cpu_threads = psutil.cpu_count(logical=True)
        
        # GPU detection
        gpu_info = {"disponible": False, "nombre": "", "vram_gb": 0}
        try:
            if torch.cuda.is_available():
                gpu_info = {
                    "disponible": True,
                    "nombre": torch.cuda.get_device_name(0),
                    "vram_gb": round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 1)
                }
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                gpu_info = {"disponible": True, "nombre": "Apple Metal (MPS)", "vram_gb": ram_disponible}
        except Exception:
            pass
        
        return {
            "ram_total_gb": ram_gb,
            "ram_disponible_gb": ram_disponible,
            "cpu_cores": cpu_cores,
            "cpu_threads": cpu_threads,
            "plataforma": platform.system(),
            "arquitectura": platform.machine(),
            "gpu": gpu_info,
            "python_version": platform.python_version(),
        }
    except Exception as e:
        logger.warning(f"Error detectando hardware: {e}")
        return {
            "ram_total_gb": 4,
            "ram_disponible_gb": 2,
            "cpu_cores": 2,
            "cpu_threads": 4,
            "plataforma": platform.system(),
            "arquitectura": platform.machine(),
            "gpu": {"disponible": False, "nombre": "", "vram_gb": 0},
        }

def recomendar_modelo(ram_gb: float = None, gpu_vram_gb: float = 0) -> Dict[str, Any]:
    """Recomienda el mejor modelo según hardware."""
    if ram_gb is None:
        hw = detectar_hardware()
        ram_gb = hw["ram_disponible_gb"]
        gpu_vram_gb = hw["gpu"]["vram_gb"]
    
    # Buscar en tabla principal
    for min_r, max_r, modelo, tamano, motor, desc in MODELOS_POR_RAM:
        if min_r <= ram_gb < max_r:
            return {
                "modelo": modelo,
                "tamano": tamano,
                "motor": motor,
                "descripcion": desc,
                "ram_requerida": max_r,
                "es_recomendado": True,
                "ram_disponible": ram_gb,
            }
    
    # Fallback
    return {
        "modelo": "qwen2.5:0.5b",
        "tamano": "400 MB",
        "motor": "ollama",
        "descripcion": "Fallback ultra ligero",
        "ram_requerida": 2,
        "es_recomendado": False,
        "ram_disponible": ram_gb,
    }

def get_modelos_para_ram(ram_gb: float, gpu_vram_gb: float = 0) -> List[Dict[str, Any]]:
    """Lista todos los modelos viables para la RAM dada."""
    modelos = []
    
    # Principal
    rec = recomendar_modelo(ram_gb, gpu_vram_gb)
    modelos.append({**rec, "categoria": "recomendado"})
    
    # Alternativos por poca RAM
    if ram_gb < 4:
        for m in MODELOS_ALTERNATIVOS["muy_poco_ram"]:
            if m["ram_min"] <= ram_gb:
                modelos.append({**m, "categoria": "ultra_ligero"})
    
    # Apple Silicon
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        for m in MODELOS_ALTERNATIVOS["apple_silicon"]:
            if m["ram_min"] <= ram_gb:
                modelos.append({**m, "categoria": "apple_silicon"})
    
    # Con GPU
    if gpu_vram_gb > 0:
        for m in MODELOS_ALTERNATIVOS["con_gpu"]:
            if m.get("vram_min", 0) <= gpu_vram_gb and m["ram_min"] <= ram_gb:
                modelos.append({**m, "categoria": "con_gpu"})
    
    return modelos

async function descargar_modelo_progreso(modelo: str, motor: str = "ollama", progreso_cb=None) -> Dict[str, Any]:
    """Descarga modelo con callback de progreso."""
    if motor == "ollama":
        return await _descargar_ollama_progreso(modelo, progreso_cb)
    return {"ok": False, "error": f"Motor {motor} no soportado para progreso"}

async function _descargar_ollama_progreso(modelo: str, progreso_cb=None) -> Dict[str, Any]:
    """Descarga en Ollama con progreso real."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ollama", "pull", modelo,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        
        output_lines = []
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            line_str = line.decode().strip()
            output_lines.append(line_str)
            if progreso_cb:
                await progreso_cb(line_str)
        
        await proc.wait()
        
        if proc.returncode == 0:
            return {"ok": True, "modelo": modelo, "output": output_lines}
        else:
            return {"ok": False, "error": "Fallo ollama pull", "output": output_lines}
    except FileNotFoundError:
        return {"ok": False, "error": "Ollama no instalado"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_info_movil() -> Dict[str, Any]:
    """Info completa para el panel móvil."""
    hw = detectar_hardware()
    rec = recomendar_modelo(hw["ram_disponible_gb"], hw["gpu"]["vram_gb"])
    alternativas = get_modelos_para_ram(hw["ram_disponible_gb"], hw["gpu"]["vram_gb"])
    
    return {
        "hardware": hw,
        "recomendacion": rec,
        "alternativas": alternativas,
        "motores_soportados": ["ollama", "lmstudio", "jan", "vllm", "mlx"],
    }