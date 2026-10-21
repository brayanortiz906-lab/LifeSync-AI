/** LifeSync AI — layout principal.
 *
 * DISENO (v5): la app abre con TU AGENDA (la informacion que necesitas) y el
 * chat vive APARTE, como burbuja flotante disponible desde cualquier vista.
 * Asi no pierdes de un vistazo lo que tienes que hacer por hablar con el
 * agente: pulsas la burbuja (o Ctrl+K), le cuentas algo y se registra solo.
 *
 * Vistas:
 *   - "agenda"          -> vista inicial: agenda + tareas + bitacora + resumen
 *   - "responsabilidad" -> gobernanza, auditoria, aprobaciones
 *   - "ajustes"         -> formulario: tus datos, tema y formas de ordenar
 *
 * Primera vez: se muestra el formulario de bienvenida (AsistenteBienvenida)
 * antes de que la persona toque nada; al terminar la deja en la agenda.
 *
 * Chat:
 *   - burbuja flotante fija (abajo a la derecha), se abre y se cierra con Ctrl+K
 *   - dentro del panel hay un boton para ocuparlo toda la pantalla
 */
import { useEffect, useState } from 'react'
import {
  AlertTriangle, CalendarCheck, LayoutGrid, MessageSquare, RefreshCw, Settings,
  ShieldCheck, Sparkles,
} from 'lucide-react'
import { useLifeSync } from './store/useLifeSync'
import TopBar from './components/TopBar'
import CalendarPanel from './components/CalendarPanel'
import AcademicPanel from './components/AcademicPanel'
import LogbookPanel from './components/LogbookPanel'
import ResponsibilityPanel from './components/ResponsibilityPanel'
import AjustesPanel, { AsistenteBienvenida } from './components/AjustesPanel'
import ContextoLateral from './components/ContextoLateral'
import ChatFlotante from './components/ChatFlotante'
import { Boton, Panel } from './components/ui'

type Vista = 'agenda' | 'responsabilidad' | 'ajustes'

export default function App() {
  const cargarTodo = useLifeSync((s) => s.cargarTodo)
  const cargarResponsable = useLifeSync((s) => s.cargarResponsable)
  const cargando = useLifeSync((s) => s.cargando)
  const error = useLifeSync((s) => s.error)
  const aprobaciones = useLifeSync((s) => s.aprobaciones)
  const ajustes = useLifeSync((s) => s.ajustes)
  const [fecha, setFecha] = useState(new Date())
  const [chatAbierto, setChatAbierto] = useState(false)
  const [vista, setVista] = useState<Vista>('agenda')
  const [conexionesAbiertas, setConexionesAbiertas] = useState(false)
  const [bienvenidaSaltada, setBienvenidaSaltada] = useState(false)

  useEffect(() => {
    cargarTodo()
    // El badge de aprobaciones pendientes debe ser correcto aunque el usuario
    // nunca abra el panel de Responsabilidad.
    void cargarResponsable()
  }, [cargarTodo, cargarResponsable])

  // Atajo Ctrl/Cmd + K: abre o cierra el chat flotante.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setChatAbierto((v) => !v)
      }
      if (e.key === 'Escape') setChatAbierto(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pendientes = aprobaciones.filter((a) => a.estado === 'pendiente').length

  const pestanas: Array<{ id: Vista; texto: string; icono: typeof LayoutGrid; color: string }> = [
    { id: 'agenda', texto: 'Mi agenda', icono: LayoutGrid, color: 'emerald' },
    { id: 'responsabilidad', texto: 'Responsabilidad', icono: ShieldCheck, color: 'rose' },
    { id: 'ajustes', texto: 'Ajustes', icono: Settings, color: 'indigo' },
  ]

  // Primera vez: el formulario de bienvenida manda hasta que la persona lo
  // completa (o decide saltarlo).
  const mostrarBienvenida =
    !cargando && !!ajustes && !ajustes.onboarding_completo && !bienvenidaSaltada

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        fecha={fecha}
        onCambiarFecha={setFecha}
        onAbrirChat={() => setChatAbierto((v) => !v)}
        chatAbierto={chatAbierto}
        conexionesAbiertas={conexionesAbiertas}
        onAbrirConexiones={() => setConexionesAbiertas(true)}
        onCerrarConexiones={() => setConexionesAbiertas(false)}
      />

      {/* Navegacion principal: agenda / responsabilidad / ajustes */}
      <nav className="flex shrink-0 items-center gap-2 border-b border-white/8 bg-slate-950/40 px-4 py-2.5">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setVista(p.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              vista === p.id
                ? p.color === 'emerald'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : p.color === 'rose'
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                    : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
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
          Ctrl+K abre el chat flotante
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

      {vista === 'agenda' && (
        /* ------------------------------ AGENDA (inicial) ------------------- */
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_minmax(300px,360px)] lg:overflow-hidden">
          <div className="min-h-[520px] lg:min-h-0">
            <CalendarPanel fecha={fecha} onCambiarFecha={setFecha} />
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
            {/* Atajo al chat dentro de la agenda: la entrada al agente siempre
                a mano, sin salir de lo que estabas mirando. */}
            <Panel titulo="Habla con tu asistente" icono={<Sparkles size={13} className="text-indigo-400" />}>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Cuentale un compromiso, un gasto o una entrega en palabras simples. Se registra
                solo y reorganiza tu agenda.
              </p>
              <Boton
                variante="primario"
                onClick={() => setChatAbierto(true)}
                className="mt-2 w-full justify-center"
              >
                <MessageSquare size={13} />
                Abrir el chat
              </Boton>
            </Panel>

            <aside className="hidden xl:block">
              <ContextoLateral fecha={fecha} />
            </aside>

            <AcademicPanel />
            <LogbookPanel />
          </div>
        </main>
      )}

      {vista === 'responsabilidad' && (
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <ResponsibilityPanel />
        </main>
      )}

      {vista === 'ajustes' && (
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <AjustesPanel onAbrirConexiones={() => setConexionesAbiertas(true)} />
        </main>
      )}

      {/* El chat vive aparte: burbuja flotante disponible en cualquier vista. */}
      <ChatFlotante abierto={chatAbierto} onToggle={() => setChatAbierto((v) => !v)} />

      {cargando && (
        <div className="pointer-events-none fixed bottom-4 left-4 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 text-[11px] text-slate-400 shadow-lg backdrop-blur">
          Cargando tu vida…
        </div>
      )}

      {mostrarBienvenida && (
        <AsistenteBienvenida
          alTerminar={() => setVista('agenda')}
          onAbrirConexiones={() => setConexionesAbiertas(true)}
        />
      )}
    </div>
  )
}

/** Icono auxiliar para la barra superior. */
export { CalendarCheck }
