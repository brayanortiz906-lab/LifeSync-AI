/** Chat flotante: burbuja fija que se expande a panel.
 *
 * DISENO: el chat NO es una pantalla mas de la app. Vive en una burbuja fija
 * (abajo a la derecha) disponible desde cualquier vista, y se despliega encima
 * del contenido sin sacar al usuario de la agenda que esta mirando. Con
 * Ctrl+K se abre y se cierra; con el boton de ampliar ocupa toda la pantalla.
 */
import { useEffect, useState } from 'react'
import { Maximize2, MessageSquare, Minimize2, Sparkles, X } from 'lucide-react'
import { useLifeSync } from '../store/useLifeSync'
import ChatBody from './ChatBody'
import { Chip } from './ui'

export default function ChatFlotante({
  abierto,
  onToggle,
}: {
  /** Estado controlado desde App (para el atajo Ctrl+K). */
  abierto: boolean
  onToggle: () => void
}) {
  const [maximizado, setMaximizado] = useState(false)
  const mensajes = useLifeSync((s) => s.mensajes)
  const enviando = useLifeSync((s) => s.enviando)

  // Al abrir el panel se sale del modo pantalla completa (mas comodo).
  useEffect(() => {
    if (!abierto) setMaximizado(false)
  }, [abierto])

  if (!abierto) {
    return (
      <button
        onClick={onToggle}
        title="Hablar con el agente (Ctrl+K)"
        aria-label="Abrir el chat con el agente"
        className="ls-fade-up fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-2xl shadow-indigo-900/50 transition hover:scale-105 hover:from-indigo-400 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {enviando ? (
          <span className="flex items-end gap-1">
            <span className="ls-dot h-1.5 w-1.5 rounded-full bg-white" />
            <span className="ls-dot h-1.5 w-1.5 rounded-full bg-white [animation-delay:150ms]" />
            <span className="ls-dot h-1.5 w-1.5 rounded-full bg-white [animation-delay:300ms]" />
          </span>
        ) : (
          <MessageSquare size={22} />
        )}
      </button>
    )
  }

  return (
    <div
      className={
        maximizado
          ? 'fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur'
          : 'fixed bottom-24 right-5 z-50 flex h-[min(620px,72vh)] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur'
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <Sparkles size={14} className="text-white" />
          </span>
          Agente LifeSync
        </div>
        <div className="flex items-center gap-1.5">
          <Chip className="bg-white/5 text-slate-400 ring-white/10">
            {mensajes.length} msg
          </Chip>
          <button
            onClick={() => setMaximizado((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:border-indigo-500/40 hover:text-indigo-300"
            title={maximizado ? 'Volver al panel flotante' : 'Ampliar a pantalla completa'}
            aria-label={maximizado ? 'Restaurar el chat flotante' : 'Ampliar el chat'}
          >
            {maximizado ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
            title="Cerrar el chat (Ctrl+K)"
            aria-label="Cerrar el chat"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      <ChatBody />
    </div>
  )
}
