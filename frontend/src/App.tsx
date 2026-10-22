/** LifeAgente AI — layout principal.
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
import { AlertTriangle, CalendarCheck, Folder, KeyRound, LayoutGrid, Loader2, MessageSquare, Plug, RefreshCw, Settings, ShieldCheck, Sparkles } from 'lucide-react'
import { useLifeAgente } from './store/useLifeAgente'
import TopBar from './components/TopBar'
import CalendarPanel from './components/CalendarPanel'
import AcademicPanel from './components/AcademicPanel'
import LogbookPanel from './components/LogbookPanel'
import ResponsibilityPanel from './components/ResponsibilityPanel'
import AjustesPanel, { AsistenteBienvenida } from './components/AjustesPanel'
import PermisosPanel from './components/PermisosPanel'
import PanelesPanel from './components/PanelesPanel'
import ContextoLateral from './components/ContextoLateral'
import PanelLocal from './components/PanelLocal'
import ChatFlotante from './components/ChatFlotante'
import ResumenMovil from './components/ResumenMovil'
import MenuMovil from './components/MenuMovil'
import { Boton, Panel } from './components/ui'
import AccesoPanel from './components/AccesoPanel'
import Bienvenida from './components/Bienvenida'
import { ESCRITORIO, useMediaQuery } from './lib/useMediaQuery'
import { guardarToken, leerToken, suscribirLento } from './lib/api'
import type { Usuario } from './types'

type Vista = 'agenda' | 'paneles' | 'responsabilidad' | 'permisos' | 'ajustes'

export default function App() {
  const cargarTodo = useLifeAgente((s) => s.cargarTodo)
  const cargarResponsable = useLifeAgente((s) => s.cargarResponsable)
  const sincronizarCuenta = useLifeAgente((s) => s.sincronizarCuenta)
  const mensajeSesion = useLifeAgente((s) => s.mensajeSesion)
  const setMensajeSesion = useLifeAgente((s) => s.setMensajeSesion)
  const cargando = useLifeAgente((s) => s.cargando)
  const error = useLifeAgente((s) => s.error)
  const aprobaciones = useLifeAgente((s) => s.aprobaciones)
  const ajustes = useLifeAgente((s) => s.ajustes)
  const [fecha, setFecha] = useState(new Date())
  const [chatAbierto, setChatAbierto] = useState(false)
  const [vista, setVista] = useState<Vista>('agenda')
  const [accesoAbierto, setAccesoAbierto] = useState(false)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [conexionesAbiertas, setConexionesAbiertas] = useState(false)
  const [bienvenidaSaltada, setBienvenidaSaltada] = useState(false)
  /** Pantalla de bienvenida: aparece antes de iniciar sesion o crear cuenta. */
  const [portadaAbierta, setPortadaAbierta] = useState(() => !leerToken())
  const [mostrarAvisoPrueba, setMostrarAvisoPrueba] = useState(false)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  /** El servidor esta tardando (se durmio en la nube): avisamos en vez de congelar. */
  const [lento, setLento] = useState(false)
  /** En pantallas grandes la agenda usa tres columnas; en movil, un menu. */
  const esEscritorio = useMediaQuery(ESCRITORIO)
  const activarModoPrueba = useLifeAgente((s) => s.activarModoPrueba)
  const activarModoLocal = useLifeAgente((s) => s.activarModoLocal)
  const cargarPlantilla = useLifeAgente((s) => s.cargarPlantilla)
  const importarTexto = useLifeAgente((s) => s.importarTexto)
  const modoLocal = useLifeAgente((s) => s.modoLocal)
  const cargarPaneles = useLifeAgente((s) => s.cargarPaneles)

  useEffect(() => {
    // v36: una sola peticion trae agenda, tareas, bitacora, mantenimiento,
    // paneles, ajustes, politica, auditoria, cumplimiento y aprobaciones.
    cargarTodo()
  }, [cargarTodo])

  // Aviso de "el servidor esta tardando" (v34): en la nube el servicio puede
  // estar dormido y la primera peticion tarda medio minuto. Mejor decirlo que
  // dejar la pantalla en blanco sin explicacion.
  useEffect(() => suscribirLento(setLento), [])

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
    { id: 'paneles', texto: 'Paneles', icono: Folder, color: 'sky' },
    { id: 'responsabilidad', texto: 'Responsabilidad', icono: ShieldCheck, color: 'rose' },
    { id: 'permisos', texto: 'Permisos', icono: KeyRound, color: 'amber' },
    { id: 'ajustes', texto: 'Ajustes', icono: Settings, color: 'indigo' },
  ]

  // Primera vez: el formulario de bienvenida manda hasta que la persona lo
  // completa (o decide saltarlo).
  const mostrarBienvenida =
    !cargando && !!ajustes && !ajustes.onboarding_completo && !bienvenidaSaltada

  return (
    <div className="ls-shell flex flex-col overflow-hidden">
      <TopBar
        onAbrirAcceso={() => setAccesoAbierto(true)}
        usuario={usuario}
        fecha={fecha}
        onCambiarFecha={setFecha}
        onAbrirChat={() => setChatAbierto((v) => !v)}
        chatAbierto={chatAbierto}
        conexionesAbiertas={conexionesAbiertas}
        onAbrirConexiones={() => setConexionesAbiertas(true)}
        onCerrarConexiones={() => setConexionesAbiertas(false)}
        onAbrirMenu={() => setMenuMovilAbierto(true)}
        panelId={useLifeAgente((s) => s.panelId)}
        onCambiarPanel={(id) => void useLifeAgente.getState().seleccionarPanel(id)}
      />

      {/* Navegacion principal: agenda / responsabilidad / ajustes */}
      <nav className="ls-scroll flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/8 bg-slate-950/40 px-4 py-2.5">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setVista(p.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              vista === p.id
                ? p.color === 'emerald'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : p.color === 'rose'
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                    : p.color === 'amber'
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
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

        <span className="ml-auto hidden shrink-0 text-[10px] text-slate-600 sm:block">
          Ctrl+K abre el chat flotante
        </span>
      </nav>

      {error && !modoLocal && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          <AlertTriangle size={13} />
          <span className="flex-1">
            {error}
            {(error.includes('404') || error.includes('405')) && (
              <span className="mt-0.5 block text-[11px] leading-relaxed text-rose-200/80">
                No encontramos el servidor de LifeAgente. Si abriste esta pagina en GitHub Pages,
                falta la API detras: ponle la direccion donde vive (por ejemplo
                <code className="mx-1">http://127.0.0.1:8000/api</code> si la tienes en tu
                computador, o la de tu servidor en la nube) en "Conectar IA &gt; Direccion de la API".
              </span>
            )}
          </span>
          <button
            onClick={() => setConexionesAbiertas(true)}
            className="flex items-center gap-1 rounded-lg border border-rose-400/40 px-2 py-1 text-[11px] font-semibold underline"
          >
            <Plug size={11} /> Configurar la API
          </button>
          <button onClick={() => cargarTodo()} className="flex items-center gap-1 underline">
            <RefreshCw size={11} /> Reintentar
          </button>
        </div>
      )}

      {vista === 'agenda' && (
        /* ------------------------------ AGENDA (inicial) -------------------
           Pantallas grandes: 3 columnas (agenda | tareas y contexto | dinero).
           Pantallas pequenas: el calendario completo + 3 lineas de resumen y
           un menu con todo lo demas (nada queda escondido ni se rompe).   */
        <main className="ls-scroll flex-1 p-3 sm:p-4 lg:overflow-hidden">
          {esEscritorio ? (
            <div className="ls-agenda mx-auto h-full w-full max-w-[1900px]">
              {/* Columna 1: la agenda, siempre visible. */}
              <div className="ls-col-calendario flex min-h-0 flex-col">
                <CalendarPanel fecha={fecha} onCambiarFecha={setFecha} />
              </div>

              {/* Columna 2: el agente, el contexto y las tareas. */}
              <div className="ls-col-tareas ls-scroll flex min-h-0 flex-col gap-4 pr-0.5">
                {/* Atajo al chat dentro de la agenda: la entrada al agente
                    siempre a mano, sin salir de lo que estabas mirando. */}
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

                <ContextoLateral fecha={fecha} />

                {/* Lo local, a mano en la pagina normal: motor de reglas, IA
                    del computador, plantillas y pegar texto de otro chat. */}
                <PanelLocal onAbrirConexiones={() => setConexionesAbiertas(true)} />

                <AcademicPanel />
              </div>

              {/* Columna 3: la bitacora y los gastos. */}
              <div className="ls-col-dinero ls-scroll flex min-h-0 flex-col gap-4 pr-0.5">
                <LogbookPanel />
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-4">
              <CalendarPanel fecha={fecha} onCambiarFecha={setFecha} />
              <ResumenMovil onAbrirMas={() => setMenuMovilAbierto(true)} />
              <PanelLocal onAbrirConexiones={() => setConexionesAbiertas(true)} />
            </div>
          )}
        </main>
      )}

      {vista === 'paneles' && (
        <main className="ls-scroll flex-1 p-3 sm:p-4">
          <div className="mx-auto w-full max-w-[1100px]">
            <PanelesPanel />
          </div>
        </main>
      )}

      {vista === 'responsabilidad' && (
        <main className="ls-scroll flex-1 p-3 sm:p-4">
          <div className="mx-auto w-full max-w-[1500px]">
            <ResponsibilityPanel />
          </div>
        </main>
      )}

      {vista === 'permisos' && (
        <main className="ls-scroll flex-1 p-3 sm:p-4">
          <div className="mx-auto w-full max-w-[1100px]">
            <PermisosPanel />
          </div>
        </main>
      )}

      {vista === 'ajustes' && (
        <main className="ls-scroll flex-1 p-3 sm:p-4">
          <div className="mx-auto w-full max-w-[1100px]">
            <AjustesPanel onAbrirConexiones={() => setConexionesAbiertas(true)} />
          </div>
        </main>
      )}

      {/* El chat vive aparte: burbuja flotante disponible en cualquier vista. */}
      <ChatFlotante abierto={chatAbierto} onToggle={() => setChatAbierto((v) => !v)} />

      {/* En movil: hoja con lo que no cabe en la pantalla. */}
      <MenuMovil
        abierto={menuMovilAbierto && !esEscritorio}
        onCerrar={() => setMenuMovilAbierto(false)}
        onAbrirConexiones={() => {
          setMenuMovilAbierto(false)
          setConexionesAbiertas(true)
        }}
        onAbrirAcceso={() => {
          setMenuMovilAbierto(false)
          setAccesoAbierto(true)
        }}
        onAbrirChat={() => {
          setMenuMovilAbierto(false)
          setChatAbierto(true)
        }}
        usuario={usuario}
      />
    {mostrarAvisoPrueba && (
      <div className="fixed left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-500/30 bg-amber-500/15 px-4 py-1.5 text-[11px] font-semibold text-amber-100 backdrop-blur">
        <span>Modo de prueba · los datos desaparecen al recargar la pagina (maximo 6 bloques, 4 tareas y 6 gastos)</span>
        <button
          onClick={() => setConexionesAbiertas(true)}
          className="shrink-0 rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold text-amber-50 transition hover:bg-amber-400/20"
        >
          Usar mi cuenta o mi IA local
        </button>
      </div>
    )}
    {modoLocal && !mostrarAvisoPrueba && (
      <div className="fixed left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-sky-500/30 bg-sky-500/15 px-4 py-1.5 text-[11px] font-semibold text-sky-100 backdrop-blur">
        <span>Modo local · LifeAgente funciona con su motor de reglas y guarda todo en este navegador</span>
        <button
          onClick={() => setConexionesAbiertas(true)}
          className="shrink-0 rounded-full border border-sky-400/40 px-2 py-0.5 text-[10px] font-bold text-sky-50 transition hover:bg-sky-400/20"
        >
          Conectar una IA
        </button>
      </div>
    )}
    {lento && (
      <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-sky-500/30 bg-slate-900/90 px-4 py-2 text-[11px] font-semibold text-sky-100 shadow-lg backdrop-blur">
        <Loader2 size={13} className="animate-spin" />
        <span>Despertando el servidor… la primera vez puede tardar un momento</span>
      </div>
    )}
    {mensajeSesion && (
      <div className="fixed left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-1.5 text-[11px] font-semibold text-emerald-100 backdrop-blur">
        {mensajeSesion}
        <button
          onClick={() => setMensajeSesion('')}
          className="underline opacity-80 hover:opacity-100"
        >
          ok
        </button>
      </div>
    )}
    <Bienvenida
      abierto={portadaAbierta}
      onCerrar={() => setPortadaAbierta(false)}
      onSesion={(token, usuario) => {
        guardarToken(token)
        setUsuario(usuario ?? null)
        setPortadaAbierta(false)
        // Al entrar con tu cuenta: recupera de Drive lo que falte y carga todo.
        void sincronizarCuenta().then(() => {
          void cargarTodo()
          void cargarPaneles()
        })
      }}
      onAbrirAcceso={() => {
        setPortadaAbierta(false)
        setAccesoAbierto(true)
      }}
      onModoPrueba={() => {
        setPortadaAbierta(false)
        activarModoPrueba()
        setMostrarAvisoPrueba(true)
      }}
      onContinuarLocal={() => {
        activarModoLocal()
        setMostrarAvisoPrueba(false)
        setPortadaAbierta(false)
      }}
      onCargarPlantilla={(id) => {
        if (!modoLocal && !useLifeAgente.getState().modoPrueba) activarModoLocal()
        cargarPlantilla(id)
        setMostrarAvisoPrueba(false)
        setPortadaAbierta(false)
      }}
      onPegarTexto={(texto) => {
        importarTexto(texto)
        setPortadaAbierta(false)
      }}
    />
    <AccesoPanel
      abierto={accesoAbierto}
      onCerrar={() => setAccesoAbierto(false)}
      onSesionCambiada={(u) => {
        setUsuario(u)
        // Con cuenta: recuperamos de Drive lo que falte y recargamos todo.
        if (u) {
          void sincronizarCuenta().then(() => {
            void cargarTodo()
            void cargarPaneles()
          })
        }
      }}
      onAbrirConexiones={() => setConexionesAbiertas(true)}
    />

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
