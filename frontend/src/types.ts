/** Tipos compartidos con la API de LifeSync AI (ver backend/app/schemas.py). */

export type CategoriaEvento =
  | 'trabajo' | 'clase' | 'estudio' | 'descanso'
  | 'personal' | 'salud' | 'social' | 'mantenimiento'

export type CategoriaGasto =
  | 'combustible' | 'mantenimiento' | 'alimentacion' | 'transporte'
  | 'servicios' | 'ocio' | 'salud' | 'educacion' | 'suscripciones' | 'otro'

export interface Evento {
  id: number
  titulo: string
  categoria: CategoriaEvento
  inicio: string
  fin: string
  inamovible: boolean
  notas: string | null
  fuente: string
  duracion_min: number
}

export interface Tarea {
  id: number
  titulo: string
  materia: string | null
  fecha_entrega: string | null
  estado: 'pendiente' | 'en_progreso' | 'completada'
  prioridad: 'alta' | 'media' | 'baja'
  minutos_estimados: number
  resumen: string | null
  material: string | null
  preguntas: string[]
  fuente: string
}

export interface Registro {
  id: number
  descripcion: string
  monto: number | null
  moneda: string
  categoria: CategoriaGasto
  fecha: string
  notas: string | null
}

export interface Mantenimiento {
  id: number
  activo: string
  tarea: string
  intervalo_dias: number
  ultima_realizacion: string | null
  proxima_fecha: string | null
  costo_estimado: number | null
  notas: string | null
  dias_restantes: number | null
  vencido: boolean
}

export interface Alerta {
  tipo: string
  texto: string
  prioridad: 'alta' | 'media' | 'baja'
}

export interface Accion {
  tipo: string
  datos: Record<string, unknown>
  motivo: string
}

/** Categoría de una acción ejecutada por el agente (registro en cascada). */
export type TipoRegistro =
  | 'evento' | 'tarea' | 'gasto' | 'mantenimiento' | 'estudio' | 'agenda'

/** Detalle de un elemento que quedó registrado automáticamente por el chat. */
export interface RegistroDetallado {
  tipo: TipoRegistro | string
  titulo: string
  detalle: string
}

export interface RegistroDetallado {
  tipo: TipoRegistro | string
  titulo: string
  detalle: string
}

export interface AprobacionPendiente {
  id: number
  tipo: string
  resumen: string
  motivo: string | null
  regla: string
  riesgo: string
  confianza: number | null
}

// --------------------------------------------------------------------------- //
// Sistema responsable (IA responsable)
// --------------------------------------------------------------------------- //
export type NivelRiesgo = 'bajo' | 'medio' | 'alto'

export interface Politica {
  id: number
  umbral_confianza: number
  gasto_max_autonomo: number
  max_acciones_por_mensaje: number
  eliminar_requiere_aprobacion: boolean
  gasto_alto_requiere_aprobacion: boolean
  baja_confianza_requiere_aprobacion: boolean
  redactar_pii: boolean
  registrar_auditoria: boolean
  permitir_ia_externa: boolean
  modo_prudente: boolean
  exigir_motivo: boolean
  dias_retencion_auditoria: number
  actualizado_en?: string | null
}

export interface Aprobacion {
  id: number
  creado_en: string
  estado: string
  tipo_accion: string
  resumen: string
  motivo: string | null
  regla: string
  riesgo: NivelRiesgo | string
  confianza: number | null
  chat_message_id: number | null
  decidido_en: string | null
  decidido_por: string | null
  nota_decision: string | null
}

export interface EntradaAuditoria {
  id: number
  creado_en: string
  actor: string
  tipo: string
  modulo: string
  entidad: string | null
  entidad_id: number | null
  descripcion: string
  motivo: string | null
  confianza: number | null
  riesgo: NivelRiesgo | string
  reversible: boolean
  resultado: string
}

export interface ControlCumplimiento {
  id: string
  nombre: string
  marco: string
  estado: 'cumple' | 'parcial' | 'no_cumple'
  detalle: string
}

export interface ReporteCumplimiento {
  puntaje: number
  controles: ControlCumplimiento[]
  resumen: Record<string, number>
  politica: Record<string, unknown>
  actividad: {
    decisiones_auditadas: number
    aprobaciones_pendientes: number
    aprobaciones_totales: number
  }
}

export interface ResumenAuditoria {
  total: number
  por_tipo: Record<string, number>
  por_riesgo: Record<string, number>
  por_resultado: Record<string, number>
  explicabilidad_pct: number
}

export interface RespuestaAgente {
  categoria: 'CALENDARIO' | 'TAREA_ACADEMICA' | 'BITACORA_GASTO' | 'MANTENIMIENTO' | 'CONVERSACION'
  /** Todas las categorías detectadas en el mensaje (multi-intención). */
  categorias?: string[]
  intencion: string
  confianza: number
  mensaje_usuario: string
  requiere_confirmacion: boolean
  acciones: Accion[]
  alertas: Alerta[]
  resumen_estado: Record<string, unknown> & {
    registros_detallados?: RegistroDetallado[]
    aprobaciones_pendientes?: AprobacionPendiente[]
    acciones_bloqueadas?: { tipo: string; motivo: string; regla: string }[]
    plan?: Record<string, unknown>
  }
}

export interface MensajeChat {
  id: string
  rol: 'user' | 'assistant'
  contenido: string
  categoria?: string
  agente?: RespuestaAgente
  plan?: Record<string, unknown>
  pendiente?: boolean
}

/** Mensaje tal como lo devuelve el historial del servidor. */
export interface HistorialMsg {
  id: number
  rol: 'user' | 'assistant' | 'system'
  contenido: string
  categoria: string | null
  payload: RespuestaAgente | null
  creado_en: string | null
}

export interface Dashboard {
  fecha: string
  eventos_hoy: Evento[]
  carga: { minutos_productivos: number; minutos_descanso: number; total_bloques: number }
  tareas_pendientes: number
  proximas_entregas: Array<{
    id: number
    titulo: string
    materia: string | null
    fecha_entrega: string | null
    prioridad: 'alta' | 'media' | 'baja'
  }>
  gasto_mes: {
    total: number
    moneda: string
    por_categoria: Record<string, number>
    conteo: number
  }
  mantenimiento: Array<{
    id: number
    activo: string
    tarea: string
    proxima_fecha: string | null
    dias_restantes: number | null
    costo_estimado: number | null
  }>
}

export interface Ajustes {
  proveedor: string
  modelo: string
  moneda: string
  inicio_jornada: string
  fin_jornada: string
  tiene_api_key: boolean
  proveedor_efectivo: string
}

/** Colores por categoría de evento (Tailwind-safe: clases estáticas). */
export const COLOR_EVENTO: Record<string, { chip: string; bloque: string; punto: string }> = {
  trabajo: {
    chip: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
    bloque: 'bg-indigo-500/25 border-indigo-400/50 text-indigo-50',
    punto: 'bg-indigo-400',
  },
  clase: {
    chip: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
    bloque: 'bg-sky-500/25 border-sky-400/50 text-sky-50',
    punto: 'bg-sky-400',
  },
  estudio: {
    chip: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
    bloque: 'bg-violet-500/25 border-violet-400/50 text-violet-50',
    punto: 'bg-violet-400',
  },
  descanso: {
    chip: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    bloque: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-50',
    punto: 'bg-emerald-400',
  },
  personal: {
    chip: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    bloque: 'bg-amber-500/25 border-amber-400/50 text-amber-50',
    punto: 'bg-amber-400',
  },
  salud: {
    chip: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    bloque: 'bg-rose-500/25 border-rose-400/50 text-rose-50',
    punto: 'bg-rose-400',
  },
  social: {
    chip: 'bg-pink-500/15 text-pink-300 ring-pink-500/30',
    bloque: 'bg-pink-500/25 border-pink-400/50 text-pink-50',
    punto: 'bg-pink-400',
  },
  mantenimiento: {
    chip: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
    bloque: 'bg-cyan-500/25 border-cyan-400/50 text-cyan-50',
    punto: 'bg-cyan-400',
  },
}

export const COLOR_GASTO: Record<string, string> = {
  combustible: 'bg-orange-500/20 text-orange-300',
  mantenimiento: 'bg-cyan-500/20 text-cyan-300',
  alimentacion: 'bg-emerald-500/20 text-emerald-300',
  transporte: 'bg-sky-500/20 text-sky-300',
  servicios: 'bg-violet-500/20 text-violet-300',
  ocio: 'bg-pink-500/20 text-pink-300',
  salud: 'bg-rose-500/20 text-rose-300',
  educacion: 'bg-indigo-500/20 text-indigo-300',
  suscripciones: 'bg-teal-500/20 text-teal-300',
  otro: 'bg-slate-500/20 text-slate-300',
}

export const ICONO_CATEGORIA: Record<string, string> = {
  trabajo: '💼', clase: '🎓', estudio: '📚', descanso: '☕',
  personal: '📌', salud: '🏥', social: '🎉', mantenimiento: '🔧',
}
