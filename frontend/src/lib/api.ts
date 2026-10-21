/** Cliente HTTP de la API de LifeSync AI. */
import type {
  Ajustes, Aprobacion, AutorizacionCuenta, Conexion, Dashboard, EntradaAuditoria, Evento,
  HistorialMsg, Mantenimiento, MotorLocal, Politica, ProveedorCatalogo, Registro,
  ReporteCumplimiento, ResumenAuditoria, RespuestaAgente, ResultadoAutorizacion, Tarea,
} from '../types'

// La URL de la API: variable de entorno (VITE_API_URL) o el mismo origen.
// Con VITE_BASE='./' (GitHub Pages) cae a './api' en lugar de '/api'.
const BASE = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detalle = `Error ${res.status}`
    try {
      const cuerpo = await res.json()
      detalle = cuerpo.detail ?? JSON.stringify(cuerpo)
    } catch {
      detalle = await res.text().catch(() => detalle)
    }
    throw new ApiError(detalle, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Clave de API que el usuario pega en el navegador (modo BYOK del prototipo). */
export function leerApiKeyLocal(): string {
  try {
    return localStorage.getItem('lifesync.apiKey') ?? ''
  } catch {
    return ''
  }
}

export function guardarApiKeyLocal(key: string) {
  try {
    if (key) localStorage.setItem('lifesync.apiKey', key)
    else localStorage.removeItem('lifesync.apiKey')
  } catch {
    /* almacenamiento no disponible */
  }
}

export const api = {
  health: () => request<{ ok: boolean; proveedor_por_defecto: string }>('/health'),

  dashboard: () => request<Dashboard>('/dashboard'),

  eventos: (desde?: string, hasta?: string) => {
    const q = new URLSearchParams()
    if (desde) q.set('desde', desde)
    if (hasta) q.set('hasta', hasta)
    return request<Evento[]>(`/events?${q.toString()}`)
  },

  crearEvento: (datos: Partial<Evento>) =>
    request<Evento>('/events', { method: 'POST', body: JSON.stringify(datos) }),

  actualizarEvento: (id: number, datos: Partial<Evento>) =>
    request<Evento>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(datos) }),

  eliminarEvento: (id: number) =>
    request<void>(`/events/${id}`, { method: 'DELETE' }),

  tareas: () => request<Tarea[]>('/tasks'),
  crearTarea: (datos: Partial<Tarea>) =>
    request<Tarea>('/tasks', { method: 'POST', body: JSON.stringify(datos) }),
  actualizarTarea: (id: number, datos: Partial<Tarea>) =>
    request<Tarea>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(datos) }),
  completarTarea: (id: number) => request<Tarea>(`/tasks/${id}/completar`, { method: 'POST' }),

  registros: (mes?: string) =>
    request<Registro[]>(`/logbook${mes ? `?mes=${mes}` : ''}`),
  crearRegistro: (datos: Partial<Registro> & { registrar_en_calendario?: boolean }) =>
    request<Registro>('/logbook', { method: 'POST', body: JSON.stringify(datos) }),

  mantenimiento: () => request<Mantenimiento[]>('/maintenance'),
  crearMantenimiento: (datos: Partial<Mantenimiento>) =>
    request<Mantenimiento>('/maintenance', { method: 'POST', body: JSON.stringify(datos) }),
  completarMantenimiento: (id: number) =>
    request<Mantenimiento>(`/maintenance/${id}/completar`, { method: 'POST' }),

  chat: (mensaje: string, extra: { proveedor?: string; modelo?: string; api_key?: string } = {}) =>
    request<{ agente: RespuestaAgente; plan: Record<string, unknown>; proveedor: string }>('/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ mensaje, ...extra }),
    }),

  historial: () => request<HistorialMsg[]>('/agent/history'),
  limpiarHistorial: () => request<void>('/agent/history', { method: 'DELETE' }),

  ajustes: () => request<Ajustes>('/settings'),
  guardarAjustes: (datos: Partial<Ajustes> & { api_key?: string; borrar_api_key?: boolean }) =>
    request<Ajustes>('/settings', { method: 'PUT', body: JSON.stringify(datos) }),

  ingerir: (datos: {
    titulo: string; materia?: string; material: string; fuente?: string
    minutos_estudio?: number; proveedor?: string; modelo?: string; api_key?: string
  }) => request<{ resumen: string; ideas_clave: string[]; preguntas_estudio: string[]; tarea_id: number }>(
    '/agent/ingest',
    { method: 'POST', body: JSON.stringify(datos) },
  ),

  // ---------------------------------------------------------------- responsable
  politica: () => request<Politica>('/responsabilidad/politica'),

  guardarPolitica: (datos: Partial<Politica>) =>
    request<Politica>('/responsabilidad/politica', { method: 'PUT', body: JSON.stringify(datos) }),

  auditoria: (params: { limite?: number; tipo?: string; riesgo?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.limite) q.set('limite', String(params.limite))
    if (params.tipo) q.set('tipo', params.tipo)
    if (params.riesgo) q.set('riesgo', params.riesgo)
    return request<EntradaAuditoria[]>(`/responsabilidad/auditoria?${q.toString()}`)
  },

  resumenAuditoria: () => request<ResumenAuditoria>('/responsabilidad/auditoria/resumen'),

  purgarAuditoria: (dias?: number) =>
    request<{ borrados: number }>(
      `/responsabilidad/auditoria${dias !== undefined ? `?dias=${dias}` : ''}`,
      { method: 'DELETE' },
    ),

  aprobaciones: (estado = 'pendiente') =>
    request<Aprobacion[]>(`/responsabilidad/aprobaciones?estado=${estado}`),

  decidirAprobacion: (id: number, aprobar: boolean, nota?: string) =>
    request<Aprobacion>(`/responsabilidad/aprobaciones/${id}/decidir`, {
      method: 'POST',
      body: JSON.stringify({ aprobar, nota, actor: 'usuario' }),
    }),

  redactar: (texto: string) =>
    request<{ texto_original: string; texto_redactado: string; categorias: string[]; total_encontrados: number }>(
      '/responsabilidad/redactar',
      { method: 'POST', body: JSON.stringify({ texto }) },
    ),

  cumplimiento: () => request<ReporteCumplimiento>('/responsabilidad/cumplimiento'),

  inventario: () => request<{
    categorias_datos: { categoria: string; dato: string; base: string; finalidad: string; base_legal: string }[]
    terceros: { nombre: string; dato: string; proposito: string; control: string }[]
    medidas: Record<string, unknown>
    derechos: Record<string, string>
  }>('/responsabilidad/inventario'),

  // ------------------------------------------------------------ conexiones IA
  catalogoConexiones: () =>
    request<{ proveedores: ProveedorCatalogo[] }>('/conexiones/catalogo'),

  conexiones: () => request<Conexion[]>('/conexiones'),

  guardarConexion: (datos: {
    proveedor: string
    api_key?: string
    base_url?: string
    modelo?: string
    nombre?: string
    modo?: string
  }) => request<Conexion>('/conexiones', { method: 'POST', body: JSON.stringify(datos) }),

  verificarConexion: (id: number) =>
    request<Conexion>(`/conexiones/${id}/verificar`, { method: 'POST' }),

  activarConexion: (id: number) =>
    request<Conexion>(`/conexiones/${id}/activar`, { method: 'POST' }),

  eliminarConexion: (id: number) =>
    request<{ ok: boolean }>(`/conexiones/${id}`, { method: 'DELETE' }),

  detectarLocales: () =>
    request<{ motores: MotorLocal[]; total: number }>('/conexiones/locales'),

  /** Paso 1 del flujo "conectar mi cuenta": pide un codigo de autorizacion. */
  iniciarCuenta: (datos: { proveedor: string; client_id: string }) =>
    request<AutorizacionCuenta>('/conexiones/cuenta/iniciar', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),

  /** Paso 2: consulta si el usuario ya autorizo en su navegador. */
  terminarCuenta: (datos: { proveedor: string; client_id: string; device_code: string }) =>
    request<ResultadoAutorizacion>('/conexiones/cuenta/terminar', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),
}
