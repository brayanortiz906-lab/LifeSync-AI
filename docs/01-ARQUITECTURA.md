# Arquitectura de LifeSync AI

## 1. Stack recomendado

| Capa | Tecnología | Por qué |
|---|---|---|
| **Frontend** | React 19 + Vite 7 + TypeScript + Tailwind CSS v4 | Arranque en segundos, HMR, tipado estricto, bundle pequeño |
| **Estado** | Zustand | Poco boilerplate, ideal para el store `useLifeSync` |
| **Fechas** | date-fns (locale es) | Ligero y tree-shakeable, sin la<Intl> headache de Moment |
| **Iconos** | lucide-react | Un solo paquete, consistente |
| **Backend** | FastAPI + Uvicorn | Async nativo, tipado con Pydantic v2, docs OpenAPI automáticas |
| **ORM / BD** | SQLAlchemy 2.0 + SQLite (→ Postgres) | Prototipo sin instalación; misma API al migrar |
| **IA** | Adaptadores propios `httpx` (OpenAI + Gemini) + proveedor `mock` | Sin dependencias pesadas; BYOK real; demo offline |
| **Seguridad** | `cryptography` (Fernet/AES-128) | Cifrado en reposo de la API Key del usuario |
| **Deploy (futuro)** | Docker + Postgres + nginx | Portabilidad total |

**Alternativas descartadas y por qué:**

- *Next.js full-stack*: rápido, pero para este proyecto el backend en Python da un agente
  mucho más natural (FastAPI + Pydantic + httpx) y separa mejor la lógica del planner.
- *Supabase/Firebase*:ceden el modelo de datos y las reglas de negocio a un proveedor;
  el proyecto es académico y necesita mostrar diseño de esquema propio.
- *LangChain*: añade una capa de abstracción que no aporta aquí (solo hay 2 proveedores y
  el agente es un único prompt estructurado). El System Prompt + el planner bastan.

---

## 2. Diagrama de arquitectura

```
┌──────────────────────────────────────────────────────────────────────┐
│                          NAVEGADOR (React)                          │
│                                                                      │
│  TopBar ── ChatPanel ──────────► api.ts (fetch + BYOK)              │
│            CalendarPanel                                                 │
│            AcademicPanel / LogbookPanel                               │
│            ResponsibilityPanel (política, auditoría, aprobaciones)   │
│            Zustand (useLifeSync) ← fuente única de verdad             │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTP /api/*  (Vite proxy en dev)
┌───────────────────────────────▼──────────────────────────────────────┐
│                        FASTAPI (backend/app)                         │
│                                                                      │
│  routers/crud.py    routers/agent.py   routers/responsabilidad.py     │
│        │                  │                       │                   │
│        │            ┌─────▼──────┐  ┌──────────────┐                │
│        │            │ agent.py   │─►│ providers.py │                │
│        │            │ contexto   │  │ OpenAI       │                │
│        │            │ → LLM      │  │ Gemini       │                │
│        │            │ → validar  │  │ mock (rules) │                │
│        │            │ → aplicar  │  └──────────────┘                │
│        │            └─────┬──────┘        ▲                          │
│        │                  │               │ system_prompt.txt         │
│        │            ┌─────▼──────┐        │ (shared/)                 │
│        │            │ policy.py  │  GOBIERNO: reglas, riesgo, PII,   │
│        │            │ ¿puede     │  auditoría, aprobación humana    │
│        │            │  ejecutar? │                                   │
│        │            └─────┬──────┘                                  │
│        │            ┌─────▼──────┐                                  │
│        │            │ planner.py │  determinista: sin solapes       │
│        │            └─────┬──────┘                                  │
│        │                  │                                          │
│        └──────────┬───────┴──────────────┐                           │
│                   ▼                      ▼                           │
│            SQLAlchemy 2.0 ─────────►  SQLite / Postgres              │
│                   │                                                   │
│            security.py (Fernet)  ◄──── AppSettings.api_key_cifrada    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. La decisión de diseño central: LLM = intención, código = ejecución

Este es el punto arquitectónico más importante del proyecto.

```
Usuario: "Tengo una cita hoy a las 3 PM"
          │
          ▼
   ┌──────────────────────────────┐
   │  LLM (understand + decide)  │  → categoría, intención, acciones,
   │  System Prompt estructurado │    prioridad, pero NO horas exactas
   └──────────────────────────────┘
          │  JSON: {categoria, acciones:[{tipo:"crear_evento"|"replanificar_dia"}]}
          ▼
   ┌──────────────────────────────┐
   │  planner.py (determinista)   │  → calcula huecos reales, aplica
   │  restricciones duras         │    inamovibles, minimiza el movim.
   └──────────────────────────────┘
          │
          ▼
   Base de datos (SQLAlchemy)
```

**Por qué separarlo:**

| Si el LLM calcula las horas | Si el planner calcula las horas |
|---|---|
| Inventa horas que no caben | Garantiza 0 solapes por construcción |
| No es determinista (misma pregunta ≠ mismo plan) | Reproducible y testeable |
| Imposible de validar con tests | 100 % testeable con unit tests |
| Se rompe con 20 eventos | Escala a cualquier cantidad |

El LLM **nunca** escribe en la base de datos: emite *intenciones tipadas* que un
dispatcher (`aplicar_acciones`) valida y ejecuta. Esto además abre la puerta a un
"undo" por acción y a la trazabilidad.

---

## 4. Capas del backend

| Módulo | Responsabilidad | No debe hacer |
|---|---|---|
| `config.py` | Settings, rutas, prompt maestro | Lógica de negocio |
| `database.py` | Engine, sesión, PRAGMA SQLite | Consultas de negocio |
| `models.py` | Esquema SQLAlchemy | Validación de entrada |
| `schemas.py` | Contrato Pydantic (API + agente) | Lógica |
| `providers.py` | Llamada HTTP al LLM + `extract_json` | Tocar la BD |
| `planner.py` | Resolución de conflictos de agenda | Interpretar lenguaje natural |
| `policy.py` | Gobierno: reglas, riesgo, PII, auditoría, aprobación | Ejecutar la acción por su cuenta |
| `agent.py` | Contexto → LLM → política → validar → aplicar | Hablar con la red directamente |
| `security.py` | Cifrar/descifrar la API Key | Guardar claves en claro |
| `routers/*` | HTTP puro (validar → servicio → responder) | Reglas de negocio |

---

## 5. Modelo de datos

```
                 ┌──────────────┐
                 │   AppSettings│  proveedor, modelo, api_key_cifrada
                 └──────────────┘

  ┌────────────┐        ┌────────────┐        ┌───────────────┐
  │   Event    │◄───────┤  LogEntry  ├───────►│  Maintenance  │
  │────────────│ evento_id        │        │───────────────│
  │ id         │        │ id        │        │ id            │
  │ titulo     │        │ descripcion│        │ activo        │
  │ categoria  │        │ monto     │        │ tarea         │
  │ inicio     │        │ moneda    │        │ intervalo_dias│
  │ fin        │        │ categoria │        │ ultima_realiz.│
  │ inamovible │        │ fecha     │        │ proxima_fecha │
  │ fuente     │        └────────────┘        │ costo_estimado│
  └────────────┘                              └───────────────┘
        ▲
        │ tarea_id
  ┌────────────┐        ┌──────────────┐
  │    Task    │◄───────┤ ChatMessage  │
  │────────────│        │──────────────│
  │ id         │        │ id           │
  │ titulo     │        │ rol          │
  │ materia    │        │ contenido    │
  │ fecha_entrega│      │ payload (JSON del agente)
  │ estado     │        │ categoria    │
  │ prioridad  │        └──────────────┘
  │ minutos    │
  │ resumen    │  ← generado por el agente
  │ preguntas  │  ← JSON list[str]
  │ material   │
  │ fuente     │  ← chat | classroom | notion | manual
  └────────────┘
```

**Decisiones:**
- `Task.tarea_id` enlaza una tarea con el bloque de estudio agendado en el calendario.
- `Event.inamovible` es el campo que el planner respeta como ancla dura.
- `Task.preguntas` y `ChatMessage.payload` guardan JSON como texto (compatible SQLite/Postgres).
- `fuente` permite auditar el origen de cada dato (manual, chat, classroom, notion).

---

## 6. Reglas de planificación (implementadas en `planner.py`)

1. **Jerarquía de restricciones**: inamovibles > semirrígidos > flexibles.
2. **Nunca solapar**: los bloques se colocan sobre huecos calculados, nunca por superposición.
3. **Movimiento mínimo**: se penaliza alejar un bloque de su hora original.
4. **Ventana de jornada**: por defecto 07:00–22:00, configurable por usuario.
5. **Margen entre bloques**: 10 min de buffer para evitar Agenda-"empastada".
6. **Carga máxima**: ~5 h de estudio profundo/día; por encima emite alerta de sobrecarga.
7. **Descanso protegido**: al menos un bloque de descanso si la carga supera 4 h seguidas.

---

## 7. Manejo de la salida del LLM

`providers.extract_json()` tolera el comportamiento real de los modelos:

1. Quita vallas ```` ```json ````.
2. Intenta `json.loads` directo.
3. Extrae el primer `{` … último `}`.
4. Si el JSON quedó truncado, intenta cerrar el objeto.

`agent._normalizar()` además mapea nombres alternativos de campo
(`categoria`/`categoría`, `acciones`/`actions`, `mensaje_usuario`/`message`) y valida
el rango de `confianza`. Si el JSON es irrecuperable, la API responde `502` con un mensaje
legible en lugar de un traceback.

---

## 8. Seguridad

| Amenaza | Mitigación |
|---|---|
| API Key expuesta en el repo | Vive en `localStorage` o cifrada en BD; nunca en el código |
| API Key en reposo en el servidor | Fernet (AES-128-CBC + HMAC) con `APP_SECRET_KEY` |
| Prompt injection desde un documento importado | El material entra en un prompt de *resumen*, no en el prompt del agente con herramientas de escritura |
| Coste descontrolado de tokens | Cuotas por usuario + proveedor `mock` para demos |
| Exposición de la API | CORS restringido a `localhost` en desarrollo; proxy Vite |

---

## 8bis. La capa de gobierno (IA responsable)

Entre el LLM y la ejecución hay una capa que decide **qué se permite hacer**:

```
LLM → intenciones tipadas → policy.py → AUTONOMO | REQUIERE_APROBACION | BLOQUEADO → agent.py
```

`policy.py` aplica 7 reglas ordenadas (modo prudente, acción no reconocida, confianza
baja, borrado irreversible, gasto sobre umbral, compromiso inamovible, motivo ausente),
clasifica el riesgo de cada tipo de acción, redacta los datos personales antes de que
salgan del servidor y escribe cada decisión en `audit_log`.

Lo que no pasa el filtro **no se ejecuta**: se crea un `ApprovalRequest` y espera al
usuario en la bandeja de *Responsabilidad → Aprobaciones*.

| Módulo | Responsabilidad |
|---|---|
| `policy.py` | `evaluar_accion`, `redactar_pii`, `registrar_auditoria`, `crear_aprobacion`, `reporte_cumplimiento` |
| `routers/responsabilidad.py` | Política, auditoría, aprobaciones, redacción, cumplimiento, inventario de datos |

Detalle completo en [05-RESPONSABILIDAD.md](05-RESPONSABILIDAD.md).

---

## 9. Roadmap técnico

| Fase | Entregable |
|---|---|
| **v1 (este repo)** | Chat + calendario + tareas + bitácora + planner + BYOK |
| **v1.05 (este repo)** | IA responsable: gobierno, auditoría, aprobación humana, PII, cumplimiento |
| v1.1 | Login multiusuario, Postgres, Alembic, tests unitarios del planner |
| v1.2 | OAuth Google Classroom (tareas/entregas) y Notion (bases de datos) |
| v1.3 | Worker asíncrono para PDFs largos + vectorización para el chat de.material |
| v2 | Recordatorios push, voz (STT/TTS), wearable, predicción de sobrecarga |

---

## 10. Pruebas del planner (extracto)

```python
def test_no_solapa_con_inamovible():
    dia = date(2026, 10, 20)
    ocupados = [Interval(datetime(2026,10,20,15,0), datetime(2026,10,20,16,0))]
    plan = replanificar(dia, datetime(2026,10,20,15,0),
                        [Bloque("Estudio", 60)], ocupados)
    assert all(a["inicio"] < "2026-10-20T15:00" or a["fin"] > "2026-10-20T16:00"
               for a in plan.asignaciones)

def test_respeta_ventana_de_jornada():
    plan = replanificar(date(2026,10,20), None, [Bloque("Estudio", 120)],
                        [], inicio_jornada="07:00", fin_jornada="10:00")
    assert all(a["fin"] <= "2026-10-20T10:00" for a in plan.asignaciones)
```
