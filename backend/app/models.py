"""Modelo de datos de LifeSync AI.

Entidades:
  Event        -> bloques de calendario (trabajo, clase, estudio, descanso...)
  Task         -> tareas/entregas académicas
  LogEntry     -> bitácora cotidiana y gastos
  Maintenance  -> plan de mantenimiento periódico (moto, carro, PC...)
  ChatMessage  -> historial del chat con el agente
  AppSettings  -> proveedor de IA + API Key cifrada (BYOK)
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(String(160), index=True)
    categoria: Mapped[str] = mapped_column(String(32), default="personal", index=True)
    inicio: Mapped[datetime] = mapped_column(DateTime, index=True)
    fin: Mapped[datetime] = mapped_column(DateTime)
    inamovible: Mapped[bool] = mapped_column(Boolean, default=False)
    notas: Mapped[str | None] = mapped_column(Text, default=None)
    fuente: Mapped[str] = mapped_column(String(32), default="chat")
    color: Mapped[str | None] = mapped_column(String(16), default=None)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    @property
    def duracion_min(self) -> int:
        return int((self.fin - self.inicio).total_seconds() // 60)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(String(220), index=True)
    materia: Mapped[str | None] = mapped_column(String(120), default=None, index=True)
    fecha_entrega: Mapped[date | None] = mapped_column(Date, default=None, index=True)
    estado: Mapped[str] = mapped_column(String(24), default="pendiente", index=True)
    prioridad: Mapped[str] = mapped_column(String(16), default="media")
    minutos_estimados: Mapped[int] = mapped_column(Integer, default=60)
    resumen: Mapped[str | None] = mapped_column(Text, default=None)
    material: Mapped[str | None] = mapped_column(Text, default=None)
    preguntas: Mapped[str | None] = mapped_column(Text, default=None)  # JSON: list[str]
    fuente: Mapped[str] = mapped_column(String(32), default="manual")
    # Evento de calendario que respalda esta tarea (bloque de estudio).
    tarea_id: Mapped[int | None] = mapped_column(ForeignKey("events.id"), default=None)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class LogEntry(Base):
    __tablename__ = "log_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    descripcion: Mapped[str] = mapped_column(String(255))
    monto: Mapped[float | None] = mapped_column(Float, default=None)
    moneda: Mapped[str] = mapped_column(String(8), default="COP")
    categoria: Mapped[str] = mapped_column(String(32), default="otro", index=True)
    fecha: Mapped[date] = mapped_column(Date, index=True)
    evento_id: Mapped[int | None] = mapped_column(ForeignKey("events.id"), default=None)
    notas: Mapped[str | None] = mapped_column(Text, default=None)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Maintenance(Base):
    __tablename__ = "maintenance_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    activo: Mapped[str] = mapped_column(String(48), index=True)
    tarea: Mapped[str] = mapped_column(String(160))
    intervalo_dias: Mapped[int] = mapped_column(Integer, default=90)
    ultima_realizacion: Mapped[date | None] = mapped_column(Date, default=None)
    proxima_fecha: Mapped[date | None] = mapped_column(Date, default=None, index=True)
    costo_estimado: Mapped[float | None] = mapped_column(Float, default=None)
    notas: Mapped[str | None] = mapped_column(Text, default=None)
    activo_flag: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    rol: Mapped[str] = mapped_column(String(16))  # user | assistant | system
    contenido: Mapped[str] = mapped_column(Text)
    payload: Mapped[str | None] = mapped_column(Text, default=None)  # JSON crudo del agente
    categoria: Mapped[str | None] = mapped_column(String(32), default=None)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    proveedor: Mapped[str] = mapped_column(String(24), default="mock")
    modelo: Mapped[str] = mapped_column(String(64), default="gpt-4o-mini")
    api_key_cifrada: Mapped[str | None] = mapped_column(Text, default=None)
    moneda: Mapped[str] = mapped_column(String(8), default="COP")
    inicio_jornada: Mapped[str] = mapped_column(String(5), default="07:00")
    fin_jornada: Mapped[str] = mapped_column(String(5), default="22:00")
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
