/**
 * Cuerpo de la conversación con el agente.
 * Se usa tanto en el panel izquierdo como en la vista ampliada (pantalla completa),
 * para que el chat sea exactamente el mismo en los dos lugares.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Bot, BookOpen, CalendarClock, GraduationCap, ListChecks, Receipt, Send, ShieldAlert,
  ShieldCheck, Sparkles, User, Wrench,
} from 'lucide-react'
import { useLifeSync } from '../store/useLifeSync'
import { Chip } from './ui'
import type { AprobacionPendiente, RegistroDetallado, RespuestaAgente } from '../types'

const CATEGORIA_META: Record<string, { label: string; icon: typeof Bot; clase: string }> = {
  CALENDARIO: { label: 'Calendario', icon: CalendarClock, clase: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30' },
  TAREA_ACADEMICA: { label: 'Académica', icon: GraduationCap, clase: 'bg-violet-500/15 text-violet-300 ring-violet-500/30' },
  BITACORA_GASTO: { label: 'Bitácora', icon: Receipt, clase: 'bg-orange-500/15 text-orange-300 ring-orange-500/30' },
  MANTENIMIENTO: { label: 'Mantenimiento', icon: Wrench, clase: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30' },
  CONVERSACION: { label: 'Conversación', icon: Bot, clase: 'bg-slate-500/15 text-slate-300 ring-slate-500/30' },
}

const TIPO_REGISTRO: Record<string, { icon: typeof Bot; clase: string; etiqueta: string }> = {
  evento: { icon: CalendarClock, clase: 'text-indigo-300', etiqueta: 'Evento' },
  tarea: { icon: GraduationCap, clase: 'text-violet-300', etiqueta: 'Tarea' },
  gasto: { icon: Receipt, clase: 'text-orange-300', etiqueta: 'Gasto' },
  mantenimiento: { icon: Wrench, clase: 'text-cyan-300', etiqueta: 'Mantenimiento' },
  estudio: { icon: BookOpen, clase: 'text-emerald-300', etiqueta: 'Estudio' },
  agenda: { icon: ListChecks, clase: 'text-amber-300', etiqueta: 'Agenda' },
}

const SUGERENCIAS = [
  'Tengo una cita hoy a las 3 PM',
  'Reorganiza mi día',
  'Hoy tanqueé la moto por $20.000',
  'Me toca cambiar el aceite de la moto',
  'Tengo que entregar el ensayo el viernes',
]

export default function ChatBody({
  compacto = false,
}: {
  /** En modo compacto se muestran menos sugerencias y menos padding. */
  compacto?: boolean
}) {
  const mensajes = useLifeSync((s) => s.mensajes)
  const enviar = useLifeSync((s) => s.enviarMensaje)
  const enviando = useLifeSync((s) => s.enviando)
  const error = useLifeSync((s) => s.error)
  const [texto, setTexto] = useState('')
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes.length, enviando])

  const enviarMensaje = async (valor?: string) => {
    const textoEnviar = (valor ?? texto).trim()
    if (!textoEnviar || enviando) return
    setTexto('')
    await enviar(textoEnviar)
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
        {mensajes.length === 0 && (
          <div className="ls-fade-up rounded-2xl border border-indigo-500/20 bg-indigo-500/8 p-4">
            <p className="text-sm font-semibold text-indigo-200">Hola, soy tu asistente LifeAgente ðŸ‘‹</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Cuéntame tus compromisos, gastos y tareas en lenguaje natural. Yo los clasifico,
              los registro y reorganizo tu agenda para que nada se solape.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Puedes mandar <span className="text-slate-400">varias cosas en la misma frase</span>{' '}
              (una cita, un gasto y una entrega) y las registro todas de una.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(compacto ? SUGERENCIAS.slice(0, 3) : SUGERENCIAS).map((s) => (
                <Chip
                  key={s}
                  onClick={() => enviarMensaje(s)}
                  className="cursor-pointer bg-white/6 text-slate-300 ring-white/10 hover:bg-white/12"
                >
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m) =>
          m.rol === 'user' ? (
            <div key={m.id} className="flex justify-end gap-2">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2.5 text-sm text-white shadow-lg shadow-indigo-900/30">
                {m.contenido}
              </div>
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                <User size={13} className="text-slate-300" />
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600">
                <Bot size={13} className="text-white" />
              </div>
              <div className="max-w-[88%] space-y-1.5">
                <div
                  className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.pendiente
                      ? 'border border-rose-500/30 bg-rose-500/10 text-rose-200'
                      : 'border border-white/8 bg-white/5 text-slate-200'
                  }`}
                >
                  {m.contenido}
                </div>
                {m.agente && <FichaAgente agente={m.agente} plan={m.plan} />}
              </div>
            </div>
          ),
        )}

        {enviando && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600">
              <Bot size={13} className="text-white" />
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/8 bg-white/5 px-4 py-3">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="ls-dot h-1.5 w-1.5 rounded-full bg-indigo-400"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && !enviando && (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="shrink-0 border-t border-white/8 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/4 p-2 focus-within:border-indigo-500/50">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviarMensaje()
              }
            }}
            rows={compacto ? 1 : 2}
            placeholder="Escribe: «tengo una cita mañana a las 10», «gasté 45 mil en transporte»â€¦"
            className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            onClick={() => enviarMensaje()}
            disabled={!texto.trim() || enviando}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            aria-label="Enviar"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-slate-500">
          Enter envía · Shift+Enter salto de línea · todo se registra solo
        </p>
      </div>
    </>
  )
}

/** Ficha con el detalle técnico de la respuesta del agente. */
export function FichaAgente({
  agente,
  plan,
}: {
  agente: RespuestaAgente
  plan?: Record<string, unknown>
}) {
  const categorias = agente.categorias?.length ? agente.categorias : [agente.categoria]
  const asignaciones = (plan?.asignaciones as Array<Record<string, unknown>>) ?? []
  const movidos = asignaciones.filter((a) => a.movido).length
  const sinCaber = (plan?.sin_caber as Array<Record<string, unknown>>) ?? []
  const registros = (agente.resumen_estado?.registros_detallados as RegistroDetallado[]) ?? []
  const pendientes = (agente.resumen_estado?.aprobaciones_pendientes as AprobacionPendiente[]) ?? []
  const bloqueadas = (agente.resumen_estado?.acciones_bloqueadas as { tipo: string; motivo: string }[]) ?? []

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {categorias.map((c) => {
          const meta = CATEGORIA_META[c] ?? CATEGORIA_META.CONVERSACION
          const Icono = meta.icon
          return (
            <Chip key={c} className={meta.clase} title={`Categoría detectada: ${c}`}>
              <Icono size={11} />
              {meta.label}
            </Chip>
          )
        })}
        {categorias.length > 1 && (
          <Chip className="bg-indigo-500/15 text-indigo-300 ring-indigo-500/30">
            {categorias.length} intenciones
          </Chip>
        )}
        <Chip className="bg-white/5 text-slate-400 ring-white/10">
          confianza {(agente.confianza * 100).toFixed(0)}%
        </Chip>
        {movidos > 0 && (
          <Chip className="bg-amber-500/15 text-amber-300 ring-amber-500/30">
            {movidos} bloque{movidos > 1 ? 's' : ''} reubicado{movidos > 1 ? 's' : ''}
          </Chip>
        )}
        {sinCaber.length > 0 && (
          <Chip className="bg-rose-500/15 text-rose-300 ring-rose-500/30">
            {sinCaber.length} sin espacio
          </Chip>
        )}
        {agente.alertas.map((a, i) => (
          <Chip
            key={i}
            className={
              a.prioridad === 'alta'
                ? 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
                : 'bg-white/5 text-slate-300 ring-white/10'
            }
            title={a.texto}
          >
            {a.texto}
          </Chip>
        ))}
      </div>

      {registros.length > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
            <Sparkles size={12} />
            Registrado automáticamente ({registros.length})
          </p>
          <ul className="space-y-1">
            {registros.map((r, i) => {
              const meta = TIPO_REGISTRO[r.tipo] ?? TIPO_REGISTRO.agenda
              const Icono = meta.icon
              return (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                  <Icono size={12} className={`mt-0.5 shrink-0 ${meta.clase}`} />
                  <span className="font-medium text-slate-200">{r.titulo}</span>
                  {r.detalle && <span className="text-slate-500">· {r.detalle}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
            <ShieldAlert size={12} />
            Requiere tu aprobación ({pendientes.length})
          </p>
          <ul className="space-y-1">
            {pendientes.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                <ShieldAlert size={12} className="mt-0.5 shrink-0 text-amber-400" />
                <span className="font-medium text-slate-200">{p.resumen}</span>
                {p.motivo && <span className="text-slate-500">· {p.motivo}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-slate-500">
            Revísalo en Responsabilidad â†’ Aprobaciones.
          </p>
        </div>
      )}

      {bloqueadas.length > 0 && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/8 p-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
            <ShieldCheck size={12} />
            No ejecutado por política ({bloqueadas.length})
          </p>
          <ul className="space-y-1">
            {bloqueadas.map((b, i) => (
              <li key={i} className="text-[11px] text-slate-300">
                <span className="font-medium text-slate-200">{b.tipo}</span>
                {b.motivo && <span className="text-slate-500">· {b.motivo}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
