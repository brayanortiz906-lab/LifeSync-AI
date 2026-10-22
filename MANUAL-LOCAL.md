# LifeAgente AI — Manual del sistema (para tenerlo en tu equipo)

Este es el manual de referencia de **LifeAgente AI**: qué es, cómo se guarda
todo, cómo se arranca en tu computador y **qué hace cada archivo del sistema**.
Está pensado para que puedas tener el sistema completo local, tocarlo y
entenderlo sin depender de nadie.

- Si quieres **empezar ya**: lee [`LEEME.txt`](LEEME.txt) (texto plano, 2 minutos).
- Si quieres **instalar**: `LifeAgente.exe` (un clic) → sección 2.
- Si quieres **desarrollar**: sección 3 y el mapa de archivos (sección 6).
- Si quieres **publicar en la nube**: [`docs/10-DESPLIEGUE.md`](docs/10-DESPLIEGUE.md).

---

## 1. Qué es LifeAgente AI

Un asistente integral de vida y productividad. Una persona le habla en
lenguaje natural y LifeAgente **registra y organiza** su vida:

| Área | Qué hace | Dónde se ve |
|---|---|---|
| **Agenda** | eventos, citas, clases, descanso | pestaña «Mi agenda» (calendario por franjas Mañana/Tarde/Noche) |
| **Estudio** | tareas, entregas, resúmenes y preguntas de material | panel «Tareas académicas» |
| **Dinero** | gastos categorization, bitácora mensual | panel «Bitácora y gastos» |
| **Hogar** | mantenimientos (aceite, frenos, filtros) con próxima fecha | panel «Mantenimiento» |
| **Asistente** | chat flotante que registra todo lo que le dices | burbuja fija abajo a la derecha (Ctrl+K) |
| **Cuentas** | correo + contraseña, Google/Outlook/GitHub, modo local, modo de prueba | pantalla de bienvenida |
| **Permisos** | Drive, Calendar, correo, piloto automático | pestaña «Permisos» |
| **Paneles** | espacios de trabajo con su propia agenda, compartibles | pestaña «Paneles» |
| **Responsabilidad** | auditoría, aprobaciones humanas, PII, cumplimiento | pestaña «Responsabilidad» |

**Principio de diseño (importante para mantenerlo):**
> *El modelo de IA emite intenciones tipadas (JSON) y el código las ejecuta.
> La IA nunca escribe en la base de datos.*

`shared/system_prompt.txt` es la **fuente de verdad** del agente: define el
contrato JSON, los 14 tipos de acción, las reglas de multi-intención, las
cascadas y las reglas de gobierno. Si cambias el comportamiento del agente,
se cambia **ahí**, no en el código.

---

## 2. Las 5 formas de tenerlo en tu equipo

| # | Forma | Qué necesitas | Comando | Cuándo usarla |
|---|---|---|---|---|
| 1 | **Instalador `.exe`** | nada | doble clic en `LifeAgente.exe` | uso diario, para cualquier persona |
| 2 | **Script `.bat`** | Python 3.12+ y Node 20 | `desktop\INICIAR.bat` | quieres ver el código funcionando |
| 3 | **Docker** | Docker Desktop | `docker compose up` | quieres aislarlo todo |
| 4 | **Desarrollo** | Python 3.12+ y Node 20 | (ver abajo) | vas a cambiar código |
| 5 | **Codespaces** | nada (navegador) | botón *Code* en GitHub | quieres el entorno listo en la nube de GitHub |

### 2.1 Instalador `.exe` (recomendado)

1. Descarga: **https://github.com/brayanortiz906-lab/LifeSync-AI/releases/download/v1.0.0/LifeAgente.exe**
2. Doble clic. Se abre una ventana con la tarjeta **REQUISITOS**.
3. Si algo falta, pulsa **Instalar** (usa `winget`: Python, Docker Desktop, Node).
4. Pulsa **Iniciar LifeAgente** → se abre el navegador en `http://127.0.0.1:8000`.
5. Al **cerrar la ventana**: copia la base de datos y apaga el servidor.

> El `.exe` lleva dentro el motor, la API, el System Prompt y la interfaz
> compilada. No necesitas Python ni Node.

### 2.2 Script de arranque

```powershell
desktop\INICIAR.bat
```
Crea el entorno virtual, instala lo necesario, compila la interfaz, levanta
el servidor, abre el navegador y apaga todo al cerrar.

### 2.3 Docker

```powershell
docker compose up
# interfaz + API en http://127.0.0.1:8000
```
Los datos quedan en el volumen `lifesync-data` (carpeta `/data` del contenedor).

### 2.4 Desarrollo (API + interfaz con recarga en caliente)

```powershell
# Terminal 1 — API
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — interfaz
cd frontend
npm install
npm run dev          # http://127.0.0.1:5173
```

### 2.5 Codespaces (todo dentro de GitHub)

Botón *Code* → *Codespaces* → *Create codespace on main*. El `.devcontainer`
prepara Python 3.12 + Node 20, instala las dependencias y abre los puertos
8000 y 5173.

---

## 2.6 La app con IA propia, descargada en un clic

Si no quieres claves de IA ni cuentas: **descarga una IA ligera** (400 MB) y
queda en tu computador, sin internet y sin que nadie vea tus datos.

| Desde dónde | Cómo |
|---|---|
| **La app** | *Conectar IA* → si no hay motor, aparece la tarjeta **«Descarga una IA ligera»** con 4 modelos, su tamaño y una barra de progreso real |
| **El instalador** | ventana `LifeAgente.exe` → botón **«Descargar IA ligera»** (instala Ollama si falta y baja `qwen2.5:0.5b`) |

Modelos disponibles:

| Modelo | Tamaño | Nota |
|---|---|---|
| `qwen2.5:0.5b` | 400 MB | **recomendado** (rápido y suficiente) |
| `gemma3:1b` | 815 MB | mejor calidad, un poco más lento |
| `llama3.2:1b` | 1,3 GB | muy rápido |
| `phi3.5:mini` | 2,2 GB | el más pequeno de razonar |

> La IA local se detecta y se **conecta sola** al arrancar la app: no hay que
> hacer nada más. Detalle en [`docs/18-IA-LIGERA-Y-ACCESO.md`](docs/18-IA-LIGERA-Y-ACCESO.md).

## 2.7 Entrar con tu cuenta sin configurar nada

El identificador de cliente OAuth **es público** (va dentro de la app, como el
botón de "Continuar con Google" de cualquier sitio). Por eso el instalador o
el despliegue pueden traerlo ya puesto y la persona solo pulsa el botón:

```
Persona          LifeAgente            Google
   |  clic  ---------->|  device flow ----->|
   |<-- codigo + autorizar en el navegador ---|
   |  "Listo, ya autoricé" -->|  poll  ------->|
   |<--------- sesión con su correo y sus datos --|
```

La app busca el identificador en **4 sitios**, en este orden: variable de
entorno → credencial guardada → lo que pegaste en la app → el archivo público
`public/clientes-publicos.json`. Por eso **nadie tiene que pegar nada**.

---

## 3. Dónde se guardan tus datos (nada se pierde)

| Dato | Ubicación | Comentario |
|---|---|---|
| **Base de datos** (agenda, tareas, gastos, cuentas, paneles, auditoría) | `%APPDATA%\LifeAgente\lifesync.db` | se crea sola la primera vez |
| **Clave de cifrado** | `%APPDATA%\LifeAgente\secreto.txt` | **no la borres**: cifra tus credenciales de IA |
| **Copias de seguridad** | `%APPDATA%\LifeAgente\respaldos\` | una por fecha (`lifesync-AAAAMM-DD-HHMM.db`) |
| **Preferencias de la interfaz** (tema, orden, posición del chat) | navegador (localStorage) | en el equipo donde abriste la app |
| **Clave de IA y URL de la API** que pegas | navegador (localStorage) | `lifesync.apiKey`, `lifesync.apiUrl` |
| **Copia en la nube** | Google Drive (si autorizas el permiso) | respaldo automático + "Recuperar de Drive" |

> **Para migrar a otro equipo**: copia la carpeta entera `%APPDATA%\LifeAgente`
> y la pegas en el otro equipo. Con eso vas con tu agenda, tus cuentas y hasta
> tus credenciales de IA (van cifradas con la clave de `secreto.txt`).

---

## 4. Variables de entorno (opcionales)

Todas van en `backend/.env` (copia de `backend/.env.example`). **Ninguna es
obligatoria**: sin ellas la app funciona igual (modo local, motor de reglas).

| Variable | Para qué | Valor por defecto |
|---|---|---|
| `APP_SECRET_KEY` | clave maestra con la que se cifran las claves de IA | se genera y se guarda sola en `secreto.txt` |
| `DATABASE_URL` | dónde vive la base de datos | `sqlite:///%APPDATA%/LifeAgente/lifesync.db` |
| `DEFAULT_LLM_PROVIDER` | proveedor por defecto: `mock`, `demo`, `openai`, `gemini`, `anthropic`, `openrouter`, `ollama`, `lmstudio` | `mock` |
| `DEFAULT_OPENAI_MODEL` / `DEFAULT_GEMINI_MODEL` | modelo por defecto de cada proveedor | `gpt-4o-mini`, `gemini-2.0-flash` |
| `GOOGLE_CLIENT_ID` | activa «Continuar con Google», Drive, Calendar y resumen por correo | vacío |
| `OUTLOOK_CLIENT_ID` | activa el acceso con Outlook/Hotmail | vacío |
| `GITHUB_CLIENT_ID` | activa el acceso con GitHub | vacío |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_DESDE` | envío del código de verificación por correo (en Render gratis usa la API de Gmail) | vacíos (el código se muestra en pantalla) |
| `CRON_TOKEN` | protege la tarea diaria (`POST /api/permisos/ejecutar-todos`) | vacío |
| `DEFAULT_CURRENCY`, `DAY_START`, `DAY_END`, `DEFAULT_TIMEZONE` | moneda, jornada y zona horaria | `COP`, `07:00`, `22:00`, `America/Bogota` |
| `CORS_ORIGINS` | orígenes permitidos (separados por comas) | `http://localhost:5173,http://127.0.0.1:5173` |
| `LIFEAGENTE_DATA` | cambia la carpeta de datos (útil para portable) | `%APPDATA%\LifeAgente` |
| `LIFEAGENTE_BOOTSTRAP_URL` | de dónde se leen los identificadores públicos de las cuentas (Google/Outlook/GitHub) | el archivo `public/clientes-publicos.json` del repo |
| `VITE_API_URL` | **solo en el build de la web**: dirección de la API que usa la interfaz. Debe ser una **URL completa** (`https://servidor/api`) o **déjala vacía** si la API va en el mismo sitio | vacía (ruta relativa `/api`) |

> **El paso técnico lo hace una sola vez quien instala.** Quien usa la app solo
> hace clic en «Continuar con Google» y autoriza en el navegador.

---

## 5. La API (resumen)

| Prefijo | Qué hay |
|---|---|
| `/api/health` | estado del servidor |
| `/api/diagnostico` | esquema de la base de datos y problemas detectados (**mira esto si algo falla**) |
| `/api/agent/chat` | el chat (registra agenda, tareas, gastos, mantenimiento) |
| `/api/agent/history` | historial del chat |
| `/api/agent/ingest` | importar material (resumen + preguntas + bloque de estudio) |
| `/api/events`, `/api/tasks`, `/api/logbook`, `/api/maintenance` | datos CRUD |
| `/api/dashboard` | indicadores del día/mes |
| `/api/cuentas/*` | registro, entrar, código de verificación, Google/Outlook/GitHub, respaldo, sincronizar |
| `/api/permisos/*` | permisos, piloto automático, respaldo a Drive, importar Calendar, resumen por correo |
| `/api/paneles/*` | paneles, compartir, miembros, datos de un panel |
| `/api/conexiones/*` | catálogo de IAs, conexiones, verificación, ID de cliente de Google |
| `/api/responsabilidad/*` | política, auditoría, aprobaciones, redacción de PII, cumplimiento |

Documentación completa de cada área en `docs/`.

---

## 6. Mapa de archivos del sistema (qué hace cada uno)

### 6.1 Raíz

| Archivo | Para qué |
|---|---|
| `README.md` | resumen del proyecto y enlaces a la documentación |
| **`MANUAL-LOCAL.md`** | este manual: el sistema completo para tenerlo local |
| **`LEEME.txt`** | arranque rápido en texto plano (para quien no usa Markdown) |
| `LICENSE` | licencia MIT |
| `Dockerfile` | imagen multi-stage: compila la interfaz y la empaqueta con la API |
| `docker-compose.yml` | un comando para levantar todo con Docker |
| `render.yaml` | blueprint para desplegar en Render (1 clic) |
| `.gitignore` | qué no se sube (base de datos, entornos, compilados) |
| `empaquetar.ps1` | crea un ZIP con **todo el sistema** listo para llevar a otro equipo |

### 6.2 `shared/`

| Archivo | Para qué |
|---|---|
| `system_prompt.txt` | **fuente de verdad del agente**: identidad, taxonomía, contrato JSON, 14 tipos de acción, multi-intención, cascadas, reglas de gobierno y ejemplos. ~20 KB. Cambiar el comportamiento del agente = cambiar aquí |

### 6.3 `backend/app/` — el cerebro

| Archivo | Para qué |
|---|---|
| `main.py` | aplicación FastAPI: routers, CORS, sirve la interfaz compilada con *fallback* SPA, tarea diaria, manejador global de errores, `/api/diagnostico` |
| `config.py` | variables de entorno, rutas, carpeta de datos, clave estable, System Prompt |
| `database.py` | conexión SQLite, PRAGMA, migraciones seguras (añaden columnas sin perder datos) |
| `models.py` | tablas: evento, tarea, gasto, mantenimiento, chat, ajustes, política, auditoría, aprobación, conexión IA, permisos, usuario, panel, permiso de panel |
| `schemas.py` | validación de entrada/salida (Pydantic v2) |
| `agent.py` | **orquestador**: arma el contexto, llama a la IA, normaliza la respuesta, aplica las acciones, detecta conflictos y encadena las cascadas |
| `planner.py` | reorganiza el día sin solapes (respeta inamovibles, descansos y carga máxima) |
| `providers.py` | adaptadores a OpenAI, Gemini, Anthropic, OpenRouter, Ollama, LM Studio + motor local por reglas (`mock`/`demo`) |
| `policy.py` | gobernanza: qué se hace solo, qué pide aprobación, qué se bloquea; auditoría; redacción de datos personales |
| `connections.py` | catálogo de proveedores, OAuth (device flow), detección de IA local |
| `cuentas.py` | registro/entrada de usuarios, código de verificación, contraseñas (PBKDF2), aislamiento por `usuario_id` |
| `permisos.py` | permisos de Google (Drive/Calendar/correo), piloto automático, respaldo, sincronización |
| `paneles.py` | espacios de trabajo, compartir con nivel «ver»/«editar» |
| `security.py` | cifrado y descifrado de credenciales (Fernet) |
| `seed.py` | datos de ejemplo la primera vez |

### 6.4 `backend/app/routers/` — las puertas de la API

`crud.py` (datos), `agent.py` (chat), `cuentas.py` (usuarios), `permisos.py`
(permisos y nube), `paneles.py` (paneles), `conexiones.py` (IA), `responsabilidad.py`
(gobierno).

### 6.5 `backend/`

| Archivo | Para qué |
|---|---|
| `run.py` | arranque rápido de la API |
| `smoke.py` | **165  comprobaciones automáticas** de todo el sistema (`python smoke.py`) |
| `requirements.txt` | dependencias de Python |
| `.env.example` | plantilla de configuración |

### 6.6 `frontend/src/` — la interfaz

| Archivo | Para qué |
|---|---|
| `App.tsx` | armazón: pestañas, chat flotante, atajo Ctrl+K, banner de modo local/prueba |
| `types.ts` | todos los tipos de datos |
| `store/useLifeAgente.ts` | estado global (Zustand) y acciones |
| `lib/api.ts` | cliente HTTP + URL de la API configurable en caliente |
| `lib/format.ts` | fechas y dinero en español (es-CO) |
| `lib/motorLocal.ts` | **motor de reglas del navegador**: funciona sin IA y sin servidor |
| `lib/plantillas.ts` | 5 organizadores preestablecidos (estudiante, oficina, emprendedor, moto, simple) |
| `lib/useMediaQuery.ts` | detección de pantalla (escritorio / grande) |
| `components/` | `TopBar`, `Bienvenida`, `AccesoPanel`, `CalendarPanel`, `AcademicPanel`, `LogbookPanel`, `ChatFlotante`, `ChatBody`, `ConexionesPanel`, `PermisosPanel`, `PanelesPanel`, `ResponsibilityPanel`, `AjustesPanel`, `ContextoLateral`, `MenuMovil`, `ResumenMovil`, `ui` (primitivas) |

### 6.7 `desktop/` — el instalador

| Archivo | Para qué |
|---|---|
| `launcher.py` | ventana del instalador (tkinter): requisitos, instalar, iniciar, detener, guardar copia |
| `LifeAgente.spec` | receta de PyInstaller (qué va dentro del `.exe`) |
| `build.ps1` | compila el `.exe` en 4 pasos |
| `INICIAR.bat` | arranque sin compilar |
| `LEEME.txt` | instrucciones para quien instala |

### 6.8 `docs/` — la documentación

| Documento | Contenido |
|---|---|
| `01-ARQUITECTURA.md` | capas, decisiones, diagrama, modelo de datos |
| `02-SYSTEM-PROMPT.md` | el contrato JSON del agente |
| `03-INTEGRACION-API-KEY.md` | cómo conectar una clave de IA paso a paso |
| `05-RESPONSABILIDAD.md` | ISO 42001, EU AI Act, Ley 1581, reglas de gobierno |
| `06-CONE-XIONES.md` | catálogo de IAs y los 4 caminos para conectarlas |
| `07-AJUSTES.md` | temas, órdenes, formulario de bienvenida |
| `08-SISTEMA-VISUAL.md` | espaciado, tarjetas, modales (para que nada quede pegado) |
| `09-CUENTAS.md` | cuentas de usuario y aislamiento de datos |
| `10-DESPLIEGUE.md` | desplegar en Render/GitHub Pages + variables |
| `11-AUTENTICACION.md` | Firebase, Supabase, Clerk: comparativa y recomendación |
| `12-PERMISOS-Y-NUBE.md` | permisos, Drive, piloto automático |
| `13-MOTOR-LOCAL.md` | el motor de reglas y las plantillas |
| `14-RESPONSIVE.md` | diseño adaptable (3 columnas, menú móvil, 3 líneas) |
| `15-CUENTAS-Y-PANELES.md` | acceso sin callejones + paneles con permiso |
| `16-RESPALDO-Y-NUBE.md` | respaldo, verificación, error 500 explicado |
| `17-INSTALADOR-LOCAL.md` | el `.exe` en detalle |

### 6.9 `.github/`

| Archivo | Para qué |
|---|---|
| `workflows/ci.yml` | pruebas automáticas en cada push (backend + frontend) |
| `workflows/deploy-pages.yml` | publica la interfaz en GitHub Pages (rama `gh-pages`) |
| `workflows/daily.yml` | tarea diaria: despierta la API, respalda y manda el resumen |
| `workflows/build-installer.yml` | compila el `.exe` y publica la descarga |

---

## 7. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| «Error 404» / «Error 405» | abriste la interfaz sin API detrás | en *Conectar IA → Dirección de la API* pon `http://127.0.0.1:8000/api` (o la de tu servidor) |
| «Failed to fetch» desde la web | falta el origen en `CORS_ORIGINS` | añade `https://brayanortiz906-lab.github.io` en Render → Environment |
| Un 500 sin explicación | esquema de la base de datos desactualizado | mira `GET /api/diagnostico`; la app ahora arranca aunque la migración falle |
| «Este puerto ya está en uso» | hay otra LifeAgente corriendo | cierra la otra ventana, o cambia `LIFEAGENTE_PUERTO` |
| La IA tarda minutos | Ollama corre en CPU | normal: el modelo local razona en tu procesador |
| No guarda nada | la cuenta no está verificada | el código de 6 dígitos llega por correo; sin SMTP se muestra en pantalla |
| No aparecen los datos de antes | no hay respaldo o falta el permiso de Drive | *Permisos → Recuperar de Drive* y revisa *Autorizar todo* |
| Windows bloquea el `.exe` | SmartScreen | *Más información → Ejecutar de todas formas* |
| El chat no responde | no hay IA conectada | *Conectar IA* → Ollama (si la tienes) o una clave de API; sin nada, funciona el motor local |

---

## 8. Mantenimiento

```powershell
# 1. Comprobar que todo sigue bien (165  casos)
backend\.venv\Scripts\python.exe backend\smoke.py

# 2. Compilar la interfaz
cd frontend; npm run build; cd ..

# 3. Probar la API en vivo
Invoke-RestMethod http://127.0.0.1:8000/api/diagnostico | ConvertTo-Json -Depth 4

# 4. Empaquetar el sistema completo para otro equipo
powershell -ExecutionPolicy Bypass -File empaquetar.ps1

# 5. Compilar el instalador
powershell -ExecutionPolicy Bypass -File desktop\build.ps1

# 6. PUBLICAR la mejora (del PC -> GitHub -> Render) en un solo comando
powershell -ExecutionPolicy Bypass -File publicar.ps1 -Mensaje "fix(agenda): corrige X"
```

El paso 6 hace todo el camino: corre las 130 pruebas, compila la interfaz,
crea el commit, lo sube a GitHub, espera a que GitHub Actions termine en verde
y te dice donde mirar. **Render reconstruye solo** con cada push a `main`
(`autoDeploy: true`), asi que la nube queda actualizada sin tocar nada mas.

Reglas del proyecto (para no romperlo):

1. Español en todo; **nada de caracteres chinos** (hay un escaneo en el CI).
2. `Depends(get_db, scope="function")` en **todos** los routers (si no, el
   `commit` llega tarde y un `GET` inmediato no ve la fila recién escrita).
3. Las fechas se guardan con `aIso(new Date())` (hora local), nunca con
   `toISOString().slice(0,10)` (eso es UTC y desplaza el día).
4. Toda escritura nueva necesita su copia de seguridad: el respaldo a Drive
   solo guarda lo que se le dice.
5. El System Prompt manda: si el agente se comporta mal, se arregla en
   `shared/system_prompt.txt` antes que en el código.
