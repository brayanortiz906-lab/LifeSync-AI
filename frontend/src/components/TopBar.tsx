/** Barra superior: marca, navegación de fecha, KPIs y conexiones de IA. */
import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Menu, MessageSquare, Plug, Sparkles, Trash2, User } from 'lucide-react'
import { BotonInstalar } from './BotonInstalar'
import { useLifeAgente } from '../store/useLifeAgente'
import { duracionLegible, etiquetaDia, monto } from '../lib/format'
import { Boton, Chip } from './ui'
import type { Usuario } from '../types'
import ConexionesPanel from './ConexionesPanel'

export default function TopBar({
  fecha, onCambiarFecha, onAbrirChat, chatAbierto,
  conexionesAbiertas, onAbrirConexiones, onCerrarConexiones, onAbrirAcceso, usuario,
  onAbrirMenu, panelId, onCambiarPanel,

}: {
  fecha: Date
  onCambiarFecha: (d: Date) => void
  onAbrirChat?: () => void
  onAbrirAcceso?: () => void
  usuario?: Usuario | null
  /** Estado del chat flotante (para pintar el boton como activo). */
  chatAbierto?: boolean
  /** Centro de conexiones controlado desde fuera (p. ej. desde Ajustes). */
  conexionesAbiertas?: boolean
  onAbrirConexiones?: () => void
  onCerrarConexiones?: () => void
  /** Abre el menu movil con lo que no cabe en pantallas pequeñas. */
  onAbrirMenu?: () => void
  /** Panel abierto ahora mismo (v19). */
  panelId?: number | null
  onCambiarPanel?: (id: number | null) => void
}) {
  const dashboard = useLifeAgente((s) => s.dashboard)
  const proveedor = useLifeAgente((s) => s.proveedor)
  const apiKey = useLifeAgente((s) => s.apiKey)
  const limpiarChat = useLifeAgente((s) => s.limpiarChat)
  const paneles = useLifeAgente((s) => s.paneles)
  const [conexionesInternas, setConexionesInternas] = useState(false)

  const conexiones = conexionesAbiertas ?? conexionesInternas
  const abrirConexiones = () => {
    setConexionesInternas(true)
    onAbrirConexiones?.()
  }
  const cerrarConexiones = () => {
    setConexionesInternas(false)
    onCerrarConexiones?.()
  }

  const dia = (offset: number) => {
    const d = new Date(fecha)
    d.setDate(d.getDate() + offset)
    onCambiarFecha(d)
  }

  const conectado = proveedor !== 'mock' && proveedor !== 'demo' && (apiKey || proveedor === 'ollama' || proveedor === 'lmstudio')

  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center gap-3.5 border-b border-white/8 bg-slate-950/70 px-5 py-3.5 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/30">
          <Sparkles className="h-4.5 w-4.5 text-white" size={18} />
        </div>
        <div className="leading-tight">
          <h1 className="text-sm font-bold tracking-tight text-white">LifeAgente AI</h1>
          <p className="hidden text-[10px] text-slate-500 sm:block">Asistente Integral de Vida y Productividad</p>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 px-1 py-1">
        <button onClick={() => dia(-1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Día anterior">
          <ChevronLeft size={16} />
        </button>
        <div className="flex min-w-[104px] items-center justify-center gap-1.5 px-1 text-xs font-semibold text-slate-200 sm:min-w-[150px]">
          <CalendarDays size={14} className="hidden text-indigo-400 sm:block" />
          {etiquetaDia(fecha)}
        </div>
        <button onClick={() => dia(1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Día siguiente">
          <ChevronRight size={16} />
        </button>
        <Boton variante="fantasma" onClick={() => onCambiarFecha(new Date())} className="ml-1 hidden sm:inline-flex">
          Hoy
        </Boton>
      </div>

      {/* Selector de panel (v19): cada panel es un espacio de trabajo. */}
      {onCambiarPanel && (
        <label className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-2.5 py-1.5">
          <LayoutGrid size={13} className="text-indigo-400" />
          <select
            value={panelId ?? ''}
            onChange={(e) => onCambiarPanel(e.target.value ? Number(e.target.value) : null)}
            className="max-w-[130px] cursor-pointer bg-transparent text-[11px] font-semibold text-slate-200 outline-none"
            title="Elige el panel que estas viendo"
          >
            <option value="">Todo</option>
            {paneles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.es_propio ? '' : ' (compartido)'}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Movil: lo que no cabe en la barra se abre desde aqui. */}
      <div className="ml-auto flex items-center gap-1 lg:hidden">
        {onAbrirChat && (
          <button
            onClick={onAbrirChat}
            className={`rounded-lg p-2 transition ${chatAbierto ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-300 hover:bg-white/10'}`}
            aria-label="Abrir el chat"
            title="Abrir el chat (Ctrl+K)"
          >
            <MessageSquare size={17} />
          </button>
        )}
        {onAbrirAcceso && (
          <button
            onClick={onAbrirAcceso}
            className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10"
            aria-label="Tu cuenta"
            title="Tu cuenta"
          >
            <User size={17} />
          </button>
        )}
        <button
          onClick={abrirConexiones}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10"
          aria-label="Conectar IA"
          title="Conectar IA"
        >
          <Plug size={17} />
        </button>
        <BotonInstalar />
        {onAbrirMenu && (
          <button
            onClick={onAbrirMenu}
            className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10"
            aria-label="Ver todo lo demas"
            title="Tareas, dinero, contexto y cuenta"
          >
            <Menu size={18} />
          </button>
        )}
      </div>

      {/* Escritorio: los indicadores completos. */}
      <div className="ml-auto hidden items-center gap-2 lg:flex">
        {dashboard && (
          <>
            <Chip className="bg-indigo-500/15 text-indigo-300 ring-indigo-500/30">
              {dashboard.carga.total_bloques} bloques ·{' '}
              {duracionLegible(dashboard.carga.minutos_productivos)} productivas
            </Chip>
            <Chip className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">
              {monto(dashboard.gasto_mes.total, dashboard.gasto_mes.moneda)} del mes
            </Chip>
            <Chip className="bg-violet-500/15 text-violet-300 ring-violet-500/30">
              {dashboard.tareas_pendientes} tareas
            </Chip>
          </>
        )}
        <Chip
          className={
            conectado
              ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
              : 'bg-slate-500/15 text-slate-300 ring-slate-500/30'
          }
          title="Proveedor de IA activo"
        >
          <span className="ls-dot h-1.5 w-1.5 rounded-full bg-current" />
          {conectado ? proveedor : 'asistente demo'}
        </Chip>
        <Boton variante="fantasma" onClick={limpiarChat} titulo="Limpiar el historial del chat">
          <Trash2 size={14} />
        </Boton>
        {onAbrirAcceso && (
          <Boton
            variante="secundario"
            onClick={onAbrirAcceso}
            titulo="Tu cuenta de LifeAgente AI (datos separados y respaldo)"
          >
            <User size={14} />
            {usuario && !usuario.es_local ? usuario.nombre || usuario.correo : 'Acceder'}
          </Boton>
        )}
        {onAbrirChat && (
          <Boton
            variante={chatAbierto ? 'secundario' : 'fantasma'}
            onClick={onAbrirChat}
            titulo={chatAbierto ? 'Cerrar el chat flotante (Ctrl+K)' : 'Abrir el chat flotante (Ctrl+K)'}
          >
            <MessageSquare size={14} />
            {chatAbierto ? 'Cerrar chat' : 'Chat'}
          </Boton>
        )}
        <Boton variante={conectado ? 'secundario' : 'primario'} onClick={abrirConexiones}>
          <Plug size={14} />
          {conectado ? 'Conexiones' : 'Conectar IA'}
        </Boton>
      </div>

      <ConexionesPanel abierto={conexiones} onCerrar={cerrarConexiones} />
    </header>
  )
}
