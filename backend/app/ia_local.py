"""IA local ligera y credenciales publicas de acceso.

Dos cosas que hacen la vida mas facil a quien usa LifeAgente:

1. **Credenciales "solo con iniciar sesion"**: el identificador de cliente de
   OAuth (Google, Outlook, GitHub) NO es un secreto -- viaja dentro de la
   aplicacion. Por eso la app puede publicarlos sola (bootstrap) y la persona
   unicamente tiene que pulsar "Continuar con Google" y autorizar en el
   navegador. La fuente es, en este orden:
       1. variables de entorno del despliegue
       2. el ID guardado en la app (Conectar IA > Configuracion avanzada)
       3. un archivo publico de bootstrap publicado por el proyecto
   El punto 3 es una URL (raw de GitHub o el propio servicio) que trae un JSON
   con los identificadores publicos. No contiene secretos: son identificadores
   de aplicacion OAuth, pensados para ir incrustados en el cliente.

2. **IA super ligera descargable**: si en el equipo no hay ningun motor local,
   se puede descargar uno pequeño (unos 400 MB) con un par de clics, sin claves
   y sin cuenta. El motor recomendado es Ollama; el modelo por defecto
   `qwen2.5:0.5b` pesa ~400 MB y corre bien incluso en un portatil modesto.
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from typing import Any

import httpx

# --------------------------------------------------------------------------- #
# 1. Credenciales publicas (bootstrap)
# --------------------------------------------------------------------------- #
# URL por defecto: el archivo publico del propio repositorio. Quien despliega
# lo actualiza con un commit y TODOS los usuarios lo reciben sin reinstalar.
BOOTSTRAP_POR_DEFECTO = (
    "https://raw.githubusercontent.com/brayanortiz906-lab/LifeSync-AI/main/public/clientes-publicos.json"
)
_CACHE_BOOTSTRAP: dict[str, Any] = {"ts": 0.0, "valor": {}}
_CACHE_BOOTSTRAP_TTL = 3600.0


def url_bootstrap() -> str:
    return (
        os.environ.get("LIFEAGENTE_BOOTSTRAP_URL")
        or BOOTSTRAP_POR_DEFECTO
    ).strip()


def clientes_publicos(forzar: bool = False) -> dict[str, str]:
    """Identificadores de cliente publicos publicados por el despliegue.

    Nunca lanza: si no hay archivo publico o no hay red, devuelve {}.
    """
    ahora = time.time()
    if not forzar and ahora - float(_CACHE_BOOTSTRAP["ts"]) < _CACHE_BOOTSTRAP_TTL:
        return dict(_CACHE_BOOTSTRAP["valor"])
    url = url_bootstrap()
    datos: dict[str, str] = {}
    if url:
        try:
            with httpx.Client(timeout=4.0, follow_redirects=True) as cliente:
                resp = cliente.get(url)
            if resp.status_code < 400:
                crudo = resp.json()
                if isinstance(crudo, dict):
                    for clave, valor in crudo.items():
                        if isinstance(valor, str) and valor.strip():
                            datos[clave.strip()] = valor.strip()
        except Exception:
            datos = {}
    _CACHE_BOOTSTRAP["ts"] = ahora
    _CACHE_BOOTSTRAP["valor"] = datos
    return dict(datos)


# --------------------------------------------------------------------------- #
# 2. Modelos ligeros descargables
# --------------------------------------------------------------------------- #
MODELOS_LIGEROS: list[dict[str, Any]] = [
    {
        "id": "qwen2.5:0.5b",
        "nombre": "Qwen 2.5 mini (0.5B)",
        "tamano_mb": 400,
        "nota": "El mas ligero. Responde de inmediato y gasta poca memoria.",
        "recomendado": True,
    },
    {
        "id": "llama3.2:1b",
        "nombre": "Llama 3.2 (1B)",
        "tamano_mb": 1300,
        "nota": "Un poco mas de criterio que el anterior. Sigue siendo muy ligero.",
        "recomendado": False,
    },
    {
        "id": "gemma3:1b",
        "nombre": "Gemma 3 (1B)",
        "tamano_mb": 815,
        "nota": "Alternativa de Google, rapida y compacta.",
        "recomendado": False,
    },
    {
        "id": "phi3.5:mini",
        "nombre": "Phi 3.5 mini",
        "tamano_mb": 2200,
        "nota": "El mas listo de los ligeros, pero necesita un poco mas de equipo.",
        "recomendado": False,
    },
]

# Motor local que se instala y se usa por defecto.
MOTOR_RECOMENDADO = "ollama"


# --------------------------------------------------------------------------- #
# Descargas en segundo plano
# --------------------------------------------------------------------------- #
_DESCARGAS: dict[str, dict[str, Any]] = {}
_CANDADO = threading.Lock()


def _registrar(descarga_id: str, **cambios: Any) -> None:
    with _CANDADO:
        actual = _DESCARGAS.setdefault(
            descarga_id,
            {
                "id": descarga_id,
                "modelo": "",
                "estado": "iniciando",
                "progreso": 0,
                "mensaje": "Preparando la descarga...",
                "log": [],
                "iniciada_en": time.time(),
                "terminada_en": None,
            },
        )
        actual.update(cambios)


def listar_descargas() -> list[dict[str, Any]]:
    with _CANDADO:
        return [dict(v) for v in _DESCARGAS.values()]


def descarga(descarga_id: str) -> dict[str, Any] | None:
    with _CANDADO:
        v = _DESCARGAS.get(descarga_id)
        return dict(v) if v else None


def _linea(descarga_id: str, texto: str) -> None:
    with _CANDADO:
        actual = _DESCARGAS.get(descarga_id)
        if actual is None:
            return
        lineas = actual.get("log") or []
        lineas.append(texto)
        actual["log"] = lineas[-40:]
        actual["mensaje"] = texto


def _ejecutar(descarga_id: str, modelo: str) -> None:
    """Descarga un modelo con `ollama pull` y va reportando el progreso."""
    _registrar(descarga_id, estado="descargando", progreso=0, modelo=modelo)
    exe = os.environ.get("LIFEAGENTE_OLLAMA", "ollama")
    try:
        proceso = subprocess.Popen(
            [exe, "pull", modelo],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except FileNotFoundError:
        _registrar(
            descarga_id,
            estado="error",
            progreso=0,
            mensaje="No se encontro Ollama. Instalalo con el boton Instalar de la ventana principal.",
        )
        return
    except Exception as exc:  # pragma: no cover
        _registrar(descarga_id, estado="error", progreso=0, mensaje=f"No se pudo iniciar la descarga: {exc}")
        return

    assert proceso.stdout is not None
    for linea in proceso.stdout:
        texto = (linea or "").strip()
        if not texto:
            continue
        if "{" in texto:
            try:
                datos = json.loads(texto[texto.index("{"):])
            except Exception:
                datos = {}
            total = float(datos.get("total") or 0)
            completados = float(datos.get("completed") or 0)
            if total > 0:
                porcentaje = int(min(100, (completados / total) * 100))
                _registrar(descarga_id, progreso=porcentaje)
        _linea(descarga_id, texto[:160])

    codigo = proceso.wait()
    if codigo == 0:
        _registrar(
            descarga_id,
            estado="listo",
            progreso=100,
            mensaje=f"Listo: {modelo} ya esta en tu equipo.",
            terminada_en=time.time(),
        )
    else:
        _registrar(
            descarga_id,
            estado="error",
            mensaje=f"La descarga se detuvo (codigo {codigo}). Revisa tu conexion e intentalo de nuevo.",
            terminada_en=time.time(),
        )


def descargar_modelo(modelo: str) -> dict[str, Any]:
    """Arranca la descarga de un modelo y devuelve el identificador del trabajo."""
    modelo = (modelo or "").strip()
    if not modelo:
        return {"ok": False, "mensaje": "Elige un modelo para descargar."}
    validos = {m["id"] for m in MODELOS_LIGEROS}
    if modelo not in validos:
        return {"ok": False, "mensaje": "Ese modelo no esta en la lista de los ligeros."}
    descarga_id = f"{modelo.replace(':', '-')}-{int(time.time())}"
    _registrar(descarga_id, modelo=modelo, estado="iniciando", progreso=0)
    hilo = threading.Thread(target=_ejecutar, args=(descarga_id, modelo), daemon=True)
    hilo.start()
    return {"ok": True, "id": descarga_id, "modelo": modelo}
