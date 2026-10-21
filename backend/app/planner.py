"""Planificador de agenda determinista.

Este módulo resuelve el problema de *conflict resolution* de horarios: la IA
(LLM) aporta la INTENCIÓN y las PRIORIDADES; este código calcula los huecos
exactos respetando restricciones duras. Separar ambas responsabilidades evita
que el modelo invente horas o solape eventos.

Restricciones:
  - Los eventos INAMOVIBLES nunca se mueven (son los "anclajes" del día).
  - Ningún bloqueFlexible puede solaparse con otro.
  - Se respeta la ventana configurada por el usuario (inicio/fin de jornada).
  - Se prefiere el movimiento MÍNIMO: se penaliza mover lejos el bloque.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

BUFFER_MIN = 10          # margen entre bloques reubicados (evita bloques pegados)
PRIORIDAD_ORDEN = {"alta": 0, "media": 1, "baja": 2}


@dataclass
class Interval:
    inicio: datetime
    fin: datetime

    @property
    def duracion_min(self) -> int:
        return int((self.fin - self.inicio).total_seconds() // 60)

    def solapa(self, otro: "Interval") -> bool:
        return self.inicio < otro.fin and otro.inicio < self.fin


@dataclass
class Bloque:
    titulo: str
    duracion_min: int
    prioridad: str = "media"
    categoria: str = "estudio"
    origen_id: int | None = None
    inicio_original: datetime | None = None
    inicio: datetime | None = None
    fin: datetime | None = None
    motivo: str = ""


@dataclass
class Plan:
    asignaciones: list[dict] = field(default_factory=list)
    sin_caber: list[dict] = field(default_factory=list)
    huecos_libres: list[dict] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    movidos: int = 0

    def as_dict(self) -> dict:
        return {
            "asignaciones": self.asignaciones,
            "sin_caber": self.sin_caber,
            "huecos_libres": self.huecos_libres,
            "avisos": self.avisos,
            "movidos": self.movidos,
        }


def _parse_hhmm(valor: str, fallback: time) -> time:
    try:
        hh, mm = valor.split(":")
        return time(int(hh), int(mm))
    except Exception:
        return fallback


def calcular_huecos(
    ocupados: list[Interval], ventana: Interval
) -> list[Interval]:
    """Devuelve los intervalos libres dentro de la ventana."""
    dentro = [i for i in ocupados if i.solapa(ventana)]
    dentro.sort(key=lambda i: i.inicio)
    huecos: list[Interval] = []
    cursor = ventana.inicio
    for occ in dentro:
        if occ.inicio > cursor:
            huecos.append(Interval(cursor, min(occ.inicio, ventana.fin)))
        cursor = max(cursor, occ.fin)
        if cursor >= ventana.fin:
            break
    if cursor < ventana.fin:
        huecos.append(Interval(cursor, ventana.fin))
    return [h for h in huecos if (h.fin - h.inicio).total_seconds() >= 300]


def _cabe(hueco: Interval, duracion_min: int, buffer_min: int, inicio_min: datetime | None) -> bool:
    if (hueco.fin - hueco.inicio).total_seconds() / 60 < duracion_min:
        return False
    if inicio_min is not None:
        candidato = inicio_min + timedelta(minutes=buffer_min)
        if candidato + timedelta(minutes=duracion_min) > hueco.fin:
            return False
    return True


def _consumir(hueco: Interval, duracion_min: int, buffer_min: int) -> tuple[Interval, Interval | None]:
    """Parte el hueco: devuelve (hueco usado, resto del hueco)."""
    usado = Interval(hueco.inicio, hueco.inicio + timedelta(minutes=duracion_min))
    resto_ini = usado.fin + timedelta(minutes=buffer_min)
    resto = Interval(resto_ini, hueco.fin) if resto_ini < hueco.fin else None
    return usado, resto


def replanificar(
    dia: date,
    ancla: datetime | None,
    bloques: list[Bloque],
    ocupados: list[Interval],
    inicio_jornada: str = "07:00",
    fin_jornada: str = "22:00",
    no_antes_de: str | None = None,
    no_despues_de: str | None = None,
    prioridad_reubicacion: str = "flexible",
) -> Plan:
    """Reubica bloques flexibles en los huecos libres del día.

    `ocupados` = eventos inamovibles (y semirrígidos que no se pueden mover).
    """
    plan = Plan()

    ini = _parse_hhmm(no_antes_de or inicio_jornada, time(7, 0))
    fin = _parse_hhmm(no_despues_de or fin_jornada, time(22, 0))
    ventana = Interval(
        datetime.combine(dia, ini),
        datetime.combine(dia, fin),
    )

    huecos = calcular_huecos(ocupados, ventana)

    # Orden: prioridad (alta primero) y luego cercanía temporal al ancla.
    ordenados = sorted(
        bloques,
        key=lambda b: (
            PRIORIDAD_ORDEN.get(b.prioridad, 1),
            abs((b.inicio_original - ancla).total_seconds()) if (b.inicio_original and ancla) else 0,
        ),
    )

    for bloque in ordenados:
        candidatos: list[tuple[float, Interval, datetime]] = []
        for hueco in huecos:
            if not _cabe(hueco, bloque.duracion_min, BUFFER_MIN, None):
                continue
            max_offset = int((hueco.fin - hueco.inicio).total_seconds() // 60) - bloque.duracion_min + 1
            for offset in range(0, max(1, max_offset)):
                candidato = hueco.inicio + timedelta(minutes=offset)
                if candidato + timedelta(minutes=bloque.duracion_min) > hueco.fin:
                    break
                if candidato < hueco.inicio:
                    continue
                # Distancia al ancla (el hecho nuevo que exige la reorganización)
                if ancla is None:
                    distancia = 0.0
                elif prioridad_reubicacion == "antes":
                    distancia = abs((ancla - candidato).total_seconds()) + (0 if candidato + timedelta(minutes=bloque.duracion_min) <= ancla else 10**9)
                elif prioridad_reubicacion == "despues":
                    distancia = abs((candidato - ancla).total_seconds()) + (0 if candidato >= ancla else 10**9)
                else:
                    distancia = abs((candidato - ancla).total_seconds()) if ancla else 0.0
                # Penalización por moverse lejos de su hora original (movimiento mínimo)
                if bloque.inicio_original:
                    distancia += abs((candidato - bloque.inicio_original).total_seconds()) / 60
                candidatos.append((distancia, hueco, candidato))

        if not candidatos:
            plan.sin_caber.append(
                {
                    "titulo": bloque.titulo,
                    "duracion_min": bloque.duracion_min,
                    "prioridad": bloque.prioridad,
                    "motivo": "No hay un hueco libre del tamaño requerido en la jornada.",
                }
            )
            continue

        distancia, hueco, inicio = min(candidatos, key=lambda c: c[0])
        usado, resto = _consumir(hueco, bloque.duracion_min, BUFFER_MIN)
        bloque.inicio, bloque.fin = inicio, inicio + timedelta(minutes=bloque.duracion_min)

        huecos.remove(hueco)
        if resto:
            huecos.append(resto)
        huecos.sort(key=lambda h: h.inicio)

        movido = bool(bloque.inicio_original and bloque.inicio != bloque.inicio_original)
        if movido:
            plan.movidos += 1
        plan.asignaciones.append(
            {
                "titulo": bloque.titulo,
                "id": bloque.origen_id,
                "categoria": bloque.categoria,
                "prioridad": bloque.prioridad,
                "inicio": bloque.inicio.isoformat(timespec="minutes"),
                "fin": bloque.fin.isoformat(timespec="minutes"),
                "duracion_min": bloque.duracion_min,
                "movido": movido,
                "inicio_original": bloque.inicio_original.isoformat(timespec="minutes") if bloque.inicio_original else None,
                "motivo": bloque.motivo or "Reubicado para evitar el conflicto.",
            }
        )

    plan.huecos_libres = [
        {
            "inicio": h.inicio.isoformat(timespec="minutes"),
            "fin": h.fin.isoformat(timespec="minutes"),
            "duracion_min": h.duracion_min,
        }
        for h in huecos
    ]

    # Reglas de bienestar
    if not plan.asignaciones and plan.sin_caber:
        plan.avisos.append("No fue posible reubicar ningún bloque con la jornada actual.")
    if plan.sin_caber:
        plan.avisos.append(
            "Quedaron " + str(len(plan.sin_caber)) + " bloque(s) sin espacio; revisa o divídelos."
        )
    return plan


def calcular_carga(eventos: list[dict]) -> dict:
    """Carga de trabajo por horas (estudio + trabajo + clase)."""
    estudio = sum(e["duracion_min"] for e in eventos if e.get("categoria") in {"estudio", "clase", "trabajo"})
    descanso = sum(e["duracion_min"] for e in eventos if e.get("categoria") == "descanso")
    return {
        "minutos_productivos": estudio,
        "minutos_descanso": descanso,
        "horas_productivas": round(estudio / 60, 1),
        "sin_descanso": descanso == 0 and estudio > 240,
        "sobrecarga": estudio > 300,
    }
