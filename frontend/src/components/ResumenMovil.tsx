/**
 * Resumen movil: las tres lineas que resumen tu dia cuando la pantalla
 * es pequeña y no cabe todo.
 *
 * En pantallas grandes esto no se ve: ahi la agenda usa las tres columnas.
 */
import { ChevronUp, Clock, Wallet } from 'lucide-react'
import { useLifeAgente } from '../store/useLifeAgente'
import { duracionLegible, monto, mismoDia } from '../lib/format'

/** Calcula las tres lineas de resumen con los datos que haya. */
export function useResumen() {
  const dashboard = useLifeAgente((s) => s.dashboard)
  const eventos = useLifeAgente((s) => s.eventos)
  const tareas = useLifeAgente((s) => s.tareas)
  const registros = useLifeAgente((s) => s.registros)
  const mantenimiento = useLifeAgente((s) => s.mantenimiento)

  const hoy = new Date()
  const eventosHoy = eventos.filter((e) => mismoDia(e.inicio, hoy))
  const minutos = eventosHoy.reduce((suma, e) => {
    const fin = e.fin ? new Date(e.fin) : null
    if (!fin) return suma
    return suma + Math.max(0, Math.round((fin.getTime() - new Date(e.inicio).getTime()) / 60000))
  }, 0)

  const pendientes = tareas.filter((t) => t.estado !== 'completada')
  const proxima = [...pendientes]
    .filter((t) => t.fecha_entrega)
    .sort((a, b) => (a.fecha_entrega ?? '').localeCompare(b.fecha_entrega ?? ''))[0]

  const gastoMes = registros.reduce((suma, r) => suma + (r.monto ?? 0), 0)
  const moneda = dashboard?.gasto_mes.moneda ?? 'COP'

  return {
    bloques: dashboard?.carga.total_bloques ?? eventosHoy.length,
    minutos: dashboard?.carga.minutos_productivos ?? minutos,
    tareasPendientes: dashboard?.tareas_pendientes ?? pendientes.length,
    proximaEntrega: dashboard?.proximas_entregas?.[0] ?? proxima ?? null,
    gastoTotal: dashboard?.gasto_mes.total ?? gastoMes,
    moneda,
    mantenimientos: dashboard?.mantenimiento.length ?? mantenimiento.length,
    mantenimientoProximo: dashboard?.mantenimiento?.[0] ?? null,
  }
}

/** Las tres lineas (texto plano, sin iconos) para reutilizar en otros sitios. */
export function lineasResumen(resumen: ReturnType<typeof useResumen>): string[] {
  const lineas: string[] = []

  lineas.push(
    `Hoy: ${resumen.bloques} bloque${resumen.bloques === 1 ? '' : 's'} · ${duracionLegible(resumen.minutos)} ocupadas`,
  )

  if (resumen.proximaEntrega) {
    const entrega = resumen.proximaEntrega
    const cuando = entrega.fecha_entrega ? ` · ${entrega.fecha_entrega}` : ''
    lineas.push(
      `${resumen.tareasPendientes} tarea${resumen.tareasPendientes === 1 ? '' : 's'} pendiente${resumen.tareasPendientes === 1 ? '' : 's'} · próxima: ${entrega.titulo}${cuando}`,
    )
  } else {
    lineas.push(`${resumen.tareasPendientes} tarea${resumen.tareasPendientes === 1 ? '' : 's'} pendiente${resumen.tareasPendientes === 1 ? '' : 's'}`)
  }

  lineas.push(
    `${monto(resumen.gastoTotal, resumen.moneda)} del mes · ${resumen.mantenimientos} mantenimiento${resumen.mantenimientos === 1 ? '' : 's'}`,
  )

  return lineas
}

export default function ResumenMovil({ onAbrirMas }: { onAbrirMas: () => void }) {
  const resumen = useResumen()
  const lineas = lineasResumen(resumen)

  return (
    <section className="ls-card space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="ls-label">Tu día de un vistazo</h2>
        <span className="text-[10px] text-slate-500">3 líneas</span>
      </div>

      <ul className="space-y-1.5">
        <li className="flex items-start gap-2 text-[12px] leading-snug text-slate-200">
          <Clock size={13} className="mt-0.5 shrink-0 text-indigo-400" />
          <span>{lineas[0]}</span>
        </li>
        <li className="flex items-start gap-2 text-[12px] leading-snug text-slate-200">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
          <span>{lineas[1]}</span>
        </li>
        <li className="flex items-start gap-2 text-[12px] leading-snug text-slate-200">
          <Wallet size={13} className="mt-0.5 shrink-0 text-emerald-400" />
          <span>{lineas[2]}</span>
        </li>
      </ul>

      <button
        onClick={onAbrirMas}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-slate-200 transition hover:bg-white/10"
      >
        <ChevronUp size={14} />
        Ver todo lo demás (tareas, dinero, ajustes)
      </button>

      {resumen.mantenimientoProximo?.proxima_fecha && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          Próximo mantenimiento: {resumen.mantenimientoProximo.tarea} ({resumen.mantenimientoProximo.proxima_fecha})
        </p>
      )}
    </section>
  )
}
