/** LifeSync AI — layout principal.
 *
 * DISENO: la app abre con el CHAT EN EL CENTRO (es la forma natural de
 *Interactuar con un asistente) y el resto de modulos alrededor, accesibles
 * con un solo clic. Se evita el panel angosto a la izquierda que obligaba a
 * "escurcir" la conversacion.
 *
 * Vistas:
 *   - "chat"            -> chat centrado + barra lateral de contexto (agenda
 *                          de hoy, tareas proximas) [+ agenda completa]
 *   - "agenda"          -> los 3 modulos de la vida (agenda / tareas / bitacora)
 *   - "responsabilidad" -> gobernanza, auditoria, aprobaciones
 */
import { useEffect, useState } from 'react'
import {
  AlertTriangle, CalendarDays, LayoutGrid, MessageSquare, RefreshCw, ShieldCheck,
} from 'lucide-react'
import { useLifeSync } from './store/useLifeSync'
import TopBar from './components/TopBar'
import ChatPanel from './components/ChatPanel'
import CalendarPanel from './components/CalendarPanel'
import AcademicPanel from './components/AcademicPanel'
import LogbookPanel from './components/LogbookPanel'
import ResponsibilityPanel from './components/ResponsibilityPanel'
import ContextoLateral from './components/ContextoLateral'

type Vista = 'chat' | 'agenda' | 'responsabilidad'

export default function App() {
  const cargarTodo = useLifeSync((s) => s.cargarTodo)
  const cargarResponsable = useLifeSync((s) => s.cargarResponsable)
  const cargando = useLifeSync((s) => s.cargando)
  const error = useLifeSync((s) => s.error)
  const aprobaciones = useLifeSync((s) => s.aprobaciones)
  const [fecha, setFecha] = useState(new Date())
  const [chatAmpliado, setChatAmpliado] = useState(false)
  const [vista, setVista] = useState<Vista>('chat')

  useEffect(() => {
    cargarTodo()
    // El badge de aprobaciones pendientes debe ser correcto aunque el usuario
    // nunca abra el panel de Responsabilidad.
    void cargarResponsable()
  }, [cargarTodo, cargarResponsable])

  // Atajo Ctrl/Cmd + K: abre o cierra el chat a pantalla completa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setChatAmpliado((v) => !v)
      }
      if (e.key === 'Escape') setChatAmpliado(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pendientes = aprobaciones.filter((a) => a.estado === 'pendiente').length

  const pestanas: Array<{ id: Vista; texto: string; icono: typeof MessageSquare; color: string }> = [
    { id: 'chat', texto: 'Chat', icono: MessageSquare, color: 'indigo' },
    { id: 'agenda', texto: 'Mi agenda', icono: LayoutGrid, color: 'emerald' },
    { id: 'responsabilidad', texto: 'Responsabilidad', icono: ShieldCheck, color: 'rose' },
  ]

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        fecha={fecha}
        onCambiarFecha={setFecha}
        onAbrirChat={() => setChatAmpliado((v) => !v)}
        onIrAAgenda={() => setVista('agenda')}
      />

      {/* Navegacion principal: chat (centro) / agenda / responsabilidad */}
      <nav className="flex shrink-0 items-center gap-1.5 border-b border-white/8 bg-slate-950/40 px-3 py-2">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setVista(p.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              vista === p.id
                ? p.color === 'indigo'
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : p.color === 'emerald'
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
            }`}
          >
            <p.icono size={13} />
            {p.texto}
            {p.id === 'responsabilidad' && pendientes > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                {pendientes}
              </span>
            )}
          </button>
        ))}

        <span className="ml-auto hidden text-[10px] text-slate-600 sm:block">
          Ctrl+K para el chat a pantalla completa
        </span>
      </nav>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          <AlertTriangle size={13} />
          <span className="flex-1">{error}</span>
          <button onClick={() => cargarTodo()} className="flex items-center gap-1 underline">
            <RefreshCw size={11} /> Reintentar
          </button>
        </div>
      )}

      {vista === 'chat' && (
        /* ------------------------------ CHAT CENTRADO ---------------------- */
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 xl:grid-cols-[1fr_320px]">
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-col">
            <ChatPanel
              expandido={chatAmpliado}
              onToggleExpandido={() => setChatAmpliado((v) => !v)}
            />
          </div>
          {/* Contexto a la derecha: que va a pasar hoy, sin cambiar de vista */}
          <aside className="hidden min-h-0 xl:flex xl:flex-col xl:gap-3 xl:overflow-y-auto">
            <ContextoLateral fecha={fecha} onVerAgenda={() => setVista('agenda')} />
          </aside>
        </main>
      )}

      {vista === 'agenda' && (
        /* ------------------------------ 3 MODULOS DE VIDA ------------------ */
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[1fr_minmax(300px,360px)] lg:overflow-hidden">
          <div className="min-h-[520px] lg:min-h-0">
            <CalendarPanel fecha={fecha} onCambiarFecha={setFecha} />
          </div>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <AcademicPanel />
            <LogbookPanel />
          </div>
        </main>
      )}

      {vista === 'responsabilidad' && (
        <main className="min-h-0 flex-1 overflow-y-auto p-3">
          <ResponsibilityPanel />
        </main>
      )}

      {/* Acceso rapido al chat en movil / cuando el panel esta oculto. */}
      {!chatAmpliado && vista !== 'chat' && (
        <button
          onClick={() => setVista('chat')}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-400 xl:hidden"
        >
          <MessageSquare size={15} />
          Hablar con el agente
        </button>
      )}

      {cargando && (
        <div className="pointer-events-none fixed bottom-4 left-4 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 text-[11px] text-slate-400 shadow-lg backdrop-blur">
          Cargando tu vida…
        </div>
      )}
    </div>
  )
}

/** Icono auxiliar para la barra superior. */
export { CalendarDays }
