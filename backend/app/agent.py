"""Orquestador del agente LifeSync.

Flujo:
   mensaje del usuario
        │
        ├─ 1. construir_contexto()  → estado real del usuario (eventos, tareas, gastos, mantenimiento)
        ├─ 2. LLM (OpenAI / Gemini / mock) → JSON con categoría + acciones
        ├─ 3. validar (Pydantic) → contrato estricto
        └─ 4. aplicar_acciones() → escritura en la base de datos + plan de agenda

Principio de diseño: el LLM decide QUÉ hacer; el código decide CUÁNDO y
CÓMO (planificador determinista, validaciones, integridad referencial).
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import connections as conexiones
from . import policy as gober
from . import providers
from .config import settings
from .models import ChatMessage, ConexionIA, Event, LogEntry, Maintenance, Task
from .planner import Bloque, Interval, calcular_carga, replanificar
from .schemas import AgentAction, AgentAlert, AgentResponse, ChatRequest, ChatResponse
from .security import descifrar


# --------------------------------------------------------------------------- #
# Contexto
# --------------------------------------------------------------------------- #
def construir_contexto(db: Session, hoy: date | None = None) -> str:
    hoy = hoy or date.today()
    manana = hoy + timedelta(days=1)

    eventos_hoy = db.scalars(
        select(Event)
        .where(Event.inicio >= datetime.combine(hoy, datetime.min.time()))
        .where(Event.inicio < datetime.combine(manana, datetime.min.time()))
        .order_by(Event.inicio)
    ).all()

    tareas = db.scalars(
        select(Task).where(Task.estado != "completada").order_by(Task.fecha_entrega.asc().nullslast())
    ).all()

    gastos_mes = db.scalar(
        select(func.coalesce(func.sum(LogEntry.monto), 0.0)).where(
            func.strftime("%Y-%m", LogEntry.fecha) == hoy.strftime("%Y-%m")
        )
    ) or 0.0

    mant = db.scalars(select(Maintenance).where(Maintenance.activo_flag.is_(True))).all()

    ctx = {
        "fecha_actual": hoy.isoformat(),
        "dia_semana": hoy.strftime("%A"),
        "moneda_por_defecto": settings.default_currency,
        "jornada": {"inicio": settings.day_start, "fin": settings.day_end},
        "eventos_hoy": [
            {
                "id": e.id, "titulo": e.titulo, "categoria": e.categoria,
                "inicio": e.inicio.isoformat(timespec="minutes"),
                "fin": e.fin.isoformat(timespec="minutes"),
                "inamovible": e.inamovible,
            }
            for e in eventos_hoy
        ],
        "tareas_pendientes": [
            {
                "id": t.id, "titulo": t.titulo, "materia": t.materia,
                "fecha_entrega": t.fecha_entrega.isoformat() if t.fecha_entrega else None,
                "prioridad": t.prioridad, "minutos_estimados": t.minutos_estimados,
            }
            for t in tareas[:12]
        ],
        "gastos_mes": {"total": float(gastos_mes), "moneda": settings.default_currency},
        "mantenimiento": [
            {
                "id": m.id, "activo": m.activo, "tarea": m.tarea,
                "intervalo_dias": m.intervalo_dias,
                "ultima_realizacion": m.ultima_realizacion.isoformat() if m.ultima_realizacion else None,
                "proxima_fecha": m.proxima_fecha.isoformat() if m.proxima_fecha else None,
            }
            for m in mant
        ],
    }
    return json.dumps(ctx, ensure_ascii=False, indent=2)


# --------------------------------------------------------------------------- #
# Utilidades de datos
# --------------------------------------------------------------------------- #
def _parse_dt(valor: Any, fallback: datetime | None = None) -> datetime | None:
    if valor in (None, ""):
        return fallback
    if isinstance(valor, datetime):
        return valor
    if isinstance(valor, date):
        return datetime.combine(valor, datetime.min.time())
    texto = str(valor).strip().replace("Z", "")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto[: len(fmt) + 2].strip(), fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(texto)
    except ValueError:
        return fallback


def _parse_date(valor: Any, fallback: date | None = None) -> date | None:
    if valor in (None, ""):
        return fallback
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    try:
        return date.fromisoformat(str(valor)[:10])
    except ValueError:
        return fallback


def _categoria_evento(valor: Any) -> str:
    permitidas = {"trabajo", "clase", "estudio", "descanso", "personal", "salud", "social", "mantenimiento"}
    v = str(valor or "personal").lower()
    return v if v in permitidas else "personal"


# --------------------------------------------------------------------------- #
# Aplicación de acciones
# --------------------------------------------------------------------------- #
def _detectar_conflictos(db: Session, inicio: datetime, fin: datetime, excluir_id: int | None = None) -> list[dict]:
    """Eventos que se solapan con el intervalo dado."""
    q = select(Event).where(Event.inicio < fin).where(Event.fin > inicio)
    if excluir_id:
        q = q.where(Event.id != excluir_id)
    return [
        {"id": e.id, "titulo": e.titulo, "inicio": e.inicio.isoformat(timespec="minutes"),
         "fin": e.fin.isoformat(timespec="minutes"), "inamovible": e.inamovible}
        for e in db.scalars(q).all()
    ]


def aplicar_acciones(
    db: Session,
    acciones: list[AgentAction],
    confianza: float | None = None,
    chat_message_id: int | None = None,
    aprobada_por_usuario: bool = False,
) -> dict[str, Any]:
    """Ejecuta las acciones PERMITIDAS por la política de gobierno.

    Acciones que requieren aprobación humana NO se ejecutan: se encolan en
    `ApprovalRequest` y el usuario las resuelve desde la interfaz. Cada
    decisión queda registrada en la bitacora de auditoría.

    `aprobada_por_usuario=True` salta la evaluacion automática: se usa cuando
    el humano ya aprobo explicitamente la acción (el visto bueno humano es
    la máxima autoridad del sistema).
    """
    resumen: dict[str, Any] = {
        "eventos_creados": [], "eventos_actualizados": [], "eventos_eliminados": 0,
        "tareas_creadas": [], "tareas_actualizadas": [], "registros": [],
        "mantenimientos": [], "estudio_programado": [], "plan": {},
        "registros_detallados": [],
        "aprobaciones_pendientes": [],
        "acciones_bloqueadas": [],
    }
    plan_resultado: dict[str, Any] = {}
    ultima_tarea: int | None = None

    # --- Control de gobierno: separar autonomas / a aprobar / bloqueadas ------
    politica = gober.obtener_politica(db)
    lote = [
        {"tipo": a.tipo, "datos": a.datos or {}, "motivo": a.motivo}
        for a in acciones
    ]
    # Límite duro de acciones por mensaje (protección contra la IA runaway).
    if len(lote) > politica.max_acciones_por_mensaje:
        gober.registrar_auditoria(
            db, actor="sistema", tipo="truncado", modulo="gobierno",
            descripcion=f"Mensaje con {len(lote)} acciones truncado al máximo permitido",
            motivo="max_acciones_por_mensaje", riesgo="medio", reversible=True,
            resultado="aplicado",
            datos={"original": len(lote), "permitidas": politica.max_acciones_por_mensaje},
        )
        lote = lote[: politica.max_acciones_por_mensaje]
    if aprobada_por_usuario:
        # El humano ya aprobo: la acción se ejecuta sin volver a pasar por los
        # umbrales automaticos (el visto bueno humano es la máxima autoridad).
        autonomas, a_aprobar, bloqueadas = [
            gober.Decision(
                nivel=gober.AUTONOMO, regla="aprobada_por_usuario",
                motivo="Aprobada explicitamente por el usuario",
                riesgo=gober.RIESGO_ACCION.get(str(a.tipo or ""), "medio"),
                confianza=1.0, accion={"tipo": a.tipo, "datos": a.datos or {}, "motivo": a.motivo},
            )
            for a in acciones
        ], [], []
    else:
        autonomas, a_aprobar, bloqueadas = gober.evaluar_lote(lote, politica, confianza)

    for decision in bloqueadas:
        resumen["acciones_bloqueadas"].append(
            {"tipo": decision.accion.get("tipo"), "motivo": decision.motivo, "regla": decision.regla}
        )
        gober.registrar_auditoria(
            db, actor="sistema", tipo="bloqueo", modulo="gobierno",
            descripcion=gober._resumen_accion(decision.accion),
            motivo=decision.motivo, confianza=decision.confianza,
            riesgo=decision.riesgo, reversible=True, resultado="bloqueado",
            entidad="accion", datos=decision.accion,
        )

    for decision in a_aprobar:
        peticion = gober.crear_aprobacion(db, decision, chat_message_id)
        resumen["aprobaciones_pendientes"].append({
            "id": peticion.id,
            "tipo": peticion.tipo_accion,
            "resumen": peticion.resumen,
            "motivo": peticion.motivo,
            "regla": peticion.regla,
            "riesgo": peticion.riesgo,
            "confianza": peticion.confianza,
        })
        gober.registrar_auditoria(
            db, actor="agente", tipo="solicitud_aprobacion", modulo="gobierno",
            descripcion=peticion.resumen, motivo=decision.motivo,
            confianza=decision.confianza, riesgo=decision.riesgo,
            reversible=True, resultado="pendiente",
            entidad="approval_request", entidad_id=peticion.id,
            datos={"regla": decision.regla},
        )

    # Solo llegan al executor las acciones autonomas.
    acciones_autorizadas = [
        AgentAction(
            tipo=str(d.accion.get("tipo") or ""),
            datos=d.accion.get("datos") or {},
            motivo=str(d.accion.get("motivo") or ""),
        )
        for d in autonomas
    ]

    def anotar(tipo: str, titulo: str, detalle: str) -> None:
        """Guarda una línea legible de lo que quedó registrado (para la UI)."""
        resumen["registros_detallados"].append(
            {"tipo": tipo, "titulo": titulo, "detalle": detalle}
        )

    for accion in acciones_autorizadas:
        tipo = accion.tipo
        d = accion.datos or {}

        # ---------------------------------------------------------------- CAL
        if tipo in {"crear_evento", "actualizar_evento"}:
            inicio = _parse_dt(d.get("inicio"))
            fin = _parse_dt(d.get("fin"))
            if inicio is None:
                continue
            if fin is None or fin <= inicio:
                fin = inicio + timedelta(minutes=int(d.get("duracion_min") or 60))

            if tipo == "crear_evento":
                # Anti-duplicado: si ya existe un evento con el mismo título a la
                # misma hora, se actualiza en vez de crear un gemelo.
                titulo = str(d.get("titulo") or "Compromiso")[:160]
                existente = db.scalars(
                    select(Event).where(
                        Event.titulo.ilike(titulo),
                        Event.inicio >= inicio - timedelta(minutes=1),
                        Event.inicio <= inicio + timedelta(minutes=1),
                    )
                ).first()
                if existente is not None:
                    existente.categoria = _categoria_evento(d.get("categoria") or existente.categoria)
                    existente.fin = fin
                    existente.inamovible = bool(d.get("inamovible", existente.inamovible))
                    if d.get("notas") is not None:
                        existente.notas = d["notas"]
                    db.flush()
                    resumen["eventos_actualizados"].append(existente.id)
                    anotar("evento", existente.titulo, f"Actualizado · {inicio.strftime('%d/%m %H:%M')}")
                    continue

                conflictos = _detectar_conflictos(db, inicio, fin)
                for c in conflictos:
                    resumen.setdefault("conflictos", []).append(
                        {"nuevo": str(d.get("titulo") or "Compromiso"), **c}
                    )
                ev = Event(
                    titulo=titulo,
                    categoria=_categoria_evento(d.get("categoria")),
                    inicio=inicio, fin=fin,
                    inamovible=bool(d.get("inamovible", False)),
                    notas=d.get("notas") or None,
                    fuente=str(d.get("fuente") or "chat"),
                )
                db.add(ev)
                db.flush()
                resumen["eventos_creados"].append(ev.id)
                anotar("evento", ev.titulo, f"{inicio.strftime('%a %d/%m')} · {inicio.strftime('%H:%M')}-{fin.strftime('%H:%M')}")
            else:
                ev = db.get(Event, d.get("id"))
                if ev is None:
                    continue
                ev.titulo = str(d.get("titulo") or ev.titulo)[:160]
                ev.categoria = _categoria_evento(d.get("categoria") or ev.categoria)
                ev.inicio, ev.fin = inicio, fin
                ev.inamovible = bool(d.get("inamovible", ev.inamovible))
                if d.get("notas") is not None:
                    ev.notas = d["notas"]
                db.flush()
                resumen["eventos_actualizados"].append(ev.id)

        elif tipo == "eliminar_evento":
            ev = db.get(Event, d.get("id"))
            if ev is not None:
                db.delete(ev)
                resumen["eventos_eliminados"] += 1

        elif tipo == "mover_bloque":
            ev = db.get(Event, d.get("id"))
            if ev is None:
                continue
            inicio = _parse_dt(d.get("inicio"))
            fin = _parse_dt(d.get("fin"))
            if inicio:
                ev.inicio = inicio
                ev.fin = fin or (inicio + timedelta(minutes=ev.duracion_min))
                db.flush()
                resumen["eventos_actualizados"].append(ev.id)

        elif tipo == "replanificar_dia":
            plan_resultado = ejecutar_replan(db, d, resumen)

        # ---------------------------------------------------------------- ACA
        elif tipo == "crear_tarea":
            tarea = Task(
                titulo=str(d.get("titulo") or "Tarea")[:220],
                materia=d.get("materia"),
                fecha_entrega=_parse_date(d.get("fecha_entrega")),
                estado=str(d.get("estado") or "pendiente"),
                prioridad=str(d.get("prioridad") or "media"),
                minutos_estimados=int(d.get("minutos_estimados") or 60),
                material=d.get("material") or None,
                fuente=str(d.get("fuente") or "chat"),
            )
            db.add(tarea)
            db.flush()
            resumen["tareas_creadas"].append(tarea.id)
            ultima_tarea = tarea.id
            entrega = tarea.fecha_entrega.isoformat() if tarea.fecha_entrega else "sin fecha"
            anotar("tarea", tarea.titulo, f"Entrega {entrega} · {tarea.minutos_estimados} min")

        elif tipo == "actualizar_tarea":
            tarea = db.get(Task, d.get("id"))
            if tarea is None:
                continue
            cambios = d.get("cambios") or {}
            for campo in ("titulo", "materia", "estado", "prioridad", "minutos_estimados", "resumen"):
                if campo in cambios and cambios[campo] is not None:
                    setattr(tarea, campo, cambios[campo])
            if "fecha_entrega" in cambios:
                tarea.fecha_entrega = _parse_date(cambios["fecha_entrega"])
            db.flush()
            resumen["tareas_actualizadas"].append(tarea.id)

        elif tipo == "completar_tarea":
            tarea = db.get(Task, d.get("id"))
            if tarea is None:
                continue
            tarea.estado = "completada"
            db.flush()
            resumen["tareas_actualizadas"].append(tarea.id)

        elif tipo == "resumir_material":
            tarea_id = _resumir_material(db, d, resumen)

        elif tipo == "programar_estudio":
            inicio = _parse_dt(d.get("inicio"))
            if inicio is None:
                continue
            fin = _parse_dt(d.get("fin")) or (inicio + timedelta(minutes=60))
            duracion = int((fin - inicio).total_seconds() // 60) or 60
            # Si el hueco propuesto está ocupado, se busca otro libre el mismo día.
            inicio, fin = _hueco_libre(db, inicio, duracion, fin)
            ev = Event(
                titulo=str(d.get("titulo") or "Estudio")[:160],
                categoria="estudio", inicio=inicio, fin=fin, inamovible=False,
                notas=d.get("material") or None, fuente="chat",
            )
            db.add(ev)
            db.flush()
            tarea_id = d.get("tarea_id")
            if tarea_id is None and ultima_tarea is not None:
                # Enlaza automáticamente el bloque con la tarea recién creada.
                tarea_id = ultima_tarea
            if tarea_id:
                tarea = db.get(Task, tarea_id)
                if tarea is not None:
                    tarea.tarea_id = ev.id
            resumen["estudio_programado"].append(ev.id)
            anotar("estudio", ev.titulo, f"{inicio.strftime('%a %d/%m')} · {inicio.strftime('%H:%M')}-{fin.strftime('%H:%M')}")

        # ---------------------------------------------------------------- BIT
        elif tipo == "registrar_gasto":
            monto = d.get("monto")
            try:
                monto = float(monto) if monto is not None else None
            except (TypeError, ValueError):
                monto = None
            fecha = _parse_date(d.get("fecha")) or date.today()
            registro = LogEntry(
                descripcion=str(d.get("descripcion") or "Gasto")[:255],
                monto=monto,
                moneda=str(d.get("moneda") or settings.default_currency),
                categoria=str(d.get("categoria") or "otro"),
                fecha=fecha,
                notas=d.get("notas") or None,
            )
            db.add(registro)
            db.flush()
            if d.get("registrar_en_calendario"):
                inicio = datetime.combine(fecha, datetime.min.time()).replace(hour=9)
                ev = Event(
                    titulo=registro.descripcion[:160], categoria="personal",
                    inicio=inicio, fin=inicio + timedelta(minutes=int(d.get("duracion_min") or 30)),
                    inamovible=False, fuente="chat",
                )
                db.add(ev)
                db.flush()
                registro.evento_id = ev.id
            resumen["registros"].append(registro.id)
            monto_txt = f"{registro.monto:,.0f} {registro.moneda}" if registro.monto else "sin monto"
            anotar("gasto", registro.descripcion, f"{monto_txt} · {registro.categoria}")

        # ------------------------------------------------------------- MANTEN
        elif tipo == "registrar_mantenimiento":
            mant = _upsert_mantenimiento(db, d)
            resumen["mantenimientos"].append(mant.id if mant else None)
            if mant is not None:
                proxima = mant.proxima_fecha.isoformat() if mant.proxima_fecha else "sin fecha"
                anotar("mantenimiento", f"{mant.activo}: {mant.tarea}", f"Próximo {proxima}")

        elif tipo == "programar_mantenimiento":
            fecha = _parse_date(d.get("fecha")) or (date.today() + timedelta(days=1))
            d2 = {
                "activo": d.get("activo", "otro"),
                "tarea": d.get("tarea", "Mantenimiento"),
                "intervalo_dias": d.get("intervalo_dias", 90),
                "ultima_realizacion": None,
                "proxima_fecha": fecha.isoformat(),
                "costo_estimado": d.get("costo_estimado"),
                "notas": d.get("notas"),
            }
            mant = _upsert_mantenimiento(db, d2)
            if mant:
                resumen["mantenimientos"].append(mant.id)
                anotar("mantenimiento", f"{mant.activo}: {mant.tarea}", f"Programado {fecha.isoformat()}")
            hora = str(d.get("hora") or "09:00")
            hh, mm = (hora.split(":") + ["0"])[:2]
            inicio = datetime.combine(fecha, datetime.min.time()).replace(hour=int(hh), minute=int(mm))
            titulo_evento = f"{d.get('activo', 'otro')}: {d.get('tarea', 'Mantenimiento')}"[:160]
            # Anti-duplicado: si ya existe ese mantenimiento agendado ese día, se actualiza.
            existente = db.scalars(
                select(Event).where(
                    Event.titulo.ilike(titulo_evento),
                    Event.inicio >= inicio - timedelta(minutes=1),
                    Event.inicio <= inicio + timedelta(minutes=1),
                )
            ).first()
            if existente is not None:
                existente.fin = inicio + timedelta(minutes=60)
                db.flush()
                resumen["eventos_actualizados"].append(existente.id)
                anotar("evento", existente.titulo, "Actualizado · mantenimiento ya agendado")
            else:
                ev = Event(
                    titulo=titulo_evento,
                    categoria="mantenimiento",
                    inicio=inicio, fin=inicio + timedelta(minutes=60), inamovible=False, fuente="chat",
                )
                db.add(ev)
                db.flush()
                resumen["eventos_creados"].append(ev.id)

        elif tipo == "marcar_realizado":
            mant = db.get(Maintenance, d.get("id"))
            if mant is None:
                continue
            fecha = _parse_date(d.get("fecha")) or date.today()
            mant.ultima_realizacion = fecha
            mant.proxima_fecha = fecha + timedelta(days=mant.intervalo_dias)
            if d.get("costo_real"):
                db.add(LogEntry(
                    descripcion=f"{mant.activo}: {mant.tarea}"[:255], monto=float(d["costo_real"]),
                    moneda=settings.default_currency, categoria="mantenimiento", fecha=fecha,
                ))
            db.flush()
            resumen["mantenimientos"].append(mant.id)
            anotar("mantenimiento", f"{mant.activo}: {mant.tarea}", f"Realizado {fecha.isoformat()}")

    if plan_resultado:
        resumen["plan"] = plan_resultado
        movidos = int(plan_resultado.get("movidos") or 0)
        if movidos:
            anotar("agenda", f"{movidos} bloque(s) reubicado(s)", "Día reorganizado sin solapes")
        sin_caber = plan_resultado.get("sin_caber") or []
        if sin_caber:
            anotar("agenda", f"{len(sin_caber)} bloque(s) sin espacio", "Revisa o divide esas tareas")

    # --- Auditoría: una entrada por acción efectivamente ejecutada -----------
    if not politica.registrar_auditoria:
        return resumen
    for decision, registro in zip(autonomas, _acciones_ejecutadas(autonomas, resumen)):
        gober.registrar_auditoria(
            db, actor="agente", tipo="accion", modulo="agente",
            descripcion=registro.get("descripcion", decision.accion.get("tipo", "")),
            motivo=decision.motivo or gober.explicar(decision),
            confianza=decision.confianza, riesgo=decision.riesgo,
            reversible=True, resultado="ok",
            entidad=registro.get("entidad"), entidad_id=registro.get("entidad_id"),
            datos={"tipo_accion": decision.accion.get("tipo"), "regla": decision.regla},
        )
    return resumen


def _acciones_ejecutadas(autonomas: list, resumen: dict[str, Any]) -> list[dict[str, Any]]:
    """Empareja cada decisión autónoma con la entidad que produjo.

    Se recorre el resumen en orden de aparición para reconstruir que se
    escribió en la base de datos a partir de cada acción.
    """
    cola: list[dict[str, Any]] = []

    def _buscar(clave: str, entidad: str, prefijo: str) -> None:
        for valor in reversed(resumen.get(clave) or []):
            if not any(c["entidad"] == entidad and c["entidad_id"] == valor for c in cola):
                cola.append({
                    "entidad": entidad, "entidad_id": valor,
                    "descripcion": f"{prefijo} #{valor}",
                })
                return

    for decision in autonomas:
        tipo = str(decision.accion.get("tipo") or "")
        titulo = str((decision.accion.get("datos") or {}).get("titulo") or "")
        if tipo == "crear_evento":
            _buscar("eventos_creados", "evento", "Evento creado")
        elif tipo == "actualizar_evento":
            _buscar("eventos_actualizados", "evento", "Evento actualizado")
        elif tipo == "crear_tarea":
            _buscar("tareas_creadas", "tarea", "Tarea creada")
        elif tipo == "registrar_gasto":
            _buscar("registros", "log_entry", "Gasto registrado")
        elif tipo in {"registrar_mantenimiento", "programar_mantenimiento"}:
            _buscar("mantenimientos", "maintenance", "Mantenimiento registrado")
        elif tipo == "programar_estudio":
            _buscar("estudio_programado", "evento", "Bloque de estudio")
        else:
            cola.append({"entidad": None, "entidad_id": None, "descripcion": f"{tipo}: {titulo}"[:255]})
    return cola


def _hueco_libre(
    db: Session, inicio: datetime, duracion_min: int, fin: datetime | None = None
) -> tuple[datetime, datetime]:
    """Devuelve (inicio, fin) de un bloque que NO se solape con eventos existentes.

    Si el hueco propuesto está ocupado, avanza en saltos de 30 minutos dentro
    de la jornada (07:00-22:00). Si no cabe, devuelve el hueco original.
    """
    duracion = max(15, int(duracion_min))
    fin = fin or (inicio + timedelta(minutes=duracion))

    def libre(ini: datetime, fin_: datetime) -> bool:
        return not db.scalars(
            select(Event).where(Event.inicio < fin_).where(Event.fin > ini)
        ).first()

    if libre(inicio, fin):
        return inicio, fin

    candidato = inicio
    limite = datetime.combine(inicio.date(), datetime.min.time()).replace(hour=22)
    while candidato + timedelta(minutes=duracion) <= limite:
        candidato += timedelta(minutes=30)
        if libre(candidato, candidato + timedelta(minutes=duracion)):
            return candidato, candidato + timedelta(minutes=duracion)
    return inicio, fin


def _upsert_mantenimiento(db: Session, d: dict[str, Any]) -> Maintenance | None:
    activo = str(d.get("activo") or "otro")
    tarea = str(d.get("tarea") or "Mantenimiento")
    existente = db.scalars(
        select(Maintenance).where(Maintenance.activo == activo, Maintenance.tarea == tarea)
    ).first()
    ultima = _parse_date(d.get("ultima_realizacion"))
    intervalo = int(d.get("intervalo_dias") or 90)
    if existente is None:
        existente = Maintenance(activo=activo, tarea=tarea, intervalo_dias=intervalo)
        db.add(existente)
    existente.intervalo_dias = intervalo
    if ultima:
        existente.ultima_realizacion = ultima
    proxima = _parse_date(d.get("proxima_fecha"))
    if proxima:
        existente.proxima_fecha = proxima
    elif existente.ultima_realizacion:
        existente.proxima_fecha = existente.ultima_realizacion + timedelta(days=intervalo)
    if d.get("costo_estimado") is not None:
        existente.costo_estimado = float(d["costo_estimado"])
    if d.get("notas") is not None:
        existente.notas = d["notas"]
    db.flush()
    return existente


def ejecutar_replan(db: Session, d: dict[str, Any], resumen: dict[str, Any]) -> dict[str, Any]:
    """Reorganiza los bloques flexibles de un día evitando solapes con los inamovibles."""
    fecha = _parse_date(d.get("fecha")) or date.today()
    dia_sig = fecha + timedelta(days=1)

    dia = db.scalars(
        select(Event)
        .where(Event.inicio >= datetime.combine(fecha, datetime.min.time()))
        .where(Event.inicio < datetime.combine(dia_sig, datetime.min.time()))
        .order_by(Event.inicio)
    ).all()

    ocupados = [Interval(e.inicio, e.fin) for e in dia if e.inamovible]
    flexibles = [e for e in dia if not e.inamovible]

    specs = d.get("bloques_a_organizar") or []
    bloques: list[Bloque] = []
    nuevos: list[tuple[str, str, int, str]] = []  # (título, categoría, duración, prioridad)

    for spec in specs:
        titulo = str(spec.get("titulo") or "Bloque").strip()
        cat = _categoria_evento(spec.get("categoria") or "estudio")
        dur = int(spec.get("duracion_min") or 60)
        prio = str(spec.get("prioridad") or "media")
        # Si ya existe un bloque flexible con ese título, se reutiliza (no duplicamos).
        ya_existe = any(e.titulo.strip().lower() == titulo.lower() for e in flexibles)
        if ya_existe:
            continue
        bloques.append(Bloque(titulo=titulo, duracion_min=dur, prioridad=prio, categoria=cat))
        nuevos.append((titulo, cat, dur, prio))

    # Los eventos flexibles existentes también se reubican (prioridad según categoría)
    for ev in flexibles:
        b = Bloque(
            titulo=ev.titulo, duracion_min=ev.duracion_min,
            prioridad="alta" if ev.categoria in {"clase", "trabajo"} else "media",
            categoria=ev.categoria, origen_id=ev.id, inicio_original=ev.inicio,
        )
        bloques.append(b)

    # Ancla: el evento inamovible más cercano a las 15:00 (el nuevo compromiso).
    ancla = min((o.inicio for o in ocupados), key=lambda x: abs((x.hour * 60 + x.minute) - 900), default=None)

    restr = d.get("restricciones") or {}
    plan = replanificar(
        dia=fecha,
        ancla=ancla,
        bloques=bloques,
        ocupados=ocupados,
        inicio_jornada=settings.day_start,
        fin_jornada=settings.day_end,
        no_antes_de=restr.get("no_antes_de"),
        no_despues_de=restr.get("no_despues_de"),
        prioridad_reubicacion=d.get("prioridad_reubicacion", "flexible"),
    )

    movidos = 0
    for asig in plan.asignaciones:
        ev_id = asig.get("id")
        if not ev_id:
            # Bloque nuevo propuesto por el agente -> se materializa como evento.
            titulo = asig.get("titulo", "Bloque")
            meta = next((n for n in nuevos if n[0].lower() == titulo.lower()), None)
            if meta is None:
                continue
            _, cat, dur, _prio = meta
            inicio = _parse_dt(asig["inicio"])
            fin = _parse_dt(asig["fin"]) or (inicio + timedelta(minutes=dur))
            if inicio is None:
                continue
            ev = Event(
                titulo=titulo[:160], categoria=cat, inicio=inicio, fin=fin,
                inamovible=False, fuente="chat", notas="Bloque sugerido por el agente.",
            )
            db.add(ev)
            db.flush()
            resumen["eventos_creados"].append(ev.id)
            asig["id"] = ev.id
            continue
        ev = db.get(Event, ev_id)
        if ev is None:
            continue
        nuevo_ini = _parse_dt(asig["inicio"])
        nuevo_fin = _parse_dt(asig["fin"])
        if nuevo_ini and nuevo_fin and (nuevo_ini, nuevo_fin) != (ev.inicio, ev.fin):
            ev.inicio, ev.fin = nuevo_ini, nuevo_fin
            movidos += 1
            resumen["eventos_actualizados"].append(ev.id)
    db.flush()

    carga = calcular_carga([{"categoria": e.categoria, "duracion_min": e.duracion_min} for e in dia])
    resultado = plan.as_dict()
    resultado["movidos"] = movidos
    resultado["carga"] = carga
    resultado["fecha"] = fecha.isoformat()
    return resultado


def _resumir_material(db: Session, d: dict[str, Any], resumen: dict[str, Any]) -> int | None:
    """Crea la tarea a partir del material y guarda resumen + preguntas."""
    material = str(d.get("material") or "").strip()
    titulo = str(d.get("titulo") or "Material de estudio")[:220]
    materia = d.get("materia")
    resumen_txt = d.get("resumen")
    preguntas = d.get("preguntas_estudio") or []

    if material and not resumen_txt:
        resumen_txt = _resumen_local(material)
    if material and not preguntas:
        preguntas = _preguntas_locales(material)

    tarea = Task(
        titulo=titulo, materia=materia,
        fecha_entrega=_parse_date(d.get("fecha_entrega")),
        estado="pendiente", prioridad=str(d.get("prioridad") or "media"),
        minutos_estimados=int(d.get("minutos_estudio") or 60),
        resumen=resumen_txt, material=material[:20000] or None,
        preguntas=json.dumps(preguntas, ensure_ascii=False),
        fuente=str(d.get("fuente") or "manual"),
    )
    db.add(tarea)
    db.flush()
    resumen["tareas_creadas"].append(tarea.id)
    return tarea.id


def _resumen_local(material: str, max_frases: int = 5) -> str:
    frases = [f.strip() for f in material.replace("\n", " ").split(".") if f.strip()]
    resumen = ". ".join(frases[:max_frases])
    if not resumen:
        resumen = material[:400]
    return (resumen[:1200] + ("..." if len(resumen) > 1200 else "")) + "."


def _preguntas_locales(material: str, n: int = 4) -> list[str]:
    palabras = [w for w in material.replace("\n", " ").split() if len(w) > 6]
    claves = list(dict.fromkeys(palabras))[:n]
    return [f"¿Qué explica {p.lower().strip('.,;:')}?" for p in claves] or ["¿Cuáles son las ideas principales?"]


# --------------------------------------------------------------------------- #
# Orquestación principal
# --------------------------------------------------------------------------- #
async def procesar_mensaje(db: Session, req: ChatRequest) -> ChatResponse:
    app = _get_app_settings(db)
    politica = gober.obtener_politica(db)
    proveedor_solicitado = (req.proveedor or app.proveedor or "mock").lower()
    proveedor = proveedor_solicitado
    modelo = req.modelo or app.modelo or settings.default_openai_model
    # La API Key puede venir en la petición (el usuario la pega en el chat) o
    # estar cifrada en el servidor ("recordar en el servidor").
    api_key = req.api_key or descifrar(app.api_key_cifrada)
    base_url: str | None = None

    # Conexión activa del "Centro de conexiones": trae credencial cifrada y la
    # URL del motor local cuando aplica (Ollama / LM Studio).
    conexion = None
    if req.proveedor:
        conexion = db.scalars(
            select(ConexionIA)
            .where(ConexionIA.proveedor == conexiones.normalizar_proveedor(req.proveedor))
            .limit(1)
        ).first()
    if conexion is None:
        conexion = db.scalars(
            select(ConexionIA).where(ConexionIA.activa.is_(True)).limit(1)
        ).first()
    if conexion is not None:
        cred = conexiones.credenciales_desde_json(conexion.credenciales_cifradas)
        if not api_key:
            # Las conexiones "con mi cuenta" guardan el permiso como access
            # token (por ejemplo el que entrega Google al iniciar sesión).
            api_key = cred.get("api_key") or cred.get("access_token") or ""
        if cred.get("base_url"):
            base_url = cred["base_url"]
        else:
            # Los motores locales (Ollama, LM Studio) usan su dirección por
            # defecto si el usuario no	configuro otra.
            prov = conexiones.obtener_proveedor(conexion.proveedor)
            base_url = prov.base_url if prov else None
        if not req.modelo and conexion.modelo:
            modelo = conexion.modelo
        if not req.proveedor:
            proveedor = conexion.proveedor

    if proveedor != "mock" and not api_key and not base_url:
        # Sin credenciales no se puede llamar al proveedor: se usa el motor
        # local en vez de romper el chat, y se avisa en la respuesta.
        proveedor = "mock"
    if proveedor != "mock" and not politica.permitir_ia_externa:
        # Governance: la política impide enviar datos a un proveedor externo.
        proveedor = "mock"
        gober.registrar_auditoria(
            db, actor="sistema", tipo="redireccion", modulo="gobierno",
            descripcion="Proveedor externo bloqueado por política; se usó el motor local",
            motivo="permitir_ia_externa=False", riesgo="bajo", reversible=True, resultado="ok",
        )

    # --- Privacidad: la PII se redacta ANTES de salir del servidor -------------
    mensaje = req.mensaje
    pii_encontrada: list[str] = []
    if politica.redactar_pii:
        mensaje, pii_encontrada = gober.redactar_pii(req.mensaje)
        if pii_encontrada:
            gober.registrar_auditoria(
                db, actor="sistema", tipo="redaccion", modulo="privacidad",
                descripcion=f"Datos personales redactados: {', '.join(pii_encontrada)}",
                motivo="politica.redactar_pii", riesgo="bajo", reversible=True,
                resultado="ok", datos={"categorias": pii_encontrada},
            )

    system_prompt = settings.system_prompt
    contexto = construir_contexto(db) if req.usar_contexto else "{}"
    user_prompt = (
        f"CONTEXTO DEL USUARIO (JSON, estado actual de la app):\n{contexto}\n\n"
        f"MENSAJE DEL USUARIO:\n{mensaje}\n\n"
        "Responde SOLO con el JSON del contrato."
    )

    texto = await providers.complete(
        system_prompt, user_prompt, proveedor=proveedor, api_key=api_key, modelo=modelo,
        mensaje_original=mensaje, base_url=base_url,
    )
    crudo = providers.extract_json(texto)

    # Salvaguarda: algunos modelos (sobre todo los locales y small) no
    # respetan el contrato JSON y devuelven texto libre o un JSON vacio.
    # En ese caso se cae al clasificador por reglas, que SI entiende el
    # lenguaje natural. Nunca se responde con una conversacion vacia.
    if not _respeta_contrato(crudo):
        crudo = providers.respuesta_reglas(mensaje)

    agente = AgentResponse.model_validate(_normalizar(crudo))

    # Persistir el mensaje del usuario (el original, sin redactar: es su dato)
    db.add(ChatMessage(rol="user", contenido=req.mensaje))
    db.flush()

    if not agente.requiere_confirmacion:
        agente.resumen_estado = aplicar_acciones(
            db, agente.acciones, confianza=agente.confianza,
            chat_message_id=None,
        )
        # Si se usó el motor local por falta de API Key, se avisa al usuario.
        if proveedor == "mock" and proveedor_solicitado != "mock":
            agente.mensaje_usuario = (
                f"{agente.mensaje_usuario} (Registrado con el motor local: "
                "no hay API Key configurada para el proveedor elegido.)"
            )
        # Salvaguarda del backend (independiente del proveedor): si el agente
        # creó un evento que se solapa con otro, se le avisa al usuario.
        conflictos = agente.resumen_estado.get("conflictos") or []
        if conflictos:
            nombres = ", ".join(
                f"\"{c.get('titulo')}\" ({c.get('inicio', '')[11:16]})" for c in conflictos[:3]
            )
            agente.mensaje_usuario = (
                f"{agente.mensaje_usuario} Ojo: eso se cruza con {nombres}. "
                "Dime si quieres que reacomode esa franja."
            )
        # Si el mensaje no menciona TODO lo que se registro (p.ej. respuesta
        # generica del modelo), se anade una linea con lo que quedó guardado.
        # El tipo "agenda" se omite del texto: la reorganizacion ya se
        # comunica con el chip "N bloques reubicados".
        detalle = agente.resumen_estado.get("registros_detallados") or []
        faltan = [
            d for d in _registros_no_mencionados(agente.mensaje_usuario, detalle)
            if d.get("tipo") != "agenda"
        ]
        if faltan:
            chips = "; ".join(f"{d['titulo']} ({d['detalle']})" for d in faltan[:6])
            extra = f" Quedó registrado: {chips}."
            if len(faltan) > 6:
                extra += f" Y {len(faltan) - 6} registro(s) más."
            agente.mensaje_usuario = f"{agente.mensaje_usuario}{extra}"

        # --- Gobierno: informe de decisiones al usuario ------------------------
        pendientes = agente.resumen_estado.get("aprobaciones_pendientes") or []
        bloqueadas = agente.resumen_estado.get("acciones_bloqueadas") or []
        if pendientes:
            frases = "; ".join(p.get("resumen", "") for p in pendientes[:3])
            extra = (
                f" Necesito tu confirmación para {len(pendientes)} acción(es): {frases}. "
                "Las dejé en la bandeja de Aprobaciones (panel Responsabilidad)."
            )
            if len(pendientes) > 3:
                extra += f" Y {len(pendientes) - 3} más."
            agente.mensaje_usuario = f"{agente.mensaje_usuario}{extra}"
        if bloqueadas:
            motivos = "; ".join(b.get("motivo", "") for b in bloqueadas[:2])
            agente.mensaje_usuario = (
                f"{agente.mensaje_usuario} No ejecuté {len(bloqueadas)} acción(es) "
                f"por política: {motivos}."
            )
        if pii_encontrada:
            agente.mensaje_usuario = (
                f"{agente.mensaje_usuario} (Protegí tus datos personales: "
                f"redacté {', '.join(pii_encontrada)} antes de procesarlo.)"
            )
    else:
        # El propio modelo pidio confirmacion: se encola igual que una
        # aprobación de gobierno, para que exista un registro y un decisión.
        decision = gober.Decision(
            gober.REQUIERE_APROBACION,
            "modelo_solicita_confirmacion",
            "El modelo pidió confirmación antes de actuar.",
            "medio",
            agente.confianza,
            {"tipo": (agente.acciones[0].tipo if agente.acciones else "accion"),
             "datos": (agente.acciones[0].datos if agente.acciones else {}),
             "motivo": (agente.acciones[0].motivo if agente.acciones else "")},
        )
        peticion = gober.crear_aprobacion(db, decision, None)
        agente.resumen_estado = {
            "pendiente_confirmacion": True,
            "aprobaciones_pendientes": [{
                "id": peticion.id, "tipo": peticion.tipo_accion,
                "resumen": peticion.resumen, "motivo": peticion.motivo,
                "regla": peticion.regla, "riesgo": peticion.riesgo,
                "confianza": peticion.confianza,
            }],
        }
        gober.registrar_auditoria(
            db, actor="agente", tipo="solicitud_aprobacion", modulo="gobierno",
            descripcion=peticion.resumen, motivo=decision.motivo,
            confianza=agente.confianza, riesgo=peticion.riesgo,
            reversible=True, resultado="pendiente",
            entidad="approval_request", entidad_id=peticion.id,
        )
        agente.mensaje_usuario = (
            f"{agente.mensaje_usuario} La dejé pendiente de tu confirmación "
            "en la bandeja de Aprobaciones (panel Responsabilidad)."
        )

    db.add(ChatMessage(
        rol="assistant", contenido=agente.mensaje_usuario,
        payload=json.dumps(agente.model_dump(), ensure_ascii=False, default=str),
        categoria=agente.categoria,
    ))
    db.flush()

    return ChatResponse(
        agente=agente,
        eventos=_eventos_rango(db, date.today(), 7),
        tareas=db.scalars(select(Task).order_by(Task.estado, Task.fecha_entrega.asc().nullslast())).all(),
        registros=db.scalars(select(LogEntry).order_by(LogEntry.fecha.desc(), LogEntry.id.desc()).limit(50)).all(),
        plan=agente.resumen_estado.get("plan", {}),
        proveedor=proveedor,
        modelo=modelo,
    )


def _respeta_contrato(crudo: Any) -> bool:
    """Indica si la respuesta del modelo cumple el contrato JSON.

    Se considera válida cuando trae una categoría conocida y al menos un campo
    con contenido real (mensaje_usuario o acciones). Si el modelo devuelve un
    objeto vacio, texto libre o un JSON con otra forma, se usa el clasificador
    por reglas como red de seguridad.
    """
    if not isinstance(crudo, dict) or not crudo:
        return False
    cat = str(crudo.get("categoria") or crudo.get("categoría") or "").upper()
    categorias_validas = {
        "CALENDARIO", "TAREA_ACADEMICA", "BITACORA_GASTO", "MANTENIMIENTO", "CONVERSACION",
    }
    if cat not in categorias_validas:
        return False
    mensaje = str(crudo.get("mensaje_usuario") or "").strip()
    acciones = crudo.get("acciones") or crudo.get("actions") or []
    return bool(mensaje) or bool(acciones)


def _normalizar(crudo: dict[str, Any]) -> dict[str, Any]:
    """Aguanta respuestas del modelo con campos faltantes o nombres alternativos."""
    if not isinstance(crudo, dict):
        return {}
    cat = str(crudo.get("categoria") or crudo.get("categoría") or "CONVERSACION").upper()
    mapa = {
        "CALENDARIO": "CALENDARIO", "AGENDA": "CALENDARIO", "EVENTO": "CALENDARIO",
        "TAREA_ACADEMICA": "TAREA_ACADEMICA", "TAREA": "TAREA_ACADEMICA", "ACADEMICA": "TAREA_ACADEMICA",
        "BITACORA_GASTO": "BITACORA_GASTO", "GASTO": "BITACORA_GASTO", "BITACORA": "BITACORA_GASTO",
        "MANTENIMIENTO": "MANTENIMIENTO",
        "CONVERSACION": "CONVERSACION", "CONVERSACIÓN": "CONVERSACION", "OTRO": "CONVERSACION",
    }
    acciones = crudo.get("acciones") or crudo.get("actions") or []
    norm_acc = []
    for a in acciones:
        if not isinstance(a, dict):
            continue
        norm_acc.append({
            "tipo": str(a.get("tipo") or a.get("type") or "").lower(),
            "datos": a.get("datos") or a.get("data") or a.get("payload") or {},
            "motivo": a.get("motivo") or a.get("reason") or "",
        })
    alertas = []
    for al in crudo.get("alertas") or crudo.get("alerts") or []:
        if isinstance(al, dict):
            alertas.append({
                "tipo": str(al.get("tipo") or "general"),
                "texto": str(al.get("texto") or al.get("text") or ""),
                "prioridad": al.get("prioridad") if al.get("prioridad") in {"alta", "media", "baja"} else "media",
            })
    # Categorías detectadas: el modelo puede devolver una lista; si no, se
    # deducen de los tipos de acción presentes (soporta mensajes mixtos).
    cats_raw = crudo.get("categorias") or crudo.get("categorias_detectadas") or []
    cats: list[str] = []
    if isinstance(cats_raw, list):
        for c in cats_raw:
            cc = str(c).upper()
            if cc in mapa and mapa[cc] not in cats:
                cats.append(mapa[cc])
    if not cats:
        for acc in norm_acc:
            c = _categoria_de_accion(acc["tipo"])
            if c and c not in cats:
                cats.append(c)
    if not cats:
        cats = [mapa.get(cat, "CONVERSACION")]
    return {
        "categoria": cats[0],
        "categorias": cats,
        "intencion": str(crudo.get("intencion") or crudo.get("intention") or "")[:120],
        "confianza": float(crudo.get("confianza") or crudo.get("confidence") or 0.0),
        "mensaje_usuario": str(crudo.get("mensaje_usuario") or crudo.get("message") or "")[:2000],
        "requiere_confirmacion": bool(crudo.get("requiere_confirmacion", False)),
        "acciones": norm_acc,
        "alertas": alertas,
    }


def _registros_no_mencionados(mensaje: str, detalle: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Registros que el texto del agente todavia no nombra (para listarlos)."""
    texto = _normalizar_texto(mensaje)
    faltan: list[dict[str, Any]] = []
    for d in detalle:
        titulo = _normalizar_texto(str(d.get("titulo") or ""))
        if len(titulo) >= 4 and titulo in texto:
            continue
        faltan.append(d)
    return faltan


def _normalizar_texto(valor: str) -> str:
    import unicodedata

    base = "".join(
        c for c in unicodedata.normalize("NFKD", valor.lower()) if not unicodedata.combining(c)
    )
    return " ".join(base.split())


def _categoria_de_accion(tipo: str) -> str | None:
    """Mapea un tipo de acción a su categoría primaria (para respuestas mixtas)."""
    mapa = {
        "crear_evento": "CALENDARIO", "actualizar_evento": "CALENDARIO",
        "eliminar_evento": "CALENDARIO", "replanificar_dia": "CALENDARIO",
        "mover_bloque": "CALENDARIO",
        "crear_tarea": "TAREA_ACADEMICA", "actualizar_tarea": "TAREA_ACADEMICA",
        "completar_tarea": "TAREA_ACADEMICA", "resumir_material": "TAREA_ACADEMICA",
        "programar_estudio": "TAREA_ACADEMICA",
        "registrar_gasto": "BITACORA_GASTO",
        "registrar_mantenimiento": "MANTENIMIENTO",
        "programar_mantenimiento": "MANTENIMIENTO", "marcar_realizado": "MANTENIMIENTO",
    }
    return mapa.get(tipo)


def _get_app_settings(db: Session):
    from .models import AppSettings

    # Cada persona tiene sus propios ajustes (v11).
    from .cuentas import usuario_id_actual

    uid = usuario_id_actual()
    app = db.get(AppSettings, uid)
    if app is None:
        app = AppSettings(id=uid, usuario_id=uid)
        db.add(app)
        db.flush()
    return app


def _eventos_rango(db: Session, desde: date, dias: int):
    fin = desde + timedelta(days=dias)
    return db.scalars(
        select(Event)
        .where(Event.inicio >= datetime.combine(desde, datetime.min.time()))
        .where(Event.inicio < datetime.combine(fin, datetime.min.time()))
        .order_by(Event.inicio)
    ).all()
