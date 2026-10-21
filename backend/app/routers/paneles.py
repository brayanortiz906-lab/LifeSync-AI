"""Endpoints de paneles: espacios de trabajo con acceso por persona (v19).

Rutas
-----
* ``GET    /api/paneles``                 paneles propios y compartidos contigo.
* ``POST   /api/paneles``                 creas un panel.
* ``PATCH  /api/paneles/{id}``            lo renombras (solo el dueño).
* ``DELETE /api/paneles/{id}``            lo borras (solo el dueño).
* ``GET    /api/paneles/{id}/miembros``    quien tiene acceso.
* ``POST   /api/paneles/{id}/compartir``  das acceso por correo.
* ``DELETE /api/paneles/{id}/compartir/{usuario_id}``  quitas el acceso.
* ``GET    /api/paneles/{id}/datos``       contenido del panel (si tienes permiso).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..cuentas import usuario_actual
from ..cuentas import usuario_verificado
from ..database import get_db
from ..paneles import (
    NIVELES,
    TIPOS_PANEL,
    compartir,
    crear_panel,
    datos_del_panel,
    eliminar_panel,
    miembros,
    mover_al_panel,
    panel_con_acceso,
    paneles_compartidos,
    paneles_propios,
    resumen_panel,
    revocar,
)

router = APIRouter(prefix="/api/paneles", tags=["paneles"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class PanelIn(BaseModel):
    nombre: str = ""
    tipo: str = "agenda"
    color: str = "indigo"
    descripcion: str = ""
    #: Si es True, lo que la persona tiene sin panel pasa a este panel.
    mover_personal: bool = False


class PanelPatch(BaseModel):
    nombre: str | None = None
    color: str | None = None
    descripcion: str | None = None


class CompartirIn(BaseModel):
    correo: str = ""
    nivel: str = "ver"


# --------------------------------------------------------------------------- #
# Rutas
# --------------------------------------------------------------------------- #
@router.get("/tipos")
def tipos():
    """Tipos de panel sugeridos."""
    return {"tipos": list(TIPOS_PANEL), "niveles": list(NIVELES)}


@router.get("")
def listar_paneles(
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_verificado),
):
    """Tus paneles: los tuyos y los que otras personas te compartieron."""
    salida = []
    for panel in paneles_propios(db, usuario.id):
        datos = resumen_panel(db, panel)
        salida.append(
            {
                "id": panel.id,
                "nombre": panel.nombre,
                "tipo": panel.tipo,
                "color": panel.color,
                "descripcion": panel.descripcion or "",
                "rol": "dueno",
                "es_propio": True,
                "miembros": len(miembros(db, panel)),
                "eventos": datos["eventos"],
                "tareas": datos["tareas"],
            }
        )
    for panel, nivel in paneles_compartidos(db, usuario.id):
        datos = resumen_panel(db, panel)
        salida.append(
            {
                "id": panel.id,
                "nombre": panel.nombre,
                "tipo": panel.tipo,
                "color": panel.color,
                "descripcion": panel.descripcion or "",
                "rol": nivel,
                "es_propio": False,
                "miembros": 0,
                "eventos": datos["eventos"],
                "tareas": datos["tareas"],
            }
        )
    return {"ok": True, "paneles": salida}


@router.post("")
def crear(
    payload: PanelIn,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_verificado)):
    """Crea un panel a tu nombre."""
    panel = crear_panel(
        db, usuario.id, payload.nombre, payload.tipo, payload.color, payload.descripcion
    )
    if payload.mover_personal:
        mover_al_panel(db, panel)
    db.flush()
    return {
        "ok": True,
        "panel": {
            "id": panel.id,
            "nombre": panel.nombre,
            "tipo": panel.tipo,
            "color": panel.color,
            "descripcion": panel.descripcion or "",
            "rol": "dueno",
            "es_propio": True,
            "miembros": 0,
            "eventos": 0,
            "tareas": 0,
        },
    }


@router.patch("/{panel_id}")
def editar(
    panel_id: int,
    payload: PanelPatch,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_verificado)):
    """Renombra o colorea un panel (solo su dueño)."""
    panel, rol = panel_con_acceso(db, panel_id, usuario.id)
    if rol != "dueno":
        raise HTTPException(
            status_code=403, detail="Solo quien creo el panel puede cambiarlo."
        )
    if payload.nombre is not None and payload.nombre.strip():
        panel.nombre = payload.nombre.strip()[:80]
    if payload.color is not None and payload.color.strip():
        panel.color = payload.color.strip()[:16]
    if payload.descripcion is not None:
        panel.descripcion = payload.descripcion.strip()[:400] or None
    db.flush()
    return {"ok": True, "id": panel.id, "nombre": panel.nombre}


@router.delete("/{panel_id}")
def borrar(
    panel_id: int,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_verificado)):
    """Borra el panel; su contenido vuelve a tu panel personal."""
    panel, rol = panel_con_acceso(db, panel_id, usuario.id)
    if rol != "dueno":
        raise HTTPException(
            status_code=403, detail="Solo quien creo el panel puede borrarlo."
        )
    eliminar_panel(db, panel)
    return {"ok": True}


@router.get("/{panel_id}/miembros")
def listar_miembros(
    panel_id: int,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_verificado),
):
    """Quien tiene acceso a este panel."""
    panel, _ = panel_con_acceso(db, panel_id, usuario.id)
    return {"ok": True, "miembros": miembros(db, panel)}


@router.post("/{panel_id}/compartir")
def compartir_panel(
    panel_id: int,
    payload: CompartirIn,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_verificado)):
    """Da acceso a otra persona (por correo). Solo el dueño."""
    panel, rol = panel_con_acceso(db, panel_id, usuario.id)
    if rol != "dueno":
        raise HTTPException(
            status_code=403, detail="Solo quien creo el panel puede compartirlo."
        )
    permiso = compartir(db, panel, payload.correo, payload.nivel)
    return {
        "ok": True,
        "permiso": {
            "usuario_id": permiso.usuario_id,
            "correo": payload.correo.strip().lower(),
            "nivel": permiso.nivel,
        },
    }


@router.delete("/{panel_id}/compartir/{usuario_id}")
def quitar_acceso(
    panel_id: int,
    usuario_id: int,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_verificado)):
    """Quita el acceso de una persona (solo el dueño)."""
    panel, rol = panel_con_acceso(db, panel_id, usuario.id)
    if rol != "dueno":
        raise HTTPException(
            status_code=403, detail="Solo quien creo el panel puede quitar accesos."
        )
    ok = revocar(db, panel, usuario_id)
    return {"ok": ok}


@router.get("/{panel_id}/datos")
def datos(
    panel_id: int,
    db: Session = Depends(get_db, scope="function"),
    usuario=Depends(usuario_verificado),
):
    """Contenido del panel. Si no tienes permiso: 403 con mensaje claro."""
    panel, rol = panel_con_acceso(db, panel_id, usuario.id)
    contenido = datos_del_panel(db, panel)
    contenido["rol"] = rol
    contenido["panel_id"] = panel.id
    contenido["nombre"] = panel.nombre
    return {"ok": True, **contenido}
