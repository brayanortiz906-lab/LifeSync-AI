"""Chat router with Gemini integration (BYOK)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
import json
import asyncio
from datetime import datetime

from app.auth.dependencies import get_current_user_id
from app.services.gemini import gemini_service, SYSTEM_PROMPTS, get_user_gemini_key
from app.database import get_db, get_db_session
from app.models import Chat, MensajeChat
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

class ChatCreate(BaseModel):
    titulo: Optional[str] = None
    modelo: str = "gemini-1.5-flash"
    system_prompt: Optional[str] = None

class ChatResponse(BaseModel):
    id: str
    titulo: Optional[str]
    modelo: str
    creado_at: str
    actualizado_at: str
    mensaje_count: int

class MensajeCreate(BaseModel):
    contenido: str = Field(..., min_length=1, max_length=50000)
    rol: str = "user"

class MensajeResponse(BaseModel):
    id: str
    rol: str
    contenido: str
    tokens_entrada: Optional[int]
    tokens_salida: Optional[int]
    modelo: Optional[str]
    creado_at: str

class ChatWithMessages(BaseModel):
    id: str
    titulo: Optional[str]
    modelo: str
    system_prompt: Optional[str]
    creado_at: str
    actualizado_at: str
    mensajes: List[MensajeResponse]

@router.post("", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
async def create_chat(
    data: ChatCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Crea nuevo chat."""
    chat = Chat(
        usuario_id=UUID(user_id),
        titulo=data.titulo,
        modelo=data.modelo,
        system_prompt=data.system_prompt or SYSTEM_PROMPTS["default"]
    )
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    
    return ChatResponse(
        id=str(chat.id),
        titulo=chat.titulo,
        modelo=chat.modelo,
        creado_at=chat.creado_at.isoformat(),
        actualizado_at=chat.actualizado_at.isoformat(),
        mensaje_count=0
    )

@router.get("", response_model=List[ChatResponse])
async def list_chats(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0)
):
    """Lista chats del usuario."""
    result = await db.execute(
        select(Chat)
        .where(Chat.usuario_id == UUID(user_id))
        .order_by(Chat.actualizado_at.desc())
        .limit(limit)
        .offset(offset)
    )
    chats = result.scalars().all()
    
    return [
        ChatResponse(
            id=str(c.id),
            titulo=c.titulo,
            modelo=c.modelo,
            creado_at=c.creado_at.isoformat(),
            actualizado_at=c.actualizado_at.isoformat(),
            mensaje_count=len(c.mensajes)
        )
        for c in chats
    ]

@router.get("/{chat_id}", response_model=ChatWithMessages)
async def get_chat(
    chat_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene chat con mensajes."""
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.mensajes))
        .where(Chat.id == chat_id, Chat.usuario_id == UUID(user_id))
    )
    chat = result.scalar_one_or_none()
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat no encontrado")
    
    return ChatWithMessages(
        id=str(chat.id),
        titulo=chat.titulo,
        modelo=chat.modelo,
        system_prompt=chat.system_prompt,
        creado_at=chat.creado_at.isoformat(),
        actualizado_at=chat.actualizado_at.isoformat(),
        mensajes=[
            MensajeResponse(
                id=str(m.id),
                rol=m.rol,
                contenido=m.contenido,
                tokens_entrada=m.tokens_entrada,
                tokens_salida=m.tokens_salida,
                modelo=m.modelo,
                creado_at=m.creado_at.isoformat()
            )
            for m in chat.mensajes
        ]
    )

@router.post("/{chat_id}/messages", response_model=MensajeResponse)
async def send_message(
    chat_id: UUID,
    data: MensajeCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    stream: bool = Query(False)
):
    """Envía mensaje y obtiene respuesta de Gemini (BYOK)."""
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.mensajes))
        .where(Chat.id == chat_id, Chat.usuario_id == UUID(user_id))
    )
    chat = result.scalar_one_or_none()
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat no encontrado")
    
    # Obtener API key del usuario
    api_key = await get_user_gemini_key(user_id)
    if not api_key:
        raise HTTPException(
            status_code=400, 
            detail="No tienes API key de Gemini configurada. Ve a Ajustes > IA y añade tu key de Google AI Studio."
        )
    
    # Guardar mensaje usuario
    user_msg = MensajeChat(
        chat_id=chat_id,
        usuario_id=UUID(user_id),
        rol="user",
        contenido=data.contenido
    )
    db.add(user_msg)
    
    # Preparar historial
    history = [
        {"role": m.rol, "parts": [m.contenido]}
        for m in chat.mensajes[-20:]
    ]
    history.append({"role": "user", "parts": [data.contenido]})
    
    try:
        if stream:
            async def generate_stream():
                full_response = ""
                async for chunk in gemini_service.generate_stream(
                    api_key=api_key,
                    prompt=data.contenido,
                    model=chat.modelo,
                    system_prompt=chat.system_prompt,
                    history=history[:-1]
                ):
                    full_response += chunk
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                
                async with get_db_session(user_id) as session:
                    assistant_msg = MensajeChat(
                        chat_id=chat_id,
                        usuario_id=UUID(user_id),
                        rol="assistant",
                        contenido=full_response,
                        modelo=chat.modelo
                    )
                    session.add(assistant_msg)
                    chat.actualizado_at = datetime.utcnow()
                    await session.commit()
                
                yield f"data: {json.dumps({'done': True})}\n\n"
            
            return StreamingResponse(
                generate_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        else:
            response = await gemini_service.generate(
                api_key=api_key,
                prompt=data.contenido,
                model=chat.modelo,
                system_prompt=chat.system_prompt,
                history=history[:-1]
            )
            
            assistant_content = response.text
            tokens_in = response.usage_metadata.prompt_token_count if response.usage_metadata else None
            tokens_out = response.usage_metadata.candidates_token_count if response.usage_metadata else None
            
            assistant_msg = MensajeChat(
                chat_id=chat_id,
                usuario_id=UUID(user_id),
                rol="assistant",
                contenido=assistant_content,
                tokens_entrada=tokens_in,
                tokens_salida=tokens_out,
                modelo=chat.modelo
            )
            db.add(assistant_msg)
            chat.actualizado_at = datetime.utcnow()
            await db.commit()
            await db.refresh(assistant_msg)
            
            return MensajeResponse(
                id=str(assistant_msg.id),
                rol=assistant_msg.rol,
                contenido=assistant_msg.contenido,
                tokens_entrada=assistant_msg.tokens_entrada,
                tokens_salida=assistant_msg.tokens_salida,
                modelo=assistant_msg.modelo,
                creado_at=assistant_msg.creado_at.isoformat()
            )
            
    except Exception as e:
        logger.error(f"Error generando respuesta Gemini: {e}")
        raise HTTPException(status_code=500, detail=f"Error del modelo IA: {str(e)}")

@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Elimina chat y sus mensajes."""
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.usuario_id == UUID(user_id))
    )
    chat = result.scalar_one_or_none()
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat no encontrado")
    
    await db.delete(chat)
    await db.commit()

@router.patch("/{chat_id}")
async def update_chat(
    chat_id: UUID,
    data: ChatCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza configuración del chat."""
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.usuario_id == UUID(user_id))
    )
    chat = result.scalar_one_or_none()
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat no encontrado")
    
    if data.titulo is not None:
        chat.titulo = data.titulo
    if data.modelo:
        chat.modelo = data.modelo
    if data.system_prompt is not None:
        chat.system_prompt = data.system_prompt
    
    chat.actualizado_at = datetime.utcnow()
    await db.commit()
    
    return {"updated": True}