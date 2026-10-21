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
from sqlalchemy import Column, Integer
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
    """Ajustes de la persona (uno por usuario, v11).

    La clave primaria la asigna la base de datos: cada persona tiene su propia
    fila y se busca por `usuario_id` (nunca por id fijo, que colisionaba).
    """

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    proveedor: Mapped[str] = mapped_column(String(24), default="mock")
    modelo: Mapped[str] = mapped_column(String(64), default="gpt-4o-mini")
    api_key_cifrada: Mapped[str | None] = mapped_column(Text, default=None)
    moneda: Mapped[str] = mapped_column(String(8), default="COP")
    inicio_jornada: Mapped[str] = mapped_column(String(5), default="07:00")
    fin_jornada: Mapped[str] = mapped_column(String(5), default="22:00")
    # --- Preferencias de la persona (v8) ---------------------------------- #
    nombre_usuario: Mapped[str] = mapped_column(String(60), default="")
    tema: Mapped[str] = mapped_column(String(24), default="medianoche")
    orden_tareas: Mapped[str] = mapped_column(String(24), default="fecha")
    orden_gastos: Mapped[str] = mapped_column(String(24), default="fecha")
    orden_eventos: Mapped[str] = mapped_column(String(24), default="hora")
    #: Etiquetas personalization por la persona (JSON con lista de textos).
    etiquetas: Mapped[str] = mapped_column(Text, default="")
    onboarding_completo: Mapped[bool] = mapped_column(Boolean, default=False)
    #: ID de cliente OAuth de Google (identificador PUBLICO, no es un secreto).
    #: Permite que cualquier persona conecte su cuenta de Google con un clic.
    google_client_id: Mapped[str] = mapped_column(String(200), default="")
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


# --------------------------------------------------------------------------- #
# CONEXIONES DE IA (cuentas y proveedores)
# --------------------------------------------------------------------------- #
class ConexionIA(Base):
    """Conexión a un proveedor de IA.

    `modo` define como se autentica el usuario:
      - "api_key"  -> pega una clave (OpenAI, Anthropic, Gemini, OpenRouter...)
      - "cuenta"   -> OAuth / sesión de cuenta (ChatGPT, Claude.ai, Google...)
      - "local"    -> motor local (Ollama, LM Studio) sin clave
      - "mock"     -> asistente integrado sin conexión
    """

    __tablename__ = "ai_connections"

    id: Mapped[int] = mapped_column(primary_key=True)
    proveedor: Mapped[str] = mapped_column(String(48), index=True)
    nombre: Mapped[str] = mapped_column(String(80), default="")
    modo: Mapped[str] = mapped_column(String(16), default="api_key", index=True)
    credenciales_cifradas: Mapped[str | None] = mapped_column(Text, default=None)
    modelo: Mapped[str] = mapped_column(String(96), default="")
    activa: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    estado: Mapped[str] = mapped_column(String(24), default="sin_probar", index=True)
    detalle_estado: Mapped[str | None] = mapped_column(Text, default=None)
    creada_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    verificada_en: Mapped[datetime | None] = mapped_column(DateTime, default=None)


# --------------------------------------------------------------------------- #
# SISTEMA RESPONSABLE (IA responsable)
# --------------------------------------------------------------------------- #
class PolicySettings(Base):
    """Parámetros de gobierno del agente: umbrales, autonomia y trazabilidad.

    Una fila por persona (v11): la clave primaria la asigna la base de datos
    y se busca por `usuario_id` (si no, dos personas chocan en la misma fila).
    """

    __tablename__ = "policy_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # --- Umbrales de decisión -------------------------------------------------
    umbral_confianza: Mapped[float] = mapped_column(Float, default=0.65)
    gasto_max_autonomo: Mapped[float] = mapped_column(Float, default=100000.0)
    max_acciones_por_mensaje: Mapped[int] = mapped_column(Integer, default=12)
    # --- Interruptores de gobierno --------------------------------------------
    eliminar_requiere_aprobacion: Mapped[bool] = mapped_column(Boolean, default=True)
    gasto_alto_requiere_aprobacion: Mapped[bool] = mapped_column(Boolean, default=True)
    baja_confianza_requiere_aprobacion: Mapped[bool] = mapped_column(Boolean, default=True)
    redactar_pii: Mapped[bool] = mapped_column(Boolean, default=True)
    registrar_auditoria: Mapped[bool] = mapped_column(Boolean, default=True)
    permitir_ia_externa: Mapped[bool] = mapped_column(Boolean, default=True)
    modo_prudente: Mapped[bool] = mapped_column(Boolean, default=False)
    # --- Explicabilidad --------------------------------------------------------
    exigir_motivo: Mapped[bool] = mapped_column(Boolean, default=True)
    # --- Privacidad ------------------------------------------------------------
    dias_retencion_auditoria: Mapped[int] = mapped_column(Integer, default=365)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    """Bitacora de auditoría: que hizo el sistema, con que motivo y con que impacto."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    actor: Mapped[str] = mapped_column(String(24), default="agente", index=True)
    tipo: Mapped[str] = mapped_column(String(32), default="accion", index=True)
    modulo: Mapped[str] = mapped_column(String(32), default="agente")
    entidad: Mapped[str | None] = mapped_column(String(32), default=None)
    entidad_id: Mapped[int | None] = mapped_column(Integer, default=None)
    descripcion: Mapped[str] = mapped_column(String(255), default="")
    motivo: Mapped[str | None] = mapped_column(Text, default=None)
    confianza: Mapped[float | None] = mapped_column(Float, default=None)
    riesgo: Mapped[str] = mapped_column(String(16), default="bajo", index=True)
    reversible: Mapped[bool] = mapped_column(Boolean, default=True)
    resultado: Mapped[str] = mapped_column(String(16), default="ok", index=True)
    datos: Mapped[str | None] = mapped_column(Text, default=None)  # JSON


class ApprovalRequest(Base):
    """Acción que el agente propone pero NO ejecuta: espera decisión humana."""

    __tablename__ = "approval_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    estado: Mapped[str] = mapped_column(String(16), default="pendiente", index=True)
    tipo_accion: Mapped[str] = mapped_column(String(32), default="")
    resumen: Mapped[str] = mapped_column(String(255), default="")
    motivo: Mapped[str | None] = mapped_column(Text, default=None)
    regla: Mapped[str] = mapped_column(String(64), default="")
    riesgo: Mapped[str] = mapped_column(String(16), default="medio")
    confianza: Mapped[float | None] = mapped_column(Float, default=None)
    datos: Mapped[str | None] = mapped_column(Text, default=None)  # JSON de la acción
    chat_message_id: Mapped[int | None] = mapped_column(Integer, default=None)
    decidido_en: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    decidido_por: Mapped[str | None] = mapped_column(String(48), default=None)
    nota_decision: Mapped[str | None] = mapped_column(Text, default=None)


# --------------------------------------------------------------------------- #
# PERMISOS DE LA CUENTA (v16)
# --------------------------------------------------------------------------- #
class PermisosCuenta(Base):
    """Permisos que la persona autorizó a LifeAgente con su cuenta.

    Con un solo permiso concedido (Drive, Calendar, correo) el sistema puede
    trabajar solo: respaldar cada noche, importar la agenda de Google y
    avisar por correo, aunque nadie tenga la app abierta.
    """

    __tablename__ = "permisos_cuenta"

    id: Mapped[int] = mapped_column(primary_key=True)
    proveedor: Mapped[str] = mapped_column(String(48), default="google_cuenta", index=True)
    correo: Mapped[str] = mapped_column(String(180), default="")
    scope: Mapped[str] = mapped_column(Text, default="")
    access_token_cifrado: Mapped[str | None] = mapped_column(Text, default=None)
    refresh_token_cifrado: Mapped[str | None] = mapped_column(Text, default=None)
    client_id: Mapped[str] = mapped_column(String(200), default="")
    autopiloto: Mapped[bool] = mapped_column(Boolean, default=False)
    respaldo_auto: Mapped[bool] = mapped_column(Boolean, default=True)
    importar_calendario: Mapped[bool] = mapped_column(Boolean, default=True)
    ultimo_respaldo: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    proximo_respaldo: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


# --------------------------------------------------------------------------- #
# Multiusuario (v11)
# --------------------------------------------------------------------------- #
# Cada fila pertenece a una persona. El id 1 es el "usuario local": el que
# usa LifeSync en su propio equipo sin crear ninguna cuenta. El filtro de
# sesion de `cuentas.py` aade `usuario_id = <usuario actual>` a todas las
# consultas, de modo que cada persona ve solo lo suyo.
from sqlalchemy import Column  # noqa: E402  (import local para no tocar el bloque superior)

for _modelo in (
    Event, Task, LogEntry, Maintenance, ChatMessage, ConexionIA,
    AuditLog, ApprovalRequest, AppSettings, PolicySettings, PermisosCuenta,
):
    _modelo.usuario_id = Column(Integer, default=1, index=True)
