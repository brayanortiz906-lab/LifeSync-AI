/** LifeSync AI — layout principal: panel de vida + panel de responsabilidad. */
import { useEffect, useState } from 'react'
import { AlertTriangle, MessageSquare, RefreshCw, ShieldCheck } from 'lucide-react'
import { useLifeSync } from './store/useLifeSync'
import TopBar from './components/TopBar'
import ChatPanel from './components/ChatPanel'
import CalendarPanel from './components/CalendarPanel'
import AcademicPanel from './components/AcademicPanel'
import LogbookPanel from './components/LogbookPanel'
import ResponsibilityPanel from './components/ResponsibilityPanel'

type Vista = 'vida' | 'responsabilidad'

export default function App() {
  const cargarTodo = useLifeSync((s) => s.cargarTodo)
  const cargarResponsable = useLifeSync((s) => s.cargarResponsable)
  const cargando = useLifeSync((s) => s.cargando)
  const error = useLifeSync((s) => s.error)
  const aprobaciones = useLifeSync((s) => s.aprobaciones)
  const [fecha, setFecha] = useState(new Date())
  const [chatAmpliado, setChatAmpliado] = useState(false)
  const [vista, setVista] = useState<Vista>('vida')

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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        fecha={fecha}
        onCambiarFecha={setFecha}
        onAbrirChat={() => setChatAmpliado((v) => !v)}
      />

      {/* Navegacion principal: vida diaria / responsabilidad */}
      <nav className="flex shrink-0 items-center gap-1.5 border-b border-white/8 bg-slate-950/40 px-3 py-2">
        <button
          onClick={() => setVista('vida')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            vista === 'vida'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
          }`}
        >
          Mi vida
        </button>
        <button
          onClick={() => setVista('responsabilidad')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            vista === 'responsabilidad'
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Responsabilidad
          {pendientes > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              {pendientes}
            </span>
          )}
        </button>
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

      {vista === 'vida' ? (
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(320px,380px)_1fr_minmax(300px,360px)] lg:overflow-hidden">
          <ChatPanel expandido={chatAmpliado} onToggleExpandido={() => setChatAmpliado((v) => !v)} />
          <div className="min-h-[520px] lg:min-h-0">
            <CalendarPanel fecha={fecha} onCambiarFecha={setFecha} />
          </div>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <AcademicPanel />
            <LogbookPanel />
          </div>
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto p-3">
          <ResponsibilityPanel />
        </main>
      )}

      {/* Acceso rápido al chat en móvil / cuando el panel está oculto. */}
      {!chatAmpliado && vista === 'vida' && (
        <button
          onClick={() => setChatAmpliado(true)}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-400 lg:hidden"
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
