# LifeSync AI

**Asistente Integral de Vida y Productividad** — centraliza la rutina diaria, los estudios y
las finanzas/mantenimiento personal mediante un agente conversacional que planifica,
reorganiza tu agenda ante imprevistos y registra lo que te pasa en lenguaje natural.

```
┌────────────┬──────────────────────────┬──────────────────────┐
│  AGENTE    │      CALENDARIO          │  ACADÉMICO + BITÁCORA│
│  (chat)    │  (día / semana / mes)    │  (tareas y gastos)   │
└────────────┴──────────────────────────┴──────────────────────┘
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

Por defecto el backend arranca en **modo `mock`**: un clasificador local por reglas que
responde con el mismo contrato JSON. Sirve para demostrar el flujo completo (incluida la
reorganización de agenda) sin gastar tokens. Para activar OpenAI o Gemini, ve a
**Conectar IA** en la barra superior y pega tu clave.

### Verificación automática

Con el backend corriendo, `backend/smoke.py` comprueba los 4 casos de uso contra la
base de datos real:

```powershell
cd backend
.\.venv\Scripts\python.exe smoke.py
```

```
[OK  ] [CALENDARIO] devuelve plan de reorganizacion -> movidos=2
[OK  ] anti-duplicado: 1 sola cita tras 2 pedidos identicos -> encontradas=1
[OK  ] [BITACORA_GASTO] monto 20000 correcto
...
RESULTADO: TODOS LOS CASOS PASARON
```

### Modo producción (un solo proceso)

`run.py` usa `--reload`, que en Windows deja un proceso *hijo* que puede sobrevivir y
seguir ocupando el puerto 8000. Si cambias código y "no se aplica", mata ambos:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

O arranca sin recarga: `.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`.

---

## 2. Estructura del proyecto

```
.
├── shared/
│   └── system_prompt.txt        ← FUENTE DE VERDAD del System Prompt (la usa el backend)
├── backend/
│   ├── app/
│   │   ├── main.py              ← FastAPI + CORS + sirve el build del frontend
│   │   ├── config.py            ← Settings (pydantic-settings)
│   │   ├── database.py          ← SQLAlchemy 2.0 + SQLite
│   │   ├── models.py            ← Event, Task, LogEntry, Maintenance, ChatMessage, AppSettings
│   │   ├── schemas.py           ← Pydantic v2 (API + contrato del agente)
│   │   ├── providers.py         ← Adaptadores OpenAI / Gemini / mock + extract_json
│   │   ├── planner.py           ← Planificador determinista (sin solapes)
│   │   ├── agent.py             ← Orquestador: contexto → LLM → validación → acciones
│   │   ├── security.py          ← Cifrado Fernet de la API Key
│   │   ├── seed.py              ← Datos de demostración
│   │   └── routers/
│   │       ├── crud.py          ← /api/events, /tasks, /logbook, /maintenance, /dashboard
│   │       └── agent.py         ← /api/agent/chat, /ingest, /settings
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   └── src/
│       ├── App.tsx              ← Layout de 3 paneles
│       ├── store/useLifeSync.ts ← Estado global (Zustand)
│       ├── lib/api.ts           ← Cliente HTTP + manejo de la API Key local
│       ├── lib/format.ts        ← Fechas, moneda, duraciones (es-CO)
│       └── components/
│           ├── TopBar.tsx       ← Marca, navegación de fecha, KPIs, ajustes
│           ├── ChatPanel.tsx    ← Chat con el agente (izquierda)
│           ├── CalendarPanel.tsx← Calendario día/semana/mes (centro)
│           ├── AcademicPanel.tsx← Tareas y resúmenes (derecha)
│           ├── LogbookPanel.tsx ← Gastos y mantenimiento (derecha)
│           ├── SettingsModal.tsx← Configuración de proveedor y clave
│           └── ui.tsx           ← Atomos visuales
└── docs/
    ├── 01-ARQUITECTURA.md
    ├── 02-SYSTEM-PROMPT.md
    └── 03-INTEGRACION-API-KEY.md
```

---

## 3. Documentación

| Documento | Contenido |
|---|---|
| [docs/01-ARQUITECTURA.md](docs/01-ARQUITECTURA.md) | Stack recomendado, diagrama, capas, modelo de datos, decisiones (ADR) |
| [docs/02-SYSTEM-PROMPT.md](docs/02-SYSTEM-PROMPT.md) | El System Prompt completo, el contrato JSON y cómo extenderlo |
| [docs/03-INTEGRACION-API-KEY.md](docs/03-INTEGRACION-API-KEY.md) | Paso a paso para conectar OpenAI / Gemini, seguridad, costos |

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

---

## 5. Producción (qué falta para desplegar)

- [ ] Cambiar `DATABASE_URL` a PostgreSQL y migrar a Alembic.
- [ ] Guardar la API Key en un gestor de secretos (no en el `.env` del servidor).
- [ ] Autenticación de usuarios (`/api` hoy es multiusuario sin login).
- [ ] RATE limiting y cuotas por usuario.
- [ ] Webhooks de Google Classroom / Notion (OAuth 2.0) para importar en segundo plano.
- [ ] Cola de tareas (Celery / arq) para resúmenes largos de PDF.
- [ ] Observabilidad: trazas por request + costo de tokens por usuario.
