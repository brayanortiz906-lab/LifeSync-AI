"""CRUD de calendario, tareas, bitácora y mantenimiento + dashboard agregado."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..cuentas import usuario_verificado
from ..database import get_db
from ..models import Event, LogEntry, Maintenance, Task
from ..schemas import (
    EventCreate,
    EventOut,
    EventUpdate,
    LogCreate,
    LogOut,
    MaintenanceCreate,
    MaintenanceOut,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)

router = APIRouter(prefix="", tags=["datos"])


# --------------------------------------------------------------------------- #
# Eventos (calendario)
# --------------------------------------------------------------------------- #
@router.get("/events", response_model=list[EventOut])
def listar_eventos(
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db, scope="function"),
):
    q = select(Event).order_by(Event.inicio)
    if desde:
        q = q.where(Event.inicio >= datetime.combine(desde, datetime.min.time()))
    if hasta:
        q = q.where(Event.inicio < datetime.combine(hasta + timedelta(days=1), datetime.min.time()))
    return db.scalars(q).all()


@router.post("/events", response_model=EventOut, status_code=201)
def crear_evento(payload: EventCreate, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    ev = Event(**payload.model_dump())
    db.add(ev)
    db.flush()
    return ev


@router.patch("/events/{evento_id}", response_model=EventOut)
def actualizar_evento(evento_id: int, payload: EventUpdate, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    ev = db.get(Event, evento_id)
    if ev is None:
        raise HTTPException(404, "Evento no encontrado")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(ev, campo, valor)
    db.flush()
    return ev


@router.delete("/events/{evento_id}", status_code=204)
def eliminar_evento(evento_id: int, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    ev = db.get(Event, evento_id)
    if ev is None:
        raise HTTPException(404, "Evento no encontrado")
    db.delete(ev)


# --------------------------------------------------------------------------- #
# Tareas académicas
# --------------------------------------------------------------------------- #
@router.get("/tasks", response_model=list[TaskOut])
def listar_tareas(estado: str | None = None, db: Session = Depends(get_db, scope="function")):
    q = select(Task).order_by(Task.estado, Task.fecha_entrega.asc().nullslast())
    if estado:
        q = q.where(Task.estado == estado)
    return db.scalars(q).all()


@router.post("/tasks", response_model=TaskOut, status_code=201)
def crear_tarea(payload: TaskCreate, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    tarea = Task(**payload.model_dump())
    db.add(tarea)
    db.flush()
    return tarea


@router.delete("/tasks/{tarea_id}")
def borrar_tarea(tarea_id: int, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    """Borra una tarea. Se puede usar desde la interfaz o para limpiar pruebas."""
    tarea = db.get(Task, tarea_id)
    if tarea is None:
        raise HTTPException(status_code=404, detail="Esa tarea no existe.")
    db.delete(tarea)
    db.commit()
    return {"ok": True, "borrada": tarea_id}


@router.patch("/tasks/{tarea_id}", response_model=TaskOut)
def actualizar_tarea(tarea_id: int, payload: TaskUpdate, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    tarea = db.get(Task, tarea_id)
    if tarea is None:
        raise HTTPException(404, "Tarea no encontrada")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(tarea, campo, valor)
    db.flush()
    return tarea


@router.post("/tasks/{tarea_id}/completar", response_model=TaskOut)
def completar_tarea(tarea_id: int, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    tarea = db.get(Task, tarea_id)
    if tarea is None:
        raise HTTPException(404, "Tarea no encontrada")
    tarea.estado = "completada"
    db.flush()
    return tarea


# --------------------------------------------------------------------------- #
# Bitácora / gastos
# --------------------------------------------------------------------------- #
@router.get("/logbook", response_model=list[LogOut])
def listar_registros(
    mes: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db, scope="function"),
):
    q = select(LogEntry).order_by(LogEntry.fecha.desc(), LogEntry.id.desc())
    if mes:
        q = q.where(func.strftime("%Y-%m", LogEntry.fecha) == mes)
    return db.scalars(q).all()


@router.post("/logbook", response_model=LogOut, status_code=201)
def registrar(payload: LogCreate, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    entrada = LogEntry(
        descripcion=payload.descripcion,
        monto=payload.monto,
        moneda=payload.moneda,
        categoria=payload.categoria,
        fecha=payload.fecha or date.today(),
        notas=payload.notas,
    )
    db.add(entrada)
    db.flush()
    return entrada


@router.delete("/logbook/{registro_id}", status_code=204)
def eliminar_registro(registro_id: int, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    reg = db.get(LogEntry, registro_id)
    if reg is None:
        raise HTTPException(404, "Registro no encontrado")
    db.delete(reg)


# --------------------------------------------------------------------------- #
# Mantenimiento
# --------------------------------------------------------------------------- #
def _enriquecer(m: Maintenance) -> MaintenanceOut:
    out = MaintenanceOut.model_validate(m)
    if m.proxima_fecha:
        out.dias_restantes = (m.proxima_fecha - date.today()).days
        out.vencido = out.dias_restantes < 0
    return out


@router.get("/maintenance", response_model=list[MaintenanceOut])
def listar_mantenimiento(db: Session = Depends(get_db, scope="function")):
    items = db.scalars(select(Maintenance).order_by(Maintenance.proxima_fecha.asc().nullslast())).all()
    return [_enriquecer(m) for m in items]


@router.post("/maintenance", response_model=MaintenanceOut, status_code=201)
def crear_mantenimiento(payload: MaintenanceCreate, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    datos = payload.model_dump()
    if datos.get("ultima_realizacion") and not datos.get("proxima_fecha"):
        datos["proxima_fecha"] = datos["ultima_realizacion"] + timedelta(days=datos.get("intervalo_dias", 90))
    mant = Maintenance(**datos)
    db.add(mant)
    db.flush()
    return _enriquecer(mant)


@router.post("/maintenance/{mant_id}/completar", response_model=MaintenanceOut)
def completar_mantenimiento(mant_id: int, db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_verificado)):
    mant = db.get(Maintenance, mant_id)
    if mant is None:
        raise HTTPException(404, "Mantenimiento no encontrado")
    mant.ultima_realizacion = date.today()
    mant.proxima_fecha = date.today() + timedelta(days=mant.intervalo_dias)
    db.flush()
    return _enriquecer(mant)


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db, scope="function")):
    hoy = date.today()
    inicio = datetime.combine(hoy, datetime.min.time())
    fin = inicio + timedelta(days=1)

    eventos_hoy = db.scalars(
        select(Event).where(Event.inicio >= inicio).where(Event.inicio < fin).order_by(Event.inicio)
    ).all()
    tareas = db.scalars(select(Task).where(Task.estado != "completada")).all()
    proximas = db.scalars(
        select(Task).where(Task.estado != "completada").where(Task.fecha_entrega.is_not(None))
        .order_by(Task.fecha_entrega).limit(5)
    ).all()
    gastos = db.scalars(
        select(LogEntry).where(func.strftime("%Y-%m", LogEntry.fecha) == hoy.strftime("%Y-%m"))
    ).all()
    mant = db.scalars(select(Maintenance).where(Maintenance.activo_flag.is_(True))).all()

    por_categoria: dict[str, float] = {}
    for g in gastos:
        por_categoria[g.categoria] = por_categoria.get(g.categoria, 0.0) + (g.monto or 0.0)

    return {
        "fecha": hoy.isoformat(),
        "eventos_hoy": [
            {
                "id": e.id, "titulo": e.titulo, "categoria": e.categoria,
                "inicio": e.inicio.isoformat(), "fin": e.fin.isoformat(),
                "inamovible": e.inamovible, "notas": e.notas, "fuente": e.fuente,
                "duracion_min": e.duracion_min,
            }
            for e in eventos_hoy
        ],
        "carga": {
            "minutos_productivos": sum(e.duracion_min for e in eventos_hoy if e.categoria in {"estudio", "clase", "trabajo"}),
            "minutos_descanso": sum(e.duracion_min for e in eventos_hoy if e.categoria == "descanso"),
            "total_bloques": len(eventos_hoy),
        },
        "tareas_pendientes": len(tareas),
        "proximas_entregas": [
            {"id": t.id, "titulo": t.titulo, "materia": t.materia,
             "fecha_entrega": t.fecha_entrega.isoformat() if t.fecha_entrega else None,
             "prioridad": t.prioridad}
            for t in proximas
        ],
        "gasto_mes": {
            "total": round(sum(g.monto or 0 for g in gastos), 2),
            "moneda": gastos[0].moneda if gastos else "COP",
            "por_categoria": {k: round(v, 2) for k, v in por_categoria.items()},
            "conteo": len(gastos),
        },
        "mantenimiento": [
            {"id": m.id, "activo": m.activo, "tarea": m.tarea,
             "proxima_fecha": m.proxima_fecha.isoformat() if m.proxima_fecha else None,
             "dias_restantes": (m.proxima_fecha - hoy).days if m.proxima_fecha else None,
             "costo_estimado": m.costo_estimado}
            for m in mant
        ],
    }
