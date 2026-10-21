/** Ajustes de LifeSync: formulario guiado, temas y formas de organizar.
 *
 * DISENO: la persona no es tecnica. Por eso el formulario va en pasos cortos
 * (una idea por pantalla, botones grandes, lenguaje llano) y los cambios se
 * guardan solos al confirmar.
 *
 * Este archivo exporta dos cosas:
 *   - `AjustesPanel`  : la seccion de Ajustes de la app.
 *   - `AsistenteBienvenida` : el formulario que aparece la PRIMERA vez, antes
 *     de que la persona toque nada, y al terminar la lleva a la agenda.
 */
import { useEffect, useState } from 'react'
import {
  Check, ChevronLeft, ChevronRight, Clock, Coins, Palette, Plus, SlidersHorizontal,
  Sparkles, Tag, Trash2, User, X,
} from 'lucide-react'
import { useLifeSync } from '../store/useLifeSync'
import type {
  Ajustes, OrdenEventos, OrdenGastos, OrdenTareas, TemaId,
} from '../types'
import { Boton, Chip, Panel } from './ui'

// --------------------------------------------------------------------------- //
// Opciones
// --------------------------------------------------------------------------- //
const TEMAS: Array<{ id: TemaId; nombre: string; desc: string; muestra: string[] }> = [
  { id: 'medianoche', nombre: 'Medianoche', desc: 'Violeta y verde. El clasico.', muestra: ['bg-indigo-500', 'bg-violet-500', 'bg-emerald-500'] },
  { id: 'oceano', nombre: 'Oceanía', desc: 'Cian y azul profundo.', muestra: ['bg-cyan-500', 'bg-indigo-500', 'bg-sky-500'] },
  { id: 'bosque', nombre: 'Bosque', desc: 'Verdes y turquesa.', muestra: ['bg-lime-500', 'bg-teal-500', 'bg-emerald-500'] },
  { id: 'atardecer', nombre: 'Atardecer', desc: 'Naranja y fucsia.', muestra: ['bg-orange-500', 'bg-fuchsia-500', 'bg-rose-500'] },
]

const MONEDAS = ['COP', 'USD', 'EUR', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'GTQ', 'UYU']

const ORDENES_TAREAS: Array<{ id: OrdenTareas; texto: string }> = [
  { id: 'fecha', texto: 'Por fecha de entrega' },
  { id: 'prioridad', texto: 'Por prioridad (urgente primero)' },
  { id: 'tiempo', texto: 'Por tiempo estimado' },
  { id: 'materia', texto: 'Por materia' },
]

const ORDENES_GASTOS: Array<{ id: OrdenGastos; texto: string }> = [
  { id: 'fecha', texto: 'Por fecha (mas reciente primero)' },
  { id: 'monto', texto: 'Por monto (mas caro primero)' },
  { id: 'categoria', texto: 'Por categoria' },
]

const ORDENES_EVENTOS: Array<{ id: OrdenEventos; texto: string }> = [
  { id: 'hora', texto: 'Por hora del dia' },
  { id: 'categoria', texto: 'Por categoria' },
  { id: 'duracion', texto: 'Por duracion' },
]

const ETIQUETAS_SUGERIDAS = ['Universidad', 'Trabajo', 'Salud', 'Casa', 'Familia', 'Dinero', 'Personal']

// --------------------------------------------------------------------------- //
// Panel de Ajustes
// --------------------------------------------------------------------------- //
export default function AjustesPanel({ onAbrirConexiones }: { onAbrirConexiones?: () => void }) {
  const ajustes = useLifeSync((s) => s.ajustes)
  const guardarAjustes = useLifeSync((s) => s.guardarAjustes)
  const [etiquetaNueva, setEtiquetaNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const aplicar = async (cambios: Partial<Ajustes>) => {
    setGuardando(true)
    setMensaje(null)
    try {
      await guardarAjustes(cambios)
      setMensaje('Guardado.')
    } catch (e) {
      setMensaje((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (!ajustes) {
    return (
      <Panel titulo="Ajustes">
        <p className="text-xs text-slate-400">Cargando tus preferenciasâ€¦</p>
      </Panel>
    )
  }

  const anadirEtiqueta = () => {
    const t = etiquetaNueva.trim()
    if (!t) return
    if (ajustes.etiquetas.some((e) => e.toLowerCase() === t.toLowerCase())) {
      setEtiquetaNueva('')
      return
    }
    void aplicar({ etiquetas: [...ajustes.etiquetas, t] })
    setEtiquetaNueva('')
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- */}
      {/* Sobre ti                                                          */}
      {/* ---------------------------------------------------------------- */}
      <Panel titulo={<><User size={14} className="text-indigo-400" />Sobre ti</>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-300">
              Como te llamas
            </span>
            <input
              value={ajustes.nombre_usuario}
              onChange={(e) => void aplicar({ nombre_usuario: e.target.value })}
              placeholder="Escribe tu nombre"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
            />
            <span className="mt-1 block text-[10px] text-slate-500">
              El asistente te hablara por tu nombre.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-300">
              <Coins size={11} /> Tu moneda
            </span>
            <select
              value={ajustes.moneda}
              onChange={(e) => void aplicar({ moneda: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
            >
              {MONEDAS.map((m) => (
                <option key={m} value={m} className="bg-slate-900">{m}</option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-2">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-300">
              <Clock size={11} /> Tu jornada
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={ajustes.inicio_jornada}
                onChange={(e) => void aplicar({ inicio_jornada: e.target.value })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
              />
              <span className="text-xs text-slate-500">hasta</span>
              <input
                type="time"
                value={ajustes.fin_jornada}
                onChange={(e) => void aplicar({ fin_jornada: e.target.value })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
              />
              <span className="text-[10px] text-slate-500">
                El agente solo agenda dentro de este rango.
              </span>
            </div>
          </div>
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      {/* Tema visual                                                       */}
      {/* ---------------------------------------------------------------- */}
      <Panel titulo={<><Palette size={14} className="text-violet-400" />Tema de la app</>}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {TEMAS.map((t) => {
            const activo = ajustes.tema === t.id
            return (
              <button
                key={t.id}
                onClick={() => void aplicar({ tema: t.id })}
                className={`rounded-xl border p-3 text-left transition ${
                  activo
                    ? 'border-indigo-500/60 bg-indigo-500/10'
                    : 'border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/6'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {t.muestra.map((c) => (
                    <span key={c} className={`h-4 w-4 rounded-full ${c}`} />
                  ))}
                  {activo && <Check size={13} className="ml-auto text-indigo-300" />}
                </div>
                <div className="mt-2 text-xs font-bold text-slate-100">{t.nombre}</div>
                <div className="text-[10px] text-slate-500">{t.desc}</div>
              </button>
            )
          })}
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      {/* Como ordenar lo que ves                                           */}
      {/* ---------------------------------------------------------------- */}
      <Panel titulo={<><SlidersHorizontal size={14} className="text-emerald-400" />Como organizar lo que ves</>}>
        <div className="grid gap-3 lg:grid-cols-3">
          <SelectorOrden
            titulo="Tareas academicas"
            valor={ajustes.orden_tareas}
            opciones={ORDENES_TAREAS}
            onChange={(v) => void aplicar({ orden_tareas: v })}
          />
          <SelectorOrden
            titulo="Gastos de la bitacora"
            valor={ajustes.orden_gastos}
            opciones={ORDENES_GASTOS}
            onChange={(v) => void aplicar({ orden_gastos: v })}
          />
          <SelectorOrden
            titulo="Bloques del dia"
            valor={ajustes.orden_eventos}
            opciones={ORDENES_EVENTOS}
            onChange={(v) => void aplicar({ orden_eventos: v })}
          />
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      {/* Temas / etiquetas                                                 */}
      {/* ---------------------------------------------------------------- */}
      <Panel titulo={<><Tag size={14} className="text-amber-400" />Tus temas (etiquetas)</>}>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
          Son tus propias categorias: nombra como quieras a las areas de tu vida
          (Universidad, Trabajo, Saludâ€¦). El agente las usa cuando registras algo.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ajustes.etiquetas.map((e) => (
            <Chip key={e} className="bg-amber-500/15 text-amber-200 ring-amber-500/30">
              {e}
              <button
                onClick={() =>
                  void aplicar({ etiquetas: ajustes.etiquetas.filter((x) => x !== e) })
                }
                className="ml-1 text-amber-300/70 hover:text-rose-300"
                aria-label={`Quitar ${e}`}
              >
                <X size={10} />
              </button>
            </Chip>
          ))}
          {ajustes.etiquetas.length === 0 && (
            <span className="text-[11px] text-slate-500">Todavia no tienes temas.</span>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={etiquetaNueva}
            onChange={(e) => setEtiquetaNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                anadirEtiqueta()
              }
            }}
            placeholder="Escribe un tema y pulsa Enter"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
          />
          <Boton variante="secundario" onClick={anadirEtiqueta} disabled={!etiquetaNueva.trim()}>
            <Plus size={13} /> Anadir
          </Boton>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ETIQUETAS_SUGERIDAS.filter(
            (s) => !ajustes.etiquetas.some((e) => e.toLowerCase() === s.toLowerCase()),
          ).map((s) => (
            <Chip
              key={s}
              onClick={() => void aplicar({ etiquetas: [...ajustes.etiquetas, s] })}
              className="cursor-pointer bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10"
            >
              + {s}
            </Chip>
          ))}
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      {/* IA                                                                */}
      {/* ---------------------------------------------------------------- */}
      <Panel titulo={<><Sparkles size={14} className="text-indigo-400" />Asistente de IA</>}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-200">
              Motor actual: {ajustes.proveedor_efectivo === 'mock' ? 'asistente demo (local)' : ajustes.proveedor}
            </div>
            <div className="text-[10px] text-slate-500">
              Modelo {ajustes.modelo} · moneda {ajustes.moneda}
            </div>
          </div>
          {onAbrirConexiones && (
            <Boton variante="secundario" onClick={onAbrirConexiones}>
              Conectar otra IA
            </Boton>
          )}
        </div>
      </Panel>

      {mensaje && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2 text-[11px] text-slate-300">
          {guardando ? <span className="ls-dot h-1.5 w-1.5 rounded-full bg-indigo-400" /> : <Check size={12} className="text-emerald-400" />}
          {mensaje}
        </div>
      )}
    </div>
  )
}

function SelectorOrden<T extends string>({
  titulo, valor, opciones, onChange,
}: {
  titulo: string
  valor: T
  opciones: Array<{ id: T; texto: string }>
  onChange: (v: T) => void
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold text-slate-300">{titulo}</div>
      <div className="space-y-1">
        {opciones.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition ${
              valor === o.id
                ? 'border-indigo-500/50 bg-indigo-500/12 text-slate-100'
                : 'border-white/8 bg-white/3 text-slate-400 hover:bg-white/6'
            }`}
          >
            <span
              className={`h-3 w-3 shrink-0 rounded-full border ${
                valor === o.id ? 'border-indigo-400 bg-indigo-400' : 'border-white/25'
              }`}
            />
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Asistente de bienvenida (formulario inicial, 3 pasos)
// --------------------------------------------------------------------------- //
export function AsistenteBienvenida({
  alTerminar,
  onAbrirConexiones,
}: {
  alTerminar: () => void
  onAbrirConexiones?: () => void
}) {
  const ajustes = useLifeSync((s) => s.ajustes)
  const guardarAjustes = useLifeSync((s) => s.guardarAjustes)
  const [paso, setPaso] = useState(0)
  const [nombre, setNombre] = useState('')
  const [moneda, setMoneda] = useState('COP')
  const [inicio, setInicio] = useState('07:00')
  const [fin, setFin] = useState('22:00')
  const [tema, setTema] = useState<TemaId>('medianoche')
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [etiquetaNueva, setEtiquetaNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ajustes) {
      setNombre(ajustes.nombre_usuario)
      setMoneda(ajustes.moneda)
      setInicio(ajustes.inicio_jornada)
      setFin(ajustes.fin_jornada)
      setTema(ajustes.tema)
      setEtiquetas(ajustes.etiquetas)
    }
  }, [ajustes])

  const finalizar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await guardarAjustes({
        nombre_usuario: nombre,
        moneda,
        inicio_jornada: inicio,
        fin_jornada: fin,
        tema,
        etiquetas,
        onboarding_completo: true,
      })
      alTerminar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const pasos = [
    { titulo: 'Sobre ti', sub: 'Para que el asistente hable contigo' },
    { titulo: 'Tu ritmo', sub: 'Tu jornada y tus temas' },
    { titulo: 'Tu estilo', sub: 'Como quieres ver la informacion' },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/95 p-4 backdrop-blur-sm">
      <div className="ls-fade-up w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        {/* Cabecera con pasos */}
        <header className="border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Sparkles size={15} className="text-indigo-400" />
            Bienvenido a LifeSync AI
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {pasos[paso].sub}. Esto toma menos de un minuto.
          </p>
          <div className="mt-3 flex gap-1.5">
            {pasos.map((p, i) => (
              <div
                key={p.titulo}
                className={`h-1 flex-1 rounded-full transition ${
                  i <= paso ? 'bg-indigo-500' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </header>

        <div className="px-5 py-4">
          {paso === 0 && (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-200">
                  Como te llamas
                </span>
                <input
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-slate-100 outline-none focus:border-indigo-500/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-200">
                  <Coins size={12} /> Con que moneda cuentas
                </span>
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-slate-100 outline-none focus:border-indigo-500/60"
                >
                  {MONEDAS.map((m) => (
                    <option key={m} value={m} className="bg-slate-900">{m}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {paso === 1 && (
            <div className="space-y-4">
              <div>
                <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-200">
                  <Clock size={12} /> Cuando empieza y termina tu dia
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                  <span className="text-xs text-slate-500">a</span>
                  <input
                    type="time"
                    value={fin}
                    onChange={(e) => setFin(e.target.value)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  El agente solo pondra bloques dentro de ese rango.
                </p>
              </div>
              <div>
                <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-200">
                  <Tag size={12} /> Como quieres nombrar tus temas
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ETIQUETAS_SUGERIDAS.map((s) => {
                    const activo = etiquetas.includes(s)
                    return (
                      <Chip
                        key={s}
                        onClick={() =>
                          setEtiquetas(
                            activo ? etiquetas.filter((x) => x !== s) : [...etiquetas, s],
                          )
                        }
                        className={
                          activo
                            ? 'cursor-pointer bg-amber-500/20 text-amber-200 ring-amber-500/40'
                            : 'cursor-pointer bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10'
                        }
                      >
                        {s}
                      </Chip>
                    )
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={etiquetaNueva}
                    onChange={(e) => setEtiquetaNueva(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && etiquetaNueva.trim()) {
                        e.preventDefault()
                        setEtiquetas([...etiquetas, etiquetaNueva.trim()])
                        setEtiquetaNueva('')
                      }
                    }}
                    placeholder="O escribe el tuyo"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                  <Boton
                    variante="secundario"
                    onClick={() => {
                      if (!etiquetaNueva.trim()) return
                      setEtiquetas([...etiquetas, etiquetaNueva.trim()])
                      setEtiquetaNueva('')
                    }}
                  >
                    <Plus size={13} />
                  </Boton>
                </div>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-4">
              <div>
                <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-200">
                  <Palette size={12} /> Elige el tema que mas te guste
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TEMAS.map((t) => {
                    const activo = tema === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTema(t.id)}
                        className={`rounded-xl border p-3 text-left transition ${
                          activo
                            ? 'border-indigo-500/60 bg-indigo-500/10'
                            : 'border-white/10 bg-white/3 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {t.muestra.map((c) => (
                            <span key={c} className={`h-4 w-4 rounded-full ${c}`} />
                          ))}
                          {activo && <Check size={13} className="ml-auto text-indigo-300" />}
                        </div>
                        <div className="mt-2 text-xs font-bold text-slate-100">{t.nombre}</div>
                        <div className="text-[10px] text-slate-500">{t.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/4 p-3">
                <div className="text-[11px] font-semibold text-slate-200">Con que IA quieres trabajar</div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
                  Puedes empezar con el asistente demo (funciona sin internet) y
                  conectar tu cuenta de Google, ChatGPT o Claude cuando quieras.
                </p>
                {onAbrirConexiones && (
                  <Boton variante="secundario" onClick={onAbrirConexiones} className="mt-2">
                    Conectar mi IA ahora
                  </Boton>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-white/8 px-5 py-3">
          <Boton variante="fantasma" onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
            <ChevronLeft size={13} /> Atras
          </Boton>
          {paso < 2 ? (
            <Boton onClick={() => setPaso((p) => Math.min(2, p + 1))}>
              Continuar <ChevronRight size={13} />
            </Boton>
          ) : (
            <Boton onClick={() => void finalizar()} disabled={guardando}>
              {guardando ? 'Guardandoâ€¦' : 'Empezar'}
            </Boton>
          )}
        </footer>
      </div>
    </div>
  )
}
