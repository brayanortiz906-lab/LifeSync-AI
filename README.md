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

Por defecto el backend arranca en **modo `demo`**: un clasificador local por reglas que
responde con el mismo contrato JSON. Sirve para demostrar el flujo completo (incluida la
reorganización de agenda) sin gastar tokens. Para conectar una IA real, ve a
**Conectar IA** en la barra superior.

### El Centro de Conexiones (conecta **cualquier** IA, sin jerga)

LifeSync no te obliga a saber qué es un token o una API key. El botón **Conectar IA**
abre un asistente con cuatro caminos, explicados en lenguaje llano:

| Camino | Qué necesitas | Costo |
|---|---|---|
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
- **Pantalla completa**: `Ctrl+K` (o `Cmd+K`) abre el chat a pantalla completa;
  `Escape` lo cierra. En móvil hay un botón flotante «Hablar con el agente».
- **Anti-duplicados**: repetir la misma cita actualiza el evento en vez de crear
  otro.
- **Sin API Key**: si el proveedor elegido no tiene clave, el backend cae al motor
  local (`mock`) y lo avisa en la respuesta; el chat nunca se rompe.

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

## 2. Estructura del proyecto

```
.
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
│   └── smoke.py                 ← 59 verificaciones end-to-end contra la BD real
├── frontend/
│   └── src/
│       ├── App.tsx              ← Layout: chat al centro + agenda + responsabilidad
│       ├── store/useLifeSync.ts ← Estado global (Zustand)
│       ├── lib/api.ts           ← Cliente HTTP + manejo de la API Key local
│       ├── lib/format.ts        ← Fechas, moneda, duraciones (es-CO)
│       └── components/
│           ├── TopBar.tsx       ← Marca, navegación de fecha, KPIs, conexiones
│           ├── ChatPanel.tsx    ← Contenedor del chat (panel o pantalla completa)
│           ├── ChatBody.tsx    ← Burbujas, ficha del agente, input, sugerencias
│           ├── ContextoLateral.tsx ← Resumen lateral del chat (hoy, entregas, mes)
│           ├── CalendarPanel.tsx← Agenda día/semana/mes por franjas (sin ambigüedad)
│           ├── ConexionesPanel.tsx ← Centro de Conexiones (4 caminos, sin jerga)
│           ├── AcademicPanel.tsx← Tareas y resúmenes (derecha)
│           ├── LogbookPanel.tsx ← Gastos y mantenimiento (derecha)
│           ├── ResponsibilityPanel.tsx ← Aprobaciones, auditoría, política, cumplimiento
│           └── ui.tsx           ← Atomos visuales
└── docs/
    ├── 01-ARQUITECTURA.md
    ├── 02-SYSTEM-PROMPT.md
    ├── 03-INTEGRACION-API-KEY.md
    ├── 05-RESPONSABILIDAD.md
    └── 06-CONE-XIONES.md
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
