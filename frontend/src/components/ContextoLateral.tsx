/** Barra lateral de contexto: que tienes hoy y que se avecina.
 *
 * Sirve para que el chat (que ahora ocupa el centro) no pierda de vista la
 * realidad de la agenda: se responde rapido y se ve el dia de un vistazo.
 */
import { useMemo } from 'react'
import { ArrowRight, CalendarCheck, Clock, ListTodo, Wallet } from 'lucide-react'
import { useLifeAgente } from '../store/useLifeAgente'
import { duracionLegible, etiquetaDia, hhmm, monto, mismoDia } from '../lib/format'
import { COLOR_EVENTO } from '../types'
import { Boton, Panel } from './ui'

export default function ContextoLateral({
  fecha, onVerAgenda,
}: {
  fecha: Date
  /** Opcional: si no se pasa, no se muestra el boton de ir a la agenda. */
  onVerAgenda?: () => void
}) {
  const eventos = useLifeAgente((s) => s.eventos)
  const dashboard = useLifeAgente((s) => s.dashboard)
  const tareas = useLifeAgente((s) => s.tareas)

  const deHoy = useMemo(
    () => eventos.filter((e) => mismoDia(e.inicio, fecha)).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [eventos, fecha],
  )
  const minutos = deHoy.reduce((acc, e) => acc + Math.max(0, e.duracion_min), 0)

  const proximas = useMemo(
    () =>
      tareas
        .filter((t) => t.estado !== 'completada' && t.fecha_entrega)
        .sort((a, b) => (a.fecha_entrega ?? '').localeCompare(b.fecha_entrega ?? ''))
        .slice(0, 4),
    [tareas],
  )

  return (
    <>
      <Panel titulo="Hoy" icono={<CalendarCheck size={13} className="text-emerald-400" />}>
        {deHoy.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-slate-500">
            Dia libre. Dile al agente que tienes y el lo acomoda.
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Clock size={11} />
              {etiquetaDia(fecha)} · {deHoy.length} {deHoy.length === 1 ? 'bloque' : 'bloques'} ·{' '}
              {duracionLegible(minutos)}
            </div>
            <ul className="space-y-1.5">
              {deHoy.slice(0, 6).map((e) => {
                const color = COLOR_EVENTO[e.categoria] ?? COLOR_EVENTO.personal
                return (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${color.punto}`} />
                    <span className="w-[38px] shrink-0 text-[10px] tabular-nums text-slate-500">
                      {hhmm(e.inicio)}
                    </span>
                    <span className="truncate text-[11px] text-slate-300">{e.titulo}</span>
                    {e.inamovible && (
                      <span className="ml-auto shrink-0 text-[9px] text-slate-600">fijo</span>
                    )}
                  </li>
                )
              })}
              {deHoy.length > 6 && (
                <li className="text-[10px] text-slate-600">+{deHoy.length - 6} mas</li>
              )}
            </ul>
          </>
        )}
      </Panel>

      <Panel titulo="Entregas próximas" icono={<ListTodo size={13} className="text-violet-400" />}>
        {proximas.length === 0 ? (
          <p className="text-[11px] text-slate-500">Sin entregas pendientes.</p>
        ) : (
          <ul className="space-y-1.5">
            {proximas.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="truncate text-[11px] text-slate-300">{t.titulo}</span>
                <span className="ml-auto shrink-0 text-[10px] text-slate-500">
                  {t.fecha_entrega}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {dashboard && (
        <Panel titulo="Este mes" icono={<Wallet size={13} className="text-amber-400" />}>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Gasto</span>
              <span className="font-semibold text-amber-300">
                {monto(dashboard.gasto_mes.total, dashboard.gasto_mes.moneda)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tareas pendientes</span>
              <span className="font-semibold text-violet-300">{dashboard.tareas_pendientes}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tiempo productivo</span>
              <span className="font-semibold text-indigo-300">
                {duracionLegible(dashboard.carga.minutos_productivos)}
              </span>
            </div>
          </div>
        </Panel>
      )}

      {onVerAgenda && (
        <Boton variante="secundario" onClick={onVerAgenda} className="w-full justify-center">
          <ArrowRight size={13} />
          Ver la agenda completa
        </Boton>
      )}
    </>
  )
}
