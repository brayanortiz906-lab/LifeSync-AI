"""Paneles: espacios de trabajo con acceso por persona (v19).

Un panel es un trozo de vida con nombre propio ("Mi trabajo", "La casa",
"Universidad"). Cada panel tiene un dueño y se puede compartir con otras
cuentas con dos niveles:

  - ``ver``    la persona puede mirar el contenido, pero no cambiarlo.
  - ``editar`` la persona puede mirar y además agregar cosas.

Nadie ve un panel que no sea suyo sin un permiso explícito: el dueño lo
comparte por correo, una sola vez, y puede quitárselo cuando quiera.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as SASession

from .cuentas import USUARIO_LOCAL, Usuario, como_usuario
from .models import Event, LogEntry, Maintenance, Panel, PermisoPanel, Task

#: Tipos de panel sugeridos (la persona puede escribir el que quiera).
TIPOS_PANEL = (
    {"id": "agenda", "nombre": "Agenda y vida diaria", "color": "indigo"},
    {"id": "academia", "nombre": "Estudio y universidad", "color": "sky"},
    {"id": "finanzas", "nombre": "Dinero y gastos", "color": "emerald"},
    {"id": "hogar", "nombre": "Casa y mantenimiento", "color": "amber"},
    {"id": "personal", "nombre": "Personal", "color": "violet"},
)

NIVELES = ("ver", "editar")


# --------------------------------------------------------------------------- #
# Alta y consulta
# --------------------------------------------------------------------------- #
def crear_panel(
    db: SASession,
    usuario_id: int,
    nombre: str,
    tipo: str = "agenda",
    color: str = "indigo",
    descripcion: str = "",
) -> Panel:
    """Crea un panel para esa persona."""
    nombre = (nombre or "").strip()[:80]
    if not nombre:
        raise HTTPException(status_code=400, detail="Ponle un nombre al panel.")
    panel = Panel(
        nombre=nombre,
        tipo=(tipo or "agenda")[:32],
        color=(color or "indigo")[:16],
        descripcion=(descripcion or "").strip()[:400] or None,
        usuario_id=usuario_id,
    )
    db.add(panel)
    db.flush()
    return panel


def paneles_propios(db: SASession, usuario_id: int) -> list[Panel]:
    return list(
        db.scalars(
            select(Panel).where(Panel.usuario_id == usuario_id).order_by(Panel.id)
        ).all()
    )


def _dueño_de(db: SASession, panel_id: int) -> int | None:
    """Dueño de un panel (SQL directo: el filtro de sesion lo esconderia)."""
    from sqlalchemy import text

    fila = db.execute(
        text("SELECT usuario_id FROM paneles WHERE id = :pid"), {"pid": panel_id}
    ).first()
    return int(fila[0]) if fila else None


def _leer_panel(db: SASession, panel_id: int) -> Panel | None:
    """Lee un panel sea de quien sea (con permiso o no)."""
    dueno = _dueño_de(db, panel_id)
    if dueno is None:
        return None
    with como_usuario(dueno):
        return db.get(Panel, panel_id)


def paneles_compartidos(db: SASession, usuario_id: int) -> list[tuple[Panel, str]]:
    """Paneles de otras personas que nos compartieron, con nuestro nivel."""
    permisos = db.scalars(
        select(PermisoPanel).where(PermisoPanel.usuario_id == usuario_id)
    ).all()
    salida: list[tuple[Panel, str]] = []
    for permiso in permisos:
        panel = _leer_panel(db, permiso.panel_id)
        if panel is not None:
            salida.append((panel, permiso.nivel))
    return salida


def panel_por_id(db: SASession, panel_id: int) -> Panel | None:
    return _leer_panel(db, panel_id)


def rol_de(db: SASession, panel_id: int, usuario_id: int) -> str | None:
    """'dueno', 'editar', 'lector' o None si no hay acceso."""
    panel = _leer_panel(db, panel_id)
    if panel is None:
        return None
    if panel.usuario_id == usuario_id:
        return "dueno"
    permiso = db.scalars(
        select(PermisoPanel).where(
            PermisoPanel.panel_id == panel_id, PermisoPanel.usuario_id == usuario_id
        )
    ).first()
    return permiso.nivel if permiso else None


def panel_con_acceso(db: SASession, panel_id: int, usuario_id: int) -> tuple[Panel, str]:
    """Devuelve (panel, rol) o corta la peticion con un mensaje claro."""
    panel = _leer_panel(db, panel_id)
    if panel is None:
        raise HTTPException(status_code=404, detail="Ese panel ya no existe.")
    rol = rol_de(db, panel_id, usuario_id)
    if rol is None:
        raise HTTPException(
            status_code=403,
            detail=(
                "Este panel es de otra persona. Pidele que te lo comparta "
                "desde 'Paneles' para poder verlo."
            ),
        )
    return panel, rol


def miembros(db: SASession, panel: Panel) -> list[dict]:
    """Personas con acceso al panel (ademas del dueño)."""
    permisos = db.scalars(
        select(PermisoPanel).where(PermisoPanel.panel_id == panel.id)
    ).all()
    salida: list[dict] = []
    for permiso in permisos:
        usuario = db.get(Usuario, permiso.usuario_id)
        salida.append(
            {
                "usuario_id": permiso.usuario_id,
                "correo": usuario.correo if usuario else "",
                "nombre": (usuario.nombre if usuario else "") or (usuario.correo if usuario else ""),
                "nivel": permiso.nivel,
                "creado_en": permiso.creado_en.isoformat() if permiso.creado_en else "",
            }
        )
    return salida


def compartir(
    db: SASession, panel: Panel, correo: str, nivel: str = "ver"
) -> PermisoPanel:
    """Da acceso a un panel a la persona con ese correo."""
    correo = (correo or "").strip().lower()
    if nivel not in NIVELES:
        nivel = "ver"
    if not correo or "@" not in correo:
        raise HTTPException(status_code=400, detail="Escribe un correo valido.")
    usuario = db.scalars(select(Usuario).where(Usuario.correo == correo)).first()
    if usuario is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Esa persona todavia no tiene cuenta en LifeAgente. Que entre "
                "con ese correo y despues vuelve a compartirle el panel."
            ),
        )
    if usuario.id == panel.usuario_id:
        raise HTTPException(status_code=400, detail="Ese panel ya es tuyo.")
    permiso = db.scalars(
        select(PermisoPanel).where(
            PermisoPanel.panel_id == panel.id, PermisoPanel.usuario_id == usuario.id
        )
    ).first()
    if permiso is None:
        permiso = PermisoPanel(panel_id=panel.id, usuario_id=usuario.id, nivel=nivel)
        db.add(permiso)
    else:
        permiso.nivel = nivel
    db.flush()
    return permiso


def revocar(db: SASession, panel: Panel, usuario_id: int) -> bool:
    permiso = db.scalars(
        select(PermisoPanel).where(
            PermisoPanel.panel_id == panel.id, PermisoPanel.usuario_id == usuario_id
        )
    ).first()
    if permiso is None:
        return False
    db.delete(permiso)
    db.flush()
    return True


def eliminar_panel(db: SASession, panel: Panel) -> None:
    """Borra el panel; su contenido vuelve al panel personal del dueño."""
    for modelo in (Event, Task, LogEntry, Maintenance):
        filas = db.scalars(
            select(modelo).where(modelo.panel_id == panel.id)
        ).all()
        for fila in filas:
            fila.panel_id = None
    permisos = db.scalars(
        select(PermisoPanel).where(PermisoPanel.panel_id == panel.id)
    ).all()
    for permiso in permisos:
        db.delete(permiso)
    db.delete(panel)
    db.flush()


# --------------------------------------------------------------------------- #
# Contenido de un panel
# --------------------------------------------------------------------------- #
def mover_al_panel(db: SASession, panel: Panel) -> int:
    """Pasa al panel todo lo que la persona tiene sin panel (su contenido personal)."""
    movidos = 0
    for modelo in (Event, Task, LogEntry, Maintenance):
        filas = db.scalars(
            select(modelo).where(modelo.panel_id.is_(None))
        ).all()
        for fila in filas:
            fila.panel_id = panel.id
            movidos += 1
    db.flush()
    return movidos


def _fila(fila) -> dict:
    datos = {}
    for col in fila.__table__.columns:
        if col.name in ("id", "usuario_id"):
            continue
        valor = getattr(fila, col.name)
        datos[col.name] = valor.isoformat() if hasattr(valor, "isoformat") else valor
    return datos


def datos_del_panel(db: SASession, panel: Panel) -> dict:
    """Contenido del panel (se lee como el dueño, con permiso de la persona)."""
    with como_usuario(panel.usuario_id):
        eventos = db.scalars(
            select(Event).where(Event.panel_id == panel.id).order_by(Event.inicio)
        ).all()
        tareas = db.scalars(
            select(Task).where(Task.panel_id == panel.id).order_by(Task.id.desc())
        ).all()
        registros = db.scalars(
            select(LogEntry).where(LogEntry.panel_id == panel.id).order_by(LogEntry.fecha.desc())
        ).all()
        mantenimiento = db.scalars(
            select(Maintenance).where(Maintenance.panel_id == panel.id).order_by(Maintenance.id)
        ).all()
    return {
        "eventos": [_fila(f) for f in eventos],
        "tareas": [_fila(f) for f in tareas],
        "registros": [_fila(f) for f in registros],
        "mantenimiento": [_fila(f) for f in mantenimiento],
    }


def resumen_panel(db: SASession, panel: Panel) -> dict:
    """Numero de cosas que tiene el panel (para la lista)."""
    with como_usuario(panel.usuario_id):
        eventos = db.scalars(select(Event).where(Event.panel_id == panel.id)).all()
        tareas = db.scalars(select(Task).where(Task.panel_id == panel.id)).all()
    return {"eventos": len(eventos), "tareas": len(tareas)}
