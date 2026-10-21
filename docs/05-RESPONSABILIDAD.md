# 05 · Sistema de IA Responsable (gobierno, auditoría y control humano)

> LifeSync AI no es solo un asistente que responde: es un **sistema de IA** que escribe en
> tu base de datos. Eso lo obliga a responder por tres preguntas: **¿por qué lo hizo?**
> (trazabilidad), **¿puedo reversarlo?** (control humano) y **¿qué datos mías salió?** (privacidad).
>
> Este documento describe el módulo implementado, las reglas que decide y el marco normativo
> que cubre.

---

## 1. Principio de diseño

```
Usuario ──▶ providers (LLM)  ──▶ policy.py (GOBIERNO)  ──▶ agent.py (EJECUCIÓN)  ──▶ SQLite
                 │                     │                        │
          intenciones             decide si se               ejecuta solo lo
          tipadas (JSON)          ejecuta, audita            AUTONOMO
```

El LLM **nunca** escribe en la base de datos: propone intenciones. `policy.py` es la capa
intermedia que traduce «qué se pidió» en «qué se permite». `agent.py` ejecuta únicamente
lo que la política autorizó.

| Decisión | Significado | Efecto |
|---|---|---|
| `AUTONOMO` | La acción cumple la política | Se ejecuta y se audita |
| `REQUIERE_APROBACION` | Riesgo medio/alto o confianza baja | **No se ejecuta**: entra en la bandeja |
| `BLOQUEADO` | Acción no reconocida o fuera de alcance | No se ejecuta y se registra el bloqueo |

---

## 2. Las 7 reglas de decisión

`backend/app/policy.py` → `evaluar_accion(accion, politica, confianza)` evalúa en orden y
devuelve una `Decision` con `nivel`, `regla`, `motivo`, `riesgo` y `confianza`:

| # | Regla | Condición | Resultado |
|---|---|---|---|
| 1 | `modo_prudente` | Política global activada | **Todo** requiere aprobación |
| 2 | `accion_no_reconocida` | El tipo de acción no está en el catálogo | **BLOQUEADO** |
| 3 | `confianza_baja` | `confianza < politica.umbral_confianza` (0.65) | Requiere aprobación |
| 4 | `borrado_irreversible` | `eliminar_evento` | Requiere aprobación |
| 5 | `gasto_sobre_umbral` | `registrar_gasto` con `monto > politica.gasto_max_autonomo` (100.000) | Requiere aprobación |
| 6 | `compromiso_inamovible` | `actualizar_evento` que toca un evento `inamovible` | Requiere aprobación |
| 7 | `motivo_ausente` | La acción no trae `motivo` (y `exigir_motivo` está activo) | Requiere aprobación |
| — | `dentro_de_politica` | Ninguna de las anteriores | **AUTONOMO** |
| — | `aprobada_por_usuario` | El usuario aprobó manualmente en la bandeja | AUTONOMO (confianza 1.0) |

El motivo es siempre **legible en español** y aparece en la interfaz, para que la decisión
sea explicable y no una caja negra.

### Matriz de riesgo por tipo de acción

| Riesgo | Acciones |
|---|---|
| **Alto** | `eliminar_evento` |
| **Medio** | `registrar_gasto`, `actualizar_evento`, `replanificar_dia`, `programar_mantenimiento`, `registrar_mantenimiento` |
| **Bajo** | `crear_evento`, `crear_tarea`, `actualizar_tarea`, `completar_tarea`, `resumir_material`, `programar_estudio`, `marcar_realizado`, `eliminar_*` de tareas/bitácora |

---

## 3. Parámetros de gobierno

Configurables en caliente desde **Responsabilidad → Política** (`PUT /api/responsabilidad/politica`):

| Parámetro | Por defecto | Efecto |
|---|---|---|
| `umbral_confianza` | `0.65` | Confianza mínima para actuar solo |
| `gasto_max_autonomo` | `100000.0` | Tope de gasto que se registra sin permiso |
| `max_acciones_por_mensaje` | `12` | Techo de acciones por mensaje (exceso se trunca y se audita) |
| `modo_prudente` | `false` | Interruptor maestro: todo requiere aprobación |
| `eliminar_requiere_aprobacion` | `true` | Borrados siempre con visto bueno |
| `gasto_alto_requiere_aprobacion` | `true` | Aplica la regla 5 |
| `baja_confianza_requiere_aprobacion` | `true` | Aplica la regla 3 |
| `exigir_motivo` | `true` | Aplica la regla 7 |
| `redactar_pii` | `true` | Mascarar datos personales antes de enviar al LLM |
| `registrar_auditoria` | `true` | Persistir la bitácora de decisiones |
| `permitir_ia_externa` | `true` | Si se desactiva, el motor externo se sustituye por el local (se audita la redirección) |
| `dias_retencion_auditoria` | `365` | Purga automática de la bitácora |

---

## 4. Privacidad y datos personales (PII)

Antes de enviar **cualquier** mensaje a un proveedor externo, `policy.redactar_pii()`
inspecciona el texto y lo enmascara:

| Tipo | Patrón | Reemplazo |
|---|---|---|
| Correo | `usuario@dominio.com` | `[CORREO_REDACTADO]` |
| API Key | `sk-…`, `pk-…`, `AIza…`, `ghp_…`, `xox…` | `[CLAVE_REDACTADA]` |
| Tarjeta | 13-19 dígitos con guiones | `[TARJETA_REDACTADA]` |
| Teléfono | 7-15 dígitos | `[TELEFONO_REDACTADO]` |
| Dirección | «calle», «carrera», «av.», «#123-45» | `[DIRECCION_REDACTADA]` |
| Identificador | «cédula/cc/nit», «documento», «pasaporte» + dígitos | `[ID_REDACTADO]` |
| Número suelto | 6-10 dígitos sin contexto de monto | `[ID_REDACTADO]` (presunción de dato personal) |

**Minimización por presunción**: un número de 6-10 dígitos se conserva solo si el texto
anterior indica contexto monetario (`por`, `$`, `costo`, `pagué`, `mil`…). Si no, se
redacta. Esto evita el error inverso —tratar «800000» como cédula y «1234567890» como
monto—.

> El mensaje **original** se guarda en el historial del chat; el **redactado** es el único
> que sale del servidor. La operación se audita (`tipo = redaccion`) con las categorías
> detectadas, nunca con los valores.

El chat confirma al usuario: *«(Protegí tus datos personales: redacté teléfono antes de
procesarlo.)»*

---

## 5. Auditoría y trazabilidad

Cada decisión deja una fila en `audit_log`:

| Campo | Uso |
|---|---|
| `actor` | `usuario`, `agente` o `sistema` |
| `tipo` | `accion`, `aprobacion`, `rechazo`, `bloqueo`, `redaccion`, `solicitud_aprobacion`, `cambio_politica`, `purga`, `truncado`, `redireccion`, `ejecucion_aprobada` |
| `descripcion` / `motivo` | Qué se hizo y por qué (texto legible) |
| `confianza` | Confianza del modelo en esa decisión |
| `riesgo` | `bajo`, `medio`, `alto` |
| `reversible` | Si el usuario puede revertirlo |
| `entidad` / `entidad_id` | Qué registro se tocó (p. ej. `log_entries #42`) |
| `datos` | JSON con el detalle |

La interfaz muestra la **cadena completa** de una decisión:

```
solicitud_aprobacion (agente) → aprobacion (usuario, "aprobada")
                              → accion (agente, "Gasto registrado #42")
                              → ejecucion_aprobada (usuario, "ok")
```

Consultas: `GET /api/responsabilidad/auditoria`, `/auditoria/resumen`,
`DELETE /auditoria?dias=N` (purga por retención).

---

## 6. Control humano (bandeja de aprobaciones)

`POST /api/agent/chat` **no** ejecuta lo que requiere permiso: crea un
`ApprovalRequest` en estado `pendiente` y lo dice en la respuesta.

```
Aprobaciones
├── Resumen          "Gasto: Refrigerador nuevo (2,000,000)"
├── Motivo           "El gasto (2,000,000) supera el limite autonomo (100,000)"
├── Chips            riesgo medio · regla: gasto_sobre_umbral · confianza 90%
├── Nota opcional    "lo autorizo, es el electrodoméstico del apartamento"
└── Acciones         [Aprobar y ejecutar]  [Rechazar]
```

Al aprobar, la acción se ejecuta con `aprobada_por_usuario=True` (confianza 1.0, regla
`aprobada_por_usuario`) y queda auditada como `ejecucion_aprobada`. Al rechazar, se
registra `rechazo` con la nota del usuario y **nada se escribe** en la base.

> **Detalle de implementación**: el agente registra la acción como pendiente en el mismo
> mensaje (`"Lo dejé pendiente de tu confirmación"`), y la UI refresca la bandeja en
> cuanto llega la respuesta, para que el badge nunca quede desactualizado.

---

## 7. El System Prompt como capa de gobierno

`shared/system_prompt.txt` §6 «Reglas de gobierno» le exige al modelo:

1. **Motivo obligatorio y específico** en cada acción (no basta «porque sí»).
2. **No inventar permisos**: el agente propone; el usuario ejecuta.
3. **Declarar incertidumbre**: si la confianza es < 0.6, pedir confirmación.
4. **No interpretar fuera de alcance**: si la intención no está en la taxonomía, no
   ejecutarla.
5. **Minimizar datos**: no copiar datos personales al contexto ni a la respuesta.
6. **Transparencia sobre el proveedor**: el agente no dice que es humano.

Además, el JSON del agente ahora incluye `categorias[]` (todas las intenciones
detectadas) y la sección 5.1 define el **registro en cascada** (tarea → bloque de
estudio; gasto de mantenimiento → próxima fecha; evento nuevo → reorganización del día).

---

## 8. Reporte de cumplimiento

`GET /api/responsabilidad/cumplimiento` devuelve un puntaje (0-100) y **8 controles**
con su marco normativo:

| Control | Marco |
|---|---|
| Trazabilidad de decisiones | ISO/IEC 42001 A.8 · EU AI Act Art. 12 |
| Supervisión humana | EU AI Act Art. 14 |
| Explicabilidad | OECD AI Principles |
| Protección de datos | Ley 1581/2012 (Colombia) · GDPR Art. 5 |
| Control humano | EU AI Act Art. 14 · NIST AI RMF |
| Minimización de datos | GDPR Art. 5(1)(c) |
| Retención y expiración | Ley 1581/2012 Art. 10 |
| Transparencia del proveedor | EU AI Act |

`GET /api/responsabilidad/inventario` expone el inventario de datos tratados
(categorías,Terceros, transferencias, medidas y derechos del usuario).

---

## 9. Qué NO cubre (y hay que construir antes de producción)

- **Autenticación y roles**: hoy `/api` no distingue usuarios; la auditoría marca el
  actor como `usuario` genérico.
- **Firma criptográfica** de la bitácora: hoy es append-only por convención, no
  tamper-evident.
- **Notificaciones** de aprobaciones fuera de la sesión (correo/push).
- **Evaluación de sesgo** del clasificador por categoría (datos agregados por grupo).
- **DPIA** (Evaluación de Impacto) documentada y firmada por el responsable del
  tratamiento, requisito de la Ley 1581 para datos sensibles.

---

## 10. Referencias

- ISO/IEC 42001:2023 — Sistemas de gestión de IA.
- Reglamento (UE) 2024/1689 — EU AI Act (obligaciones de transparencia y supervisión humana).
- OECD AI Principles (2019, revisado 2024) — explicabilidad y rendición de cuentas.
- Ley 1581 de 2012 (Colombia) y GDPR — protección de datos personales.
- NIST AI RMF 1.0 — funciones de governance, map, measure, manage.
