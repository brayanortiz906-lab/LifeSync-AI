/** Panel central: calendario/rutina del día con bloques de tiempo (día / semana / mes). */
import { useMemo, useState } from 'react'
import { CalendarRange, LayoutGrid, List, Rows3, Trash2, X } from 'lucide-react'
import { useLifeSync } from '../store/useLifeSync'
import {
  aFecha, duracionLegible, etiquetaDia, hhmm, HORA_FIN, HORA_INICIO, mismoDia,
} from '../lib/format'
import { COLOR_EVENTO } from '../types'
import type { Evento } from '../types'
import { Boton, Chip, Vacio } from './ui'

type Vista = 'dia' | 'semana' | 'mes'

const ALTO_HORA = 56      // px por hora en la vista día
const ALTO_HORA_COMPACTO = 22 // px por hora en la vista semana

export default function CalendarPanel({
  fecha, onCambiarFecha,
}: {
  fecha: Date
  onCambiarFecha: (d: Date) => void
}) {
  const eventos = useLifeSync((s) => s.eventos)
  const eliminarEvento = useLifeSync((s) => s.eliminarEvento)
  const [vista, setVista] = useState<Vista>('dia')
  const [seleccion, setSeleccion] = useState<Evento | null>(null)

  const delDia = useMemo(() => eventos.filter((e) => mismoDia(e.inicio, fecha)), [eventos, fecha])

  const inicioDia = new Date(fecha)
  inicioDia.setHours(0, 0, 0, 0)

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-900/60 shadow-xl shadow-black/30 backdrop-blur">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <CalendarRange size={15} className="text-indigo-400" />
          Mi rutina
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

      <div className="min-h-0 flex-1 overflow-auto">
        {vista === 'dia' && (
          <VistaDia
            fecha={fecha}
            eventos={delDia}
            onSeleccion={setSeleccion}
            onCambiarFecha={onCambiarFecha}
          />
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
/* Vista día                                                              */
/* --------------------------------------------------------------------- */
function VistaDia({
  fecha, eventos, onSeleccion, onCambiarFecha,
}: {
  fecha: Date
  eventos: Evento[]
  onSeleccion: (e: Evento) => void
  onCambiarFecha: (d: Date) => void
}) {
  const horas = useMemo(() => Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i), [])
  const ahora = new Date()
  const esHoy = ahora.toDateString() === fecha.toDateString()
  const minutoAhora = ahora.getHours() * 60 + ahora.getMinutes()
  const columnas = useMemo(() => calcularColumnas(eventos), [eventos])

  return (
    <div className="flex min-h-full">
      <div className="sticky left-0 z-10 w-14 shrink-0 bg-slate-900/90 backdrop-blur">
        {horas.map((h) => (
          <div key={h} style={{ height: ALTO_HORA }} className="flex justify-end pr-2 pt-0.5">
            <span className="text-[10px] tabular-nums text-slate-500">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
      </div>

      <div className="relative flex-1" style={{ height: horas.length * ALTO_HORA }}>
        {horas.map((h) => (
          <div
            key={h}
            style={{ height: ALTO_HORA }}
            className="border-b border-white/5 px-2 transition hover:bg-white/2"
          />
        ))}

        {eventos.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Vacio
              icono={<CalendarRange size={26} />}
              texto="Día libre por ahora"
              sub="Dile al agente «tengo una cita a las 3 PM» y acomodará tus bloques."
            />
          </div>
        )}

        {columnas.map(({ evento, izquierda, ancho }) => {
          const inicio = aFecha(evento.inicio)
          const fin = aFecha(evento.fin)
          const top = ((inicio.getHours() * 60 + inicio.getMinutes() - HORA_INICIO * 60) / 60) * ALTO_HORA
          const alto = Math.max(20, ((fin.getTime() - inicio.getTime()) / 3600000) * ALTO_HORA)
          const color = COLOR_EVENTO[evento.categoria] ?? COLOR_EVENTO.personal
          return (
            <button
              key={evento.id}
              onClick={() => onSeleccion(evento)}
              style={{ top, height: alto, left: `${izquierda * 100}%`, width: `${ancho * 100}%` }}
              className={`ls-block absolute overflow-hidden rounded-lg border px-2 py-1 text-left ${color.bloque} ${
                evento.inamovible ? 'ring-1 ring-white/25' : ''
              }`}
            >
              <div className="flex items-center gap-1 text-[11px] font-bold leading-tight">
                {!evento.inamovible && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />}
                <span className="truncate">{evento.titulo}</span>
              </div>
              {alto > 34 && (
                <div className="mt-0.5 text-[10px] leading-tight opacity-80">
                  {hhmm(evento.inicio)} – {hhmm(evento.fin)} · {duracionLegible(evento.duracion_min)}
                </div>
              )}
              {evento.inamovible && alto > 52 && (
                <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide opacity-70">
                  Inamovible
                </div>
              )}
            </button>
          )
        })}

        {esHoy && minutoAhora >= HORA_INICIO * 60 && minutoAhora <= HORA_FIN * 60 && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20 flex items-center gap-1"
            style={{ top: ((minutoAhora - HORA_INICIO * 60) / 60) * ALTO_HORA }}
          >
            <span className="h-2 w-2 rounded-full bg-rose-500 shadow" />
            <span className="h-px flex-1 bg-rose-500/70" />
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Vista semana                                                           */
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
    const diaSemana = (inicio.getDay() + 6) % 7 // lunes = 0
    inicio.setDate(inicio.getDate() - diaSemana)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicio)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [fecha])

  const altura = (HORA_FIN - HORA_INICIO) * ALTO_HORA_COMPACTO

  return (
    <div className="grid grid-cols-7 divide-x divide-white/5">
      {dias.map((d) => {
        const delDia = eventos.filter((e) => mismoDia(e.inicio, d))
        const esHoy = d.toDateString() === new Date().toDateString()
        return (
          <div key={d.toISOString()} className="min-w-0">
            <button
              onClick={() => onCambiarFecha(d)}
              className={`sticky top-0 z-10 w-full border-b border-white/8 px-2 py-2 text-left backdrop-blur ${
                esHoy ? 'bg-indigo-500/15' : 'bg-slate-900/90'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                {d.toLocaleDateString('es-CO', { weekday: 'short' })}
              </div>
              <div className={`text-sm font-bold ${esHoy ? 'text-indigo-300' : 'text-slate-200'}`}>
                {d.getDate()}
              </div>
            </button>
            <div className="relative" style={{ height: altura }}>
              {Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => (
                <div key={i} style={{ height: ALTO_HORA_COMPACTO }} className="border-b border-white/4" />
              ))}
              {delDia.map((e) => {
                const inicio = aFecha(e.inicio)
                const fin = aFecha(e.fin)
                const top = ((inicio.getHours() * 60 + inicio.getMinutes() - HORA_INICIO * 60) / 60) * ALTO_HORA_COMPACTO
                const alto = Math.max(14, ((fin.getTime() - inicio.getTime()) / 3600000) * ALTO_HORA_COMPACTO)
                const color = COLOR_EVENTO[e.categoria] ?? COLOR_EVENTO.personal
                return (
                  <button
                    key={e.id}
                    onClick={() => onSeleccion(e)}
                    style={{ top, height: alto }}
                    className={`ls-block absolute inset-x-0.5 overflow-hidden rounded border-l-2 px-1 text-left text-[9px] leading-tight ${color.bloque}`}
                  >
                    <span className="font-semibold">{hhmm(e.inicio)}</span>{' '}
                    <span className="opacity-80">{e.titulo}</span>
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
/* Vista mes                                                              */
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

  const etiquetas = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-white/8">
        {etiquetas.map((e) => (
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
          return (
            <button
              key={d.toISOString()}
              onClick={() => onCambiarFecha(d)}
              className={`min-h-[92px] border-b border-r border-white/5 p-1 text-left transition hover:bg-white/4 ${
                delMes ? 'bg-transparent' : 'bg-slate-950/40 opacity-45'
              }`}
            >
              <div
                className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  esHoy ? 'bg-indigo-500 text-white' : delMes ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {delDia.slice(0, 3).map((e) => {
                  const color = COLOR_EVENTO[e.categoria] ?? COLOR_EVENTO.personal
                  return (
                    <div
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onSeleccion(e)
                      }}
                      className={`truncate rounded px-1 py-0.5 text-[9px] font-medium ${color.bloque}`}
                    >
                      {hhmm(e.inicio)} {e.titulo}
                    </div>
                  )
                })}
                {delDia.length > 3 && (
                  <div className="px-1 text-[9px] text-slate-500">+{delDia.length - 3} más</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Detalle                                                                */
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
              <Chip className="bg-rose-500/15 text-rose-300 ring-rose-500/30">inamovible</Chip>
            )}
            <Chip className="bg-white/5 text-slate-400 ring-white/10">origen: {evento.fuente}</Chip>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {hhmm(evento.inicio)} – {hhmm(evento.fin)} · {duracionLegible(evento.duracion_min)}
          </p>
          {evento.notas && <p className="mt-1 text-xs text-slate-500">{evento.notas}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Boton variante="peligro" onClick={onEliminar}>
            <Trash2 size={13} />
          </Boton>
          <Boton variante="fantasma" onClick={onCerrar}>
            <X size={14} />
          </Boton>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Cálculo de columnas para eventos solapados                             */
/* --------------------------------------------------------------------- */
function calcularColumnas(eventos: Evento[]): Array<{ evento: Evento; izquierda: number; ancho: number }> {
  const ordenados = [...eventos].sort((a, b) => a.inicio.localeCompare(b.inicio))
  const resultado: Array<{ evento: Evento; izquierda: number; ancho: number }> = []
  let grupo: Evento[] = []
  let finGrupo = 0

  const cerrarGrupo = () => {
    if (!grupo.length) return
    const columnas: Evento[][] = []
    for (const ev of grupo) {
      const inicio = aFecha(ev.inicio).getTime()
      let colocada = false
      for (const col of columnas) {
        const ultimo = col[col.length - 1]
        if (aFecha(ultimo.fin).getTime() <= inicio) {
          col.push(ev)
          colocada = true
          break
        }
      }
      if (!colocada) columnas.push([ev])
    }
    const total = columnas.length
    columnas.forEach((col, i) => {
      for (const ev of col) {
        resultado.push({ evento: ev, izquierda: i / total, ancho: 1 / total })
      }
    })
    grupo = []
  }

  for (const ev of ordenados) {
    const inicio = aFecha(ev.inicio).getTime()
    if (grupo.length && inicio >= finGrupo) {
      cerrarGrupo()
    }
    grupo.push(ev)
    finGrupo = Math.max(finGrupo, aFecha(ev.fin).getTime())
  }
  cerrarGrupo()
  return resultado
}
