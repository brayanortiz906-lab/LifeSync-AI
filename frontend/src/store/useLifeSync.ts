/** Estado global de LifeSync AI (Zustand). */
import { create } from 'zustand'
import { api, guardarApiKeyLocal, leerApiKeyLocal } from '../lib/api'
import { aIso } from '../lib/format'
import type {
  Ajustes, Dashboard, Evento, Mantenimiento, MensajeChat, Registro, RespuestaAgente, Tarea,
} from '../types'

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

  cargarTodo: () => Promise<void>
  enviarMensaje: (texto: string) => Promise<void>
  refrescarEventos: () => Promise<void>
  completarTarea: (id: number) => Promise<void>
  crearRegistro: (datos: Partial<Registro> & { registrar_en_calendario?: boolean }) => Promise<void>
  completarMantenimiento: (id: number) => Promise<void>
  eliminarEvento: (id: number) => Promise<void>
  limpiarChat: () => Promise<void>
  guardarAjustes: (datos: Partial<Ajustes> & { api_key?: string; borrar_api_key?: boolean }) => Promise<void>
  setApiKey: (key: string) => void
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

  async cargarTodo() {
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
    } catch (e) {
      set({ cargando: false, error: (e as Error).message })
    }
  },

  async enviarMensaje(texto) {
    const trimmed = texto.trim()
    if (!trimmed) return
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
    set({ proveedor: ajustes.proveedor, modelo: ajustes.modelo })
  },

  setApiKey(key) {
    guardarApiKeyLocal(key)
    set({ apiKey: key })
  },
}))
