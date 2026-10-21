/** Cliente HTTP de la API de LifeSync AI. */
import type {
  Ajustes, Aprobacion, AutorizacionCuenta, CatalogoModelos, Conexion, Dashboard, EntradaAuditoria, EstadoGoogle,
  PerfilCuenta, Respaldo, ResultadoCodigo, ResultadoSesion,
  Evento, HistorialMsg, Mantenimiento, MotorLocal, Politica, ProveedorCatalogo, Registro,
  ReporteCumplimiento, ResumenAuditoria, RespuestaAgente, ResultadoAutorizacion, Tarea,
} from '../types'

// La URL de la API, en este orden de prioridad:
// 1. Lo que el usuario guardo en el navegador (util cuando la interfaz esta en
//    GitHub Pages y la API vive en otro sitio: se puede cambiar sin recompilar).
// 2. Variable de entorno VITE_API_URL (la inyecta el workflow de Pages).
// 3. El mismo origen (./api) cuando la API se sirve junto a la interfaz.
const CLAVE_API_URL = 'lifesync.apiUrl'

export function leerUrlApi(): string {
  const guardada = localStorage.getItem(CLAVE_API_URL)?.trim()
  if (guardada) return guardada.replace(/\/+$/, '')
  return (import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`).replace(/\/+$/, '')
}

export function guardarUrlApi(url: string): void {
  const limpio = url.trim()
  if (limpio) localStorage.setItem(CLAVE_API_URL, limpio)
  else localStorage.removeItem(CLAVE_API_URL)
}

// --- Token de sesion (v11) ------------------------------------------------
// Se guarda en este navegador. Sin token la app funciona igual, pero con los
// datos SOLO en este equipo (modo local). Con token, cada persona tiene sus
// datos aislados en el servidor.
const CLAVE_TOKEN = 'lifesync.token'

export function leerToken(): string {
  return localStorage.getItem(CLAVE_TOKEN)?.trim() || ''
}

export function guardarToken(token: string): void {
  if (token.trim()) localStorage.setItem(CLAVE_TOKEN, token.trim())
  else localStorage.removeItem(CLAVE_TOKEN)
}

export function borrarToken(): void {
  localStorage.removeItem(CLAVE_TOKEN)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = leerToken()
  if (token) cabeceras.Authorization = `Bearer ${token}`
  const res = await fetch(`${leerUrlApi()}${path}`, {
    ...init,
    headers: { ...cabeceras, ...((init?.headers as Record<string, string>) || {}) },
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

  detectarLocales: () => request<{
    motores: MotorLocal[]
    total: number
    autoconectado?: {
      id: number; proveedor: string; nombre: string; modelo: string; ok: boolean; mensaje: string
    } | null
  }>('/conexiones/locales'),

  /** Catalogo amplio de modelos para que la persona elija "cualquier IA". */
  modelosDisponibles: (proveedor = 'openrouter') =>
    request<CatalogoModelos>(`/conexiones/modelos?proveedor=${proveedor}`),

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

  /** Estado del acceso con Google: dice si ya hay un ID de cliente configurado. */
  estadoGoogle: () => request<EstadoGoogle>('/conexiones/google/estado'),

  /** Guarda el ID de cliente de Google (es publico) para conectar en un clic. */
  guardarGoogleClientId: (client_id: string) =>
    request<{ ok: boolean; configurado: boolean; origen: string }>('/conexiones/google/estado', {
      method: 'PUT',
      body: JSON.stringify({ client_id }),
    }),
}

/** Endpoints de acceso y respaldo (v11). */
export const cuentas = {
  yo: () => request<PerfilCuenta>('/cuentas/yo'),
  pedirCodigo: (correo: string, nombre = '') =>
    request<ResultadoCodigo>('/cuentas/codigo', {
      method: 'POST',
      body: JSON.stringify({ correo, nombre }),
    }),
  verificarCodigo: (correo: string, codigo: string) =>
    request<ResultadoSesion>('/cuentas/verificar', {
      method: 'POST',
      body: JSON.stringify({ correo, codigo }),
    }),
  entrarConGoogle: (access_token: string) =>
    request<ResultadoSesion>('/cuentas/google', {
      method: 'POST',
      body: JSON.stringify({ access_token }),
    }),
  entrarGoogleDesdeConexion: () =>
    request<ResultadoSesion>('/cuentas/google/desde-conexion', { method: 'POST' }),
  salir: () => request<{ ok: boolean }>('/cuentas/salir', { method: 'POST' }),
  respaldo: () => request<Respaldo>('/cuentas/respaldo'),
  respaldoDriveDesdeConexion: () =>
    request<{ ok: boolean; archivo: string; enlace: string }>('/cuentas/respaldo/drive/desde-conexion', {
      method: 'POST',
    }),
  respaldoDrive: (access_token: string, nombre = 'lifesync-respaldo.json') =>
    request<{ ok: boolean; archivo: string; enlace: string }>('/cuentas/respaldo/drive', {
      method: 'POST',
      body: JSON.stringify({ access_token, nombre }),
    }),
}
