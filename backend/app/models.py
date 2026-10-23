"""SQLAlchemy models - UUID PK, RLS ready."""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, UniqueConstraint, Boolean, Integer, JSON, Enum as SQLEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship, DeclarativeBase
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import enum

class Base(DeclarativeBase): pass

class EventType(str, enum.Enum):
    TASK = "task"; EVENT = "event"; NOTE = "note"; REMINDER = "reminder"

class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(100))
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    locale: Mapped[str] = mapped_column(String(10), default="es")
    ai_api_keys: Mapped[Dict[str, str]] = mapped_column(JSON, default={})
    default_ai_provider: Mapped[Optional[str]] = mapped_column(String(50))
    email_notifications: Mapped[bool] = mapped_column(default=True)
    daily_summary_time: Mapped[Optional[str]] = mapped_column(String(5))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    eventos: Mapped[List["Evento"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")
    tareas: Mapped[List["Tarea"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")
    paneles: Mapped[List["Panel"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")
    backups: Mapped[List["Backup"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")
    chats: Mapped[List["Chat"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")

class Evento(Base):
    __tablename__ = "eventos"
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[Optional[str]] = mapped_column(Text)
    tipo: Mapped[EventType] = mapped_column(SQLEnum(EventType), default=EventType.EVENT)
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    fin: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    todo_dia: Mapped[bool] = mapped_column(default=False)
    rrule: Mapped[Optional[str]] = mapped_column(Text)
    google_event_id: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    google_calendar_id: Mapped[Optional[str]] = mapped_column(String(100))
    sync_status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    usuario: Mapped["Usuario"] = relationship(back_populates="eventos")
    __table_args__ = (Index("ix_eventos_usuario_inicio", "usuario_id", "inicio"),)

class Tarea(Base):
    __tablename__ = "tareas"
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[Optional[str]] = mapped_column(Text)
    completada: Mapped[bool] = mapped_column(default=False, index=True)
    prioridad: Mapped[int] = mapped_column(Integer, default=0)
    fecha_vencimiento: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    fecha_recordatorio: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    rrule: Mapped[Optional[str]] = mapped_column(Text)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    panel_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("paneles.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completada_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    usuario: Mapped["Usuario"] = relationship(back_populates="tareas")
    panel: Mapped[Optional["Panel"]] = relationship(back_populates="tareas")
    __table_args__ = (Index("ix_tareas_usuario_completada", "usuario_id", "completada"), Index("ix_tareas_usuario_vencimiento", "usuario_id", "fecha_vencimiento"),)

class Panel(Base):
    __tablename__ = "paneles"
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(100))
    descripcion: Mapped[Optional[str]] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(7), default="#3B82F6")
    icono: Mapped[Optional[str]] = mapped_column(String(50))
    es_publico: Mapped[bool] = mapped_column(default=False)
    codigo_compartido: Mapped[Optional[str]] = mapped_column(String(20), unique=True, index=True)
    creado_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    usuario: Mapped["Usuario"] = relationship(back_populates="paneles")
    tareas: Mapped[List["Tarea"]] = relationship(back_populates="panel", cascade="all, delete-orphan")
    permisos: Mapped[List["PermisoPanel"]] = relationship(back_populates="panel", cascade="all, delete-orphan")

class PermisoPanel(Base):
    __tablename__ = "permisos_panel"
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    panel_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("paneles.id", ondelete="CASCADE"))
    usuario_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"))
    rol: Mapped[str] = mapped_column(String(20), default="viewer")
    creado_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    panel: Mapped["Panel"] = relationship(back_populates="permisos")
    usuario: Mapped["Usuario"] = relationship()
    __table_args__ = (UniqueConstraint("panel_id", "usuario_id", name="uq_panel_usuario"),)

class Backup(Base):
    __tablename__ = "backups"
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre_archivo: Mapped[str] = mapped_column(String(255))
    ruta_storage: Mapped[str] = mapped_column(String(500))
    tamano_bytes: Mapped[int] = mapped_column(Integer)
    tipo: Mapped[str] = mapped_column(String(20))
    estado: Mapped[str] = mapped_column(String(20), default="completed")
    metadatos: Mapped[Dict[str, Any]] = mapped_column(JSON, default={})
    creado_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    usuario: Mapped["Usuario"] = relationship(back_populates="backups")
    __table_args__ = (Index("ix_backups_usuario_creado", "usuario_id", "creado_at"),)

class Chat(Base):
    __tablename__ = "chats"
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    titulo: Mapped[Optional[str]] = mapped_column(String(200))
    modelo: Mapped[str] = mapped_column(String(50), default="gemini-1.5-flash")
    system_prompt: Mapped[Optional[str]] = mapped_column(Text)
    creado_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    actualizado_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    usuario: Mapped["Usuario"] = relationship(back_populates="chats")
    mensajes: Mapped[List["MensajeChat"]] = relationship(back_populates="chat", cascade="all, delete-orphan", order_by="MensajeChat.creado_at")

class MensajeChat(Base):
    __tablename__ = "mensajes_chat"
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    rol: Mapped[str] = mapped_column(String(20))
    contenido: Mapped[str] = mapped_column(Text)
    tokens_entrada: Mapped[Optional[int]] = mapped_column(Integer)
    tokens_salida: Mapped[Optional[int]] = mapped_column(Integer)
    modelo: Mapped[Optional[str]] = mapped_column(String(50))
    metadatos: Mapped[Dict[str, Any]] = mapped_column(JSON, default={})
    creado_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    chat: Mapped["Chat"] = relationship(back_populates="mensajes")
    usuario: Mapped["Usuario"] = relationship()
    __table_args__ = (Index("ix_mensajes_chat_creado", "chat_id", "creado_at"),)