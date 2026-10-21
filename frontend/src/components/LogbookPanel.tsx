/** Panel derecho (inferior): bitácora, gastos y mantenimiento. */
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Receipt, TrendingUp, Wrench } from 'lucide-react'
import { useLifeSync } from '../store/useLifeSync'
import { aIso, fechaCorta, monto } from '../lib/format'
import { COLOR_GASTO, type CategoriaGasto, type OrdenGastos } from '../types'
import { Boton, Chip, Panel, Vacio } from './ui'

export default function LogbookPanel() {
  const registros = useLifeSync((s) => s.registros)
  const dashboard = useLifeSync((s) => s.dashboard)
  const mantenimiento = useLifeSync((s) => s.mantenimiento)
  const crearRegistro = useLifeSync((s) => s.crearRegistro)
  const ajustes = useLifeSync((s) => s.ajustes)
  const guardarAjustes = useLifeSync((s) => s.guardarAjustes)

  const modo = ajustes?.orden_gastos ?? 'fecha'
  const registrosOrdenados = useMemo(() => {
    const copia = [...registros]
    if (modo === 'monto') {
      copia.sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0))
    } else if (modo === 'categoria') {
      copia.sort(
        (a, b) =>
          (a.categoria ?? '').localeCompare(b.categoria ?? '') ||
          (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0),
      )
    } else {
      copia.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    }
    return copia
  }, [registros, modo])
  const completarMantenimiento = useLifeSync((s) => s.completarMantenimiento)

  const [descripcion, setDescripcion] = useState('')
  const [montoValor, setMontoValor] = useState('')
  const [categoria, setCategoria] = useState<CategoriaGasto>('otro')
  const [guardando, setGuardando] = useState(false)

  const total = dashboard?.gasto_mes.total ?? 0
  const moneda = dashboard?.gasto_mes.moneda ?? 'COP'
  const porCategoria = dashboard?.gasto_mes.por_categoria ?? {}

  const maxCat = useMemo(
    () => Math.max(1, ...Object.values(porCategoria).map((v) => Math.abs(v))),
    [porCategoria],
  )

  const guardar = async () => {
    if (!descripcion.trim()) return
    setGuardando(true)
    try {
      await crearRegistro({
        descripcion: descripcion.trim(),
        monto: montoValor ? Number(montoValor) : null,
        moneda,
        categoria,
        fecha: aIso(new Date()),
      })
      setDescripcion('')
      setMontoValor('')
      setCategoria('otro')
    } finally {
      setGuardando(false)
    }
  }

  const vencidos = mantenimiento.filter((m) => m.vencido)

  return (
    <Panel
      titulo={
        <>
          <Receipt size={15} className="text-orange-400" />
          Bitácora y gastos
        </>
      }
      acciones={
        <Chip className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">
          <TrendingUp size={11} />
          {monto(total, moneda)}
        </Chip>
      }
      cuerpoClass="overflow-y-auto"
    >
      {/* Registro rápido */}
      <div className="space-y-2 border-b border-white/8 p-3">
        <div className="flex gap-2">
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && guardar()}
            placeholder="Ej: Tanqueé la moto"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
          />
          <input
            value={montoValor}
            onChange={(e) => setMontoValor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && guardar()}
            placeholder="$"
            inputMode="numeric"
            className="w-20 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
          />
          <Boton onClick={guardar} disabled={guardando || !descripcion.trim()}>
            <Plus size={13} />
          </Boton>
        </div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(COLOR_GASTO) as CategoriaGasto[]).map((c) => (
            <Chip
              key={c}
              onClick={() => setCategoria(c)}
              className={
                categoria === c
                  ? `cursor-pointer ${COLOR_GASTO[c]} ring-1 ring-white/25`
                  : 'cursor-pointer bg-white/4 text-slate-500 ring-white/8 hover:bg-white/10'
              }
            >
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {/* Desglose del mes */}
      {Object.keys(porCategoria).length > 0 && (
        <div className="space-y-1.5 border-b border-white/8 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Gasto del mes por categoría
          </p>
          {Object.entries(porCategoria)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, valor]) => (
              <div key={cat} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] text-slate-400">{cat}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                  <div
                    className={`h-full rounded-full ${COLOR_GASTO[cat] ?? COLOR_GASTO.otro}`}
                    style={{ width: `${Math.max(6, (Math.abs(valor) / maxCat) * 100)}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-300">
                  {monto(valor, moneda)}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Mantenimiento */}
      {mantenimiento.length > 0 && (
        <div className="border-b border-white/8 p-3">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Wrench size={10} /> Mantenimiento
            {vencidos.length > 0 && (
              <Chip className="bg-rose-500/15 text-rose-300 ring-rose-500/30">
                {vencidos.length} vencido{vencidos.length > 1 ? 's' : ''}
              </Chip>
            )}
          </p>
          <ul className="space-y-1.5">
            {mantenimiento.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/3 px-2.5 py-1.5"
              >
                {m.vencido ? (
                  <AlertTriangle size={13} className="shrink-0 text-rose-400" />
                ) : (
                  <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-200">
                    {m.activo}: {m.tarea}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {m.proxima_fecha ?? 'sin fecha'} ·{' '}
                    {m.vencido
                      ? `venció hace ${Math.abs(m.dias_restantes ?? 0)} d`
                      : `en ${m.dias_restantes ?? 0} d`}
                    {m.costo_estimado ? ` · ${monto(m.costo_estimado)}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => completarMantenimiento(m.id)}
                  className="shrink-0 rounded-md px-1.5 py-1 text-[10px] font-semibold text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                  title="Marcar como realizado"
                >
                  Hecho
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Movimientos */}
      {registros.length === 0 ? (
        <Vacio icono={<Receipt size={24} />} texto="Bitácora vacía" sub="Registra un gasto o cuéntale al agente." />
      ) : (
        <>
          <div className="flex items-center gap-2 border-t border-white/8 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Movimientos
            </span>
            <select
              value={modo}
              onChange={(e) => void guardarAjustes({ orden_gastos: e.target.value as OrdenGastos })}
              title="Como ordenar los gastos"
              className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-300 outline-none hover:bg-white/10"
            >
              <option value="fecha">Orden: fecha</option>
              <option value="monto">Orden: monto</option>
              <option value="categoria">Orden: categoria</option>
            </select>
          </div>
          <ul className="divide-y divide-white/5">
            {registrosOrdenados.slice(0, 30).map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_GASTO[r.categoria] ?? COLOR_GASTO.otro}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">{r.descripcion}</p>
                <p className="text-[10px] text-slate-500">
                  {r.categoria} · {fechaCorta(r.fecha)}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-300">
                {r.monto !== null ? monto(r.monto, r.moneda) : '-'}
              </span>
            </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
