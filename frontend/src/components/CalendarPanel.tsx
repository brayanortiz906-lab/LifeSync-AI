/** Panel central: calendario / rutina del dia.
 *
 * DISENO: en vez de una rejilla de horas "pixel" (dificil de leer y facil de
 * malinterpretar), el dia se presenta como una LINEA DE TIEMPO CLARA:
 *   - Cada bloque es una tarjeta con hora grande, duracion explicita y color
 *     por categoria.
 *   - Los huecos libres se muestran explicitamente ("Libre 1h 20m"), para que
 *     se entienda de un vistazo donde hay espacio.
 *   - Los bloques que se cruzan se agrupan y se avisan con un rotulo claro
 *     ("Se cruza con..."), en vez de solaparse visualmente.
 *   - Leyenda de colores siempre visible.
 * La vista Semana es una tabla de 7 dias con bloques apilados (sin solapes
 * visuales); la vista Mes es un calendario con puntos de color por dia.
 */
import { useMemo, useState } from 'react'
import {
  AlarmClock, CalendarRange, Clock, Info, LayoutGrid, List, Rows3,
  TriangleAlert, Trash2, X,
} from 'lucide-react'
import { useLifeAgente } from '../store/useLifeAgente'
import {
  aFecha, duracionLegible, etiquetaDia, hhmm, HORA_FIN, HORA_INICIO, mismoDia,
} from '../lib/format'
import { COLOR_EVENTO } from '../types'
import type { Evento, OrdenEventos } from '../types'
import { PLANTILLAS } from '../lib/plantillas'
import { Boton, Chip, Vacio } from './ui'

type Vista = 'dia' | 'semana' | 'mes'

const ETIQUETAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Franjas del dia: cada bloque se muestra en su franja con su hora exacta. */
const FRANJAS = [
  { id: 'manana', titulo: 'Mañana', desde: 0, hasta: 12 },
  { id: 'tarde', titulo: 'Tarde', desde: 12, hasta: 18 },
  { id: 'noche', titulo: 'Noche', desde: 18, hasta: 24 },
]

export default function CalendarPanel({
  fecha, onCambiarFecha,
}: {
  fecha: Date
  onCambiarFecha: (d: Date) => void
}) {
  const eventos = useLifeAgente((s) => s.eventos)
  const eliminarEvento = useLifeAgente((s) => s.eliminarEvento)
  const ajustes = useLifeAgente((s) => s.ajustes)
  const guardarAjustes = useLifeAgente((s) => s.guardarAjustes)
  const [vista, setVista] = useState<Vista>('dia')
  const [seleccion, setSeleccion] = useState<Evento | null>(null)
  const [categoria, setCategoria] = useState<string | null>(null)
  const [soloFijos, setSoloFijos] = useState(false)

  const modo = ajustes?.orden_eventos ?? 'hora'

  const categorias = useMemo(
    () => [
      ...new Set(
        eventos.filter((e) => mismoDia(e.inicio, fecha)).map((e) => e.categoria),
      ),
    ],
    [eventos, fecha],
  )

  const delDia = useMemo(() => {
    let lista = eventos.filter((e) => mismoDia(e.inicio, fecha))
    if (categoria) lista = lista.filter((e) => e.categoria === categoria)
    if (soloFijos) lista = lista.filter((e) => e.inamovible)
    const copia = [...lista]
    if (modo === 'categoria') {
      copia.sort(
        (a, b) =>
          (a.categoria ?? '').localeCompare(b.categoria ?? '') ||
          a.inicio.localeCompare(b.inicio),
      )
    } else if (modo === 'duracion') {
      copia.sort((a, b) => (b.duracion_min ?? 0) - (a.duracion_min ?? 0))
    } else {
      copia.sort((a, b) => a.inicio.localeCompare(b.inicio))
    }
    return copia
  }, [eventos, fecha, categoria, soloFijos, modo])

  return (
    <section className="flex min-h-0 flex-col overflow-visible rounded-2xl border border-white/8 bg-slate-900/60 shadow-xl shadow-black/30 backdrop-blur lg:flex-1 lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-white/8 px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <CalendarRange size={15} className="text-indigo-400" />
          Mi agenda
        </div>
        <span className="text-xs text-slate-500">{etiquetaDia(fecha)}</span>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/4 p-0.5">
          {([
            ['dia', 'Día', Rows3],
            ['semana', 'Semana', List],
            ['mes', 'Mes', LayoutGrid],
          ] as const).map(([v, label, Icono]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                vista === v ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
              }`}
            >
              <Icono size={12} />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Filtros y formas de ordenar lo que se ve */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/8 px-5 py-2.5">
        <Chip
          onClick={() => setCategoria(null)}
          className={
            categoria === null
              ? 'cursor-pointer bg-indigo-500/20 text-indigo-300 ring-indigo-500/40'
              : 'cursor-pointer bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10'
          }
        >
          Todas
        </Chip>
        {categorias.map((c) => (
          <Chip
            key={c}
            onClick={() => setCategoria(categoria === c ? null : c)}
            className={
              categoria === c
                ? 'cursor-pointer bg-indigo-500/20 text-indigo-300 ring-indigo-500/40'
                : 'cursor-pointer bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10'
            }
          >
            {c}
          </Chip>
        ))}
        <Chip
          onClick={() => setSoloFijos((v) => !v)}
          className={
            soloFijos
              ? 'cursor-pointer bg-amber-500/20 text-amber-300 ring-amber-500/40'
              : 'cursor-pointer bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10'
          }
        >
          solo fijos
        </Chip>
        <select
          value={modo}
          onChange={(e) => void guardarAjustes({ orden_eventos: e.target.value as OrdenEventos })}
          title="Como ordenar los bloques del día"
          className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-300 outline-none hover:bg-white/10"
        >
          <option value="hora">Orden: hora</option>
          <option value="categoria">Orden: categoria</option>
          <option value="duracion">Orden: duracion</option>
        </select>
      </div>

      {/* En movil el calendario crece con su contenido (la pagina hace un
          solo scroll, sin scrolls anidados que roben el gesto); en escritorio
          el panel tiene altura fija y scrollea por dentro. */}
      <div className="flex-none overflow-visible lg:min-h-0 lg:flex-1 lg:overflow-auto">
        {vista === 'dia' && (
          <VistaDia fecha={fecha} eventos={delDia} onSeleccion={setSeleccion} />
        )}
        {vista === 'semana' && (
          <VistaSemana
            fecha={fecha}
            eventos={eventos}
            onSeleccion={setSeleccion}
            onCambiarFecha={onCambiarFecha}
          />
        )}
        {vista === 'mes' && (
          <VistaMes
            fecha={fecha}
            eventos={eventos}
            onSeleccion={setSeleccion}
            onCambiarFecha={onCambiarFecha}
          />
        )}
      </div>

      {vista === 'dia' && <Leyenda />}

      {seleccion && (
        <DetalleEvento
          evento={seleccion}
          onCerrar={() => setSeleccion(null)}
          onEliminar={async () => {
            await eliminarEvento(seleccion.id)
            setSeleccion(null)
          }}
        />
      )}
    </section>
  )
}

/* --------------------------------------------------------------------- */
/* Leyenda: que significa cada color                                      */
/* --------------------------------------------------------------------- */
function Leyenda() {
  const items = [
    ['clase', 'Clase / estudio'],
    ['trabajo', 'Trabajo'],
    ['personal', 'Personal'],
    ['descanso', 'Descanso'],
    ['salud', 'Salud'],
    ['social', 'Social'],
  ]
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/8 bg-slate-950/40 px-5 py-2.5">
      {items.map(([cat, texto]) => {
        const color = COLOR_EVENTO[cat]
        return (
          <span key={cat} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className={`h-2 w-2 rounded-full ${color.punto}`} />
            {texto}
          </span>
        )
      })}
      <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <span className="h-2 w-2 rounded-full border border-white/50 bg-transparent" />
        Inamovible (no se mueve)
      </span>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Vista dia: franjas + tarjetas + huecos libres explicitos               */
/* --------------------------------------------------------------------- */
function VistaDia({
  fecha, eventos, onSeleccion,
}: {
  fecha: Date
  eventos: Evento[]
  onSeleccion: (e: Evento) => void
}) {
  const ahora = new Date()
  const esHoy = ahora.toDateString() === fecha.toDateString()
  const cargarPlantilla = useLifeAgente((s) => s.cargarPlantilla)

  const grupos = useMemo(() => {
    const positivos = eventos.filter((e) => aFecha(e.fin).getTime() > aFecha(e.inicio).getTime())
    const sinFin = eventos.filter((e) => aFecha(e.fin).getTime() <= aFecha(e.inicio).getTime())
    return { positivos, sinFin }
  }, [eventos])

  if (eventos.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-6">
        <Vacio
          icono={<CalendarRange size={26} />}
          texto="No hay nada agendado para este día"
          sub='Dile al agente "tengo una cita hoy a las 3 PM" y el bloque aparecera aquí, ya acomodado.'
        />
        {/* Atajo a lo local: plantillas y motor de reglas, sin salir de la vista. */}
        <div className="w-full max-w-md rounded-2xl border border-white/8 bg-white/3 p-3">
          <div className="ls-label mb-1.5">O empieza con algo listo</div>
          <div className="flex flex-wrap gap-1.5">
            {PLANTILLAS.map((p) => (
              <button
                key={p.id}
                onClick={() => cargarPlantilla(p.id)}
                title={p.para}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
              >
                {p.icono} {p.nombre}
              </button>
            ))}
          </div>
          <p className="ls-hint mt-2">
            Se guardan en este navegador (modo local). Si prefieres la nube, entra con tu cuenta
            desde el boton «Acceder».
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {/* Resumen claro del dia */}
      <ResumenDia eventos={eventos} />

      {FRANJAS.map((franja) => {
        const enFranja = grupos.positivos.filter((e) => {
          const h = aFecha(e.inicio).getHours()
          return h >= franja.desde && h < franja.hasta
        })
        const cruza = grupos.sinFin.filter((e) => {
          const h = aFecha(e.inicio).getHours()
          return h >= franja.desde && h < franja.hasta
        })
        const todos = [...enFranja, ...cruza]
        if (todos.length === 0) return null

        return (
          <section key={franja.id}>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {franja.titulo}
              <span className="h-px flex-1 bg-white/8" />
            </h3>
            <div className="space-y-2.5">
              {todos.map((e) => (
                <TarjetaEvento
                  key={e.id}
                  evento={e}
                  eventos={eventos}
                  esHoy={esHoy}
                  ahora={ahora}
                  onSeleccion={onSeleccion}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Resumen: cuantas cosas y cuanto tiempo ocupado (informacion sin ambiguedad). */
function ResumenDia({ eventos }: { eventos: Evento[] }) {
  const minutos = eventos.reduce((acc, e) => acc + Math.max(0, e.duracion_min), 0)
  const cruzados = eventos.filter((e) => tieneCruce(e, eventos)).length
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
        <div className="text-lg font-bold leading-none text-white">{eventos.length}</div>
        <div className="mt-0.5 text-[10px] text-slate-400">
          {eventos.length === 1 ? 'bloque agendado' : 'bloques agendados'}
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
        <div className="text-lg font-bold leading-none text-indigo-300">{duracionLegible(minutos)}</div>
        <div className="mt-0.5 text-[10px] text-slate-400">de tiempo ocupado</div>
      </div>
      <div
        className={`rounded-xl border px-3 py-2 ${
          cruzados > 0
            ? 'border-rose-500/30 bg-rose-500/10'
            : 'border-white/8 bg-white/4'
        }`}
      >
        <div className={`text-lg font-bold leading-none ${cruzados > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
          {cruzados}
        </div>
        <div className="mt-0.5 text-[10px] text-slate-400">
          {cruzados > 0 ? 'bloques que se cruzan' : 'sin cruces'}
        </div>
      </div>
    </div>
  )
}

/** Tarjeta de un bloque: hora grande, duracion, categoria y aviso de cruce. */
function TarjetaEvento({
  evento, eventos, esHoy, ahora, onSeleccion,
}: {
  evento: Evento
  eventos: Evento[]
  esHoy: boolean
  ahora: Date
  onSeleccion: (e: Evento) => void
}) {
  const color = COLOR_EVENTO[evento.categoria] ?? COLOR_EVENTO.personal
  const inicio = aFecha(evento.inicio)
  const fin = aFecha(evento.fin)
  const enCurso = esHoy && ahora >= inicio && ahora < fin
  const cruzados = eventos.filter((o) => o.id !== evento.id && seCruzan(evento, o))
  // Títulos únicos: si 5 bloques se cruzan con el mismo título, se dice una vez.
  const titulosCruce = Array.from(new Set(cruzados.map((c) => c.titulo)))
  const otrosCruces = titulosCruce.length - 1

  return (
    <button
      onClick={() => onSeleccion(evento)}
      className={`ls-block flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:brightness-110 ${
        enCurso ? 'border-emerald-400/50 ring-1 ring-emerald-400/30' : ''
      } ${color.bloque}`}
    >
      <div className="w-[72px] shrink-0 text-right">
        <div className="text-base font-bold leading-none tabular-nums">{hhmm(evento.inicio)}</div>
        <div className="mt-0.5 text-[10px] opacity-75 tabular-nums">{hhmm(evento.fin)}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{evento.titulo}</span>
          {evento.inamovible && (
            <Chip className="bg-black/25 text-white/90 ring-white/25">fijo</Chip>
          )}
          {enCurso && (
            <Chip className="bg-emerald-500/25 text-emerald-100 ring-emerald-400/40">ahora</Chip>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] opacity-80">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {duracionLegible(evento.duracion_min)}
          </span>
          <span>{evento.categoria}</span>
        </div>
        {titulosCruce.length > 0 && (
          <div className="mt-1.5 flex items-start gap-1 rounded-lg bg-rose-500/20 px-2 py-1 text-[10px] font-semibold text-rose-100">
            <TriangleAlert size={11} className="mt-0.5 shrink-0" />
            <span>
              Se cruza con: {titulosCruce[0]}
              {otrosCruces > 0 && (
                <span className="font-normal opacity-90">
                  {' '}
                  y {otrosCruces} {otrosCruces === 1 ? 'bloque más' : 'bloques más'}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

/* --------------------------------------------------------------------- */
/* Vista semana: 7 columnas con bloques apilados                           */
/* --------------------------------------------------------------------- */
function VistaSemana({
  fecha, eventos, onSeleccion, onCambiarFecha,
}: {
  fecha: Date
  eventos: Evento[]
  onSeleccion: (e: Evento) => void
  onCambiarFecha: (d: Date) => void
}) {
  const dias = useMemo(() => {
    const inicio = new Date(fecha)
    const diaSemana = (inicio.getDay() + 6) % 7
    inicio.setDate(inicio.getDate() - diaSemana)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicio)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [fecha])

  return (
    <div className="grid grid-cols-1 divide-y divide-white/5 sm:grid-cols-2 lg:grid-cols-7 lg:divide-x lg:divide-y-0">
      {dias.map((d) => {
        const delDia = eventos
          .filter((e) => mismoDia(e.inicio, d))
          .sort((a, b) => a.inicio.localeCompare(b.inicio))
        const esHoy = d.toDateString() === new Date().toDateString()
        const minutos = delDia.reduce((acc, e) => acc + Math.max(0, e.duracion_min), 0)
        return (
          <div key={d.toISOString()} className="min-w-0 p-2">
            <button
              onClick={() => onCambiarFecha(d)}
              className={`mb-2 w-full rounded-lg border px-2 py-1.5 text-left transition ${
                esHoy
                  ? 'border-indigo-500/50 bg-indigo-500/15'
                  : 'border-white/8 bg-white/3 hover:bg-white/8'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {d.toLocaleDateString('es-CO', { weekday: 'short' })}
                </span>
                <span className={`text-sm font-bold ${esHoy ? 'text-indigo-300' : 'text-slate-200'}`}>
                  {d.getDate()}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                {delDia.length === 0 ? 'libre' : `${delDia.length} · ${duracionLegible(minutos)}`}
              </div>
            </button>

            <div className="space-y-1.5">
              {delDia.map((e) => {
                const color = COLOR_EVENTO[e.categoria] ?? COLOR_EVENTO.personal
                return (
                  <button
                    key={e.id}
                    onClick={() => onSeleccion(e)}
                    className={`ls-block w-full rounded-lg border-l-[3px] px-2 py-1.5 text-left ${color.bloque}`}
                  >
                    <div className="text-[10px] font-bold tabular-nums opacity-80">{hhmm(e.inicio)}</div>
                    <div className="truncate text-[11px] font-semibold">{e.titulo}</div>
                    <div className="truncate text-[9px] opacity-70">{duracionLegible(e.duracion_min)}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Vista mes: puntos de color + detalle al elegir dia                     */
/* --------------------------------------------------------------------- */
function VistaMes({
  fecha, eventos, onSeleccion, onCambiarFecha,
}: {
  fecha: Date
  eventos: Evento[]
  onSeleccion: (e: Evento) => void
  onCambiarFecha: (d: Date) => void
}) {
  const celdas = useMemo(() => {
    const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1)
    const offset = (inicio.getDay() + 6) % 7
    const primer = new Date(inicio)
    primer.setDate(primer.getDate() - offset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(primer)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [fecha])

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-white/8">
        {ETIQUETAS.map((e) => (
          <div key={e} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {e}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {celdas.map((d) => {
          const delDia = eventos.filter((e) => mismoDia(e.inicio, d))
          const delMes = d.getMonth() === fecha.getMonth()
          const esHoy = d.toDateString() === new Date().toDateString()
          const categorias = [...new Set(delDia.map((e) => e.categoria))]
          return (
            <button
              key={d.toISOString()}
              onClick={() => onCambiarFecha(d)}
              className={`min-h-[74px] border-b border-r border-white/5 p-1.5 text-left transition hover:bg-white/5 ${
                delMes ? '' : 'opacity-40'
              }`}
            >
              <div
                className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  esHoy ? 'bg-indigo-500 text-white' : delMes ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {d.getDate()}
              </div>
              <div className="flex flex-wrap gap-0.5">
                {categorias.slice(0, 4).map((c) => {
                  const color = COLOR_EVENTO[c] ?? COLOR_EVENTO.personal
                  return <span key={c} className={`h-1.5 w-1.5 rounded-full ${color.punto}`} />
                })}
              </div>
              {delDia.length > 0 && (
                <div className="mt-0.5 text-[9px] text-slate-500">
                  {delDia.length} {delDia.length === 1 ? 'bloque' : 'bloques'}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Detalle del dia elegido: la lista real, sin ambiguedad */}
      <div className="border-t border-white/8 p-3">
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {etiquetaDia(fecha)}
        </h4>
        {eventos.filter((e) => mismoDia(e.inicio, fecha)).length === 0 ? (
          <p className="text-[11px] text-slate-500">Dia libre.</p>
        ) : (
          <div className="space-y-1.5">
            {eventos
              .filter((e) => mismoDia(e.inicio, fecha))
              .sort((a, b) => a.inicio.localeCompare(b.inicio))
              .map((e) => {
                const color = COLOR_EVENTO[e.categoria] ?? COLOR_EVENTO.personal
                return (
                  <button
                    key={e.id}
                    onClick={() => onSeleccion(e)}
                    className={`ls-block flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${color.bloque}`}
                  >
                    <span className="text-[11px] font-bold tabular-nums">{hhmm(e.inicio)}</span>
                    <span className="truncate text-[11px] font-semibold">{e.titulo}</span>
                    <span className="ml-auto text-[10px] opacity-75">{duracionLegible(e.duracion_min)}</span>
                  </button>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Detalle del evento                                                     */
/* --------------------------------------------------------------------- */
function DetalleEvento({
  evento, onCerrar, onEliminar,
}: {
  evento: Evento
  onCerrar: () => void
  onEliminar: () => void
}) {
  const color = COLOR_EVENTO[evento.categoria] ?? COLOR_EVENTO.personal
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-900/95 p-4 backdrop-blur">
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${color.punto}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-white">{evento.titulo}</h3>
            <Chip className={color.chip}>{evento.categoria}</Chip>
            {evento.inamovible && (
              <Chip className="bg-rose-500/15 text-rose-300 ring-rose-500/30">fijo</Chip>
            )}
            <Chip className="bg-white/5 text-slate-400 ring-white/10">origen: {evento.fuente}</Chip>
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
            <AlarmClock size={12} />
            {hhmm(evento.inicio)} â€“ {hhmm(evento.fin)} · {duracionLegible(evento.duracion_min)}
          </p>
          {evento.notas && <p className="mt-1 text-xs text-slate-500">{evento.notas}</p>}
          {evento.inamovible && (
            <p className="mt-1 flex items-start gap-1 text-[10px] text-slate-500">
              <Info size={10} className="mt-0.5 shrink-0" />
              Este bloque es fijo: el agente nunca lo movera.
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Boton variante="peligro" onClick={onEliminar} titulo="Eliminar bloque">
            <Trash2 size={13} />
          </Boton>
          <Boton variante="fantasma" onClick={onCerrar} titulo="Cerrar">
            <X size={14} />
          </Boton>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Utilidades de cruce                                                    */
/* --------------------------------------------------------------------- */
function seCruzan(a: Evento, b: Evento): boolean {
  const aIni = aFecha(a.inicio).getTime()
  const aFin = aFecha(a.fin).getTime()
  const bIni = aFecha(b.inicio).getTime()
  const bFin = aFecha(b.fin).getTime()
  return aIni < bFin && bIni < aFin
}

function tieneCruce(e: Evento, todos: Evento[]): boolean {
  return todos.some((o) => o.id !== e.id && seCruzan(e, o))
}
