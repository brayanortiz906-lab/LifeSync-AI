/** Estado global de LifeSync AI (Zustand). */
import { create } from 'zustand'
import { api, cuentas as apiCuentas, guardarApiKeyLocal, leerApiKeyLocal, paneles as apiPaneles } from '../lib/api'
import { aIso } from '../lib/format'
import { analizarLocal } from '../lib/motorLocal'
import type { DatoLocal } from '../lib/motorLocal'
import { materializarPlantilla, PLANTILLAS } from '../lib/plantillas'
import type {
  Ajustes, Aprobacion, Dashboard, EntradaAuditoria, Evento, Mantenimiento, MensajeChat,
  Panel, Politica, Registro, RegistroDetallado, ReporteCumplimiento, ResumenAuditoria,
  RespuestaAgente, Tarea,
} from '../types'

/** Clave de localStorage donde viven los datos del modo local (sin servidor). */
const CLAVE_LOCAL = 'lifesync.local'

/** Cuanto se puede guardar en el modo de prueba (es temporal, es una demo). */
export const LIMITE_PRUEBA = { eventos: 6, tareas: 4, gastos: 6 }

interface DatosLocales {
  eventos: Evento[]
  tareas: Tarea[]
  registros: Registro[]
  mantenimiento: Mantenimiento[]
}

function leerLocales(): DatosLocales | null {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCAL)
    if (!crudo) return null
    const d = JSON.parse(crudo) as DatosLocales
    return {
      eventos: d.eventos ?? [],
      tareas: d.tareas ?? [],
      registros: d.registros ?? [],
      mantenimiento: d.mantenimiento ?? [],
    }
  } catch {
    return null
  }
}

function guardarLocales(d: DatosLocales) {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(d))
  } catch {
    /* sin espacio o sin permiso: la app sigue funcionando en memoria */
  }
}

/** Suma minutos a una fecha-hora local en texto. */
function sumarMinutos(fechaHora: string, minutos: number): string {
  const [fecha, hora = '00:00'] = fechaHora.split('T')
  const [h, m] = hora.split(':').map(Number)
  const total = (h || 0) * 60 + (m || 0) + minutos
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${fecha}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
}

/** Suma dias a una fecha local en texto (YYYY-MM-DD). */
function sumarDias(fecha: string, dias: number): string {
  const f = new Date(`${fecha}T12:00:00`)
  f.setDate(f.getDate() + dias)
  return aIso(f)
}

/**
 * Aplica lo que detecto el motor local de reglas a las listas del estado.
 * En el modo de prueba respeta el limite (es una demo: 3 bloques, 2 tareas, 3 gastos).
 */
function aplicarLocal(
  base: DatosLocales,
  datos: DatoLocal[],
  enPrueba: boolean,
): { resultado: DatosLocales; registros: RegistroDetallado[]; aviso?: string } {
  const resultado: DatosLocales = {
    eventos: [...base.eventos],
    tareas: [...base.tareas],
    registros: [...base.registros],
    mantenimiento: [...base.mantenimiento],
  }
  const registros: RegistroDetallado[] = []
  let id = -1000
  let aviso: string | undefined

  for (const d of datos) {
    if (d.tipo === 'evento') {
      if (enPrueba && resultado.eventos.length >= LIMITE_PRUEBA.eventos) {
        aviso = `En el modo de prueba caben ${LIMITE_PRUEBA.eventos} bloques, ${LIMITE_PRUEBA.tareas} tareas y ${LIMITE_PRUEBA.gastos} gastos. Con una cuenta guardas todo sin limites.`
        continue
      }
      const duracion = d.duracion ?? 60
      const inicio = `${d.fecha ?? aIso(new Date())}T${d.hora ?? '09:00'}:00`
      resultado.eventos.push({
        id: id--,
        titulo: d.titulo,
        categoria: (d.categoria ?? 'personal') as Evento['categoria'],
        inicio,
        fin: sumarMinutos(inicio, duracion),
        inamovible: false,
        notas: '',
        fuente: 'local',
        duracion_min: duracion,
      })
      registros.push({ tipo: 'evento', titulo: d.titulo, detalle: `${d.fecha ?? aIso(new Date())} ${d.hora ?? '09:00'}` })
    } else if (d.tipo === 'tarea') {
      if (enPrueba && resultado.tareas.length >= LIMITE_PRUEBA.tareas) {
        aviso = `En el modo de prueba caben ${LIMITE_PRUEBA.eventos} bloques, ${LIMITE_PRUEBA.tareas} tareas y ${LIMITE_PRUEBA.gastos} gastos. Con una cuenta guardas todo sin limites.`
        continue
      }
      resultado.tareas.push({
        id: id--,
        titulo: d.titulo,
        materia: null,
        fecha_entrega: d.fecha ?? aIso(new Date()),
        estado: 'pendiente',
        prioridad: 'media',
        minutos_estimados: 90,
        resumen: null,
        material: null,
        preguntas: [],
        fuente: 'local',
      })
      registros.push({ tipo: 'tarea', titulo: d.titulo, detalle: `Entrega ${d.fecha ?? aIso(new Date())}` })
    } else if (d.tipo === 'gasto') {
      if (enPrueba && resultado.registros.length >= LIMITE_PRUEBA.gastos) {
        aviso = `En el modo de prueba caben ${LIMITE_PRUEBA.eventos} bloques, ${LIMITE_PRUEBA.tareas} tareas y ${LIMITE_PRUEBA.gastos} gastos. Con una cuenta guardas todo sin limites.`
        continue
      }
      const categoria = (d.categoria ?? 'otro') as Registro['categoria']
      resultado.registros.push({
        id: id--,
        descripcion: d.titulo,
        monto: d.monto ?? 0,
        moneda: 'COP',
        categoria,
        fecha: d.fecha ?? aIso(new Date()),
        notas: '',
      })
      registros.push({
        tipo: 'gasto',
        titulo: d.titulo,
        detalle: `${(d.monto ?? 0).toLocaleString('es-CO')} COP · ${categoria}`,
      })
    } else {
      const proxima = sumarDias(d.fecha ?? aIso(new Date()), 90)
      resultado.mantenimiento.push({
        id: id--,
        activo: d.activo ?? 'hogar',
        tarea: d.titulo,
        intervalo_dias: 90,
        ultima_realizacion: d.fecha ?? aIso(new Date()),
        proxima_fecha: proxima,
        costo_estimado: null,
        notas: '',
        dias_restantes: 90,
        vencido: false,
      })
      registros.push({ tipo: 'mantenimiento', titulo: d.titulo, detalle: `Proxima: ${proxima}` })
    }
  }
  return { resultado, registros, aviso }
}

/**
 * Responde con el motor local de reglas (sin IA) y registra lo que detecta.
 * Se usa en el modo de prueba, en el modo local y cuando la API no esta disponible
 * (por ejemplo, la version publicada en GitHub Pages sin servidor detras).
 */
function registrarConMotorLocal(texto: string) {
  const estado = useLifeSync.getState()
  const enPrueba = estado.modoPrueba
  const analisis = analizarLocal(texto, new Date())
  const base: DatosLocales = {
    eventos: estado.eventos,
    tareas: estado.tareas,
    registros: estado.registros,
    mantenimiento: estado.mantenimiento,
  }
  const { resultado, registros, aviso } = aplicarLocal(base, analisis.datos, enPrueba)
  const detalle = registros.map((r) => `${r.titulo} (${r.detalle})`).join(', ')
  const mensaje = `${analisis.mensaje}${detalle ? ` Quedó registrado: ${detalle}.` : ''}${aviso ? ` ${aviso}` : ''}`
  const agente: RespuestaAgente = {
    categoria: (analisis.categorias[0] ?? 'CONVERSACION') as RespuestaAgente['categoria'],
    categorias: analisis.categorias,
    intencion: analisis.categorias.join(' + '),
    confianza: analisis.confianza,
    mensaje_usuario: mensaje,
    requiere_confirmacion: false,
    acciones: analisis.datos.map((d) => ({
      tipo: d.tipo,
      datos: { ...d } as unknown as Record<string, unknown>,
      motivo: 'Detectado por palabras clave',
    })),
    alertas: [],
    resumen_estado: { registros_detallados: registros, motor: 'local' },
  }
  const usuario: MensajeChat = { id: `u-${Date.now()}`, rol: 'user', contenido: texto }
  const respuesta: MensajeChat = {
    id: `a-${Date.now()}`,
    rol: 'assistant',
    contenido: mensaje,
    categoria: agente.categoria,
    agente,
  }
  if (!enPrueba) guardarLocales(resultado)
  useLifeSync.setState({
    ...resultado,
    dashboard: null,
    mensajes: [...estado.mensajes, usuario, respuesta],
    ultimoPlan: null,
    enviando: false,
    error: null,
  })
}

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
  /** Modo local: la API no esta disponible; todo se guarda en este navegador. */
  modoLocal: boolean

  // --- Paneles (v19) --------------------------------------------------------
  /** Paneles propios y los que otras personas te compartieron. */
  paneles: Panel[]
  /** Panel abierto ahora mismo (null = todo). */
  panelId: number | null

  cargarTodo: () => Promise<void>
  activarModoPrueba: () => void
  salirModoPrueba: () => void
  /** Modo local: todo se guarda en este navegador, sin servidor. */
  activarModoLocal: () => void
  /** Pega texto (por ejemplo un historial de chat) y lo registra con el motor local. */
  importarTexto: (texto: string) => void
  /** Carga un organizador preestablecido (plantilla) de un clic. */
  cargarPlantilla: (id: string) => void
  /** Borra los datos locales (modo local o de prueba). */
  limpiarLocal: () => void
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

  // --- Paneles (v19) --------------------------------------------------------
  cargarPaneles: () => Promise<void>
  seleccionarPanel: (id: number | null) => Promise<void>
  crearPanel: (datos: { nombre: string; tipo?: string; color?: string; descripcion?: string; mover_personal?: boolean }) => Promise<void>
  compartirPanel: (id: number, correo: string, nivel: 'ver' | 'editar') => Promise<void>
  quitarAcceso: (id: number, usuarioId: number) => Promise<void>
  borrarPanel: (id: number) => Promise<void>

  // --- Cuenta y almacenamiento (v20) ---------------------------------------
  /** Al entrar con tu cuenta: recupera de Drive lo que falta y carga todo. */
  sincronizarCuenta: () => Promise<void>
  /** Mensaje para la persona (por ejemplo: "recuperamos tu contenido de Drive"). */
  mensajeSesion: string
  setMensajeSesion: (mensaje: string) => void
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
  modoLocal: false,
  paneles: [],
  panelId: null,
  mensajeSesion: '',

  setMensajeSesion: (mensaje: string) => set({ mensajeSesion: mensaje }),

  async sincronizarCuenta() {
    // Sin cuenta (modo local o de prueba) no hay nada que sincronizar.
    if (get().modoPrueba || get().modoLocal) return
    try {
      const r = await apiCuentas.sincronizar()
      if (r?.restaurado) {
        await get().cargarTodo()
        await get().cargarPaneles()
        set({ mensajeSesion: r.mensaje || 'Recuperamos tu contenido de Google Drive.' })
      }
    } catch {
      /* si no hay Drive o no hay permiso, la app sigue con lo que hay */
    }
  },

  async cargarPaneles() {
    try {
      const r = await apiPaneles.lista()
      set({ paneles: r.paneles })
    } catch {
      /* sin paneles (o sin API): la app sigue igual */
    }
  },

  async seleccionarPanel(id) {
    set({ panelId: id })
    const panel = get().paneles.find((p) => p.id === id)
    if (id && panel && !panel.es_propio) {
      // Panel compartido: el contenido lo da el dueño (403 si no hay permiso).
      try {
        const d = await apiPaneles.datos(id)
        set({
          eventos: d.eventos as Evento[],
          tareas: d.tareas as Tarea[],
          registros: d.registros as Registro[],
          mantenimiento: d.mantenimiento as Mantenimiento[],
          dashboard: null,
          error: null,
        })
      } catch (e) {
        set({ error: (e as Error).message })
      }
      return
    }
    await get().cargarTodo()
  },

  async crearPanel(datos) {
    try {
      await apiPaneles.crear(datos)
      await get().cargarPaneles()
      await get().cargarTodo()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  async compartirPanel(id, correo, nivel) {
    try {
      await apiPaneles.compartir(id, correo, nivel)
      await get().cargarPaneles()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  async quitarAcceso(id, usuarioId) {
    try {
      await apiPaneles.quitarAcceso(id, usuarioId)
      await get().cargarPaneles()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  async borrarPanel(id) {
    try {
      await apiPaneles.borrar(id)
      if (get().panelId === id) set({ panelId: null })
      await get().cargarPaneles()
      await get().cargarTodo()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  activarModoPrueba() {
    set({ modoPrueba: true, modoLocal: false, ...datosDePrueba() })
  },

  salirModoPrueba() {
    set({ modoPrueba: false })
  },

  activarModoLocal() {
    const d = leerLocales() ?? { eventos: [], tareas: [], registros: [], mantenimiento: [] }
    set({ modoLocal: true, modoPrueba: false, ...d, dashboard: null, error: null })
  },

  importarTexto(texto) {
    const limpio = texto.trim()
    if (!limpio) return
    if (!get().modoPrueba) get().activarModoLocal()
    registrarConMotorLocal(limpio)
  },

  cargarPlantilla(id) {
    const plantilla = PLANTILLAS.find((p) => p.id === id)
    if (!plantilla) return
    const datos = materializarPlantilla(plantilla, new Date())
    const enPrueba = get().modoPrueba
    const recorte: DatosLocales = enPrueba
      ? {
          eventos: datos.eventos.slice(0, LIMITE_PRUEBA.eventos),
          tareas: datos.tareas.slice(0, LIMITE_PRUEBA.tareas),
          registros: datos.registros.slice(0, LIMITE_PRUEBA.gastos),
          mantenimiento: datos.mantenimiento,
        }
      : datos
    if (!enPrueba && get().modoLocal) guardarLocales(recorte)
    set({
      ...recorte,
      dashboard: null,
      mensajes: [
        ...get().mensajes,
        {
          id: `a-${Date.now()}`,
          rol: 'assistant',
          contenido: `Cargue la plantilla "${plantilla.nombre}". ${plantilla.para} Ya puedes ver como queda una agenda real; cambiala por la tuya cuando quieras.`,
        },
      ],
    })
  },

  limpiarLocal() {
    try {
      localStorage.removeItem(CLAVE_LOCAL)
    } catch {
      /* nada que hacer */
    }
    set({ eventos: [], tareas: [], registros: [], mantenimiento: [], dashboard: null, mensajes: [] })
  },

  async cargarTodo() {
    if (get().modoPrueba) {
      set({ ...datosDePrueba(), cargando: false, error: null })
      return
    }
    if (get().modoLocal) {
      const d = leerLocales() ?? { eventos: [], tareas: [], registros: [], mantenimiento: [] }
      set({ ...d, dashboard: null, cargando: false, error: null })
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
      // Si hay un panel abierto, enseñamos solo lo de ese panel (v19).
      const pid = get().panelId
      const enPanel = <T extends { panel_id?: number | null }>(filas: T[]): T[] =>
        pid ? filas.filter((f) => (f.panel_id ?? null) === pid) : filas
      set({
        dashboard, tareas: enPanel(tareas), registros: enPanel(registros),
        mantenimiento: enPanel(mantenimiento), eventos: enPanel(eventos), cargando: false,
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
      const mensaje = (e as Error).message || ''
      // Si la API no esta disponible (Pages sin servidor, API apagada, sin internet)
      // la app sigue funcionando con el motor local de reglas.
      if (/404|405|fetch|network|failed to fetch|load failed/i.test(mensaje)) {
        const d = leerLocales() ?? { eventos: [], tareas: [], registros: [], mantenimiento: [] }
        set({ modoLocal: true, ...d, dashboard: null, cargando: false, error: null })
        return
      }
      set({ cargando: false, error: mensaje })
    }
  },

  async enviarMensaje(texto) {
    const trimmed = texto.trim()
    if (!trimmed) return
    if (get().modoPrueba || get().modoLocal) {
      registrarConMotorLocal(trimmed)
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
      const mensaje = (e as Error).message || ''
      // Sin IA disponible (ni servidor ni clave): el motor local de reglas responde.
      if (/404|405|fetch|network|failed to fetch|load failed|no hay|proveedor/i.test(mensaje)) {
        set({ modoLocal: true })
        registrarConMotorLocal(trimmed)
        return
      }
      set((s) => ({
        mensajes: [
          ...s.mensajes,
          {
            id: `e-${Date.now()}`,
            rol: 'assistant',
            contenido: `No pude completar la acción: ${mensaje}`,
            pendiente: true,
          },
        ],
        enviando: false,
        error: mensaje,
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
      const mensaje = (e as Error).message || ''
      // Sin API (Pages sin servidor): no es un error de la persona, es el modo local.
      if (/404|405|fetch|network|failed to fetch|load failed/i.test(mensaje)) {
        set({ cargandoResponsable: false, modoLocal: true })
        return
      }
      set({ cargandoResponsable: false, error: mensaje })
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
