# 02 — System Prompt y Contrato JSON

> **Fuente de verdad:** [`shared/system_prompt.txt`](../shared/system_prompt.txt)
> El backend lo carga en caliente desde ese archivo (`backend/app/config.py` → `settings.system_prompt`).
> Si editas el prompt, **no toques** `agent.py` ni `providers.py`: el archivo es el único lugar a editar.

---

## 1. Por qué un prompt que devuelve JSON

El agente no habla con el usuario directamente: habla con **tu base de datos**. Por eso su
salida no es texto, es un **contrato JSON estricto** que el backend valida con Pydantic y
ejecuta. Esto te da:

| Problema | Sin JSON | Con JSON (este diseño) |
|---|---|---|
| Alucinación de datos | El modelo inventa horas/precios en prosa | El modelo llena campos tipados; Pydantic rechaza lo que no cuadra |
| Trazabilidad | No sabes qué cambió en la BD | Cada `accion` queda auditada con `motivo` |
| Regresiones | Cambias el prompt y rompe 3 cosas | `AgentAction` es un enum: el compilador te avisa |
| Auditoría | Imposible de automatizar | `respuesta_estado` con IDs de lo creado |

---

## 2. Anatomía del prompt

`shared/system_prompt.txt` tiene 7 secciones:

| Sección | Contenido | Por qué importa |
|---|---|---|
| 1. Identidad y misión | 4 principios innegociables | Define "ejecuta, no solo sugieras" |
| 2. Taxonomía | 5 categorías + reglas de desempate | Una sola categoría primaria por mensaje |
| 3. Contrato de salida | Esquema JSON + 3.1 fechas + 3.2 esquemas de `datos` | La parte que el backend parsea |
| 4. Reglas de planificación | Jerarquía inamovible > semirrígido > flexible | El LLM da intención; el planner calcula huecos |
| 5. Reglas por categoría | Comportamiento específico de cada categoría | Reduce ambigüedad en montos y entregas |
| 6. Estilo de respuesta | 1–4 frases, números concretos | La UI muestra esto como burbuja del agente |
| 7. Ejemplos | 3 casos completos (cita / gasto / saludo) | Few-shot: ancla el formato exacto |

### Los 4 principios (sección 1)

1. **Ejecuta, no solo sugieras.** Un hecho reportado se registra.
2. **No inventes datos.** Si falta algo imprescindible, infiere del contexto y márcalo en `notas`; si es arriesgado, pregunta con `requiere_confirmacion: true`.
3. **El usuario manda.** Los inamovibles nunca se mueven sin permiso explícito.
4. **Contexto sobre suposiciones.** Resuelve "hoy", "mañana", "lo de la tarde" con el bloque `CONTEXTO DEL USUARIO`, nunca con la fecha del modelo.

---

## 3. Contrato JSON (copia literal del prompt)

```json
{
  "categoria": "CALENDARIO | TAREA_ACADEMICA | BITACORA_GASTO | MANTENIMIENTO | CONVERSACION",
  "categorias": ["CALENDARIO", "BITACORA_GASTO"],
  "intencion": "string breve en minúsculas, máx. 80 caracteres",
  "confianza": 0.0,
  "mensaje_usuario": "Respuesta en español, 1 a 4 frases. Confirma qué se hizo y qué sigue.",
  "requiere_confirmacion": false,
  "acciones": [
    {
      "tipo": "crear_evento | actualizar_evento | eliminar_evento | replanificar_dia | mover_bloque | crear_tarea | actualizar_tarea | completar_tarea | resumir_material | programar_estudio | registrar_gasto | registrar_mantenimiento | programar_mantenimiento | marcar_realizado",
      "datos": { },
      "motivo": "string breve: por qué se hace esta acción"
    }
  ],
  "alertas": [
    { "tipo": "mantenimiento_vencido | pago_pendiente | entrega_proxima | carga_excesiva", "texto": "string", "prioridad": "alta | media | baja" }
  ]
}
```

### Equivalencia campo → modelo

| Campo JSON | Tipo Pydantic (`backend/app/schemas.py`) | Uso |
|---|---|---|
| `categoria` | `str` (validado contra enum) | Chip de color en la burbuja del agente |
| `categorias` | `list[str]` | Todas las categorías detectadas (multi-intención) |
| `intencion` | `str` | Trazabilidad / debug |
| `confianza` | `float` 0.0–1.0 | Se muestra como "%" en la UI |
| `mensaje_usuario` | `str` | Texto que ve el usuario en el chat |
| `requiere_confirmacion` | `bool` | Botón "Confirmar" en la UI |
| `acciones[]` | `list[AgentAction]` | Se ejecutan contra la BD |
| `alertas[]` | `list[AgentAlert]` | Chips naranjas/rojos en la burbuja |

### 3.1 Multi-intención: `categoria` vs `categorias`

La sección 2.1 del prompt obliga a **una acción por intención**. Cuando el mensaje trae
varias cosas, el contrato se rellena así:

| Mensaje | `categoria` | `categorias` | `acciones[]` |
|---|---|---|---|
| *«Tengo una cita a las 3 PM»* | `CALENDARIO` | `["CALENDARIO"]` | `crear_evento`, `replanificar_dia` |
| *«Tengo una cita a las 4 PM y además gasté 25 mil en gasolina»* | `CALENDARIO` (primaria) | `["CALENDARIO","BITACORA_GASTO"]` | `crear_evento`, `registrar_gasto`, `replanificar_dia` |

Reglas:

- `categoria` = la intención **dominante** (la primera del mensaje); nunca se omiten
  acciones de las demás categorías.
- `categorias` = lista de **todas** las categorías detectadas, sin duplicados.
- `alertas[]` puede mezclar tipos: cada intención aporta sus propias alertas.
- Si el mensaje es solo conversación → `categorias: ["CONVERSACION"]` y `acciones: []`.
- `confianza` baja un poco en respuestas mixtas (≈0.8) porque hay más superficie de error.

El backend no confía en `categorias`: `agent._normalizar()` la deduce de los tipos de
acción si el modelo no la envía, de modo que la UI siempre refleja lo que realmente
se ejecutó.

### 3.2 Registro en cascada (sección 5.1 del prompt)

El prompt pide la acción **explícita**; las **cascadas** las ejecuta el código
(`agent.aplicar_acciones`), para que un modelo no las olvide:

| Acción emitida | Cascada automática en código |
|---|---|
| `crear_tarea` con `fecha_entrega` | `programar_estudio` en un hueco libre antes de la entrega |
| `registrar_gasto` con `categoría: "mantenimiento"` | `registrar_mantenimiento` (recalcula `proxima_fecha`) |
| `crear_evento` nuevo | `replanificar_dia` (una vez por fecha) |
| `resumir_material` | `crear_tarea` + `programar_estudio` |

Todo lo que queda guardado se anota en `resumen_estado.registros_detallados`
(`{tipo, titulo, detalle}`) y la interfaz lo muestra bajo **«Registrado
automáticamente (N)»**.

---

## 4. Los 14 tipos de acción

| Tipo | `datos` mínimos | Efecto en la BD |
|---|---|---|
| `crear_evento` | `titulo`, `categoria`, `inicio`, `fin`, `inamovible` | INSERT en `events` |
| `actualizar_evento` | `id`, campos a cambiar | UPDATE en `events` |
| `eliminar_evento` | `id` | DELETE en `events` |
| `replanificar_dia` | `fecha`, `bloques_a_organizar[]` | Dispara `planner.replanificar` → mueve/crea eventos |
| `mover_bloque` | `id`, `inicio`, `fin` | UPDATE de horario |
| `crear_tarea` | `titulo`, `fecha_entrega`, `prioridad` | INSERT en `tasks` |
| `actualizar_tarea` | `id`, `cambios{}` | UPDATE en `tasks` |
| `completar_tarea` | `id` | `estado = "completada"` |
| `resumir_material` | `titulo`, `material`, `preguntas_estudio[]` | INSERT en `tasks` + `resumen` + `preguntas` |
| `programar_estudio` | `titulo`, `inicio`, `fin` | INSERT en `events` (cat. `estudio`) |
| `registrar_gasto` | `descripcion`, `monto`, `moneda`, `categoria` | INSERT en `logbook` |
| `registrar_mantenimiento` | `activo`, `tarea`, `intervalo_dias` | UPSERT en `maintenance` |
| `programar_mantenimiento` | `activo`, `tarea`, `fecha`, `hora` | UPSERT + evento en `events` |
| `marcar_realizado` | `id`, `fecha`, `costo_real` | Actualiza `ultima_realizacion` / `proxima_fecha` |

---

## 5. Reglas de planificación (sección 4 del prompt)

Estas reglas NO las ejecuta el modelo — las ejecuta `backend/app/planner.py`. El modelo solo
dice *qué* es inamovible y *en qué orden* reubicar.

```
Jerarquía de restricciones
├── 1. INAMOVIBLES  (trabajo, clases fijas, citas)      → jamás se mueven
├── 2. SEMIRRÍGIDOS (entregas, cuidado personal)          → se mueven lo mínimo, siempre antes del deadline
└── 3. FLEXIBLES    (estudio, descanso, hobbies)          → libre dentro de la franja permitida
```

| Regla | Constante / implementación |
|---|---|
| Nunca solapar dos eventos | `planner.calcular_huecos` + `BUFFER_MIN = 10` |
| Ventana de jornada | `settings.day_start` / `day_end` (07:00–22:00) |
| Carga máx. de estudio | ~5 h/día → alerta `carga_excesiva` |
| Descanso protegido | ≥ 1 bloque de 30 min si hay carga > 4 h seguidas |
| Movimiento mínimo | Se mueve el bloque **flexible y más cercano**, no el más importante |
| Conflicto irresoluble | `requiere_confirmacion: true` + pregunta; NO se ejecuta |

---

## 6. Formato de fechas y horas (sección 3.1)

- **ISO 8601 local sin zona**: `"2026-10-20T15:00:00"`.
- "Hoy" = `fecha_actual` del bloque `CONTEXTO DEL USUARIO`, **nunca** la fecha del modelo.
- Duraciones por defecto: cita 60 min · clase 90 min · descanso 30 min · estudio 45–60 min · tarea rápida 30 min.

---

## 7. Del JSON a la base de datos

```
POST /api/agent/chat
   │
   ├─ 1. construir_contexto(db)      → fecha_actual, eventos_hoy, tareas, gastos, mantenimiento
   ├─ 2. providers.complete()        → system_prompt.txt + contexto + mensaje del usuario
   ├─ 3. providers.extract_json()    → tolera ```json, JSON truncado, texto alrededor
   ├─ 4. agent._normalizar()         → mapea campos alternativos del modelo
   ├─ 5. AgentResponse.model_validate → Pydantic valida (si falla → error 422 al cliente)
   ├─ 6. agent.aplicar_acciones()    → ejecuta cada acción tipada contra la BD
   ├─ 7. agent._detectar_conflictos()→ avisa si el nuevo evento se cruza con otro
   └─ 8. respuesta_estado            → IDs creados + plan (qué se movió) + conflictos
```

**El LLM nunca escribe directo en la BD.** Solo emite intenciones; `aplicar_acciones` las valida
y las ejecuta. Por eso un modelo mediocre degrada la calidad del plan, pero **no puede corromper datos**.

---

## 8. Ajustar el prompt sin romper nada

1. Edita `shared/system_prompt.txt`.
2. Reinicia el backend (uvicorn `--reload` lo recarga solo; `settings.system_prompt` se lee al importar).
3. Prueba con el proveedor `mock` → no consume tokens y **no ejecuta el prompt real** (el mock
   clasifica por reglas). Para probar el prompt de verdad necesitas una API Key real.
4. Valida el JSON con `backend/app/schemas.py` (`AgentResponse.model_validate`).

> Consejo: cuando agregues un tipo de acción, actualiza **las tres** capas:
> prompt (esquema) → `schemas.py` (`AgentAction.tipo` como enum) → `agent.aplicar_acciones` (dispatcher).
> Si olvidas una, el backend devuelve un error claro en `respuesta_estado["errores"]`.

---

## 9. Referencia rápida

| Quiero… | Cambió en el prompt |
|---|---|
| Que no invente montos | Sección 5 `[BITACORA_GASTO]`: exigir confirmación si la moneda no está clara |
| Que priorice el descanso | Sección 4: bajar el umbral de "carga > 4 h seguidas" |
| Que use otro rango horario | Sección 3.1 + `backend/.env` (`DAY_START`, `DAY_END`) |
| Que responda en otro idioma | Sección 0 (encabezado) y sección 6 |
| Que sea más estricto con entregas | Sección 5 `[TAREA_ACADEMICA]`: bajar el umbral de "alta prioridad" de 48 h |
