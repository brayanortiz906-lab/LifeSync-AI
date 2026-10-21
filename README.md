# LifeSync AI

**Asistente Integral de Vida y Productividad** — centraliza la rutina diaria, los estudios y
las finanzas/mantenimiento personal mediante un agente conversacional que planifica,
reorganiza tu agenda ante imprevistos y registra lo que te pasa en lenguaje natural.

[![CI](https://github.com/brayanortiz906-lab/LifeSync-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/brayanortiz906-lab/LifeSync-AI/actions/workflows/ci.yml)
[![Pages](https://github.com/brayanortiz906-lab/LifeSync-AI/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/brayanortiz906-lab/LifeSync-AI/actions/workflows/deploy-pages.yml)
[![Licencia](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

```
┌───────────────────────────────────────────┬──────────────────────┐
│  MI AGENDA (vista inicial)                │  ACADÉMICO + BITÁCORA│
│  calendario por franjas · resumen         │  (tareas y gastos)   │
│  academia · bitácora · mantenimiento       │                      │
└───────────────────────────────────────────┴──────────────────────┘
        ▲
        │  burbuja flotante (Ctrl+K) — el chat vive aparte, no tapa la agenda
```

---

## 1. Arranque rápido (2 minutos)

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env          # opcional: configura APP_SECRET_KEY
.\.venv\Scripts\python.exe run.py    # http://127.0.0.1:8000/docs
```

La base SQLite se crea sola y se siembra con datos de ejemplo (agenda, tareas, gastos,
mantenimiento) la primera vez.

### Frontend

```powershell
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Vite hace proxy de `/api` → `http://127.0.0.1:8000`, así que no hay CORS que configurar
en desarrollo.

### Probar sin API Key

Por defecto el backend arranca en **modo `demo`**: un clasificador local por reglas que
responde con el mismo contrato JSON. Sirve para demostrar el flujo completo (incluida la
reorganización de agenda) sin gastar tokens. Para conectar una IA real, ve a
**Conectar IA** en la barra superior.

### El Centro de Conexiones (conecta **cualquier** IA, sin jerga)

LifeSync no te obliga a saber qué es un token o una API key. El botón **Conectar IA**
abre un asistente con cuatro caminos, explicados en lenguaje llano:

| Camino | Qué necesitas | Costo |
|---|---|---|
| **Continuar con Google** | Un clic: entras con tu cuenta de Google y **después eliges con qué IA trabajar** | El de tu plan |
| **Ya tengo mi cuenta de IA** | Iniciar sesión con tu cuenta (Google, ChatGPT, Claude) — sin escribir tokens | El de tu plan |
| **Usar la IA de mi computador** | Nada: detecta el motor local solo (Ollama o LM Studio) | **Gratis, sin internet** |
| **Tengo una clave de API** | Una clave, con el link a la consola y los pasos numerados | Según el uso |
| **Solo quiero ver cómo funciona** | Nada | Gratis |

El camino de **cuenta** usa **OAuth 2.0 Device Authorization**, el estándar de "inicia
sesión con tu cuenta": LifeSync te da un **código corto**, abres el sitio del proveedor
en tu navegador, lo pegas y la autorización vuelve sola. **Nunca ves ni escribes tu
contraseña**, y los errores del proveedor se traducen a lenguaje llano antes de
mostrarse ("Ese ID de cliente no existe. Cópialo de nuevo desde el panel del
proveedor…").

LifeSync **detecta automáticamente** los motores locales y muestra los modelos que ya
tienes instalados:

```
GET /api/conexiones/locales
{"motores":[{"id":"ollama","nombre":"Ollama","modelos":["qwen2.5:latest","gemma4:26b", ...],
  "modelos_disponibles":5}],"total":1}
```

**«Continuar con Google» y elegir cualquier IA.** La tarjeta grande del modal inicia
el acceso con tu cuenta de Google (OAuth Device Flow) y, al autorizar, LifeSync te
enseña **todos** los proveedores para que elijas. El token de Google habilita
**Gemini** al instante; y a través de **OpenRouter** (cuyo acceso tiene *Sign in with
Google*) desbloqueas **468 modelos de 67 familias** —GPT, Claude, Gemini, Llama,
DeepSeek, Mistral…— con buscador y filtro por familia:

```
GET /api/conexiones/modelos?proveedor=openrouter
{"proveedor":"openrouter","total":468,"familias":[{"familia":"anthropic","modelos":8}, ...],
 "modelos":[{"id":"anthropic/claude-sonnet-4.5","nombre":"Anthropic: Claude Sonnet 4.5",
             "familia":"anthropic","gratis":false,"contexto":1000000}, ...]}
```

Si el despliegue define `GOOGLE_CLIENT_ID` (ver `backend/.env.example`), el botón
funciona en **un solo clic** sin que nadie escriba identificadores.

Ventajas que ya trae:

- **Los modelos locales no pierden tu frase**: si el modelo no devuelve el JSON del
  contrato, LifeSync cae al motor por reglas y registra lo que corresponde igual.
- **Credenciales cifradas** (Fernet) y nunca enviadas al navegador: la API solo dice
  `tiene_credencial: true/false`.
- **Conectores compatibles con OpenAI** (`lmstudio`, `openrouter`) reutilizan un mismo
  adaptador HTTP.
- Un solo proveedor activo a la vez; cambiar es un clic y desconectar limpia la clave.

Detalle completo en [`docs/06-CONE-XIONES.md`](docs/06-CONE-XIONES.md).

### Verificación automática

Con el backend corriendo, `backend/smoke.py` comprueba los 59 casos de uso contra la
base de datos real (calendario, bitácora, tareas, mantenimiento, multi-intención,
cascadas de registro automático, el sistema de IA responsable y el centro de conexiones):

```powershell
cd backend
.\.venv\Scripts\python.exe smoke.py
```

```
[OK  ] [CALENDARIO] devuelve plan de reorganizacion -> movidos=2
[OK  ] [MULTI] detecta 2 categorias -> categorias=['CALENDARIO', 'BITACORA_GASTO']
[OK  ] [CASCADA] tarea genera bloque de estudio
[OK  ] [RESP] gasto alto queda pendiente de aprobacion
[OK  ] [RESP] tras aprobar, el gasto SI queda registrado
...
RESULTADO: TODOS LOS CASOS PASARON
```

El script es **idempotente**: limpia las citas de corridas anteriores antes de
empezar, así que se puede repetir sin contaminar la base.

### El chat: habla y se registra todo

El chat es la puerta de entrada principal. Escribe en lenguaje natural, con una o
varias intenciones a la vez, y el agente registra **todo** automáticamente:

| Tu frase | Qué registra el agente |
|---|---|
| `Tengo una cita hoy a las 3 PM` | Evento **Cita** 15:00-16:00 (inamovible) + reorganiza el día |
| `Hoy tanqueé la moto por $20.000` | Gasto 20.000 COP, categoría **combustible** |
| `Tengo que entregar el ensayo el viernes` | Tarea con entrega + **bloque de estudio** agendado |
| `me toca cambiar el aceite de la moto` | Mantenimiento **Cambio de aceite** + evento en el calendario |
| `Pagué el cambio de aceite de la moto por 120 mil` | Gasto + **actualiza el próximo mantenimiento** |
| `Mañana tengo reunión a las 9 AM, además entrego el informe el jueves y me toca revisar los frenos` | Las **3 cosas** a la vez (3 categorías, 5 registros) |

Claves de la experiencia:

- **Multi-intención**: una sola frase con varias intenciones se segmenta por
  conectores (`y`, `además`, `también`, `luego`, `después`, `pero`, `entonces`,
  `,`, `;`) y cada fragmento se registra por separado.
- **Registro en cascada**: el código encadena las consecuencias (tarea → bloque de
  estudio; gasto de mantenimiento → próxima fecha; evento nuevo → reorganización).
- **Visibilidad**: bajo cada respuesta aparece el bloque verde **«Registrado
  automáticamente (N)»** con cada cosa guardada, y un chip por categoría.
- **Chat flotante y móvil, aparte de la agenda**: el asistente vive en una burbuja
  **arrastrable** (la agarras y la llevas a donde quieras; la posición se recuerda).
  `Ctrl+K` (o `Cmd+K`) la abre y la cierra, `Escape` la cierra, y desde su cabecera
  puedes ampliarla a pantalla casi completa. En el celular el panel ocupa toda la
  pantalla. La agenda manda: nunca tapa la información operativa.
- **Anti-duplicados**: repetir la misma cita actualiza el evento en vez de crear
  otro.
- **Sin API Key**: si el proveedor elegido no tiene clave, el backend cae al motor
  local (`mock`) y lo avisa en la respuesta; el chat nunca se rompe.

### La interfaz: la agenda manda, el chat acompaña

Al abrir LifeSync ves **«Mi agenda»**, no el chat. El chat es un **widget flotante**
(`frontend/src/components/ChatFlotante.tsx`) superpuesto, para que la conversación
tape lo que ya tenías en pantalla.

| Zona | Qué contiene |
|---|---|
| **Vista inicial «Mi agenda»** | Calendario por franjas (Mañana / Tarde / Noche) + resumen del día + tareas académicas + bitácora de gastos |
| **Tarjeta «Habla con tu asistente»** | Dentro de la propia agenda: un botón «Abrir el chat» para hablar sin salir de la vista |
| **Burbuja flotante** (arrastrable) | Acceso al chat desde cualquier vista; la mueves con el dedo o el ratón; puntos animados mientras el agente responde |
| **Panel del chat** | Burbuja → panel de 420 px pegado a la burbuja; botón «Ampliar» → casi pantalla completa; en móvil → pantalla completa |
| **Pestaña «Ajustes»** | Tu nombre, moneda, jornada, tema de color, cómo ordenar cada bloque y tus etiquetas |
| **Teclado** | `Ctrl+K` / `Cmd+K` alterna el chat · `Escape` lo cierra |

### Ajustes, temas y cómo ordenar lo que ves

LifeSync arranca con un **formulario de bienvenida** (3 pasos) la primera vez: te pide
tu nombre, tu jornada y el tema que prefieres, antes de que toques nada. Después, todo
lo demás vive en la pestaña **«Ajustes»** (`frontend/src/components/AjustesPanel.tsx`).

| Bloque de Ajustes | Qué puedes cambiar | Dónde se nota |
|---|---|---|
| **Sobre ti** | Nombre, moneda, hora de inicio y fin de tu jornada | Encabezado, métricas y agenda |
| **Tema de la app** | 4 temas: Medianoche, Océano, Bosque, Atardecer | Cambia la interfaz al instante (variables CSS, sin recargar) |
| **Cómo organizar lo que ves** | Orden de tareas (fecha / prioridad / tiempo / materia), de gastos (fecha / monto / categoría) y de agenda (hora / categoría / duración) | Paneles de tareas, gastos y calendario |
| **Tus temas / etiquetas** | Etiquetas libres (p. ej. *Universidad*, *Trabajo*) para clasificar a tu manera | Filtras y agrupadores |

Además, la agenda tiene **filtros por categoría** y la opción **«solo fijos»** (los
compromisos inamovibles que el agente nunca mueve).

Detalle completo en [docs/07-AJUSTES.md](docs/07-AJUSTES.md).

### El sistema de IA responsable

Un asistente que **escribe en tu base de datos** necesita justificar cada movimiento.
LifeSync incluye una capa de gobierno completa entre el modelo y la ejecución
(`backend/app/policy.py`): el LLM propone intenciones, la política decide si pueden
ejecutarse, y todo queda auditado.

| Mecanismo | Qué hace |
|---|---|
| **Gobernanza por reglas** | 7 reglas ordenadas: modo prudente, acción no reconocida (bloqueada), confianza baja, borrado irreversible, gasto sobre umbral, compromiso inamovible, motivo ausente |
| **Autonomía graduada** | Cada acción es `AUTONOMO`, `REQUIERE_APROBACION` o `BLOQUEADO`, siempre con motivo legible |
| **Bandeja de aprobaciones** | Lo que requiere permiso **no** se ejecuta: espera tu visto bueno en *Responsabilidad → Aprobaciones* |
| **Auditoría** | Bitácora append-only: actor, tipo, motivo, confianza, riesgo, reversible, entidad tocada |
| **Privacidad (PII)** | Cédulas, teléfonos, correos, tarjetas, claves y direcciones se enmascaran **antes** de salir del servidor |
| **Cumplimiento** | Reporte de 8 controles con marco ISO/IEC 42001, EU AI Act, OECD, Ley 1581, GDPR y NIST AI RMF |

Verificado en la interfaz: un gasto de 2.000.000 con umbral de 100.000 queda en la
bandeja con el motivo *"supera el límite autónomo"*, y al aprobarlo se registra, se audita
(`solicitud_aprobacion → aprobacion → accion → ejecucion_aprobada`) y desaparece de la
bandeja. Detalle completo en [docs/05-RESPONSABILIDAD.md](docs/05-RESPONSABILIDAD.md).

### Modo producción (un solo proceso)

`run.py` usa `--reload`, que en Windows deja un proceso *hijo* que puede sobrevivir y
seguir ocupando el puerto 8000. Si cambias código y "no se aplica", mata ambos:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

O arranca sin recarga: `.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`.

---

## 1-bis. Correr dentro de GitHub

El repositorio trae **toda la infraestructura** para que la app funcione sin instalar nada
en tu equipo. Hay tres caminos:

| Camino | Qué es | Para quién |
|---|---|---|
| **GitHub Codespaces** | Un VS Code en la nube con Python, Node, la API (8000) y la interfaz (5173) ya instalados | Quien quiere abrir, tocar y probar sin configurar nada |
| **GitHub Pages + Render** | La interfaz se publica en `brayanortiz906-lab.github.io/LifeSync-AI/` y la API corre en Render (Docker) | Quien quiere una URL pública que se pueda compartir |
| **Docker en tu equipo** | `docker compose up` levanta API + interfaz en un solo proceso | Quien ya usa contenedores |

### 1-bis.1 Codespaces (lo más rápido)

1. Abre el repositorio en GitHub → botón verde **Code** → **Codespaces** → **Create codespace on main**.
2. Espera a que termine `postCreate` (crea el venv, instala dependencias y compila la interfaz).
3. Abre el puerto **8000** en la pestaña *Ports* → se abre LifeSync AI en el navegador.

El `.devcontainer/devcontainer.json` ya trae Python 3.12, Node 20, y reenvía los puertos
8000 y 5173.

### 1-bis.2 Pages (interfaz) + Render (API)

- **Interfaz (Pages)**: el workflow `.github/workflows/deploy-pages.yml` compila el frontend
  y lo publica en GitHub Pages. Se activa en *Settings → Pages → Source → GitHub Actions*.
  URL pública de este despliegue: **https://underlanded4.github.io/LifeSync-AI/**
  (el repositorio canónico es `brayanortiz906-lab/LifeSync-AI`).
- **API (Render)**: el `render.yaml` del repo es un *Blueprint*: al abrirlo en Render se crea
  un servicio con Dockerfile, disco persistente en `/data` y healthcheck en `/api/health`.
- **Conectar una y otra**: hay dos formas, sin tocar el código:
  1. Define la variable de repositorio `VITE_API_URL` con la URL de tu API y el workflow de
     Pages la inyecta al compilar:

     ```bash
     gh variable set VITE_API_URL --body "https://<tu-api>/api" --repo underlanded4/LifeSync-AI
     ```

  2. O ábrela en caliente desde la interfaz: *Conectar IA → Dirección de la API*. Se guarda en
     tu navegador y no requiere recompilar nada.

### 1-bis.3 Docker

```bash
docker compose up --build          # http://localhost:8000
```

El `Dockerfile` es multi-stage: compila la interfaz con Node 20 y la sirve desde la misma
imagen de Python 3.12 que corre la API. La base SQLite vive en el volumen `/data`.

### 1-bis.4 Automatización (CI)

`.github/workflows/ci.yml` corre en cada push: levanta la API, ejecuta los **59 casos** de
`backend/smoke.py` (que incluyen el chat multi-intención, las cascadas, el sistema responsable
y el centro de conexiones) y compila el frontend con `tsc -b && vite build`. La insignia de
arriba refleja el estado real del último push.

---

## 2. Estructura del proyecto

```
.
├── .github/workflows/
│   ├── ci.yml                   ← CI: 63 casos del smoke test + build del frontend
│   └── deploy-pages.yml         ← Publica la interfaz en GitHub Pages
├── .devcontainer/               ← Codespaces: Python 3.12 + Node 20 preinstalados
├── Dockerfile                   ← Multi-stage: Node 20 compila, Python 3.12 sirve
├── docker-compose.yml           ← `docker compose up` y listo
├── render.yaml                  ← Blueprint para desplegar la API en Render
├── shared/
│   └── system_prompt.txt        ← FUENTE DE VERDAD del System Prompt (la usa el backend)
├── backend/
│   ├── app/
│   │   ├── main.py              ← FastAPI + CORS + sirve el build del frontend
│   │   ├── config.py            ← Settings (pydantic-settings)
│   │   ├── database.py          ← SQLAlchemy 2.0 + SQLite (+ migración de esquema)
│   │   ├── models.py            ← Event, Task, LogEntry, Maintenance, ChatMessage,
│   │   │                           AppSettings, PolicySettings, AuditLog, ApprovalRequest
│   │   ├── schemas.py           ← Pydantic v2 (API + contrato del agente)
│   │   ├── providers.py         ← Adaptadores OpenAI / Gemini / Anthropic / Ollama /
│   │   │                           OpenAI-compatible + motor por reglas (demo)
│   │   ├── planner.py           ← Planificador determinista (sin solapes)
│   │   ├── agent.py             ← Orquestador: contexto → LLM → política → acciones
│   │   ├── policy.py            ← Motor de gobierno: reglas, riesgo, PII, auditoría
│   │   ├── connections.py       ← Catálogo de proveedores, motores locales, verificación
│   │   ├── security.py          ← Cifrado Fernet de las credenciales
│   │   ├── seed.py              ← Datos de demostración
│   │   └── routers/
│   │       ├── crud.py          ← /api/events, /tasks, /logbook, /maintenance, /dashboard
│   │       ├── agent.py         ← /api/agent/chat, /ingest, /settings
│   │       ├── conexiones.py    ← /api/conexiones/* (catálogo, locales, activar, verificar)
│   │       └── responsabilidad.py ← /api/responsabilidad/* (política, auditoría,
│   │                                 aprobaciones, redacción, cumplimiento)
│   ├── requirements.txt
│   ├── run.py
│   └── smoke.py                 ← 63 verificaciones end-to-end contra la BD real
├── frontend/
│   └── src/
│       ├── App.tsx              ← Layout: agenda (vista inicial) + responsabilidad + ajustes
│       ├── store/useLifeSync.ts ← Estado global (Zustand) + tema y ajustes
│       ├── lib/api.ts           ← Cliente HTTP + manejo de la API Key local
│       ├── lib/format.ts        ← Fechas, moneda, duraciones (es-CO)
│       └── components/
│           ├── TopBar.tsx       ← Marca, navegación de fecha, KPIs, conexiones
│           ├── ChatFlotante.tsx ← Chat flotante móvil (burbuja arrastrable → panel → pantalla completa)
│           ├── ChatBody.tsx    ← Burbujas, ficha del agente, input, sugerencias
│           ├── ContextoLateral.tsx ← Resumen lateral (hoy, entregas, mes)
│           ├── CalendarPanel.tsx← Agenda día/semana/mes por franjas + filtros y orden
│           ├── ConexionesPanel.tsx ← Centro de Conexiones (4 caminos + Google, sin jerga)
│           ├── AcademicPanel.tsx← Tareas y resúmenes (derecha, ordenable)
│           ├── LogbookPanel.tsx ← Gastos y mantenimiento (derecha, ordenable)
│           ├── AjustesPanel.tsx  ← Ajustes (temas, órdenes, etiquetas) + bienvenida inicial
│           ├── ResponsibilityPanel.tsx ← Aprobaciones, auditoría, política, cumplimiento
│           └── ui.tsx           ← Atomos visuales (Modal con portal)
└── docs/
    ├── 01-ARQUITECTURA.md
    ├── 02-SYSTEM-PROMPT.md
    ├── 03-INTEGRACION-API-KEY.md
    ├── 05-RESPONSABILIDAD.md
    ├── 06-CONE-XIONES.md
    └── 07-AJUSTES.md
```

---

## 3. Documentación

| Documento | Contenido |
|---|---|
| [docs/01-ARQUITECTURA.md](docs/01-ARQUITECTURA.md) | Stack recomendado, diagrama, capas, modelo de datos, decisiones (ADR) |
| [docs/02-SYSTEM-PROMPT.md](docs/02-SYSTEM-PROMPT.md) | El System Prompt completo, el contrato JSON y cómo extenderlo |
| [docs/03-INTEGRACION-API-KEY.md](docs/03-INTEGRACION-API-KEY.md) | Paso a paso para conectar OpenAI / Gemini, seguridad, costos |
| [docs/05-RESPONSABILIDAD.md](docs/05-RESPONSABILIDAD.md) | Motor de política, reglas, PII, auditoría, aprobaciones y marco normativo |
| [docs/06-CONE-XIONES.md](docs/06-CONE-XIONES.md) | Centro de Conexiones: cualquier IA, sin claves, con IA local |
| [docs/07-AJUSTES.md](docs/07-AJUSTES.md) | Formulario inicial, temas, órdenes de cada bloque y etiquetas |

---

## 4. Flujos clave

### 4.1 Reorganización automática de agenda
1. El usuario escribe: *«Tengo una cita hoy a las 3 PM»*.
2. El agente clasifica → `[CALENDARIO]` y emite `crear_evento` (inamovible) +
   `replanificar_dia`.
3. `planner.py` calcula los huecos reales: los bloques **inamovibles** no se mueven, los
   flexibles (estudio, descanso) se recolocan minimizando el desplazamiento.
4. La UI se actualiza al instante y el chat muestra *«2 bloques reubicados»*.

### 4.2 Gasto en lenguaje natural
*«Hoy tanqueé la moto por $20.000»* → `[BITACORA_GASTO]` → se registra el gasto, se
categoriza como `combustible` y se actualiza el acumulado del mes.

### 4.3 Material académico
Panel derecho → **Importar** → se pega el contenido → el agente lo resume, genera
preguntas de estudio y agenda un bloque de práctica en el calendario.

### 4.4 Registro automático en cascada
El agente no solo ejecuta lo que pide: el **código** encadena las consecuencias y las
deja escritas en la base de datos.

| Disparo | Cascada automática |
|---|---|
| `crear_tarea` con fecha de entrega | `programar_estudio`: bloque de estudio en un hueco libre antes de la entrega |
| `registrar_gasto` de categoría `mantenimiento` | `registrar_mantenimiento`: recalcula la próxima fecha (intervalo) y avisa |
| `crear_evento` nuevo | `replanificar_dia`: reorganiza el resto del día sin solapes (una vez por fecha) |
| `resumir_material` | `crear_tarea` + `programar_estudio` |

Cada paso queda anotado en `resumen_estado.registros_detallados` y la interfaz lo
muestra en el bloque **«Registrado automáticamente (N)»**, de modo que el usuario ve
exactamente qué se guardó, sin tener que leer la base de datos.

### 4.5 Multi-intención (una frase, varios registros)
1. El usuario escribe: *«Mañana tengo una reunión de proyecto a las 9 AM, además entrego
   el informe de metodología el jueves y me toca revisar los frenos de la moto»*.
2. `providers.py` segmenta el mensaje por conectores (`además`, `y`, `,`, `;`…) y
   clasifica **cada fragmento** por separado.
3. Se acumulan las acciones de todas las categorías; `categoria` es la primaria y
   `categorias` las lista todas.
4. El agente responde con las 3 cosas hechas y la interfaz muestra 3 chips de categoría
   y 5 registros automáticos.

### 4.6 Decisión gobernada (IA responsable)
1. El usuario escribe: *«Pagué el refrigerador nuevo por 2 millones»*.
2. `providers.py` emite la intención `registrar_gasto` con su motivo.
3. `policy.py` la evalúa contra las 7 reglas → **REQUIERE_APROBACION** (regla
   `gasto_sobre_umbral`: 2.000.000 > 100.000). Se crea un `ApprovalRequest` y se audita.
4. El chat responde: *«Necesito tu confirmación para 1 acción(es)…»* con el bloque ámbar
   **«Requiere tu aprobación (1)»**.
5. En *Responsabilidad → Aprobaciones* el usuario pulsa **Aprobar y ejecutar**: la acción
   se ejecuta con `aprobada_por_usuario=True` y queda auditada como
   `ejecucion_aprobada`.

Si el mensaje trae datos personales, `policy.redactar_pii` los enmascara **antes** de
que salgan del servidor (cédula, teléfono, correo, tarjeta, clave, dirección) y la
operación se audita sin guardar los valores.

---

## 5. Producción (qué falta para desplegar)

- [ ] Cambiar `DATABASE_URL` a PostgreSQL y migrar a Alembic.
- [ ] Guardar la API Key en un gestor de secretos (no en el `.env` del servidor).
- [ ] Autenticación de usuarios (`/api` hoy es multiusuario sin login).
- [ ] RATE limiting y cuotas por usuario.
- [ ] Webhooks de Google Classroom / Notion (OAuth 2.0) para importar en segundo plano.
- [ ] Cola de tareas (Celery / arq) para resúmenes largos de PDF.
- [ ] Observabilidad: trazas por request + costo de tokens por usuario.
- [ ] **Autenticación y roles**: la auditoría marca el actor como `usuario` genérico; falta
  saber *quién* aprobó (y mantener la separación de responsabilidades).
- [ ] **Firma criptográfica** de `audit_log` para que sea *tamper-evident*.
- [ ] **Notificaciones** de aprobaciones fuera de la sesión (correo/push).
- [ ] **DPIA** (Ley 1581) firmada por el responsable del tratamiento.
