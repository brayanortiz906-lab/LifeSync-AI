/** Panel derecho (superior): tareas académicas, resúmenes y material importado. */
import { useMemo, useState } from 'react'
import {
  BookOpen, CheckCircle2, Circle, FileUp, GraduationCap, Loader2, Sparkles,
} from 'lucide-react'
import { useLifeSync } from '../store/useLifeSync'
import { api } from '../lib/api'
import type { OrdenTareas, Tarea } from '../types'
import { Boton, Chip, Modal, Panel, Vacio } from './ui'

const PRIORIDAD: Record<string, string> = {
  alta: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  media: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  baja: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

/** Rango de prioridad para ordenar (alta primero). */
const RANGO_PRIO: Record<string, number> = { alta: 0, media: 1, baja: 2 }

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null
  const d = new Date(fecha + 'T00:00:00')
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - hoy.getTime()) / 86400000)
}

export default function AcademicPanel() {
  const tareas = useLifeSync((s) => s.tareas)
  const completar = useLifeSync((s) => s.completarTarea)
  const cargarTodo = useLifeSync((s) => s.cargarTodo)
  const ajustes = useLifeSync((s) => s.ajustes)
  const guardarAjustes = useLifeSync((s) => s.guardarAjustes)
  const [filtro, setFiltro] = useState<'pendientes' | 'todas' | 'completadas'>('pendientes')
  const [expandida, setExpandida] = useState<number | null>(null)
  const [importar, setImportar] = useState(false)

  const modo = ajustes?.orden_tareas ?? 'fecha'

  const visibles = useMemo(() => {
    const filtradas = tareas.filter((t) => {
      if (filtro === 'pendientes') return t.estado !== 'completada'
      if (filtro === 'completadas') return t.estado === 'completada'
      return true
    })
    return filtradas.sort((a, b) => {
      if ((a.estado === 'completada') !== (b.estado === 'completada')) {
        return a.estado === 'completada' ? 1 : -1
      }
      if (modo === 'prioridad') {
        const d = RANGO_PRIO[a.prioridad] - RANGO_PRIO[b.prioridad]
        if (d !== 0) return d
      }
      if (modo === 'tiempo') {
        const d = (a.minutos_estimados ?? 0) - (b.minutos_estimados ?? 0)
        if (d !== 0) return d
      }
      if (modo === 'materia') {
        const ma = (a.materia ?? '').toLowerCase()
        const mb = (b.materia ?? '').toLowerCase()
        if (ma !== mb) return ma < mb ? -1 : 1
      }
      const fa = a.fecha_entrega ?? '9999-12-31'
      const fb = b.fecha_entrega ?? '9999-12-31'
      if (fa !== fb) return fa < fb ? -1 : 1
      return RANGO_PRIO[a.prioridad] - RANGO_PRIO[b.prioridad]
    })
  }, [tareas, filtro, modo])

  return (
    <Panel
      titulo={
        <>
          <GraduationCap size={15} className="text-violet-400" />
          Tareas académicas
        </>
      }
      acciones={
        <Boton variante="secundario" onClick={() => setImportar(true)} titulo="Importar material (Notion / Classroom / PDF)">
          <FileUp size={13} />
          Importar
        </Boton>
      }
      cuerpoClass="overflow-y-auto"
    >
      <div className="flex gap-1 border-b border-white/8 px-3 py-2">
        {(['pendientes', 'todas', 'completadas'] as const).map((f) => (
          <Chip
            key={f}
            onClick={() => setFiltro(f)}
            className={
              filtro === f
                ? 'cursor-pointer bg-indigo-500/20 text-indigo-300 ring-indigo-500/40'
                : 'cursor-pointer bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10'
            }
          >
            {f === 'pendientes' ? 'Pendientes' : f === 'todas' ? 'Todas' : 'Completadas'}
          </Chip>
        ))}
        <select
          value={modo}
          onChange={(e) => void guardarAjustes({ orden_tareas: e.target.value as OrdenTareas })}
          title="Como ordenar las tareas"
          className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-300 outline-none hover:bg-white/10"
        >
          <option value="fecha">Orden: fecha</option>
          <option value="prioridad">Orden: prioridad</option>
          <option value="tiempo">Orden: tiempo</option>
          <option value="materia">Orden: materia</option>
        </select>
      </div>

      {visibles.length === 0 ? (
        <Vacio icono={<BookOpen size={24} />} texto="Sin tareas por aquí" sub="Pídele al agente que registre una entrega." />
      ) : (
        <ul className="divide-y divide-white/5">
          {visibles.map((t) => (
            <TareaItem
              key={t.id}
              tarea={t}
              abierta={expandida === t.id}
              onToggle={() => setExpandida(expandida === t.id ? null : t.id)}
              onCompletar={() => completar(t.id)}
            />
          ))}
        </ul>
      )}

      <ModalImportar abierto={importar} onCerrar={() => setImportar(false)} onOk={cargarTodo} />
    </Panel>
  )
}

function TareaItem({
  tarea, abierta, onToggle, onCompletar,
}: {
  tarea: Tarea
  abierta: boolean
  onToggle: () => void
  onCompletar: () => void
}) {
  const dias = diasRestantes(tarea.fecha_entrega)
  const completada = tarea.estado === 'completada'

  return (
    <li className="px-3 py-2.5 transition hover:bg-white/3">
      <div className="flex items-start gap-2">
        <button onClick={onCompletar} className="mt-0.5 shrink-0 text-slate-500 hover:text-emerald-400" aria-label="Completar">
          {completada ? (
            <CheckCircle2 size={16} className="text-emerald-500" />
          ) : (
            <Circle size={16} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={onToggle} className="block w-full text-left">
            <p className={`text-sm font-medium ${completada ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
              {tarea.titulo}
            </p>
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {tarea.materia && (
              <Chip className="bg-violet-500/15 text-violet-300 ring-violet-500/30">{tarea.materia}</Chip>
            )}
            <Chip className={PRIORIDAD[tarea.prioridad]}>{tarea.prioridad}</Chip>
            {tarea.fecha_entrega && (
              <Chip
                className={
                  dias !== null && dias < 0
                    ? 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
                    : dias !== null && dias <= 2
                      ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
                      : 'bg-white/5 text-slate-400 ring-white/10'
                }
              >
                {dias !== null && dias < 0 ? 'vencida' : dias === 0 ? 'hoy' : `en ${dias}d`} ·{' '}
                {tarea.fecha_entrega}
              </Chip>
            )}
            <Chip className="bg-white/5 text-slate-400 ring-white/10">{tarea.minutos_estimados} min</Chip>
            {tarea.fuente !== 'manual' && (
              <Chip className="bg-sky-500/15 text-sky-300 ring-sky-500/30">{tarea.fuente}</Chip>
            )}
          </div>

          {abierta && (tarea.resumen || tarea.preguntas.length > 0) && (
            <div className="ls-fade-up mt-2 space-y-2 rounded-lg border border-white/8 bg-white/4 p-2.5">
              {tarea.resumen && (
                <p className="text-xs leading-relaxed text-slate-300">{tarea.resumen}</p>
              )}
              {tarea.preguntas.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <Sparkles size={10} /> Preguntas de estudio
                  </p>
                  <ul className="space-y-0.5">
                    {tarea.preguntas.map((p, i) => (
                      <li key={i} className="text-xs text-slate-400">
                        • {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function ModalImportar({
  abierto, onCerrar, onOk,
}: {
  abierto: boolean
  onCerrar: () => void
  onOk: () => Promise<void>
}) {
  const { apiKey, proveedor } = useLifeSync()
  const [titulo, setTitulo] = useState('')
  const [materia, setMateria] = useState('')
  const [material, setMaterial] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async () => {
    if (!titulo.trim() || !material.trim()) return
    setCargando(true)
    setError(null)
    try {
      await api.ingerir({
        titulo: titulo.trim(),
        materia: materia.trim() || undefined,
        material: material.trim(),
        proveedor: proveedor !== 'mock' ? proveedor : undefined,
        api_key: apiKey || undefined,
        minutos_estudio: 60,
      })
      setTitulo('')
      setMateria('')
      setMaterial('')
      await onOk()
      onCerrar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Importar material de estudio">
      <div className="space-y-3">
        <p className="text-xs text-slate-400">
          Pega el contenido (o el texto extraído de un PDF / Notion / Classroom). El agente lo resume,
          genera preguntas de estudio y agenda un bloque de práctica en tu calendario.
        </p>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título (ej. Capítulo 4 — Límites)"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
        />
        <input
          value={materia}
          onChange={(e) => setMateria(e.target.value)}
          placeholder="Materia (opcional)"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
        />
        <textarea
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          rows={8}
          placeholder="Pega aquí el material…"
          className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
        />
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={enviar} disabled={cargando || !titulo.trim() || !material.trim()}>
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Resumir y agendar
          </Boton>
        </div>
      </div>
    </Modal>
  )
}
