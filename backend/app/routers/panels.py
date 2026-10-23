"""Router de paneles (tableros Kanban/agrupación)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from app.auth.dependencies import get_current_user_id
from app.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.models import Panel, PermisoPanel, Usuario, Tarea

router = APIRouter(prefix="/panels", tags=["panels"])

class PanelCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: Optional[str] = None
    color: str = Field("#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")
    icono: Optional[str] = None
    es_publico: bool = False

class PanelUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    icono: Optional[str] = None
    es_publico: Optional[bool] = None

class PermisoCreate(BaseModel):
    usuario_id: UUID
    rol: str = Field("viewer", pattern="^(viewer|editor|admin)$")

class PanelResponse(BaseModel):
    id: str
    nombre: str
    descripcion: Optional[str]
    color: str
    icono: Optional[str]
    es_publico: bool
    codigo_compartido: Optional[str]
    creado_at: str
    actualizado_at: str
    tareas_count: int = 0
    permisos: List[dict] = []

class PermisoResponse(BaseModel):
    id: str
    panel_id: str
    usuario_id: str
    rol: str
    usuario_email: Optional[str] = None
    usuario_display_name: Optional[str] = None
    creado_at: str

def panel_to_response(p: Panel, include_tareas: bool = False) -> PanelResponse:
    return PanelResponse(
        id=str(p.id),
        nombre=p.nombre,
        descripcion=p.descripcion,
        color=p.color,
        icono=p.icono,
        es_publico=p.es_publico,
        codigo_compartido=p.codigo_compartido,
        creado_at=p.creado_at.isoformat(),
        actualizado_at=p.actualizado_at.isoformat(),
        tareas_count=len(p.tareas) if include_tareas else 0,
        permisos=[
            {"usuario_id": str(perm.usuario_id), "rol": perm.rol}
            for perm in p.permisos
        ]
    )

@router.post("", response_model=PanelResponse, status_code=status.HTTP_201_CREATED)
async def create_panel(
    data: PanelCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    import secrets
    panel = Panel(
        usuario_id=UUID(user_id),
        codigo_compartido=secrets.token_urlsafe(10)[:20],
        **data.model_dump()
    )
    db.add(panel)
    await db.commit()
    await db.refresh(panel)
    return panel_to_response(panel)

@router.get("", response_model=List[PanelResponse])
async def list_panels(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    include_shared: bool = Query(True)
):
    """Lista paneles del usuario (propios + compartidos)."""
    # Paneles propios
    result = await db.execute(
        select(Panel)
        .options(selectinload(Panel.tareas), selectinload(Panel.permisos))
        .where(Panel.usuario_id == UUID(user_id))
        .order_by(Panel.creado_at.desc())
    )
    own_panels = result.scalars().all()
    
    # Paneles compartidos
    shared_panels = []
    if include_shared:
        result = await db.execute(
            select(Panel)
            .options(selectinload(Panel.tareas), selectinload(Panel.permisos))
            .join(PermisoPanel, Panel.id == PermisoPanel.panel_id)
            .where(
                PermisoPanel.usuario_id == UUID(user_id),
                Panel.usuario_id != UUID(user_id)
            )
        )
        shared_panels = result.scalars().all()
    
    all_panels = list(own_panels) + list(shared_panels)
    return [panel_to_response(p, True) for p in all_panels]

@router.get("/public/{codigo}", response_model=PanelResponse)
async def get_public_panel(
    codigo: str,
    db: AsyncSession = Depends(get_db)
):
    """Accede a panel público por código compartido."""
    result = await db.execute(
        select(Panel)
        .options(selectinload(Panel.tareas), selectinload(Panel.permisos))
        .where(Panel.codigo_compartido == codigo, Panel.es_publico == True)
    )
    panel = result.scalar_one_or_none()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel no encontrado o no público")
    return panel_to_response(panel, True)

@router.get("/{panel_id}", response_model=PanelResponse)
async def get_panel(
    panel_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Panel)
        .options(selectinload(Panel.tareas), selectinload(Panel.permisos))
        .where(Panel.id == panel_id)
    )
    panel = result.scalar_one_or_none()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel no encontrado")
    
    # Verificar acceso
    if panel.usuario_id != UUID(user_id):
        perm_result = await db.execute(
            select(PermisoPanel).where(
                PermisoPanel.panel_id == panel_id,
                PermisoPanel.usuario_id == UUID(user_id)
            )
        )
        if not perm_result.scalar_one_or_none() and not panel.es_publico:
            raise HTTPException(status_code=403, detail="Sin acceso a este panel")
    
    return panel_to_response(panel, True)

@router.patch("/{panel_id}", response_model=PanelResponse)
async def update_panel(
    panel_id: UUID,
    data: PanelUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Panel).where(Panel.id == panel_id, Panel.usuario_id == UUID(user_id))
    )
    panel = result.scalar_one_or_none()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel no encontrado o sin permisos")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(panel, key, value)
    panel.actualizado_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(panel)
    return panel_to_response(panel)

@router.delete("/{panel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_panel(
    panel_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Panel).where(Panel.id == panel_id, Panel.usuario_id == UUID(user_id))
    )
    panel = result.scalar_one_or_none()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel no encontrado o sin permisos")
    
    await db.delete(panel)
    await db.commit()

# Permisos
@router.post("/{panel_id}/permissions", response_model=PermisoResponse, status_code=status.HTTP_201_CREATED)
async def add_permission(
    panel_id: UUID,
    data: PermisoCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    # Verificar ownership
    result = await db.execute(
        select(Panel).where(Panel.id == panel_id, Panel.usuario_id == UUID(user_id))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Solo el owner puede gestionar permisos")
    
    # Verificar que el usuario existe
    user_result = await db.execute(select(Usuario).where(Usuario.id == data.usuario_id))
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Crear/actualizar permiso
    from sqlalchemy.dialects.postgresql import insert
    stmt = insert(PermisoPanel).values(
        panel_id=panel_id,
        usuario_id=data.usuario_id,
        rol=data.rol
    ).on_conflict_do_update(
        index_elements=["panel_id", "usuario_id"],
        set_={"rol": data.rol}
    )
    await db.execute(stmt)
    await db.commit()
    
    # Obtener permiso creado
    perm_result = await db.execute(
        select(PermisoPanel).where(
            PermisoPanel.panel_id == panel_id,
            PermisoPanel.usuario_id == data.usuario_id
        )
    )
    perm = perm_result.scalar_one()
    
    return PermisoResponse(
        id=str(perm.id),
        panel_id=str(perm.panel_id),
        usuario_id=str(perm.usuario_id),
        rol=perm.rol,
        usuario_email=target_user.id,  # Se podría hacer join para email
        usuario_display_name=target_user.display_name,
        creado_at=perm.creado_at.isoformat()
    )

@router.get("/{panel_id}/permissions", response_model=List[PermisoResponse])
async def list_permissions(
    panel_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    # Verificar ownership
    result = await db.execute(
        select(Panel).where(Panel.id == panel_id, Panel.usuario_id == UUID(user_id))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Solo el owner puede ver permisos")
    
    result = await db.execute(
        select(PermisoPanel, Usuario.display_name)
        .join(Usuario, PermisoPanel.usuario_id == Usuario.id)
        .where(PermisoPanel.panel_id == panel_id)
    )
    return [
        PermisoResponse(
            id=str(perm.id),
            panel_id=str(perm.panel_id),
            usuario_id=str(perm.usuario_id),
            rol=perm.rol,
            usuario_display_name=display_name,
            creado_at=perm.creado_at.isoformat()
        )
        for perm, display_name in result.all()
    ]

@router.delete("/{panel_id}/permissions/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_permission(
    panel_id: UUID,
    usuario_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    # Verificar ownership
    result = await db.execute(
        select(Panel).where(Panel.id == panel_id, Panel.usuario_id == UUID(user_id))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Solo el owner puede gestionar permisos")
    
    # No permitir quitar al owner
    if usuario_id == UUID(user_id):
        raise HTTPException(status_code=400, detail="No puedes quitarte a ti mismo como owner")
    
    await db.execute(
        PermisoPanel.__table__.delete().where(
            PermisoPanel.panel_id == panel_id,
            PermisoPanel.usuario_id == usuario_id
        )
    )
    await db.commit()

@router.post("/{panel_id}/toggle-public", response_model=PanelResponse)
async def toggle_public(
    panel_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Alterna visibilidad pública del panel."""
    result = await db.execute(
        select(Panel).where(Panel.id == panel_id, Panel.usuario_id == UUID(user_id))
    )
    panel = result.scalar_one_or_none()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel no encontrado")
    
    panel.es_publico = not panel.es_publico
    panel.actualizado_at = datetime.utcnow()
    await db.commit()
    await db.refresh(panel)
    return panel_to_response(panel)