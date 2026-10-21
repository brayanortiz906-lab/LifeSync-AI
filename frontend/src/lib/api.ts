/** Cliente HTTP de la API de LifeAgente AI. */
import type {
  Ajustes, Aprobacion, AutorizacionCuenta, CatalogoModelos, Conexion, Dashboard, DatosPanel,
  DescargaIA, EntradaAuditoria, EstadoGoogle,
  EstadoPermisos, InfoClientesPublicos, InfoModelosLigeros, InfoProveedores, MiembroPanel,
  Panel, Permiso,
  PerfilCuenta, Respaldo, ResultadoCodigo, ResultadoSesion, Usuario,
  Evento, HistorialMsg, Mantenimiento, MotorLocal, Politica, ProveedorCatalogo, Registro,
  ReporteCumplimiento, ResumenAuditoria, RespuestaAgente, ResultadoAutorizacion, Tarea,
} from '../types'

// La URL de la API, en este orden de prioridad:
// 1. Lo que el usuario guardo en el navegador (util cuando la interfaz esta en
//    GitHub Pages y la API vive en otro sitio: se puede cambiar sin recompilar).
//    PERO si esa direccion apunta a un sitio estatico (GitHub Pages) no vale:
//    ahi no hay API y por eso se ignoraba y la peticion se quedaba en el
//    sitio estatico (error 405 "Method Not Allowed").
// 2. Variable de entorno VITE_API_URL (la inyecta el workflow de Pages).
// 3. El mismo origen (./api) cuando la API se sirve junto a la interfaz.
const CLAVE_API_URL = 'lifesync.apiUrl'

/** Sitios que solo sirven archivos estaticos: ahi no hay API que responder. */
function esSitioEstatico(url: string): boolean {
  if (!url) return false
  try {
    const host = new URL(url, window.location.origin).hostname.toLowerCase()
    return host === 'github.io' || host.endsWith('.github.io')
  } catch {
    return false
  }
}

function sinBarras(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function leerUrlApi(): string {
  const guardada = localStorage.getItem(CLAVE_API_URL)?.trim()
  const delBuild = (import.meta.env.VITE_API_URL || '').trim()
  // 1. La guardada, siempre que NO apunte a un sitio estatico.
  if (guardada && !esSitioEstatico(guardada)) return sinBarras(guardada)
  // 2. La que trae el build (la del despliegue).
  if (delBuild) return sinBarras(delBuild)
  // 3. El mismo origen (la API va junto a la interfaz).
  return sinBarras(`${import.meta.env.BASE_URL}api`)
}

export function guardarUrlApi(url: string): void {
  const limpio = url.trim()
  if (limpio) localStorage.setItem(CLAVE_API_URL, limpio)
  else localStorage.removeItem(CLAVE_API_URL)
}

/** True si la direccion guardada en este navegador apunta a un sitio sin API. */
export function apiGuardadaEsEstatica(): boolean {
  const guardada = localStorage.getItem(CLAVE_API_URL)?.trim()
  if (!guardada) return false
  return esSitioEstatico(guardada)
}

/** La direccion que se esta usando ahora mismo (la que veria el servidor). */
export function urlApiEnUso(): string {
  return leerUrlApi()
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

/**
 * Traduce los errores tecnicos a un mensaje que la persona entienda.
 * Antes salia el texto crudo del servidor ("Method Not Allowed", "Failed to
 * fetch") y no decia donde se arregla.
 */
function traducirDetalle(detalle: string, status: number): string {
  const d = (detalle || '').trim()
  const donde = 'Conectar IA > Direccion de la API'
  if (status === 0 || /failed to fetch|networkerror|load failed|network request failed/i.test(d)) {
    return `No pudimos comunicarnos con el servidor. Revisa tu conexion o cambia la direccion de la API en ${donde}.`
  }
  if (status === 404) {
    return `No encontramos ese servicio. Si abriste LifeAgente en GitHub Pages, la API no esta ahi: pon su direccion en ${donde}.`
  }
  if (status === 405 || /method not allowed/i.test(d)) {
    return `El servidor no entendio la peticion. Si abriste LifeAgente en GitHub Pages falta la API detras: pon su direccion en ${donde}.`
  }
  if (!d) return `Error ${status}`
  return d
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
    throw new ApiError(traducirDetalle(detalle, res.status), res.status)
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

  /** Estado del acceso con una cuenta: dice si ya hay un ID de cliente configurado. */
  estadoGoogle: (proveedor = 'google_cuenta') =>
    request<EstadoGoogle>(`/conexiones/google/estado?proveedor=${proveedor}`),

  /** Guarda el ID de cliente de una cuenta (es publico) para conectar en un clic. */
  guardarGoogleClientId: (client_id: string, proveedor = 'google_cuenta') =>
    request<{ ok: boolean; configurado: boolean; origen: string; proveedor?: string }>(
      '/conexiones/google/estado',
      {
        method: 'PUT',
        body: JSON.stringify({ client_id, proveedor }),
      },
    ),

  /** Modelos ligeritos que se pueden descargar para usar IA en el computador. */
  modelosLigeros: () => request<InfoModelosLigeros>('/conexiones/modelos-ligeros'),

  /** Arranca la descarga de un modelo ligero (en segundo plano). */
  descargarModelo: (modelo: string) =>
    request<{ ok: boolean; id: string; modelo: string }>('/conexiones/descargar-modelo', {
      method: 'POST',
      body: JSON.stringify({ modelo }),
    }),

  /** Como van las descargas (progreso, log y errores). */
  descargas: () => request<{ ok: boolean; descargas: DescargaIA[]; total: number }>('/conexiones/descargas'),

  /** Credenciales publicas de las cuentas (se obtienen solas al iniciar sesion). */
  clientesPublicos: (forzar = false) =>
    request<InfoClientesPublicos>(`/conexiones/clientes-publicos?forzar=${forzar ? 1 : 0}`),
}

/** Endpoints de acceso y respaldo (v11). */
export const cuentas = {
  yo: () => request<PerfilCuenta>('/cuentas/yo'),
  /** Crea la cuenta con correo y contrasena (v19). */
  registrar: (correo: string, nombre: string, password: string) =>
    request<ResultadoCodigo>('/cuentas/registro', {
      method: 'POST',
      body: JSON.stringify({ correo, nombre, password }),
    }),
  /** Entra con correo y contrasena (v19). */
  entrar: (correo: string, password: string) =>
    request<ResultadoSesion>('/cuentas/entrar', {
      method: 'POST',
      body: JSON.stringify({ correo, password }),
    }),
  /** ¿El servidor tiene el acceso con Google activado? (v19) */
  googleDisponible: () =>
    request<{ ok: boolean; disponible: boolean; mensaje: string }>('/cuentas/google/disponible'),
  /** Que cuentas se pueden usar para entrar y cuales estan activadas aqui (v24). */
  proveedores: () => request<InfoProveedores>('/cuentas/proveedores'),
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
  iniciarAccesoGoogle: (proveedor = 'google_cuenta') =>
    request<{ ok: boolean; user_code: string; verification_uri: string; device_code: string }>(
      '/cuentas/google/iniciar',
      { method: 'POST', body: JSON.stringify({ proveedor }) },
    ),
  terminarAccesoGoogle: (device_code: string, proveedor = 'google_cuenta') =>
    request<{ ok: boolean; token?: string; usuario?: Usuario; mensaje?: string }>(
      '/cuentas/google/terminar',
      { method: 'POST', body: JSON.stringify({ device_code, proveedor }) },
    ),
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
  /** Manda otra vez el codigo de verificacion (si se perdio o expiro). */
  reenviarCodigo: (correo: string, nombre = '') =>
    request<{ ok: boolean; modo: string; codigo?: string; mensaje: string }>(
      '/cuentas/reenviar-codigo',
      { method: 'POST', body: JSON.stringify({ correo, nombre }) },
    ),
  /** Trae el ultimo respaldo de Google Drive y lo deja en tu cuenta. */
  restaurarDrive: () =>
    request<{ ok: boolean; restaurados?: Record<string, number>; omitidos?: number; origen?: string }>(
      '/cuentas/restaurar/drive',
      { method: 'POST' },
    ),
  /** Al entrar: si el servidor esta vacio, recupera tu contenido de Drive. */
  sincronizar: () =>
    request<{ ok: boolean; restaurado: boolean; mensaje: string }>('/cuentas/sincronizar', {
      method: 'POST',
    }),
}

/** Endpoints de permisos y autopiloto (v16). */
export const permisos = {
  /** Que permisos tienes concedidos y como esta el autopiloto. */
  estado: () => request<EstadoPermisos>('/permisos'),

  /** Paso 1: pide TODOS los permisos de una vez (Drive, Calendar, correo). */
  autorizar: (proveedor = 'google_cuenta') =>
    request<{ ok: boolean; user_code: string; verification_uri: string; device_code: string }>(
      '/permisos/autorizar',
      { method: 'POST', body: JSON.stringify({ proveedor }) },
    ),

  /** Paso 2: comprueba si ya autorizaste en el navegador. */
  terminar: (device_code: string) =>
    request<{ ok: boolean; mensaje?: string; estado?: EstadoPermisos }>('/permisos/terminar', {
      method: 'POST',
      body: JSON.stringify({ device_code }),
    }),

  /** Enciende o apaga el trabajo automatico. */
  autopiloto: (datos: {
    activo: boolean
    respaldo_auto: boolean
    importar_calendario: boolean
    resumen_diario?: boolean
  }) =>
    request<EstadoPermisos>('/permisos/autopiloto', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),

  /** v21: guarda en Drive si la persona ya dejo de escribir. */
  guardar: () =>
    request<{ ok: boolean; guardado: boolean; mensaje?: string }>('/permisos/guardar', {
      method: 'POST',
    }),

  /** v21: manda ahora el resumen del dia siguiente por correo. */
  correoResumen: () =>
    request<{ ok: boolean; mensaje?: string; cuerpo?: string }>('/permisos/correo/resumen', {
      method: 'POST',
    }),

  /** Ejecuta ahora lo que el sistema hace solo. */
  ejecutar: () =>
    request<{ ok: boolean; mensaje?: string; resumen?: Record<string, { ok: boolean; mensaje?: string; importados?: number; enlace?: string }> }>(
      '/permisos/autopiloto/ejecutar',
      { method: 'POST' },
    ),

  /** Respaldo manual en Google Drive. */
  respaldar: () =>
    request<{ ok: boolean; mensaje?: string; archivo?: string; enlace?: string }>('/permisos/respaldo', {
      method: 'POST',
    }),

  /** Importa tu agenda de Google Calendar. */
  importarCalendario: () =>
    request<{ ok: boolean; mensaje?: string; importados?: number; revisados?: number }>(
      '/permisos/importar-calendario',
      { method: 'POST' },
    ),
}

/** Endpoints de paneles: espacios de trabajo con acceso por persona (v19). */
export const paneles = {
  /** Tus paneles y los que otras personas te compartieron. */
  lista: () => request<{ ok: boolean; paneles: Panel[] }>('/paneles'),

  /** Tipos sugeridos al crear un panel. */
  tipos: () =>
    request<{ tipos: { id: string; nombre: string; color: string }[]; niveles: string[] }>(
      '/paneles/tipos',
    ),

  /** Crea un panel a tu nombre. */
  crear: (datos: { nombre: string; tipo?: string; color?: string; descripcion?: string }) =>
    request<{ ok: boolean; panel: Panel }>('/paneles', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),

  /** Renombra o colorea un panel (solo el dueño). */
  editar: (id: number, datos: { nombre?: string; color?: string; descripcion?: string }) =>
    request<{ ok: boolean }>(`/paneles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(datos),
    }),

  /** Borra el panel (su contenido vuelve a tu panel personal). */
  borrar: (id: number) => request<{ ok: boolean }>(`/paneles/${id}`, { method: 'DELETE' }),

  /** Quien tiene acceso. */
  miembros: (id: number) =>
    request<{ ok: boolean; miembros: MiembroPanel[] }>(`/paneles/${id}/miembros`),

  /** Da acceso a otra persona por correo. */
  compartir: (id: number, correo: string, nivel: 'ver' | 'editar' = 'ver') =>
    request<{ ok: boolean }>(`/paneles/${id}/compartir`, {
      method: 'POST',
      body: JSON.stringify({ correo, nivel }),
    }),

  /** Quita el acceso de una persona. */
  quitarAcceso: (id: number, usuarioId: number) =>
    request<{ ok: boolean }>(`/paneles/${id}/compartir/${usuarioId}`, { method: 'DELETE' }),

  /** Contenido del panel (403 si no tienes permiso). */
  datos: (id: number) => request<DatosPanel>(`/paneles/${id}/datos`),
}
