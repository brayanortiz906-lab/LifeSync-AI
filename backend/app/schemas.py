"""Esquemas Pydantic v2: entrada/salida de la API y contrato del agente."""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CategoriaEvento = Literal[
    "trabajo", "clase", "estudio", "descanso", "personal", "salud", "social", "mantenimiento"
]
CategoriaGasto = Literal[
    "combustible", "mantenimiento", "alimentacion", "transporte", "servicios",
    "ocio", "salud", "educacion", "suscripciones", "otro",
]


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# CRUD
# --------------------------------------------------------------------------- #
class EventBase(BaseModel):
    titulo: str = Field(min_length=1, max_length=160)
    categoria: CategoriaEvento = "personal"
    inicio: datetime
    fin: datetime
    inamovible: bool = False
    notas: str | None = None
    fuente: str = "manual"

    @field_validator("fin")
    @classmethod
    def _fin_despues_de_inicio(cls, v: datetime, info):
        inicio = info.data.get("inicio")
        if inicio and v <= inicio:
            raise ValueError("La hora de fin debe ser posterior al inicio")
        return v


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    titulo: str | None = None
    categoria: CategoriaEvento | None = None
    inicio: datetime | None = None
    fin: datetime | None = None
    inamovible: bool | None = None
    notas: str | None = None
    fuente: str | None = None


class EventOut(ORMBase):
    id: int
    titulo: str
    categoria: str
    inicio: datetime
    fin: datetime
    inamovible: bool
    notas: str | None
    fuente: str
    duracion_min: int = 0


class TaskCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=220)
    materia: str | None = None
    fecha_entrega: date | None = None
    prioridad: Literal["alta", "media", "baja"] = "media"
    minutos_estimados: int = 60
    resumen: str | None = None
    material: str | None = None
    fuente: str = "manual"
    estado: Literal["pendiente", "en_progreso", "completada"] = "pendiente"


class TaskUpdate(BaseModel):
    titulo: str | None = None
    materia: str | None = None
    fecha_entrega: date | None = None
    prioridad: Literal["alta", "media", "baja"] | None = None
    minutos_estimados: int | None = None
    resumen: str | None = None
    estado: Literal["pendiente", "en_progreso", "completada"] | None = None


class TaskOut(ORMBase):
    id: int
    titulo: str
    materia: str | None
    fecha_entrega: date | None
    estado: str
    prioridad: str
    minutos_estimados: int
    resumen: str | None
    material: str | None
    preguntas: list[str] = []
    fuente: str

    @field_validator("preguntas", mode="before")
    @classmethod
    def _parse_preguntas(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v) or []
            except json.JSONDecodeError:
                return []
        return v or []


class LogCreate(BaseModel):
    descripcion: str = Field(min_length=1, max_length=255)
    monto: float | None = None
    moneda: str = "COP"
    categoria: CategoriaGasto = "otro"
    fecha: date | None = None
    notas: str | None = None
    registrar_en_calendario: bool = False
    duracion_min: int = 30


class LogOut(ORMBase):
    id: int
    descripcion: str
    monto: float | None
    moneda: str
    categoria: str
    fecha: date
    notas: str | None


class MaintenanceCreate(BaseModel):
    activo: str = Field(min_length=1, max_length=48)
    tarea: str = Field(min_length=1, max_length=160)
    intervalo_dias: int = 90
    ultima_realizacion: date | None = None
    proxima_fecha: date | None = None
    costo_estimado: float | None = None
    notas: str | None = None


class MaintenanceOut(ORMBase):
    id: int
    activo: str
    tarea: str
    intervalo_dias: int
    ultima_realizacion: date | None
    proxima_fecha: date | None
    costo_estimado: float | None
    notas: str | None
    dias_restantes: int | None = None
    vencido: bool = False


# --------------------------------------------------------------------------- #
# Agente
# --------------------------------------------------------------------------- #
class AgentAction(BaseModel):
    tipo: str
    datos: dict[str, Any] = Field(default_factory=dict)
    motivo: str = ""


class AgentAlert(BaseModel):
    tipo: str
    texto: str
    prioridad: Literal["alta", "media", "baja"] = "media"


class AgentResponse(BaseModel):
    categoria: Literal[
        "CALENDARIO", "TAREA_ACADEMICA", "BITACORA_GASTO", "MANTENIMIENTO", "CONVERSACION"
    ] = "CONVERSACION"
    categorias: list[str] = Field(default_factory=list)   # todas las detectadas (mensajes mixtos)
    intencion: str = ""
    confianza: float = 0.0
    mensaje_usuario: str = ""
    requiere_confirmacion: bool = False
    acciones: list[AgentAction] = Field(default_factory=list)
    alertas: list[AgentAlert] = Field(default_factory=list)
    resumen_estado: dict[str, Any] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    mensaje: str = Field(min_length=1)
    proveedor: str | None = None
    modelo: str | None = None
    api_key: str | None = None          # BYOK: la clave viaja por request, no se persiste
    guardar_api_key: bool = False        # si es True, se cifra y guarda en el servidor
    usar_contexto: bool = True


class ChatResponse(BaseModel):
    agente: AgentResponse
    eventos: list[EventOut] = []
    tareas: list[TaskOut] = []
    registros: list[LogOut] = []
    plan: dict[str, Any] = {}
    proveedor: str = "mock"
    modelo: str = "gpt-4o-mini"


class IngestRequest(BaseModel):
    titulo: str
    materia: str | None = None
    material: str
    fuente: str = "manual"
    fecha_entrega: date | None = None
    minutos_estudio: int = 60
    proveedor: str | None = None
    modelo: str | None = None
    api_key: str | None = None


class SettingsUpdate(BaseModel):
    proveedor: str | None = None
    modelo: str | None = None
    api_key: str | None = None
    borrar_api_key: bool = False
    moneda: str | None = None
    inicio_jornada: str | None = None
    fin_jornada: str | None = None


class SettingsOut(BaseModel):
    proveedor: str
    modelo: str
    moneda: str
    inicio_jornada: str
    fin_jornada: str
    tiene_api_key: bool = False
    proveedor_efectivo: str = "mock"


def dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)
