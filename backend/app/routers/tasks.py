"""Router de tareas."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from app.auth.dependencies import get_current_user_id
from app.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models import Tarea, Panel

router = APIRouter(prefix="/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=200)
    descripcion: Optional[str] = None
    fecha_vencimiento: Optional[datetime] = None
    fecha_recordatorio: Optional[datetime] = None
    prioridad: int = Field(0, ge=0, le=2)
    rrule: Optional[str] = None
    panel_id: Optional[UUID] = None
    orden: int = 0

class TaskUpdate(BaseModel):
    titulo: Optional[str] = Field(None, min_length=1, max_length=200)
    descripcion: Optional[str] = None
    completada: Optional[bool] = None
    prioridad: Optional[int] = Field(None, ge=0, le=2)
    fecha_vencimiento: Optional[datetime] = None
    fecha_recordatorio: Optional[datetime] = None
    rrule: Optional[str] = None
    panel_id: Optional[UUID] = None
    orden: Optional[int] = None

class TaskResponse(BaseModel):
    id: str
    titulo: str
    descripcion: Optional[str]
    completada: bool
    prioridad: int
    fecha_vencimiento: Optional[str]
    fecha_recordatorio: Optional[str]
    rrule: Optional[str]
    orden: int
    panel_id: Optional[str]
    created_at: str
    updated_at: str
    completada_at: Optional[str]

def task_to_response(t: Tarea) -> TaskResponse:
    return TaskResponse(
        id=str(t.id),
        titulo=t.titulo,
        descripcion=t.descripcion,
        completada=t.completada,
        prioridad=t.prioridad,
        fecha_vencimiento=t.fecha_vencimiento.isoformat() if t.fecha_vencimiento else None,
        fecha_recordatorio=t.fecha_recordatorio.isoformat() if t.fecha_recordatorio else None,
        rrule=t.rrule,
        orden=t.orden,
        panel_id=str(t.panel_id) if t.panel_id else None,
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
        completada_at=t.completada_at.isoformat() if t.completada_at else None
    )

@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    task = Tarea(
        usuario_id=UUID(user_id),
        **data.model_dump()
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task_to_response(task)

@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    completada: Optional[bool] = Query(None),
    panel_id: Optional[UUID] = Query(None),
    prioridad: Optional[int] = Query(None, ge=0, le=2),
    vencidas: bool = Query(False),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0)
):
    query = select(Tarea).where(Tarea.usuario_id == UUID(user_id))
    
    if completada is not None:
        query = query.where(Tarea.completada == completada)
    if panel_id:
        query = query.where(Tarea.panel_id == panel_id)
    if prioridad is not None:
        query = query.where(Tarea.prioridad == prioridad)
    if vencidas:
        query = query.where(
            Tarea.fecha_vencimiento < datetime.utcnow(),
            Tarea.completada == False
        )
    
    query = query.order_by(Tarea.orden, Tarea.created_at).limit(limit).offset(offset)
    result = await db.execute(query)
    return [task_to_response(t) for t in result.scalars().all()]

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tarea).where(Tarea.id == task_id, Tarea.usuario_id == UUID(user_id))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return task_to_response(task)

@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    data: TaskUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tarea).where(Tarea.id == task_id, Tarea.usuario_id == UUID(user_id))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Manejar completada_at
    if "completada" in update_data and update_data["completada"] and not task.completada:
        update_data["completada_at"] = datetime.utcnow()
    elif "completada" in update_data and not update_data["completada"] and task.completada:
        update_data["completada_at"] = None
    
    for key, value in update_data.items():
        setattr(task, key, value)
    task.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(task)
    return task_to_response(task)

@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tarea).where(Tarea.id == task_id, Tarea.usuario_id == UUID(user_id))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    await db.delete(task)
    await db.commit()

@router.post("/bulk-update", response_model=List[TaskResponse])
async def bulk_update_tasks(
    updates: List[dict],  # [{"id": "...", "completada": true, "orden": 1}, ...]
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza múltiples tareas (para reordenar, completar en lote)."""
    results = []
    for update in updates:
        task_id = update.pop("id")
        result = await db.execute(
            select(Tarea).where(Tarea.id == UUID(task_id), Tarea.usuario_id == UUID(user_id))
        )
        task = result.scalar_one_or_none()
        if task:
            if "completada" in update and update["completada"] and not task.completada:
                update["completada_at"] = datetime.utcnow()
            elif "completada" in update and not update["completada"] and task.completada:
                update["completada_at"] = None
            
            for key, value in update.items():
                setattr(task, key, value)
            task.updated_at = datetime.utcnow()
            results.append(task_to_response(task))
    
    await db.commit()
    return results

@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_tasks(
    task_ids: List[UUID],
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tarea).where(
            Tarea.id.in_(task_ids),
            Tarea.usuario_id == UUID(user_id)
        )
    )
    tasks = result.scalars().all()
    for t in tasks:
        await db.delete(t)
    await db.commit()
    return {"deleted": len(tasks)}