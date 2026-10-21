/** Cliente HTTP de la API de LifeSync AI. */
import type {
  Ajustes, Dashboard, Evento, HistorialMsg, Mantenimiento,
  Registro, RespuestaAgente, Tarea,
} from '../types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

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
}
