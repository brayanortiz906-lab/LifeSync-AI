"""Carga inicial de la app en UNA sola peticion (v36).

La app hacia 11 peticiones al abrirse (agenda, tareas, bitacora, mantenimiento,
paneles, ajustes, politica, auditoria, cumplimiento y permisos). En una
conexion lenta (o con el servicio de la nube recien despertando) eso se
notaba mucho. Aqui se junta todo en un solo viaje.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..cuentas import usuario_actual
from ..database import get_db
from . import crud, responsabilidad

router = APIRouter(prefix="/api/inicio", tags=["inicio"])


@router.get("")
def inicio(db: Session = Depends(get_db, scope="function"), usuario=Depends(usuario_actual)):
    """Todo lo que la app necesita al abrirse, en una sola peticion."""
    from .. import paneles as pan
    from .. import permisos as perm
    from .. import policy as gober
    from ..routers.agent import leer_settings
    from ..schemas import EventOut, LogOut, PolicyOut, TaskOut

    hoy = date.today()
    mes = f"{hoy.year}-{hoy.month:02d}"
    # OJO: estas funciones de crud devuelven objetos de SQLAlchemy y se
    # serializan bien SOLO cuando las llama FastAPI con su response_model.
    # Aqui se llaman directamente, asi que hay que convertirlas a mano: si no,
    # campos calculados como `duracion_min` no viajan y la interfaz ve
    # "NaN h de tiempo ocupado".
    eventos = [
        EventOut.model_validate(e)
        for e in crud.listar_eventos(desde=hoy - timedelta(days=7), hasta=hoy + timedelta(days=60), db=db)
    ]
    tareas = [TaskOut.model_validate(t) for t in crud.listar_tareas(db=db)]
    registros = [LogOut.model_validate(r) for r in crud.listar_registros(mes=mes, db=db)]
    return {
        "ok": True,
        "dashboard": crud.dashboard(db=db),
        "eventos": eventos,
        "tareas": tareas,
        "registros": registros,
        "mantenimiento": crud.listar_mantenimiento(db=db),
        "paneles": _paneles(db, usuario),
        "ajustes": leer_settings(db=db),
        "politica": PolicyOut.model_validate(gober.obtener_politica(db)),
        "resumen_auditoria": responsabilidad.resumen_auditoria(db=db),
        "cumplimiento": responsabilidad.cumplimiento(db=db),
        "permisos": perm.estado(db),
        "aprobaciones": _aprobaciones(db),
    }


def _aprobaciones(db: Session) -> list:
    """Aprobaciones pendientes de la persona."""
    from . import responsabilidad as resp

    try:
        return resp.listar_aprobaciones(db=db, estado="pendiente", limite=50)
    except Exception:
        return []


def _paneles(db: Session, usuario) -> dict:
    """Los paneles con la misma forma que devuelve /api/paneles."""
    from . import paneles as paneles_router

    try:
        return paneles_router.listar_paneles(db=db, usuario=usuario)
    except Exception:
        return {"ok": True, "paneles": []}
