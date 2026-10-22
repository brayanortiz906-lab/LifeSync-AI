/** Tipos compartidos con la API de LifeAgente AI (ver backend/app/schemas.py). */

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
  /** Panel al que pertenece (v19). */
  panel_id?: number | null
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
  /** Panel al que pertenece (v19). */
  panel_id?: number | null
}

export interface Registro {
  id: number
  descripcion: string
  monto: number | null
  moneda: string
  categoria: CategoriaGasto
  fecha: string
  notas: string | null
  /** Panel al que pertenece (v19). */
  panel_id?: number | null
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
  /** Panel al que pertenece (v19). */
  panel_id?: number | null
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

export type TemaId = 'medianoche' | 'oceano' | 'bosque' | 'atardecer'
export type OrdenTareas = 'fecha' | 'prioridad' | 'tiempo' | 'materia'
export type OrdenGastos = 'fecha' | 'monto' | 'categoria'
export type OrdenEventos = 'hora' | 'categoria' | 'duracion'

export interface Ajustes {
  proveedor: string
  modelo: string
  moneda: string
  inicio_jornada: string
  fin_jornada: string
  tiene_api_key: boolean
  proveedor_efectivo: string
  /** Como quieres que te llame el asistente. */
  nombre_usuario: string
  /** Tema visual de la aplicacion. */
  tema: TemaId
  /** Como se ordenan las tareas academicas. */
  orden_tareas: OrdenTareas
  /** Como se ordenan los gastos de la bitacora. */
  orden_gastos: OrdenGastos
  /** Como se ordenan los bloques del dia. */
  orden_eventos: OrdenEventos
  /** Etiquetas propias para clasificar lo que registras. */
  etiquetas: string[]
  /** Ya completo el formulario de bienvenida. */
  onboarding_completo: boolean
}

// --------------------------------------------------------------------------- //
// Centro de conexiones de IA
// --------------------------------------------------------------------------- //
export type ModoConexion = 'api_key' | 'cuenta' | 'local' | 'demo'

export interface ProveedorCatalogo {
  id: string
  nombre: string
  modo: ModoConexion
  resumen: string
  icono: string
  requiere_pago: boolean
  gratis: boolean
  instrucciones: string[]
  modelos: string[]
  modelo_defecto: string
  url_registro: string
  pasos_ayuda: string[]
  notas: string
  acepta_cuenta: boolean
  url_client_id: string
  /** Se puede entrar a su sitio con la cuenta de Google ("Continuar con Google"). */
  permite_google: boolean
  /** La persona puede elegir entre un catalogo amplio de modelos. */
  permite_seleccion_modelo: boolean
}

/** Un modelo del catalogo amplio (por ejemplo los 300+ de OpenRouter). */
export interface ModeloCatalogo {
  id: string
  nombre: string
  familia: string
  gratis: boolean
  contexto: number
}

export interface CatalogoModelos {
  proveedor: string
  modelos: ModeloCatalogo[]
  total: number
  familias: { familia: string; modelos: number }[]
}

/** Datos que devuelve el inicio del flujo OAuth "device authorization". */
export interface AutorizacionCuenta {
  proveedor: string
  user_code: string
  verification_uri: string
  verification_uri_simple: string
  intervalo: number
  expira_en: number
  device_code: string
  client_id: string
}

/** Persona con cuenta (v11). Sin cuenta: el usuario local del equipo. */
export interface Usuario {
  id: number
  correo: string
  nombre: string
  metodo: string
  verificado: boolean
  es_local: boolean
}

/** Nivel de acceso de una persona a un panel (v19). */
export type RolPanel = 'dueno' | 'editar' | 'lector'

/** Un panel: espacio de trabajo con su propio contenido (v19). */
export interface Panel {
  id: number
  nombre: string
  tipo: string
  color: string
  descripcion: string
  rol: RolPanel
  es_propio: boolean
  miembros: number
  eventos: number
  tareas: number
}

/** Persona con acceso a un panel (v19). */
export interface MiembroPanel {
  usuario_id: number
  correo: string
  nombre: string
  nivel: 'ver' | 'editar'
  creado_en: string
}

/** Contenido de un panel (v19). */
export interface DatosPanel {
  ok: boolean
  panel_id: number
  nombre: string
  rol: RolPanel
  eventos: Evento[]
  tareas: Tarea[]
  registros: Registro[]
  mantenimiento: Mantenimiento[]
}

export interface PerfilCuenta {
  ok: boolean
  usuario: Usuario
}

export interface ResultadoCodigo {
  ok: boolean
  modo: string
  mensaje: string
  correo: string
  codigo?: string
}

/** Todo lo que la app necesita al abrirse, en una sola peticion (v36). */
/** Autodiagnostico del servidor: que falta por configurar (v37). */
export interface PendienteDespliegue {
  titulo: string
  estado: 'listo' | 'pendiente' | 'opcional'
  como: string
}

export interface Diagnostico {
  ok: boolean
  app: string
  problemas: string[]
  usuarios?: number
  correos?: boolean
  google_configurado?: boolean
  pendientes: PendienteDespliegue[]
  listo?: boolean
}

export interface Inicio {
  ok: boolean
  dashboard: Dashboard | null
  eventos: Evento[]
  tareas: Tarea[]
  registros: Registro[]
  mantenimiento: Mantenimiento[]
  paneles: { ok: boolean; paneles: Panel[] }
  ajustes: Ajustes
  politica: Politica
  resumen_auditoria: ResumenAuditoria
  cumplimiento: ReporteCumplimiento
  permisos: EstadoPermisos
  aprobaciones: Aprobacion[]
}

export interface ResultadoSesion {
  ok: boolean
  token?: string
  usuario?: Usuario
  /** Mensaje para la UI (por ejemplo: todavia falta autorizar en el navegador). */
  mensaje?: string
}

export interface Respaldo {
  version: number
  exportado_en: string
  eventos: Record<string, unknown>[]
  tareas: Record<string, unknown>[]
  registros: Record<string, unknown>[]
  mantenimiento: Record<string, unknown>[]
  chat: Record<string, unknown>[]
  conexiones: Record<string, unknown>[]
}

/** Un modelo de IA ligero que se puede descargar para usarlo en el computador. */
export interface ModeloLigero {
  id: string
  nombre: string
  tamano_mb: number
  nota: string
  recomendado: boolean
}

/** Como va una descarga de modelo (progreso, log y error si lo hubo). */
export interface DescargaIA {
  id: string
  modelo: string
  estado: 'descargando' | 'listo' | 'error'
  progreso: number
  mensaje: string
  log: string[]
  iniciada_en: string | null
  terminada_en: string | null
}

/** Modelos ligeros disponibles y si hay un motor local instalado. */
export interface InfoModelosLigeros {
  ok: boolean
  modelos: ModeloLigero[]
  motor: string
  hay_motor: boolean
  motores: MotorLocal[]
}

/** Credenciales publicas de las cuentas (se obtienen solas al iniciar sesion). */
export interface InfoClientesPublicos {
  ok: boolean
  url: string
  proveedores: Record<string, string>
  configurado: boolean
}

/** Estado del acceso con Google: dice si ya hay un ID de cliente configurado. */
export interface EstadoGoogle {
  /** Ya hay un ID de cliente de Google guardado (un clic y entras). */
  configurado: boolean
  /** De donde sale: "app" (guardado por la persona), "servidor" (env) o "nada". */
  origen: string
  /** Explicacion en lenguaje llano de lo que hay que hacer. */
  pista: string
  /** A que cuenta se refiere (google_cuenta, outlook_cuenta, github_cuenta). */
  proveedor?: string
}

/** Una cuenta con la que se puede entrar (Google, Outlook, GitHub). */
export interface ProveedorAcceso {
  id: string
  nombre: string
  detalle: string
  icono: string
  /** ¿Este servidor ya tiene activado ese acceso? */
  disponible: boolean
  /** Lo que ve la persona, en palabras llanas. */
  mensaje: string
  /** Donde se activa (para quien instala). */
  url_registro: string
  instrucciones: string[]
}

/** Que vias de acceso ofrece el servidor ahora mismo (v24). */
export interface InfoProveedores {
  ok: boolean
  proveedores: ProveedorAcceso[]
  correo: { disponible: boolean; mensaje: string }
  local: { disponible: boolean; mensaje: string }
}

/** Un permiso que la app pide a la cuenta (Drive, Calendar, correo...). */
export interface Permiso {
  id: string
  titulo: string
  descripcion: string
  /** Por que lo pedimos, en palabras simples. */
  por_que: string
  icono: string
  scope: string
  /** Ya lo concediste? */
  concedido: boolean
}

/** Estado de los permisos de la persona y de su autopiloto. */
export interface EstadoPermisos {
  /** Hay una cuenta conectada con permisos? */
  conectado: boolean
  proveedor: string
  correo: string
  permisos: Permiso[]
  autopiloto: {
    /** El sistema trabaja solo? */
    activo: boolean
    respaldo_auto: boolean
    importar_calendario: boolean
    /** Mandar el resumen del dia siguiente por correo? */
    resumen_diario: boolean
    ultimo_respaldo: string
    proximo_respaldo: string
    /** v21: hay cambios que todavia no se han guardado en Drive. */
    cambios_pendientes: boolean
    /** v21: cuando fue el ultimo cambio. */
    ultimo_cambio: string
    /** v21: segundos que faltan para que el sistema guarde. */
    guarda_en_segundos: number
  }
}

/** Resultado de consultar si el usuario ya autorizo en su navegador. */
export interface ResultadoAutorizacion {
  ok: boolean
  mensaje: string
  detalle?: string
  conexion?: Conexion
}

export interface Conexion {
  id: number
  proveedor: string
  nombre: string
  modo: ModoConexion | string
  modelo: string
  activa: boolean
  estado: string
  detalle_estado: string | null
  creada_en: string | null
  verificada_en: string | null
  tiene_credencial: boolean
  base_url: string
  icono: string
  resumen: string
  instrucciones: string[]
  modelos_disponibles: string[]
}

export interface MotorLocal {
  id: string
  nombre: string
  url: string
  modelos: string[]
  modelos_disponibles: number
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
