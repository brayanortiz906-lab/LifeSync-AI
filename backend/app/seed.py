"""Datos de demostración: agenda, tareas, gastos y mantenimiento."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Event, LogEntry, Maintenance, Task


def sembrar(db: Session) -> bool:
    """Crea datos de ejemplo si la base está vacía. Devuelve True si sembró."""
    if db.scalar(select(Event).limit(1)) is not None:
        return False

    hoy = date.today()
    base = datetime.combine(hoy, datetime.min.time())

    def bloque(dia: int, hora: int, minutos: int, titulo: str, cat: str, fijo: bool = True, notas: str | None = None):
        inicio = base + timedelta(days=dia, hours=hora)
        return Event(titulo=titulo, categoria=cat, inicio=inicio, fin=inicio + timedelta(minutes=minutos),
                     inamovible=fijo, notas=notas, fuente="manual")

    eventos = [
        bloque(0, 8, 120, "Trabajo en oficina", "trabajo"),
        bloque(0, 13, 45, "Almuerzo", "descanso", fijo=False),
        bloque(0, 15, 90, "Clase de Cálculo", "clase"),
        bloque(0, 18, 60, "Estudio: Parciales de álgebra", "estudio", fijo=False),
        bloque(1, 7, 60, "Gimnasio", "salud", fijo=False),
        bloque(1, 9, 180, "Trabajo en oficina", "trabajo"),
        bloque(1, 14, 90, "Seminario de investigación", "clase"),
        bloque(2, 10, 90, "Taller de laboratorio", "clase"),
        bloque(2, 16, 60, "Estudio: Informe final", "estudio", fijo=False),
        bloque(3, 9, 120, "Trabajo en oficina", "trabajo"),
        bloque(4, 8, 120, "Clase de Estadística", "clase"),
    ]
    db.add_all(eventos)

    tareas = [
        Task(titulo="Entregar ensayo de Metodología de investigación", materia="Metodología",
             fecha_entrega=hoy + timedelta(days=3), prioridad="alta", minutos_estimados=120,
             resumen="Ensayo de 4 páginas con al menos 5 referencias APA 7.", fuente="notion"),
        Task(titulo="Resolver ejercicios 1–20 del capítulo 4", materia="Cálculo",
             fecha_entrega=hoy + timedelta(days=1), prioridad="alta", minutos_estimados=90,
             resumen="Límites y derivadas: ejercicios 1 al 20.", fuente="classroom"),
        Task(titulo="Leer artículo:Introduction to Transformer", materia="Aprendizaje automático",
             fecha_entrega=hoy + timedelta(days=6), prioridad="media", minutos_estimados=60,
             preguntas=json_dumps([
                 "¿Qué es el mecanismo de atención?",
                 "¿Cuál es la diferencia entre encoder y decoder?",
                 "¿Qué es el paralelismo en el entrenamiento?",
             ]), fuente="manual"),
        Task(titulo="Preparar presentación de proyecto", materia="Bases de datos",
             fecha_entrega=hoy + timedelta(days=9), prioridad="media", minutos_estimados=150, fuente="manual"),
    ]
    db.add_all(tareas)

    gastos = [
        LogEntry(descripcion="Tanqueo de la moto", monto=20000.0, moneda="COP",
                 categoria="combustible", fecha=hoy - timedelta(days=1)),
        LogEntry(descripcion="Almuerzo del mediodía", monto=18000.0, moneda="COP",
                 categoria="alimentacion", fecha=hoy),
        LogEntry(descripcion="Pago de internet y celular", monto=95000.0, moneda="COP",
                 categoria="servicios", fecha=hoy - timedelta(days=5)),
        LogEntry(descripcion="Cambio de aceite de la moto", monto=85000.0, moneda="COP",
                 categoria="mantenimiento", fecha=hoy - timedelta(days=40)),
        LogEntry(descripcion="Transporte universidad", monto=6000.0, moneda="COP",
                 categoria="transporte", fecha=hoy - timedelta(days=2)),
    ]
    db.add_all(gastos)

    mantenimiento = [
        Maintenance(activo="moto", tarea="Cambio de aceite", intervalo_dias=90,
                    ultima_realizacion=hoy - timedelta(days=95), proxima_fecha=hoy - timedelta(days=5),
                    costo_estimado=85000.0, notas="Revisar también la cadena."),
        Maintenance(activo="moto", tarea="Revisión de frenos", intervalo_dias=60,
                    ultima_realizacion=hoy - timedelta(days=20), proxima_fecha=hoy + timedelta(days=40),
                    costo_estimado=60000.0),
        Maintenance(activo="computador", tarea="Limpieza y cambio de pasta térmica", intervalo_dias=180,
                    ultima_realizacion=hoy - timedelta(days=60), proxima_fecha=hoy + timedelta(days=120),
                    costo_estimado=50000.0),
        Maintenance(activo="hogar", tarea="Pago del servicio de agua", intervalo_dias=30,
                    ultima_realizacion=hoy - timedelta(days=35), proxima_fecha=hoy - timedelta(days=5),
                    costo_estimado=45000.0),
    ]
    db.add_all(mantenimiento)

    db.flush()
    return True


def json_dumps(obj) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False)
