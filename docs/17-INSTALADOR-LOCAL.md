# Instalador local (LifeAgente.exe)

Que la app funcione **en el computador de cada persona**, sin que esa persona
tenga que instalar Python, Node ni Docker: un solo archivo `.exe`.

## 1. Que hace el instalador

| Paso | Que ocurre |
|---|---|
| 1. Revisa | Python (ya va dentro), Docker (opcional), base de datos, puerto 8000, interfaz compilada |
| 2. Instala lo que falte | un boton **Instalar** por requisito, usando `winget` |
| 3. Prepara los datos | crea `%APPDATA%\LifeAgente` y la base de datos SQLite (con datos de ejemplo la primera vez) |
| 4. Arranca | levanta la API + la interfaz en `http://127.0.0.1:8000` |
| 5. Abre el navegador | en esa misma direccion |
| 6. Al cerrar la ventana | **guarda una copia de la base de datos y apaga todo** (no queda nada corriendo) |

## 2. Donde viven los datos

```
%APPDATA%\LifeAgente
|- lifesync.db        <- agenda, tareas, gastos, mantenimiento
|- secreto.txt        <- clave de cifrado (estable entre ejecuciones)
|- respaldos\         <- copias automaticas al cerrar
`- logs\
```

Ese cambio de ubicacion es **importante**: antes la base vivia junto al
codigo (`backend/lifesync.db`). En una app empaquetada, el codigo vive en una
carpeta temporal que se borra al cerrar, asi que los datos tienen que ir a una
carpeta del usuario. Por eso `backend/app/config.py` ahora calcula:

- `DATA_DIR` = `%APPDATA%\LifeAgente` (o la variable `LIFEAGENTE_DATA`)
- `FRONTEND_DIST` y `SYSTEM_PROMPT_PATH` se buscan en varias rutas, porque
  dentro del `.exe` estan en `_MEIPASS` (la carpeta temporal de PyInstaller)

Ademas, la clave de cifrado (`APP_SECRET_KEY`) se guarda en `secreto.txt`: si
cambiara en cada arranque, las credenciales de las IA guardadas dejarian de
poder descifrarse.

## 3. Como se compila

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1
```

El script:

1. compila la interfaz (`frontend/dist`) si no existe;
2. crea `.venv-desktop` con PyInstaller;
3. genera **`desktop/dist/LifeAgente.exe`**;
4. comprueba que el ejecutable existe.

El `.spec` (`desktop/LifeAgente.spec`) mete dentro del ejecutable:

| Pieza | Ubicacion dentro del .exe |
|---|---|
| La API completa | `app/` |
| El System Prompt | `shared/system_prompt.txt` |
| La interfaz compilada | `frontend/dist/` |
| El motor de Python | (lo mete PyInstaller) |

Y el lanzador se relanza a si mismo con `--servidor` para levantar la API en
un proceso aparte (asi el cierre de la ventana lo apaga de verdad).

## 4. Sin `.exe`: el arranque con un clic

Si la persona tiene el repositorio descargado, puede usar
**`desktop/INICIAR.bat`**: crea el entorno, instala las dependencias, compila
la interfaz, levanta el sistema, abre el navegador y apaga todo al cerrar.

## 5. Publicar la descarga

`.github/workflows/build-installer.yml` compila el `.exe` en Windows:

| Evento | Que hace |
|---|---|
| *Run workflow* (manual) | compila y deja el `.exe` como artefacto descargable |
| Tag `v*` (por ejemplo `v1.0`) | ademas crea una **Release** con el `.exe` adjunto |

Es **gratis** en repositorios publicos. La descarga directa queda en
`https://github.com/brayanortiz906-lab/LifeSync-AI/releases`.

## 6. Docker dentro del instalador

Docker es **opcional**: el modo rapido (el que usa el `.exe`) no lo necesita.
El lanzador lo detecta y lo muestra en los requisitos, para quien prefiera
levantar la app con `docker compose up` (el repo ya trae `docker-compose.yml`
y un `Dockerfile` multi-stage).

## 7. Verificacion

| Prueba | Resultado |
|---|---|
| Requisitos detectados | Python, Docker, base de datos, puerto e interfaz |
| Arranque | el proceso responde `/api/health` con `{"ok":true,"app":"LifeAgente AI",...}` |
| Interfaz | se sirve en el mismo dominio (`/` devuelve el HTML de la SPA) |
| Copia de seguridad | se crea `respaldos/lifesync-AAAA-MM-DD-HHMM.db` |
| Apagado | el proceso termina y el puerto 8000 queda libre |

## 8. Archivos

| Archivo | Que aporta |
|---|---|
| `desktop/launcher.py` | la ventana del instalador: requisitos, instalar, iniciar, detener, copiar y apagar |
| `desktop/LifeAgente.spec` | la receta de PyInstaller (que entra en el `.exe`) |
| `desktop/build.ps1` | compila el `.exe` |
| `desktop/INICIAR.bat` | arranque con un clic sin compilar el `.exe` |
| `desktop/LEEME.txt` | el texto que lee la persona que instala |
| `backend/app/config.py` | `DATA_DIR`, `FRONTEND_DIST` y `SYSTEM_PROMPT_PATH` compatibles con el `.exe` |
| `.github/workflows/build-installer.yml` | compila y publica la descarga |
