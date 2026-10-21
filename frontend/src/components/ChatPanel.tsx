/** Panel izquierdo: chat conversacional con el agente LifeSync. */
import { Maximize2, Minimize2, Sparkles } from 'lucide-react'
import ChatBody from './ChatBody'
import { Chip } from './ui'

export default function ChatPanel({
  expandido,
  onToggleExpandido,
}: {
  /** Cuando es true el panel ocupa toda la pantalla. */
  expandido?: boolean
  onToggleExpandido?: () => void
}) {
  return (
    <section
      className={
        expandido
          ? 'fixed inset-0 z-40 flex flex-col bg-slate-950/95 backdrop-blur lg:static lg:z-auto lg:bg-transparent lg:backdrop-blur-none'
          : 'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-900/60 shadow-xl shadow-black/30 backdrop-blur'
      }
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles size={15} className="text-indigo-400" />
          Agente LifeSync
        </div>
        <div className="flex items-center gap-2">
          <Chip className="bg-white/5 text-slate-400 ring-white/10">4 categorías</Chip>
          {onToggleExpandido && (
            <button
              onClick={onToggleExpandido}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:border-indigo-500/40 hover:text-indigo-300"
              title={expandido ? 'Cerrar chat ampliado' : 'Ampliar chat (Ctrl+K)'}
              aria-label={expandido ? 'Cerrar chat ampliado' : 'Ampliar chat'}
            >
              {expandido ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
        </div>
      </header>

      <ChatBody compacto={!expandido} />
    </section>
  )
}
