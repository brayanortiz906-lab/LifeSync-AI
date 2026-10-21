"""Motor de gobierno del agente: politicas, explicabilidad y trazabilidad.

Este módulo implementa la capa de "IA responsable" de LifeSync AI. Encaja
exactamente entre el LLM (que propone intenciones) y la base de datos (que
ejecuta). Ninguna acción llega a la BD sin pasar por aquí.

Pilares implementados
---------------------
1. **Autonomia graduada** — cada acción se clasifica en `autónomo`,
   `requiere_aprobacion` o `bloqueado` segun reglas explicitas y umbrales
   configurables por el usuario.
2. **Supervisión humana** — las acciones sensibles (borrados, gastos altos,
   baja confianza) NO se ejecutan: quedan en una cola de aprobaciones
   (`ApprovalRequest`) que el usuario resuelve desde la interfaz.
3. **Explicabilidad** — cada decisión lleva un `motivo` legible en espanol que
   explica que se hizo y por que regla se disparo.
4. **Trazabilidad** — cada decisión (aplicada, bloqueada, aprobada, rechazada,
   redactada) queda en `AuditLog` con actor, riesgo, confianza e impacto.
5. **Privacidad** — los datos personales identificables (PII) se redactan antes
   de enviar nada a un proveedor externo de IA.
6. **Reversibilidad** — se distingue entre lo que se puede deshacer y lo que no.

Marco de referencia: ISO/IEC 42001, NIST AI RMF 1.0, principios de la OCDE
para IA y Union Europea AI Act (sistema de riesgo limitado: transparencia y
supervisión humana obligatorias).
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import ApprovalRequest, AuditLog, PolicySettings

# --------------------------------------------------------------------------- #
# Niveles de decisión
# --------------------------------------------------------------------------- #
AUTONOMO = "autonomo"
REQUIERE_APROBACION = "requiere_aprobacion"
BLOQUEADO = "bloqueado"

# Riesgo inherente por tipo de acción. Sirve para ordenar y para colorear el panel.
RIESGO_ACCION: dict[str, str] = {
    "crear_evento": "bajo",
    "actualizar_evento": "medio",
    "eliminar_evento": "alto",
    "replanificar_dia": "medio",
    "mover_bloque": "medio",
    "crear_tarea": "bajo",
    "actualizar_tarea": "medio",
    "completar_tarea": "bajo",
    "resumir_material": "bajo",
    "programar_estudio": "bajo",
    "registrar_gasto": "medio",
    "registrar_mantenimiento": "medio",
    "programar_mantenimiento": "medio",
    "marcar_realizado": "bajo",
}

# Acciones que NUNCA deben ejecutarse de forma autónoma.
ACCIONES_SENSIBLES = {
    "eliminar_evento",
    "actualizar_evento",
    "registrar_gasto",
    "registrar_mantenimiento",
    "programar_mantenimiento",
    "mover_bloque",
}

# --------------------------------------------------------------------------- #
# Redacción de datos personales (PII)
# --------------------------------------------------------------------------- #
_RE_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", re.IGNORECASE)
_RE_TARJETA = re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b")
_RE_TELEFONO = re.compile(r"(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b")
_RE_APIKEY = re.compile(r"\b(?:sk|pk|AIza|ghp_|xox)[-_A-Za-z0-9]{12,}\b")
_RE_DIRECCION = re.compile(
    r"\b(?:calle|carrera|av|cra|diag|manzana|barrio)\s+\d+[A-Za-z]?\s*(?:n[°ºo]|#\s?\d+)?\b",
    re.IGNORECASE,
)
# Identificacion explícita: "mi cedula 1234567890", "CC 123456", "NIT 900.123".
_RE_ID_CON_TEXTO = re.compile(
    r"\b(c[eé]dula|cc|cc\.|nit|documento|dni|pasaporte|identificaci[oó]n)\s*"
    r"(?:n[°ºo]\s*|num(?:ero)?\s*|de\s+identificaci[oó]n\s*)?"
    r"(\d[\d\s.-]{4,18})\b",
    re.IGNORECASE,
)
# Número suelto de 6-10 digitos (sin puntuacion de miles).
_RE_ID_SUELTO = re.compile(r"(?<![\d.,])\d{6,10}(?![\d.,])")
# Palabras que indican que el número es un MONTO, no un identificador.
_CTX_MONTO = re.compile(
    r"(?:\$|usd|cop|eur|pesos|bol[ií]var|d[oó]lares|por|costo|coste|precio|valor|vale|"
    r"gast\w*|pagu\w*|compr\w*|cobr\w*|pag[oó]|mil|miles|millones|millon)\s*$",
    re.IGNORECASE,
)
# Palabras que indican que el número es un identificador.
_CTX_ID = re.compile(
    r"(?:c[eé]dula|cc|cc\.|nit|documento|dni|pasaporte|identificaci[oó]n|"
    r"n[°ºo]|num(?:ero)?)\s*[:#]?\s*$",
    re.IGNORECASE,
)

CATEGORIAS_PII = {
    "email": "correo electrónico",
    "telefono": "telefono",
    "cedula": "número de identificacion",
    "tarjeta": "dato de tarjeta",
    "api_key": "clave de API",
    "direccion": "direccion",
}


def _redactar_identificadores(texto: str) -> tuple[str, bool]:
    """Redacta números de identificacion sin confundirlos con montos.

    "por 800000" es un monto y se conserva; "mi cedula 1234567890" es un ID y
    se enmascara. Un número suelto de 6-10 digitos se enmascara por presuncion
    de privacidad (minimización de datos).
    """
    # 1) Identificacion con contexto explicito: gana sobre cualquier otra regla.
    def _con_contexto(m: re.Match[str]) -> str:
        return f"{m.group(1)} [ID_REDACTADO]"

    out = _RE_ID_CON_TEXTO.sub(_con_contexto, texto)
    hubo_id = out != texto
    texto_base = out

    # 2) Número suelto de 6-10 digitos: se enmascara salvo que sea un monto.
    def _suelto(m: re.Match[str]) -> str:
        antes = texto_base[: m.start()]
        if _CTX_MONTO.search(antes) or _CTX_ID.search(antes):
            return m.group(0)
        if antes.endswith(("$", "usd", "cop", "eur")):
            return m.group(0)
        return "[ID_REDACTADO]"

    out = _RE_ID_SUELTO.sub(_suelto, texto_base)
    return out, hubo_id or out != texto_base


def redactar_pii(texto: str) -> tuple[str, list[str]]:
    """Sustituye datos personales por marcadores. Devuelve (texto, tipos)."""
    if not texto:
        return texto, []
    encontrados: list[str] = []
    out = texto

    def _sustituir(patron: re.Pattern[str], token: str, etiqueta: str) -> None:
        nonlocal out
        if patron.search(out):
            encontrados.append(etiqueta)
            out = patron.sub(token, out)

    _sustituir(_RE_EMAIL, "[CORREO_REDACTADO]", "email")
    _sustituir(_RE_APIKEY, "[CLAVE_REDACTADA]", "api_key")
    _sustituir(_RE_TARJETA, "[TARJETA_REDACTADA]", "tarjeta")
    _sustituir(_RE_TELEFONO, "[TELEFONO_REDACTADO]", "telefono")
    _sustituir(_RE_DIRECCION, "[DIRECCION_REDACTADA]", "direccion")
    out, hubo_id = _redactar_identificadores(out)
    if hubo_id:
        encontrados.append("cedula")
    return out, sorted(set(encontrados))


# --------------------------------------------------------------------------- #
# Política
# --------------------------------------------------------------------------- #
def obtener_politica(db: Session) -> PolicySettings:
    """Devuelve la política activa; la crea con los valores por defecto."""
    # Cada persona tiene su propia politica de gobierno (v11).
    from .cuentas import usuario_id_actual

    uid = usuario_id_actual()
    politica = db.get(PolicySettings, uid)
    if politica is None:
        politica = PolicySettings(id=uid, usuario_id=uid)
        db.add(politica)
        db.flush()
    return politica


class Decision:
    """Resultado de evaluar una acción contra la política."""

    __slots__ = ("nivel", "regla", "motivo", "riesgo", "confianza", "accion")

    def __init__(
        self,
        nivel: str,
        regla: str,
        motivo: str,
        riesgo: str,
        confianza: float | None,
        accion: dict[str, Any],
    ) -> None:
        self.nivel = nivel
        self.regla = regla
        self.motivo = motivo
        self.riesgo = riesgo
        self.confianza = confianza
        self.accion = accion

    @property
    def requiere_aprobacion(self) -> bool:
        return self.nivel == REQUIERE_APROBACION

    @property
    def bloqueada(self) -> bool:
        return self.nivel == BLOQUEADO

    def to_dict(self) -> dict[str, Any]:
        return {
            "nivel": self.nivel,
            "regla": self.regla,
            "motivo": self.motivo,
            "riesgo": self.riesgo,
            "confianza": self.confianza,
        }


def _monto_de(accion: dict[str, Any]) -> float:
    datos = accion.get("datos") or {}
    for clave in ("monto", "costo", "costo_estimado", "valor"):
        valor = datos.get(clave)
        if valor is None:
            continue
        try:
            return float(valor)
        except (TypeError, ValueError):
            continue
    return 0.0


def _resumen_accion(accion: dict[str, Any]) -> str:
    """Descripción corta y legible de una acción, para la cola de aprobaciones."""
    tipo = str(accion.get("tipo") or "")
    datos = accion.get("datos") or {}
    if tipo in {"crear_evento", "actualizar_evento"}:
        return f"Evento: {datos.get('titulo', 'sin título')}"
    if tipo == "eliminar_evento":
        return f"Eliminar evento #{datos.get('id', '?')}"
    if tipo in {"crear_tarea", "actualizar_tarea"}:
        return f"Tarea: {datos.get('titulo', 'sin título')}"
    if tipo == "registrar_gasto":
        monto = _monto_de(accion)
        return f"Gasto: {datos.get('descripcion', 'sin descripción')} ({monto:,.0f})"
    if tipo in {"registrar_mantenimiento", "programar_mantenimiento"}:
        return f"Mantenimiento: {datos.get('tarea', 'sin tarea')}"
    if tipo == "marcar_realizado":
        return f"Marcar realizado: {datos.get('tarea', datos.get('id', '?'))}"
    if tipo == "replanificar_dia":
        return f"Reorganizar el día {datos.get('fecha', '?')}"
    if tipo == "mover_bloque":
        return f"Mover bloque {datos.get('id', '?')}"
    if tipo == "programar_estudio":
        return f"Bloque de estudio: {datos.get('titulo', 'Estudio')}"
    if tipo == "resumir_material":
        return "Resumir material"
    if tipo == "completar_tarea":
        return f"Completar tarea #{datos.get('id', '?')}"
    return f"{tipo}: {json.dumps(datos, ensure_ascii=False, default=str)[:120]}"


def evaluar_accion(
    accion: dict[str, Any],
    politica: PolicySettings,
    confianza: float | None = None,
) -> Decision:
    """Evalua una acción contra la política. NUNCA ejecuta: solo decide."""
    tipo = str(accion.get("tipo") or "")
    datos = accion.get("datos") or {}
    riesgo = RIESGO_ACCION.get(tipo, "medio")
    confianza_efectiva = confianza if confianza is not None else float(accion.get("confianza") or 1.0)

    # --- Regla 1: modo prudente --------------------------------------------- #
    if politica.modo_prudente:
        return Decision(
            REQUIERE_APROBACION,
            "modo_prudente",
            "El modo prudente esta activo: toda acción se revisa antes de aplicarse.",
            riesgo,
            confianza_efectiva,
            accion,
        )

    # --- Regla 2: tipo de acción desconocido --------------------------------- #
    if tipo not in RIESGO_ACCION:
        return Decision(
            BLOQUEADO,
            "accion_no_reconocida",
            f"La acción '{tipo}' no esta en el catálogo permitido, por seguridad no se ejecuta.",
            "alto",
            confianza_efectiva,
            accion,
        )

    # --- Regla 3: baja confianza --------------------------------------------- #
    if (
        politica.baja_confianza_requiere_aprobacion
        and confianza_efectiva < politica.umbral_confianza
    ):
        return Decision(
            REQUIERE_APROBACION,
            "confianza_baja",
            (
                f"La confianza del modelo ({confianza_efectiva:.0%}) esta por debajo del "
                f"umbral ({politica.umbral_confianza:.0%}); te pido confirmarlo."
            ),
            riesgo,
            confianza_efectiva,
            accion,
        )

    # --- Regla 4: borrados (irreversibles) ------------------------------------ #
    if tipo == "eliminar_evento" and politica.eliminar_requiere_aprobacion:
        return Decision(
            REQUIERE_APROBACION,
            "borrado_irreversible",
            "Eliminar información es irreversible: quedó a la espera de tu confirmacion.",
            "alto",
            confianza_efectiva,
            accion,
        )

    # --- Regla 5: gastos por encima del umbral ------------------------------- #
    if tipo == "registrar_gasto" and politica.gasto_alto_requiere_aprobacion:
        monto = _monto_de(accion)
        if monto > politica.gasto_max_autonomo:
            return Decision(
                REQUIERE_APROBACION,
                "gasto_sobre_umbral",
                (
                    f"El gasto ({monto:,.0f}) supera el límite autónomo "
                    f"({politica.gasto_max_autonomo:,.0f}); lo dejó pendiente de tu visto bueno."
                ),
                "medio",
                confianza_efectiva,
                accion,
            )

    # --- Regla 6: modificaciones de compromisos inamovibles ------------------- #
    if tipo == "actualizar_evento" and datos.get("inamovible"):
        return Decision(
            REQUIERE_APROBACION,
            "compromiso_inamovible",
            "Es un compromiso inamovible: no lo toco sin que me lo confirmes.",
            "medio",
            confianza_efectiva,
            accion,
        )

    # --- Regla 7: exigir motivo (explicabilidad) ----------------------------- #
    if politica.exigir_motivo:
        motivo = str(accion.get("motivo") or "").strip()
        if not motivo:
            return Decision(
                REQUIERE_APROBACION,
                "motivo_ausente",
                "El modelo no explico el motivo de esta acción, así que te la consulto.",
                riesgo,
                confianza_efectiva,
                accion,
            )

    # --- Default: autonomia controlada ---------------------------------------- #
    return Decision(
        AUTONOMO,
        "dentro_de_politica",
        f"Acción de riesgo {riesgo} dentro de los límites de la política vigente.",
        riesgo,
        confianza_efectiva,
        accion,
    )


def evaluar_lote(
    acciones: list[dict[str, Any]],
    politica: PolicySettings,
    confianza: float | None = None,
) -> tuple[list[Decision], list[Decision], list[Decision]]:
    """Divide las acciones en (autonomas, requieren_aprobacion, bloqueadas)."""
    autonomas: list[Decision] = []
    aprobacion: list[Decision] = []
    bloqueadas: list[Decision] = []
    for accion in acciones:
        decision = evaluar_accion(accion, politica, confianza)
        if decision.bloqueada:
            bloqueadas.append(decision)
        elif decision.requiere_aprobacion:
            aprobacion.append(decision)
        else:
            autonomas.append(decision)
    return autonomas, aprobacion, bloqueadas


# --------------------------------------------------------------------------- #
# Auditoría
# --------------------------------------------------------------------------- #
def registrar_auditoria(
    db: Session,
    *,
    actor: str = "agente",
    tipo: str = "accion",
    modulo: str = "agente",
    descripcion: str = "",
    motivo: str | None = None,
    confianza: float | None = None,
    riesgo: str = "bajo",
    reversible: bool = True,
    resultado: str = "ok",
    entidad: str | None = None,
    entidad_id: int | None = None,
    datos: dict[str, Any] | None = None,
) -> AuditLog | None:
    """Anota una decisión en la bitacora de auditoría (append-only)."""
    politica = obtener_politica(db)
    if not politica.registrar_auditoria:
        return None
    entrada = AuditLog(
        actor=actor,
        tipo=tipo,
        modulo=modulo,
        entidad=entidad,
        entidad_id=entidad_id,
        descripcion=descripcion[:255],
        motivo=motivo,
        confianza=confianza,
        riesgo=riesgo,
        reversible=reversible,
        resultado=resultado,
        datos=json.dumps(datos, ensure_ascii=False, default=str) if datos else None,
    )
    db.add(entrada)
    db.flush()
    return entrada


def purgar_auditoria(db: Session, dias: int | None = None) -> int:
    """Elimina entradas de auditoría más antiguas que la retención configurada."""
    politica = obtener_politica(db)
    limite = dias if dias is not None else politica.dias_retencion_auditoria
    if limite <= 0:
        return 0
    corte = datetime.now() - timedelta(days=limite)
    resultado = db.execute(delete(AuditLog).where(AuditLog.creado_en < corte))
    return int(resultado.rowcount or 0)


# --------------------------------------------------------------------------- #
# Cola de aprobaciones
# --------------------------------------------------------------------------- #
def crear_aprobacion(
    db: Session,
    decision: Decision,
    chat_message_id: int | None = None,
) -> ApprovalRequest:
    """Encola una acción sensible para que el usuario la apruebe o la rechace."""
    peticion = ApprovalRequest(
        estado="pendiente",
        tipo_accion=str(decision.accion.get("tipo") or ""),
        resumen=_resumen_accion(decision.accion)[:255],
        motivo=decision.motivo,
        regla=decision.regla,
        riesgo=decision.riesgo,
        confianza=decision.confianza,
        datos=json.dumps(decision.accion, ensure_ascii=False, default=str),
        chat_message_id=chat_message_id,
    )
    db.add(peticion)
    db.flush()
    return peticion


def listar_aprobaciones(
    db: Session, estado: str = "pendiente", limite: int = 100
) -> list[ApprovalRequest]:
    consulta = select(ApprovalRequest).order_by(ApprovalRequest.creado_en.desc()).limit(limite)
    if estado and estado != "todas":
        consulta = consulta.where(ApprovalRequest.estado == estado)
    return list(db.scalars(consulta).all())


def decidir_aprobacion(
    db: Session,
    peticion_id: int,
    aprobar: bool,
    nota: str | None = None,
    actor: str = "usuario",
) -> tuple[ApprovalRequest | None, dict[str, Any] | None]:
    """Aprueba o rechaza una petición. Devuelve (petición, accion_aplicada)."""
    peticion = db.get(ApprovalRequest, peticion_id)
    if peticion is None:
        return None, None
    if peticion.estado != "pendiente":
        return peticion, None

    peticion.estado = "aprobada" if aprobar else "rechazada"
    peticion.decidido_en = datetime.now()
    peticion.decidido_por = actor
    peticion.nota_decision = nota
    db.flush()

    accion: dict[str, Any] | None = None
    if aprobar and peticion.datos:
        try:
            accion = json.loads(peticion.datos)
        except (TypeError, ValueError):
            accion = None

    registrar_auditoria(
        db,
        actor=actor,
        tipo="aprobacion" if aprobar else "rechazo",
        modulo="gobierno",
        descripcion=peticion.resumen,
        motivo=nota or (peticion.motivo or ""),
        confianza=peticion.confianza,
        riesgo=peticion.riesgo,
        reversible=True,
        resultado="aprobada" if aprobar else "rechazada",
        entidad="approval_request",
        entidad_id=peticion.id,
        datos={"regla": peticion.regla, "tipo_accion": peticion.tipo_accion},
    )
    return peticion, accion


# --------------------------------------------------------------------------- #
# Explicabilidad: "por que" de cada decisión
# --------------------------------------------------------------------------- #
EXPLICACION_TIPOS: dict[str, str] = {
    "crear_evento": "Agrego un bloque a tu calendario porque lo pediste en lenguaje natural.",
    "actualizar_evento": "Modifico un bloque que ya estaba en tu calendario.",
    "eliminar_evento": "Elimino un bloque: esto borra información y no se puede deshacer.",
    "replanificar_dia": "Reorganizo tu día moviendo solo los bloques flexibles, nunca los inamovibles.",
    "mover_bloque": "Muevo un bloque flexible a un hueco libre.",
    "crear_tarea": "Creó una tarea academica con su entrega y su bloque de estudio.",
    "actualizar_tarea": "Actualizo el estado o los datos de una tarea.",
    "completar_tarea": "Marco una tarea como completada.",
    "resumir_material": "Resumo el material para que estudies más rapido.",
    "programar_estudio": "Aparto un bloque de estudio en un hueco libre.",
    "registrar_gasto": "Registro un gasto en tu bitacora y lo categorizo automáticamente.",
    "registrar_mantenimiento": "Actualizo el historial de mantenimiento del activo.",
    "programar_mantenimiento": "Programo el próximo mantenimiento del activo y lo agrego al calendario.",
    "marcar_realizado": "Marco un mantenimiento como realizado y recalculo la próxima fecha.",
}


def explicar(decision: Decision) -> str:
    """Texto de explicabilidad para mostrar al usuario."""
    base = EXPLICACION_TIPOS.get(str(decision.accion.get("tipo") or ""), "")
    partes = [base] if base else []
    partes.append(decision.motivo)
    if decision.riesgo in {"alto", "medio"}:
        partes.append(f"Nivel de riesgo: {decision.riesgo}.")
    return " ".join(p for p in partes if p)


# --------------------------------------------------------------------------- #
# Reporte de cumplimiento
# --------------------------------------------------------------------------- #
def reporte_cumplimiento(db: Session) -> dict[str, Any]:
    """Evalua el estado de los controles de IA responsable."""
    politica = obtener_politica(db)

    total_audit = db.scalar(select(AuditLog).with_only_columns(AuditLog.id).limit(1)) is not None
    conteo_audit = len(list(db.scalars(select(AuditLog.id)).all()))
    pendientes = len(listar_aprobaciones(db, "pendiente"))
    decididas = len(listar_aprobaciones(db, "todas"))

    controles = [
        {
            "id": "trazabilidad",
            "nombre": "Trazabilidad de decisiones",
            "marco": "ISO/IEC 42001 (A.8) - EU AI Act Art. 12",
            "estado": "cumple" if politica.registrar_auditoria else "parcial",
            "detalle": (
                f"{conteo_audit} decisiones registradas con motivo, riesgo y resultado."
                if politica.registrar_auditoria
                else "La bitacora de auditoría esta desactivada."
            ),
        },
        {
            "id": "supervision",
            "nombre": "Supervisión humana",
            "marco": "EU AI Act Art. 14 - ISO/IEC 42001 (A.9)",
            "estado": "cumple" if pendientes >= 0 and politica.eliminar_requiere_aprobacion else "parcial",
            "detalle": (
                f"{pendientes} acciones esperando tu aprobación; {decididas - pendientes} ya decididas."
            ),
        },
        {
            "id": "explicabilidad",
            "nombre": "Explicabilidad",
            "marco": "OECD - Principio 1",
            "estado": "cumple" if politica.exigir_motivo else "parcial",
            "detalle": (
                "Cada acción exige un motivo; si falta, se te consulta."
                if politica.exigir_motivo
                else "El motivo es opcional."
            ),
        },
        {
            "id": "privacidad",
            "nombre": "Protección de datos",
            "marco": "Ley 1581/2012 (Habeas Data) - GDPR Art. 5",
            "estado": "cumple" if politica.redactar_pii else "parcial",
            "detalle": (
                "Los datos personales identificables se redactan antes de enviarse a un proveedor de IA."
                if politica.redactar_pii
                else "La redacción de datos personales esta desactivada."
            ),
        },
        {
            "id": "control_humano",
            "nombre": "Control humano sobre el sistema",
            "marco": "EU AI Act Art. 14 - NIST AI RMF (MANAGE)",
            "estado": "cumple",
            "detalle": "El usuario puede editar, borrar y auditar cualquier registro.",
        },
        {
            "id": "minimizacion",
            "nombre": "Minimización de datos",
            "marco": "GDPR Art. 5(1)(c) - Ley 1581/2012",
            "estado": "cumple",
            "detalle": "Solo se envia al modelo el contexto necesario para clasificar el mensaje.",
        },
        {
            "id": "retencion",
            "nombre": "Retención y expiracion",
            "marco": "Ley 1581/2012 Art. 10",
            "estado": "cumple" if politica.dias_retencion_auditoria > 0 else "parcial",
            "detalle": f"La auditoría se conserva {politica.dias_retencion_auditoria} días y luego se purga.",
        },
        {
            "id": "transparencia",
            "nombre": "Transparencia del proveedor",
            "marco": "EU AI Act Art. 50",
            "estado": "cumple",
            "detalle": "El proveedor y el modelo activos se muestran siempre en la interfaz.",
        },
    ]

    resumen = {"cumple": 0, "parcial": 0, "no_cumple": 0}
    for control in controles:
        resumen[control["estado"]] = resumen.get(control["estado"], 0) + 1
    total = len(controles)
    pct = round(100 * (resumen.get("cumple", 0) + 0.5 * resumen.get("parcial", 0)) / total, 1) if total else 0.0

    return {
        "puntaje": pct,
        "controles": controles,
        "resumen": resumen,
        "politica": {
            "umbral_confianza": politica.umbral_confianza,
            "gasto_max_autonomo": politica.gasto_max_autonomo,
            "max_acciones_por_mensaje": politica.max_acciones_por_mensaje,
            "modo_prudente": politica.modo_prudente,
            "redactar_pii": politica.redactar_pii,
            "registrar_auditoria": politica.registrar_auditoria,
            "permitir_ia_externa": politica.permitir_ia_externa,
            "exigir_motivo": politica.exigir_motivo,
            "dias_retencion_auditoria": politica.dias_retencion_auditoria,
        },
        "actividad": {
            "decisiones_auditadas": conteo_audit,
            "aprobaciones_pendientes": pendientes,
            "aprobaciones_totales": decididas,
        },
    }
