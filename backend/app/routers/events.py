"""Router de eventos (calendario)."""
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
from app.models import Evento, EventType

router = APIRouter(prefix="/events", tags=["events"])

class EventCreate(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=200)
    descripcion: Optional[str] = None
    tipo: EventType = EventType.EVENT
    inicio: datetime
    fin: Optional[datetime] = None
    todo_dia: bool = False
    rrule: Optional[str] = None
    google_event_id: Optional[str] = None
    google_calendar_id: Optional[str] = None

class EventUpdate(BaseModel):
    titulo: Optional[str] = Field(None, min_length=1, max_length=200)
    descripcion: Optional[str] = None
    tipo: Optional[EventType] = None
    inicio: Optional[datetime] = None
    fin: Optional[datetime] = None
    todo_dia: Optional[bool] = None
    rrule: Optional[str] = None
    google_event_id: Optional[str] = None
    google_calendar_id: Optional[str] = None
    sync_status: Optional[str] = None

class EventResponse(BaseModel):
    id: str
    titulo: str
    descripcion: Optional[str]
    tipo: str
    inicio: str
    fin: Optional[str]
    todo_dia: bool
    rrule: Optional[str]
    google_event_id: Optional[str]
    google_calendar_id: Optional[str]
    sync_status: str
    created_at: str
    updated_at: str

def event_to_response(e: Evento) -> EventResponse:
    return EventResponse(
        id=str(e.id),
        titulo=e.titulo,
        descripcion=e.descripcion,
        tipo=e.tipo.value,
        inicio=e.inicio.isoformat(),
        fin=e.fin.isoformat() if e.fin else None,
        todo_dia=e.todo_dia,
        rrule=e.rrule,
        google_event_id=e.google_event_id,
        google_calendar_id=e.google_calendar_id,
        sync_status=e.sync_status,
        created_at=e.created_at.isoformat(),
        updated_at=e.updated_at.isoformat()
    )

@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    event = Evento(
        usuario_id=UUID(user_id),
        **data.model_dump()
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event_to_response(event)

@router.get("", response_model=List[EventResponse])
async def list_events(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    desde: Optional[datetime] = Query(None),
    hasta: Optional[datetime] = Query(None),
    tipo: Optional[EventType] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0)
):
    query = select(Evento).where(Evento.usuario_id == UUID(user_id))
    
    if desde:
        query = query.where(Evento.inicio >= desde)
    if hasta:
        query = query.where(Evento.inicio <= hasta)
    if tipo:
        query = query.where(Evento.tipo == tipo)
    
    query = query.order_by(Evento.inicio).limit(limit).offset(offset)
    result = await db.execute(query)
    events = result.scalars().all()
    
    return [event_to_response(e) for e in events]

@router.get("/range", response_model=List[EventResponse])
async def get_events_range(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    desde: datetime = Query(...),
    hasta: datetime = Query(...)
):
    """Eventos en rango de fechas (para vista calendario)."""
    result = await db.execute(
        select(Evento)
        .where(
            Evento.usuario_id == UUID(user_id),
            Evento.inicio >= desde,
            Evento.inicio <= hasta
        )
        .order_by(Evento.inicio)
    )
    return [event_to_response(e) for e in result.scalars().all()]

@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Evento).where(Evento.id == event_id, Evento.usuario_id == UUID(user_id))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return event_to_response(event)

@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: UUID,
    data: EventUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Evento).where(Evento.id == event_id, Evento.usuario_id == UUID(user_id))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)
    event.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(event)
    return event_to_response(event)

@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Evento).where(Evento.id == event_id, Evento.usuario_id == UUID(user_id))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    
    await db.delete(event)
    await db.commit()

@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_events(
    event_ids: List[UUID],
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Elimina múltiples eventos."""
    result = await db.execute(
        select(Evento).where(
            Evento.id.in_(event_ids),
            Evento.usuario_id == UUID(user_id)
        )
    )
    events = result.scalars().all()
    for e in events:
        await db.delete(e)
    await db.commit()
    return {"deleted": len(events)}