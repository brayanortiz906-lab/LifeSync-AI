"""LifeAgente AI — Instalador local para Windows.

Un solo archivo (.exe) que:
  1. revisa qué falta (Python, Docker, Node, base de datos, puerto);
  2. instala lo que falte con un clic (winget);
  3. crea la base de datos y levanta el sistema;
  4. abre el navegador en la app;
  5. al cerrar la ventana: guarda una copia de tus datos y apaga todo.

Uso:
  LifeAgente.exe                -> abre la ventana
  LifeAgente.exe --servidor     -> arranca solo la API (lo usa el lanzador)
  LifeAgente.exe --instalar     -> instala dependencias y sale
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path
from shutil import which as shutil_which


def _asegurar_salida() -> None:
    """En una app de ventana (sin consola) Python deja stdout y stderr en None.

    Con eso uvicorn revienta al configurar el log ('NoneType' object has no
    attribute 'isatty' -> "Unable to configure formatter 'default'") y el
    servidor no arranca nunca. Lo que arreglamos: mandamos la salida a la
    nada, pero sin que el proceso se caiga.
    """
    if sys.stdout is None:
        try:
            sys.stdout = open(os.devnull, "w", encoding="utf-8")
        except Exception:
            pass
    if sys.stderr is None:
        try:
            sys.stderr = open(os.devnull, "w", encoding="utf-8")
        except Exception:
            pass


_asegurar_salida()

# --------------------------------------------------------------------------- #
# Modo SERVIDOR: el .exe se relanza a si mismo con --servidor.
# --------------------------------------------------------------------------- #
if getattr(sys, "frozen", False) and "--servidor" in sys.argv:
    _datos = Path(
        os.environ.get("LIFEAGENTE_DATA")
        or (Path(os.environ.get("APPDATA") or Path.home()) / "LifeAgente")
    )
    _datos.mkdir(parents=True, exist_ok=True)
    os.environ["LIFEAGENTE_DATA"] = str(_datos)
    import uvicorn

    from app.main import app

    # El log del servidor va a un archivo: en una app de ventana no hay consola
    # y asi la ventana del lanzador puede mostrarlo si algo falla.
    _log = _datos / "servidor.log"
    _config_log = None
    try:
        import copy

        from uvicorn.config import LOGGING_CONFIG

        _config_log = copy.deepcopy(LOGGING_CONFIG)
        _config_log.setdefault("handlers", {})["archivo"] = {
            "class": "logging.FileHandler",
            "filename": str(_log),
            "formatter": "default",
            "encoding": "utf-8",
        }
        for _nombre in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            _logger = _config_log.get("loggers", {}).get(_nombre)
            if _logger is not None:
                _manejadores = list(_logger.get("handlers", []))
                if "archivo" not in _manejadores:
                    _manejadores.append("archivo")
                _logger["handlers"] = _manejadores
    except Exception:
        _config_log = None

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("LIFEAGENTE_PUERTO", "8000")),
        log_level="warning",
        log_config=_config_log,
    )
    raise SystemExit(0)

import tkinter as tk
from tkinter import scrolledtext, ttk

# --------------------------------------------------------------------------- #
# Configuración
# --------------------------------------------------------------------------- #
FROZEN = bool(getattr(sys, "frozen", False))
MEIPASS = Path(getattr(sys, "_MEIPASS", "")) if FROZEN else Path(__file__).resolve().parent
DIR_DATOS = Path(
    os.environ.get("LIFEAGENTE_DATA")
    or (Path(os.environ.get("APPDATA") or Path.home()) / "LifeAgente")
)
PUERTO = int(os.environ.get("LIFEAGENTE_PUERTO", "8000"))
URL = f"http://127.0.0.1:{PUERTO}"


def _leer_version() -> str:
    """Version de la app (archivo VERSION). La misma que ve la persona."""
    candidatos = [
        (Path(getattr(sys, "_MEIPASS", "")) / "VERSION") if FROZEN else None,
        Path(__file__).resolve().parent.parent / "VERSION",
        Path(__file__).resolve().parent / "VERSION",
    ]
    for ruta in candidatos:
        if not ruta:
            continue
        try:
            if ruta.exists():
                texto = ruta.read_text(encoding="utf-8").strip()
                if texto:
                    return texto
        except OSError:
            continue
    return "1.1.0"


VERSION = _leer_version()

# Modelo muy ligero para usar LifeAgente en el computador sin claves de IA.
MODELO_LIGERO = "qwen2.5:0.5b"
DIR_RESPALDOS = DIR_DATOS / "respaldos"
ARCHIVO_DB = DIR_DATOS / "lifesync.db"
RUTA_LOG = DIR_DATOS / "servidor.log"


def leer_log_servidor(lineas: int = 25) -> str:
    """Ultimas lineas del log del servidor (util cuando se para sin consola)."""
    try:
        if not RUTA_LOG.exists():
            return ""
        texto = RUTA_LOG.read_text(encoding="utf-8", errors="replace").strip()
        if not texto:
            return ""
        return "\n".join(texto.splitlines()[-lineas:])
    except Exception:
        return ""

# Raíz del proyecto cuando NO estamos empaquetados (desarrollo / repo).
RAIZ_REPO = Path(__file__).resolve().parent.parent if not FROZEN else None

FONDO = "#0b1220"
FONDO_CARD = "#131c31"
TEXTO = "#e2e8f0"
TEXTO_TENUE = "#94a3b8"
VERDE = "#34d399"
AMARILLO = "#fbbf24"
ROJO = "#f87171"
INDIGO = "#818cf8"

WINGET = {
    "python": [
        "winget", "install", "--id", "Python.Python.3.12", "-e",
        "--accept-package-agreements", "--accept-source-agreements", "--silent",
    ],
    "docker": [
        "winget", "install", "--id", "Docker.DockerDesktop", "-e",
        "--accept-package-agreements", "--accept-source-agreements",
    ],
    "node": [
        "winget", "install", "--id", "OpenJS.NodeJS.LTS", "-e",
        "--accept-package-agreements", "--accept-source-agreements", "--silent",
    ],
}


# --------------------------------------------------------------------------- #
# Utilidades del sistema
# --------------------------------------------------------------------------- #
def en_ruta(comando: str) -> bool:
    return shutil_which(comando) is not None


def puerto_libre(puerto: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", puerto))
            return True
        except OSError:
            return False


def docker_funciona() -> bool:
    if not en_ruta("docker"):
        return False
    try:
        r = subprocess.run(
            ["docker", "info"], capture_output=True, timeout=12, text=True
        )
        return r.returncode == 0
    except Exception:
        return False


def interfaz_compilada() -> Path | None:
    """Ruta del frontend compilado (si existe)."""
    candidatas = []
    if FROZEN:
        candidatas.append(MEIPASS / "frontend" / "dist")
    else:
        candidatas.append(RAIZ_REPO / "frontend" / "dist")
        candidatas.append(MEIPASS.parent / "frontend" / "dist")
    for c in candidatas:
        if c.exists() and (c / "index.html").exists():
            return c
    return None


def version_python() -> str:
    return ".".join(str(x) for x in sys.version_info[:3])


# --------------------------------------------------------------------------- #
# Comprobaciones
# --------------------------------------------------------------------------- #
def comprobaciones() -> list[dict]:
    """Devuelve la lista de requisitos con su estado."""
    items: list[dict] = []

    if FROZEN:
        items.append({
            "clave": "python", "titulo": "Motor de LifeAgente",
            "ok": True, "detalle": f"incluido en el instalador (Python {version_python()})",
            "accion": None,
        })
    else:
        ok = en_ruta("python") or en_ruta("py")
        items.append({
            "clave": "python", "titulo": "Python 3.12",
            "ok": ok, "detalle": f"Python {version_python()} (incluido en elvenv)" if ok else "no encontrado",
            "accion": None if ok else "python",
        })

    ok_docker = docker_funciona()
    items.append({
        "clave": "docker", "titulo": "Docker (opcional)",
        "ok": ok_docker,
        "detalle": "instalado y funcionando" if ok_docker else "no hace falta: puedes usar el modo rapido",
        "accion": None if ok_docker else "docker",
    })

    ok_db = ARCHIVO_DB.exists()
    items.append({
        "clave": "db", "titulo": "Base de datos",
        "ok": ok_db,
        "detalle": str(ARCHIVO_DB) if ok_db else "se creara al iniciar (no hay datos todavia)",
        "accion": None,
    })

    ok_puerto = puerto_libre(PUERTO)
    items.append({
        "clave": "puerto", "titulo": f"Puerto {PUERTO}",
        "ok": ok_puerto,
        "detalle": "libre" if ok_puerto else "ocupado: puede que LifeAgente ya este corriendo",
        "accion": None,
    })

    interfaz = interfaz_compilada()
    items.append({
        "clave": "interfaz", "titulo": "Interfaz compilada",
        "ok": interfaz is not None,
        "detalle": str(interfaz) if interfaz else "falta compilar el frontend",
        "accion": None,
    })

    return items


# --------------------------------------------------------------------------- #
# Ventana
# --------------------------------------------------------------------------- #
class Lanzador:
    def __init__(self) -> None:
        self.proceso: subprocess.Popen | None = None
        self.hilo_instalar: threading.Thread | None = None
        self.hilo_inicio: threading.Thread | None = None
        self.cerrando = False

        self.raiz = tk.Tk()
        self.raiz.title("LifeAgente AI — Instalador local")
        self.raiz.configure(bg=FONDO)
        self.raiz.geometry("820x600")
        self.raiz.minsize(720, 520)
        self.raiz.protocol("WM_DELETE_WINDOW", self.al_cerrar)

        self._construir()

    # --- interfaz ---------------------------------------------------------- #
    def _construir(self) -> None:
        marco = tk.Frame(self.raiz, bg=FONDO)
        marco.pack(fill="both", expand=True, padx=18, pady=16)

        # Encabezado
        cab = tk.Frame(marco, bg=FONDO)
        cab.pack(fill="x")
        tk.Label(
            cab, text="LifeAgente AI", bg=FONDO, fg=TEXTO,
            font=("Segoe UI", 22, "bold"),
        ).pack(side="left")
        tk.Label(
            cab, text=f"v{VERSION}", bg=FONDO, fg=TEXTO_TENUE,
            font=("Segoe UI", 11),
        ).pack(side="left", padx=(8, 0), pady=8)
        self.etiqueta_estado = tk.Label(
            cab, text="Listo", bg=FONDO, fg=TEXTO_TENUE,
            font=("Segoe UI", 11),
        )
        self.etiqueta_estado.pack(side="right", pady=8)

        tk.Label(
            marco,
            text="Tu asistente de vida y productividad, en tu computador. "
                 "Al cerrar esta ventana se guarda todo y el sistema se apaga.",
            bg=FONDO, fg=TEXTO_TENUE, font=("Segoe UI", 10), justify="left",
            wraplength=760,
        ).pack(fill="x", pady=(2, 12))

        # Requisitos
        self.tarjeta_requisitos = tk.Frame(marco, bg=FONDO_CARD, bd=0, highlightthickness=1,
                                           highlightbackground="#1e293b")
        self.tarjeta_requisitos.pack(fill="x")
        tk.Label(
            self.tarjeta_requisitos, text="REQUISITOS", bg=FONDO_CARD, fg=TEXTO_TENUE,
            font=("Segoe UI", 9, "bold"),
        ).pack(anchor="w", padx=14, pady=(12, 4))
        self.lista_requisitos = tk.Frame(self.tarjeta_requisitos, bg=FONDO_CARD)
        self.lista_requisitos.pack(fill="x", padx=14, pady=(0, 12))
        self.filas: dict[str, dict] = {}

        # Botones
        botones = tk.Frame(marco, bg=FONDO)
        botones.pack(fill="x", pady=12)
        self.boton_iniciar = tk.Button(
            botones, text="Iniciar LifeAgente", command=self.iniciar,
            bg=INDIGO, fg="#0b1220", activebackground="#a5b4fc",
            font=("Segoe UI", 12, "bold"), bd=0, padx=18, pady=9, cursor="hand2",
        )
        self.boton_iniciar.pack(side="left")
        self.boton_abrir = tk.Button(
            botones, text="Abrir en el navegador", command=lambda: webbrowser.open(URL),
            bg=FONDO_CARD, fg=TEXTO, activebackground="#1e293b",
            font=("Segoe UI", 10), bd=0, highlightthickness=1,
            highlightbackground="#1e293b", padx=14, pady=9, cursor="hand2",
        )
        self.boton_abrir.pack(side="left", padx=8)
        self.boton_detener = tk.Button(
            botones, text="Detener", command=self.detener,
            bg=FONDO_CARD, fg=TEXTO, activebackground="#1e293b",
            font=("Segoe UI", 10), bd=0, highlightthickness=1,
            highlightbackground="#1e293b", padx=14, pady=9, cursor="hand2",
        )
        self.boton_detener.pack(side="left")
        self.boton_respaldo = tk.Button(
            botones, text="Guardar copia ahora", command=self.guardar_copia,
            bg=FONDO_CARD, fg=TEXTO, activebackground="#1e293b",
            font=("Segoe UI", 10), bd=0, highlightthickness=1,
            highlightbackground="#1e293b", padx=14, pady=9, cursor="hand2",
        )
        self.boton_respaldo.pack(side="left", padx=8)
        self.boton_ia = tk.Button(
            botones, text="Descargar IA ligera", command=self.descargar_ia_ligera,
            bg=FONDO_CARD, fg=TEXTO, activebackground="#1e293b",
            font=("Segoe UI", 10), bd=0, highlightthickness=1,
            highlightbackground="#1e293b", padx=14, pady=9, cursor="hand2",
        )
        self.boton_ia.pack(side="left", padx=8)

        # Registro
        tk.Label(marco, text="REGISTRO", bg=FONDO, fg=TEXTO_TENUE,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self.registro = scrolledtext.ScrolledText(
            marco, height=12, bg="#0f172a", fg="#cbd5e1", bd=0,
            font=("Consolas", 9), insertbackground=TEXTO, relief="flat",
        )
        self.registro.pack(fill="both", expand=True, pady=(4, 0))
        self.registro.configure(state="disabled")

        self.actualizar_requisitos()
        self.escribir("LifeAgente AI listo. Revisa los requisitos y pulsa 'Iniciar LifeAgente'.")

    # --- utilidades de la interfaz ----------------------------------------- #
    def escribir(self, texto: str) -> None:
        def _hacer() -> None:
            self.registro.configure(state="normal")
            self.registro.insert("end", texto.rstrip() + "\n")
            self.registro.see("end")
            self.registro.configure(state="disabled")

        self.raiz.after(0, _hacer)

    def estado(self, texto: str, color: str = TEXTO_TENUE) -> None:
        def _hacer() -> None:
            self.etiqueta_estado.configure(text=texto, fg=color)

        self.raiz.after(0, _hacer)

    def actualizar_requisitos(self) -> None:
        for hijo in self.lista_requisitos.winfo_children():
            hijo.destroy()
        self.filas.clear()
        for item in comprobaciones():
            fila = tk.Frame(self.lista_requisitos, bg=FONDO_CARD)
            fila.pack(fill="x", pady=3)
            color = VERDE if item["ok"] else (AMARILLO if item["accion"] is None else ROJO)
            tk.Label(fila, text="●", bg=FONDO_CARD, fg=color,
                     font=("Segoe UI", 10)).pack(side="left")
            tk.Label(fila, text=item["titulo"], bg=FONDO_CARD, fg=TEXTO,
                     font=("Segoe UI", 10, "bold"), width=22, anchor="w").pack(side="left")
            tk.Label(fila, text=item["detalle"], bg=FONDO_CARD, fg=TEXTO_TENUE,
                     font=("Segoe UI", 9), anchor="w").pack(side="left", fill="x", expand=True)
            if item["accion"]:
                clave = item["accion"]
                tk.Button(
                    fila, text="Instalar", command=lambda k=clave: self.instalar(k),
                    bg="#1e293b", fg=INDIGO, bd=0, font=("Segoe UI", 9),
                    padx=10, pady=3, cursor="hand2",
                ).pack(side="right")
            self.filas[item["clave"]] = item

    # --- instalar dependencias -------------------------------------------- #
    def instalar(self, clave: str) -> None:
        if clave not in WINGET:
            return
        if not en_ruta("winget"):
            self.escribir("No se encontro 'winget' (viene con Windows 10/11 y el App Installer).")
            self.escribir("Descarga el programa desde la pagina oficial del proveedor.")
            return
        self.escribir(f"Instalando {clave}... (puede tardar varios minutos)")

        def _hilo() -> None:
            try:
                r = subprocess.run(WINGET[clave], capture_output=True, text=True, timeout=1800)
                if r.returncode == 0:
                    self.escribir(f"Listo: {clave} instalado. Reinicia el equipo si te lo pide.")
                    self.estado("Instalado", VERDE)
                else:
                    self.escribir(f"No se pudo instalar {clave}: {(r.stderr or r.stdout)[-300:]}")
                    self.estado("Fallo la instalacion", ROJO)
            except Exception as exc:
                self.escribir(f"Error instalando {clave}: {exc}")
            self.raiz.after(0, self.actualizar_requisitos)

        threading.Thread(target=_hilo, daemon=True).start()

    # --- IA ligera local ---------------------------------------------------- #
    def descargar_ia_ligera(self) -> None:
        """Baja un modelo de IA muy pequeno para que la app funcione sin claves.

        Si Ollama no esta instalado, se instala primero con winget; despues se
        baja 'qwen2.5:0.5b' (unos 400 MB), que es el modelo mas ligero que
        responde bien en un computador normal.
        """
        modelo = MODELO_LIGERO
        if not en_ruta("ollama"):
            if not en_ruta("winget"):
                self.escribir("No se encontro 'winget'. Instala Ollama desde https://ollama.com/download")
                self.estado("Falta instalar Ollama", ROJO)
                return
            self.escribir("Ollama no esta instalado. Instalando con winget (puede tardar)...")
            self.estado("Instalando Ollama...", TEXTO_TENUE)
            r = subprocess.run(
                ["winget", "install", "--id", "Ollama.Ollama", "-e",
                 "--accept-package-agreements", "--accept-source-agreements"],
                capture_output=True, text=True, timeout=1800,
            )
            if r.returncode != 0:
                self.escribir(f"No se pudo instalar Ollama: {(r.stderr or r.stdout)[-300:]}")
                self.estado("Fallo la instalacion", ROJO)
                return
            self.escribir("Ollama instalado. Si sigue sin aparecer, reinicia el equipo.")
            self.raiz.after(0, self.actualizar_requisitos)

        self.escribir(f"Descargando el modelo {modelo} (unos 400 MB). Puedes seguir usando la app mientras baja.")
        self.estado("Descargando IA ligera...", TEXTO_TENUE)

        def _hilo() -> None:
            try:
                proceso = subprocess.Popen(
                    ["ollama", "pull", modelo], stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, text=True,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                for linea in proceso.stdout or []:
                    linea = linea.strip()
                    if linea:
                        self.escribir(f"  {linea}")
                proceso.wait()
                if proceso.returncode == 0:
                    self.escribir(f"Listo: {modelo} ya esta en tu computador.")
                    self.escribir("En la app, ve a 'Conectar IA' y pulsa 'Conectar' en Ollama.")
                    self.estado("IA lista", VERDE)
                else:
                    self.escribir(f"La descarga fallo (codigo {proceso.returncode}).")
                    self.estado("Fallo la descarga", ROJO)
            except Exception as exc:
                self.escribir(f"Error descargando la IA: {exc}")
                self.estado("Error", ROJO)
            self.raiz.after(0, self.actualizar_requisitos)

        threading.Thread(target=_hilo, daemon=True).start()

    # --- iniciar ------------------------------------------------------------ #
    def iniciar(self) -> None:
        if self.proceso is not None:
            self.escribir("Ya esta corriendo.")
            return
        if not puerto_libre(PUERTO):
            self.escribir(f"El puerto {PUERTO} esta ocupado: quiza LifeAgente ya este corriendo.")
            self.estado("Ya corriendo", AMARILLO)
            webbrowser.open(URL)
            return
        self.boton_iniciar.configure(state="disabled")
        self.estado("Iniciando...", AMARILLO)
        self.escribir("Preparando la base de datos y arrancando el sistema...")

        def _hilo() -> None:
            try:
                cmd = (
                    [sys.executable, "--servidor"]
                    if FROZEN
                    else [sys.executable, "-m", "uvicorn", "app.main:app",
                          "--host", "127.0.0.1", "--port", str(PUERTO), "--log-level", "warning"]
                )
                env = os.environ.copy()
                env["LIFEAGENTE_DATA"] = str(DIR_DATOS)
                env["LIFEAGENTE_PUERTO"] = str(PUERTO)
                cwd = str(MEIPASS) if FROZEN else str(RAIZ_REPO / "backend")
                self.proceso = subprocess.Popen(
                    cmd, cwd=cwd, env=env,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                )
            except Exception as exc:
                self.escribir(f"No se pudo arrancar: {exc}")
                self.estado("Error", ROJO)
                self.raiz.after(0, lambda: self.boton_iniciar.configure(state="normal"))
                return

            # Esperar a que la API responda
            listo = False
            for _ in range(90):
                time.sleep(1)
                if self.proceso.poll() is not None:
                    salida = ""
                    if self.proceso.stdout:
                        try:
                            salida = self.proceso.stdout.read() or ""
                        except Exception:
                            salida = ""
                    if not salida.strip():
                        # En modo ventana el servidor no escribe en la consola:
                        # su log esta en un archivo (servidor.log).
                        salida = leer_log_servidor()
                    self.escribir("El servidor se detuvo:\n" + (salida or "(sin detalles)"))
                    self.estado("Error", ROJO)
                    self.raiz.after(0, lambda: self.boton_iniciar.configure(state="normal"))
                    return
                if self._responde():
                    listo = True
                    break

            if listo:
                self.escribir(f"LifeAgente esta corriendo en {URL}")
                self.estado("Corriendo", VERDE)
                self.raiz.after(0, lambda: self.boton_iniciar.configure(state="normal"))
                webbrowser.open(URL)
            else:
                self.escribir("El sistema tardo demasiado en arrancar. Revisa el registro.")
                self.estado("Tardo", AMARILLO)
                self.raiz.after(0, lambda: self.boton_iniciar.configure(state="normal"))

        threading.Thread(target=_hilo, daemon=True).start()

    @staticmethod
    def _responde() -> bool:
        import urllib.request

        try:
            with urllib.request.urlopen(f"{URL}/api/health", timeout=3) as r:
                return r.status == 200
        except Exception:
            return False

    # --- detener y guardar -------------------------------------------------- #
    def guardar_copia(self) -> None:
        """Copia la base de datos a la carpeta de respaldos."""
        try:
            DIR_RESPALDOS.mkdir(parents=True, exist_ok=True)
            sello = datetime.now().strftime("%Y-%m-%d-%H%M%S")
            destino = DIR_RESPALDOS / f"lifesync-{sello}.db"
            if ARCHIVO_DB.exists():
                import shutil as _sh

                _sh.copy2(ARCHIVO_DB, destino)
                self.escribir(f"Copia guardada: {destino}")
            else:
                self.escribir("Todavia no hay base de datos (no has iniciado el sistema).")
        except Exception as exc:
            self.escribir(f"No se pudo guardar la copia: {exc}")

    def detener(self, avisar: bool = True) -> None:
        if self.proceso is not None:
            self.escribir("Apagando el sistema...")
            try:
                self.proceso.terminate()
                self.proceso.wait(timeout=12)
            except Exception:
                try:
                    self.proceso.kill()
                except Exception:
                    pass
            self.proceso = None
        # Dar tiempo a que el sistema operativo libere el puerto.
        for _ in range(15):
            if puerto_libre(PUERTO):
                break
            time.sleep(0.4)
        if avisar:
            self.guardar_copia()
            self.estado("Apagado", TEXTO_TENUE)
            self.escribir("Sistema apagado. Tus datos quedan guardados.")

    def al_cerrar(self) -> None:
        if self.cerrando:
            return
        self.cerrando = True
        self.estado("Guardando y apagando...", AMARILLO)
        self.raiz.update()
        self.detener(avisar=False)
        self.guardar_copia()
        self.raiz.destroy()

    def ejecutar(self) -> None:
        self.raiz.mainloop()


def main() -> None:
    if "--instalar" in sys.argv:
        # Modo consola: instala lo que falte y sale.
        for clave in ("python", "node", "docker"):
            if clave == "python" and FROZEN:
                continue
            if clave == "docker" and docker_funciona():
                continue
            print(f"== Instalando {clave} ==")
            try:
                subprocess.run(WINGET[clave], check=False)
            except Exception as exc:
                print(f"No se pudo instalar {clave}: {exc}")
        return
    Lanzador().ejecutar()


if __name__ == "__main__":
    main()
