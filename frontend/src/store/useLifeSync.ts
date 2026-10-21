/** Estado global de LifeSync AI (Zustand). */
import { create } from 'zustand'
import { api, guardarApiKeyLocal, leerApiKeyLocal } from '../lib/api'
import { aIso } from '../lib/format'
import type {
  Ajustes, Aprobacion, Dashboard, EntradaAuditoria, Evento, Mantenimiento, MensajeChat,
  Politica, Registro, ReporteCumplimiento, ResumenAuditoria, RespuestaAgente, Tarea,
} from '../types'

/** Aplica el tema visual al <html>: Tailwind lee las variables con [data-tema]. */
export function aplicarTema(tema: string | undefined | null) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-tema', tema || 'medianoche')
}

interface Estado {
  cargando: boolean
  enviando: boolean
  error: string | null
  eventos: Evento[]
  tareas: Tarea[]
  registros: Registro[]
  mantenimiento: Mantenimiento[]
  dashboard: Dashboard | null
  mensajes: MensajeChat[]
  proveedor: string
  modelo: string
  apiKey: string
  ultimoPlan: Record<string, unknown> | null
  /** Preferencias de la persona (tema, ordenes, nombre, onboarding). */
  ajustes: Ajustes | null

  // --- Sistema responsable -------------------------------------------------
  politica: Politica | null
  aprobaciones: Aprobacion[]
  auditoria: EntradaAuditoria[]
  resumenAuditoria: ResumenAuditoria | null
  cumplimiento: ReporteCumplimiento | null
  cargandoResponsable: boolean

  /** Modo de prueba: los datos viven solo en memoria y se borran al recargar. */
  modoPrueba: boolean

  cargarTodo: () => Promise<void>
  activarModoPrueba: () => void
  salirModoPrueba: () => void
  enviarMensaje: (texto: string) => Promise<void>
  refrescarEventos: () => Promise<void>
  completarTarea: (id: number) => Promise<void>
  crearRegistro: (datos: Partial<Registro> & { registrar_en_calendario?: boolean }) => Promise<void>
  completarMantenimiento: (id: number) => Promise<void>
  eliminarEvento: (id: number) => Promise<void>
  limpiarChat: () => Promise<void>
  guardarAjustes: (datos: Partial<Ajustes> & { api_key?: string; borrar_api_key?: boolean }) => Promise<void>
  setApiKey: (key: string) => void

  // --- Acciones del sistema responsable -------------------------------------
  cargarResponsable: () => Promise<void>
  guardarPolitica: (datos: Partial<Politica>) => Promise<void>
  decidirAprobacion: (id: number, aprobar: boolean, nota?: string) => Promise<void>
  purgarAuditoria: (dias?: number) => Promise<void>
}

export const useLifeSync = create<Estado>((set, get) => ({
  cargando: true,
  enviando: false,
  error: null,
  eventos: [],
  tareas: [],
  registros: [],
  mantenimiento: [],
  dashboard: null,
  mensajes: [],
  proveedor: 'mock',
  modelo: 'gpt-4o-mini',
  apiKey: leerApiKeyLocal(),
  ultimoPlan: null,
  ajustes: null,
  politica: null,
  aprobaciones: [],
  auditoria: [],
  resumenAuditoria: null,
  cumplimiento: null,
  cargandoResponsable: false,
  modoPrueba: false,

  activarModoPrueba() {
    set({ modoPrueba: true, ...datosDePrueba() })
  },

  salirModoPrueba() {
    set({ modoPrueba: false })
  },

  async cargarTodo() {
    if (get().modoPrueba) {
      set({ ...datosDePrueba(), cargando: false, error: null })
      return
    }
    set({ cargando: true, error: null })
    try {
      const [dashboard, tareas, registros, mantenimiento, ajustes, historial] = await Promise.all([
        api.dashboard(),
        api.tareas(),
        api.registros(),
        api.mantenimiento(),
        api.ajustes(),
        api.historial(),
      ])
      const eventos = await api.eventos(
        aIso(new Date()),
        aIso(new Date(Date.now() + 14 * 864e5)),
      )
      set({
        dashboard, tareas, registros, mantenimiento, eventos, cargando: false,
        proveedor: ajustes.proveedor,
        modelo: ajustes.modelo,
        ajustes,
        mensajes: historial.map((h) => {
          const plan = (h.payload?.resumen_estado?.plan as Record<string, unknown>) ?? undefined
          return {
            id: `srv-${h.id}`,
            rol: h.rol === 'user' ? 'user' : 'assistant',
            contenido: h.contenido,
            categoria: h.categoria ?? undefined,
            agente: h.payload ?? undefined,
            plan,
          }
        }),
      })
      aplicarTema(ajustes.tema)
    } catch (e) {
      set({ cargando: false, error: (e as Error).message })
    }
  },

  async enviarMensaje(texto) {
    const trimmed = texto.trim()
    if (!trimmed) return
    if (get().modoPrueba) {
      const usuario: MensajeChat = { id: `u-${Date.now()}`, rol: 'user', contenido: trimmed }
      const respuesta: MensajeChat = {
        id: `a-${Date.now()}`,
        rol: 'assistant',
        contenido:
          'Modo de prueba: puedes mirar como funciona la agenda, pero no hay IA conectada. En cuanto recargues la pagina, todo esto desaparece.',
      }
      set((s) => ({ mensajes: [...s.mensajes, usuario, respuesta], enviando: false }))
      return
    }
    const usuario: MensajeChat = { id: `u-${Date.now()}`, rol: 'user', contenido: trimmed }
    set((s) => ({ mensajes: [...s.mensajes, usuario], enviando: true, error: null }))

    try {
      const { proveedor, modelo, apiKey } = get()
      const res = await api.chat(trimmed, {
        proveedor: proveedor !== 'mock' ? proveedor : undefined,
        modelo: proveedor !== 'mock' ? modelo : undefined,
        api_key: apiKey || undefined,
      })
      const agente: RespuestaAgente = res.agente
      const plan = res.plan
      set((s) => ({
        mensajes: [
          ...s.mensajes,
          {
            id: `a-${Date.now()}`,
            rol: 'assistant',
            contenido: agente.mensaje_usuario,
            categoria: agente.categoria,
            agente,
            plan,
          },
        ],
        ultimoPlan: plan && Object.keys(plan).length ? plan : s.ultimoPlan,
        enviando: false,
      }))
      await get().cargarTodo()
      // El agente pudo dejar acciones en la bandeja de aprobaciones: refresca
      // el panel de responsabilidad para que el badge y la lista no queden obsoletos.
      await get().cargarResponsable()
    } catch (e) {
      set((s) => ({
        mensajes: [
          ...s.mensajes,
          {
            id: `e-${Date.now()}`,
            rol: 'assistant',
            contenido: `No pude completar la acción: ${(e as Error).message}`,
            pendiente: true,
          },
        ],
        enviando: false,
        error: (e as Error).message,
      }))
    }
  },

  async refrescarEventos() {
    const desde = aIso(new Date())
    const hasta = aIso(new Date(Date.now() + 14 * 864e5))
    const eventos = await api.eventos(desde, hasta)
    const dashboard = await api.dashboard()
    set({ eventos, dashboard })
  },

  async completarTarea(id) {
    await api.completarTarea(id)
    const tareas = await api.tareas()
    set({ tareas })
  },

  async crearRegistro(datos) {
    await api.crearRegistro(datos)
    const registros = await api.registros()
    const dashboard = await api.dashboard()
    set({ registros, dashboard })
  },

  async completarMantenimiento(id) {
    await api.completarMantenimiento(id)
    const mantenimiento = await api.mantenimiento()
    set({ mantenimiento })
  },

  async eliminarEvento(id) {
    await api.eliminarEvento(id)
    await get().refrescarEventos()
  },

  async limpiarChat() {
    await api.limpiarHistorial()
    set({ mensajes: [], ultimoPlan: null })
  },

  async guardarAjustes(datos) {
    const ajustes = await api.guardarAjustes(datos)
    if (datos.api_key !== undefined) {
      guardarApiKeyLocal(datos.api_key)
      set({ apiKey: datos.api_key })
    }
    set({ proveedor: ajustes.proveedor, modelo: ajustes.modelo, ajustes })
    aplicarTema(ajustes.tema)
  },

  setApiKey(key) {
    guardarApiKeyLocal(key)
    set({ apiKey: key })
  },

  // ------------------------------------------------------------------ responsable
  async cargarResponsable() {
    set({ cargandoResponsable: true })
    try {
      const [politica, aprobaciones, auditoria, resumenAuditoria, cumplimiento] = await Promise.all([
        api.politica(),
        api.aprobaciones('pendiente'),
        api.auditoria({ limite: 120 }),
        api.resumenAuditoria(),
        api.cumplimiento(),
      ])
      set({ politica, aprobaciones, auditoria, resumenAuditoria, cumplimiento, cargandoResponsable: false })
    } catch (e) {
      set({ cargandoResponsable: false, error: (e as Error).message })
    }
  },

  async guardarPolitica(datos) {
    const politica = await api.guardarPolitica(datos)
    set({ politica })
    await get().cargarResponsable()
  },

  async decidirAprobacion(id, aprobar, nota) {
    await api.decidirAprobacion(id, aprobar, nota)
    await get().cargarResponsable()
    await get().cargarTodo()
  },

  async purgarAuditoria(dias) {
    await api.purgarAuditoria(dias)
    await get().cargarResponsable()
  },
}))


/** Datos de ejemplo EN MEMORIA para el modo de prueba (se borran al recargar). */
function datosDePrueba() {
  const hoy = aIso(new Date())
  const h = (hora: number) => `${hoy}T${String(hora).padStart(2, '0')}:00:00`
  return {
    eventos: [
      { id: -1, titulo: 'Trabajo en oficina', categoria: 'trabajo', inicio: h(8), fin: h(12), inamovible: true, notas: '', fuente: 'demo', color: '' },
      { id: -2, titulo: 'Estudio: parciales de calculo', categoria: 'estudio', inicio: h(15), fin: h(17), inamovible: false, notas: '', fuente: 'demo', color: '' },
      { id: -3, titulo: 'Almuerzo', categoria: 'descanso', inicio: h(12), fin: h(13), inamovible: false, notas: '', fuente: 'demo', color: '' },
    ] as unknown as Evento[],
    tareas: [
      { id: -1, titulo: 'Entregar el ensayo', materia: 'Metodologia', estado: 'pendiente', prioridad: 'media', minutos_estimados: 120, fecha_entrega: hoy, resumen: '', material: '', preguntas: [], fuente: 'demo' },
    ] as unknown as Tarea[],
    registros: [
      { id: -1, descripcion: 'Tanqueo de la moto', monto: 20000, moneda: 'COP', categoria: 'combustible', fecha: hoy, notas: '', evento_id: null },
    ] as unknown as Registro[],
    mantenimiento: [
      { id: -1, tarea: 'Cambio de aceite', intervalo_dias: 90, ultimo_realizacion: hoy, proxima_fecha: hoy, costo_estimado: 85000, notas: '', activo: true },
    ] as unknown as Mantenimiento[],
    dashboard: null,
    mensajes: [],
  }
}
