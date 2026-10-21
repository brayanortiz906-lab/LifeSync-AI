"""Router del sistema responsable: política, auditoría, aprobaciones y cumplimiento."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import policy as gober
from ..database import get_db
from ..models import AuditLog, Event, LogEntry, Maintenance, Task
from ..schemas import (
    ApprovalDecision,
    ApprovalOut,
    AuditOut,
    ComplianceOut,
    PolicyOut,
    PolicyUpdate,
    RedactOut,
    RedactRequest,
)

router = APIRouter(prefix="/api/responsabilidad", tags=["responsabilidad"])


# --------------------------------------------------------------------------- #
# Política
# --------------------------------------------------------------------------- #
@router.get("/politica", response_model=PolicyOut)
def leer_politica(db: Session = Depends(get_db, scope="function")) -> PolicyOut:
    politica = gober.obtener_politica(db)
    db.flush()
    return PolicyOut.model_validate(politica)


@router.put("/politica", response_model=PolicyOut)
def actualizar_politica(cambios: PolicyUpdate, db: Session = Depends(get_db, scope="function")) -> PolicyOut:
    politica = gober.obtener_politica(db)
    datos = cambios.model_dump(exclude_unset=True)
    for campo, valor in datos.items():
        setattr(politica, campo, valor)
    db.flush()
    gober.registrar_auditoria(
        db, actor="usuario", tipo="cambio_politica", modulo="gobierno",
        descripcion="Se actualizaron los parámetros de gobierno",
        motivo="ajuste manual del usuario", riesgo="bajo", reversible=True,
        resultado="ok", datos=datos,
    )
    return PolicyOut.model_validate(politica)


# --------------------------------------------------------------------------- #
# Auditoría
# --------------------------------------------------------------------------- #
@router.get("/auditoria", response_model=list[AuditOut])
def listar_auditoria(
    db: Session = Depends(get_db, scope="function"),
    limite: int = Query(default=100, ge=1, le=500),
    tipo: str | None = None,
    riesgo: str | None = None,
    resultado: str | None = None,
) -> list[AuditOut]:
    consulta = select(AuditLog).order_by(AuditLog.creado_en.desc()).limit(limite)
    if tipo:
        consulta = consulta.where(AuditLog.tipo == tipo)
    if riesgo:
        consulta = consulta.where(AuditLog.riesgo == riesgo)
    if resultado:
        consulta = consulta.where(AuditLog.resultado == resultado)
    return [AuditOut.model_validate(e) for e in db.scalars(consulta).all()]


@router.get("/auditoria/resumen")
def resumen_auditoria(db: Session = Depends(get_db, scope="function")) -> dict:
    """Metricas de trazabilidad: que hace el sistema y con que nivel de riesgo."""
    total = db.scalar(select(func.count(AuditLog.id))) or 0
    por_tipo = dict(
        db.execute(select(AuditLog.tipo, func.count(AuditLog.id)).group_by(AuditLog.tipo)).all()
    )
    por_riesgo = dict(
        db.execute(select(AuditLog.riesgo, func.count(AuditLog.id)).group_by(AuditLog.riesgo)).all()
    )
    por_resultado = dict(
        db.execute(select(AuditLog.resultado, func.count(AuditLog.id)).group_by(AuditLog.resultado)).all()
    )
    con_motivo = db.scalar(
        select(func.count(AuditLog.id)).where(AuditLog.motivo.is_not(None), AuditLog.motivo != "")
    ) or 0
    return {
        "total": total,
        "por_tipo": por_tipo,
        "por_riesgo": por_riesgo,
        "por_resultado": por_resultado,
        "explicabilidad_pct": round(100 * con_motivo / total, 1) if total else 100.0,
    }


@router.delete("/auditoria")
def purgar_auditoria(dias: int | None = Query(default=None, ge=0), db: Session = Depends(get_db, scope="function")):
    """Purga la auditoría más antigua que la retención configurada (derecho de supresion)."""
    borrados = gober.purgar_auditoria(db, dias)
    gober.registrar_auditoria(
        db, actor="usuario", tipo="purga", modulo="privacidad",
        descripcion=f"Se purgaron {borrados} entradas de auditoría",
        motivo="retención o solicitud del usuario", riesgo="bajo", reversible=False,
        resultado="ok", datos={"borrados": borrados},
    )
    return {"borrados": borrados}


# --------------------------------------------------------------------------- #
# Aprobaciones humanas
# --------------------------------------------------------------------------- #
@router.get("/aprobaciones", response_model=list[ApprovalOut])
def listar_aprobaciones(
    db: Session = Depends(get_db, scope="function"),
    estado: str = Query(default="pendiente"),
    limite: int = Query(default=100, ge=1, le=300),
) -> list[ApprovalOut]:
    return [
        ApprovalOut.model_validate(p)
        for p in gober.listar_aprobaciones(db, estado, limite)
    ]


@router.post("/aprobaciones/{peticion_id}/decidir", response_model=ApprovalOut)
def decidir_aprobacion(
    peticion_id: int,
    decision: ApprovalDecision,
    db: Session = Depends(get_db, scope="function"),
) -> ApprovalOut:
    """El usuario aprueba o rechaza una acción que el agente NO ejecuto."""
    peticion, accion = gober.decidir_aprobacion(
        db, peticion_id, decision.aprobar, decision.nota, decision.actor
    )
    if peticion is None:
        raise HTTPException(status_code=404, detail="Aprobación no encontrada")
    if peticion.estado != "pendiente" and accion is None:
        return ApprovalOut.model_validate(peticion)

    if decision.aprobar and accion is not None:
        from ..agent import aplicar_acciones  # import local: evita ciclo
        from ..schemas import AgentAction

        acc = AgentAction(
            tipo=str(accion.get("tipo") or ""),
            datos=accion.get("datos") or {},
            motivo=str(accion.get("motivo") or "Aprobada por el usuario"),
        )
        # `aprobada_por_usuario=True`: el visto bueno humano es la máxima
        # autoridad, así que la acción se ejecuta sin volver a pasar por los
        # umbrales automaticos (si no, volveria a quedar en cola).
        resumen = aplicar_acciones(
            db, [acc], confianza=1.0,
            chat_message_id=peticion.chat_message_id, aprobada_por_usuario=True,
        )
        db.flush()
        gober.registrar_auditoria(
            db, actor="usuario", tipo="ejecucion_aprobada", modulo="gobierno",
            descripcion=peticion.resumen,
            motivo=decision.nota or "Aprobada por el usuario",
            riesgo=peticion.riesgo, reversible=True, resultado="ok",
            entidad="approval_request", entidad_id=peticion.id,
            datos={"registrado": resumen.get("registros_detallados", [])},
        )
    return ApprovalOut.model_validate(peticion)


# --------------------------------------------------------------------------- #
# Privacidad
# --------------------------------------------------------------------------- #
@router.post("/redactar", response_model=RedactOut)
def redactar(cuerpo: RedactRequest) -> RedactOut:
    """Previsualiza que datos personales se ocultarian antes de enviarlos al modelo."""
    redactado, categorias = gober.redactar_pii(cuerpo.texto)
    return RedactOut(
        texto_original=cuerpo.texto,
        texto_redactado=redactado,
        categorias=categorias,
        total_encontrados=len(categorias),
    )


# --------------------------------------------------------------------------- #
# Cumplimiento
# --------------------------------------------------------------------------- #
@router.get("/cumplimiento", response_model=ComplianceOut)
def cumplimiento(db: Session = Depends(get_db, scope="function")) -> ComplianceOut:
    return ComplianceOut(**gober.reporte_cumplimiento(db))


@router.get("/inventario")
def inventario_datos(db: Session = Depends(get_db, scope="function")) -> dict:
    """Inventario de datos personales tratados (deber de información)."""
    politica = gober.obtener_politica(db)
    return {
        "categorias_datos": [
            {"categoria": "Agenda y horarios", "dato": "Títulos, fechas, horas de compromisos", "base": "Event", "finalidad": "Planificación y reorganizacion", "base_legal": "Ejecución del contrato (servicio solicitado)"},
            {"categoria": "Academico", "dato": "Tareas, materias, entregas, material", "base": "Task", "finalidad": "Seguimiento de entregas y bloques de estudio", "base_legal": "Ejecución del contrato"},
            {"categoria": "Finanzas", "dato": "Descripción y monto de gastos", "base": "LogEntry", "finalidad": "Control de gasto y clasificacion automática", "base_legal": "Ejecución del contrato"},
            {"categoria": "Mantenimiento", "dato": "Activos y calendario de servicios", "base": "Maintenance", "finalidad": "Recordatorios de mantenimiento periodico", "base_legal": "Ejecución del contrato"},
            {"categoria": "Conversacion", "dato": "Mensajes con el agente y sus respuestas", "base": "ChatMessage", "finalidad": "Historial y explicabilidad", "base_legal": "Interés legitimo"},
            {"categoria": "Trazabilidad", "dato": "Decisiones, motivos, riesgos, confianza", "base": "AuditLog", "finalidad": "Auditoría, explicabilidad y cumplimiento", "base_legal": "Cumplimiento legal"},
            {"categoria": "Credenciales", "dato": "API Key del proveedor de IA", "base": "AppSettings (cifrada)", "finalidad": "Autenticación con el proveedor", "base_legal": "Ejecución del contrato"},
        ],
        "terceros": [
            {"nombre": "OpenAI / Google Gemini", "dato": "Mensaje y contexto minimo", "proposito": "Clasificar intencion y generar acciones", "control": "API Key propia (BYOK), contexto minimo, PII redactada, auditable"},
        ],
        "medidas": {
            "redaccion_pii": politica.redactar_pii,
            "cifrado_api_key": True,
            "retencion_auditoria_dias": politica.dias_retencion_auditoria,
            "control_usuario": "Edición, borrado manual y aprobación de cada acción sensible",
        },
        "derechos": {
            "acceso": "GET /api/events, /api/tasks, /api/logbook, /api/responsabilidad/auditoría",
            "rectificacion": "PATCH /api/events/{id}, /api/tasks/{id}",
            "supresion": "DELETE /api/events/{id}, /api/logbook/{id}, purga de auditoría",
            "portabilidad": "GET /api/context devuelve el estado completo en JSON",
            "oposicion": "Desactivar IA externa o activar modo prudente en /api/responsabilidad/política",
        },
    }
