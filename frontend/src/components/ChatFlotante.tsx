/** Chat flotante: burbuja MOVIL que se expande a panel.
 *
 * DISENO: el chat NO es una pantalla mas de la app. Vive en una burbuja que
 * puedes arrastrar a cualquier punto de la pantalla (la posicion se guarda),
 * disponible desde cualquier vista. Con Ctrl+K se abre y se cierra; en movil
 * el panel ocupa toda la pantalla; con el boton de ampliar, toda la pantalla
 * en cualquier tamano.
 */
import { useEffect, useRef, useState } from 'react'
import { GripVertical, Maximize2, MessageSquare, Minimize2, Sparkles, X } from 'lucide-react'
import { useLifeAgente } from '../store/useLifeAgente'
import ChatBody from './ChatBody'
import { Chip } from './ui'

const CLAVE_POS = 'lifesync.chatPos'
const LADO = 56 // lado de la burbuja en px

type Pos = { x: number; y: number }

function leerPos(): Pos | null {
  try {
    const raw = localStorage.getItem(CLAVE_POS)
    if (!raw) return null
    const p = JSON.parse(raw) as Pos
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p
  } catch {
    /* posicion corrupta: se recalcula */
  }
  return null
}

export default function ChatFlotante({
  abierto,
  onToggle,
}: {
  /** Estado controlado desde App (para el atajo Ctrl+K). */
  abierto: boolean
  onToggle: () => void
}) {
  const [maximizado, setMaximizado] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const [tam, setTam] = useState({ w: 1280, h: 800 })
  const [arrastrando, setArrastrando] = useState(false)
  const movido = useRef(false)
  const mensajes = useLifeAgente((s) => s.mensajes)
  const enviando = useLifeAgente((s) => s.enviando)

  // Al abrir el panel se sale del modo pantalla completa (mas comodo).
  useEffect(() => {
    if (!abierto) setMaximizado(false)
  }, [abierto])

  // Tamano de la ventana: para colocar la burbuja y el panel.
  useEffect(() => {
    const medir = () => setTam({ w: window.innerWidth, h: window.innerHeight })
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  // Posicion inicial: abajo a la derecha (la ultima guardada manda).
  useEffect(() => {
    const guardada = leerPos()
    if (guardada) {
      setPos({
        x: Math.min(Math.max(8, guardada.x), Math.max(8, window.innerWidth - LADO - 8)),
        y: Math.min(Math.max(8, guardada.y), Math.max(8, window.innerHeight - LADO - 8)),
      })
      return
    }
    setPos({
      x: Math.max(8, window.innerWidth - LADO - 20),
      y: Math.max(8, window.innerHeight - LADO - 20),
    })
  }, [])

  // Al redimensionar, la burbuja se queda dentro de la pantalla.
  useEffect(() => {
    setPos((p) => {
      if (!p) return p
      return {
        x: Math.min(Math.max(8, p.x), Math.max(8, tam.w - LADO - 8)),
        y: Math.min(Math.max(8, p.y), Math.max(8, tam.h - LADO - 8)),
      }
    })
  }, [tam])

  /** Arrastrar la burbuja por toda la pantalla. */
  const iniciarArrastre = (e: React.PointerEvent) => {
    if (!pos) return
    movido.current = false
    const dx = e.clientX - pos.x
    const dy = e.clientY - pos.y
    const origen = pos
    setArrastrando(true)

    const mover = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - origen.x - dx) > 3 || Math.abs(ev.clientY - origen.y - dy) > 3) {
        movido.current = true
      }
      const x = Math.min(Math.max(8, ev.clientX - dx), Math.max(8, window.innerWidth - LADO - 8))
      const y = Math.min(Math.max(8, ev.clientY - dy), Math.max(8, window.innerHeight - LADO - 8))
      setPos({ x, y })
    }
    const soltar = () => {
      setArrastrando(false)
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      setPos((p) => {
        if (p) localStorage.setItem(CLAVE_POS, JSON.stringify(p))
        return p
      })
      // El clic que el navegador dispara al terminar el arrastre no debe
      // abrir el chat; pero un clic posterior si.
      window.setTimeout(() => {
        movido.current = false
      }, 350)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  const movil = tam.w < 640

  if (!abierto) {
    return (
      <button
        onPointerDown={iniciarArrastre}
        onClick={() => {
          // Si hubo arrastre real, el click no debe abrir el chat.
          if (movido.current) {
            movido.current = false
            return
          }
          onToggle()
        }}
        style={pos ? { left: pos.x, top: pos.y } : { right: 20, bottom: 20 }}
        title="Hablar con el agente (Ctrl+K). Arrastrame a donde quieras."
        aria-label="Abrir el chat con el agente"
        className={`ls-fade-up fixed z-40 flex touch-none items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-2xl shadow-indigo-900/50 transition focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
          arrastrando
            ? 'scale-105 cursor-grabbing'
            : 'cursor-grab hover:scale-105 hover:from-indigo-400 hover:to-violet-500'
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center">
          {enviando ? (
            <span className="flex items-end gap-1">
              <span className="ls-dot h-1.5 w-1.5 rounded-full bg-white" />
              <span className="ls-dot h-1.5 w-1.5 rounded-full bg-white [animation-delay:150ms]" />
              <span className="ls-dot h-1.5 w-1.5 rounded-full bg-white [animation-delay:300ms]" />
            </span>
          ) : (
            <MessageSquare size={22} />
          )}
        </span>
        <GripVertical size={11} className="absolute -left-1 -top-1 rounded-full bg-slate-900/80 p-0.5 text-slate-500" />
      </button>
    )
  }

  // El panel se ancla junto a la burbuja (y en movil ocupa toda la pantalla).
  const anchoPanel = Math.min(420, Math.max(280, tam.w - 32))
  const altoPanel = Math.min(620, Math.max(360, tam.h - 120))
  const estiloPanel: React.CSSProperties = {}
  if (!movil && !maximizado && pos) {
    const derecha = pos.x > tam.w / 2
    const x = derecha ? pos.x - anchoPanel - 16 : pos.x + LADO + 16
    const y = pos.y - altoPanel - 16
    estiloPanel.left = Math.min(Math.max(8, x), Math.max(8, tam.w - anchoPanel - 8))
    estiloPanel.top = Math.min(Math.max(8, y), Math.max(8, tam.h - altoPanel - 8))
    estiloPanel.width = anchoPanel
    estiloPanel.height = altoPanel
  }

  return (
    <div
      style={estiloPanel}
      className={
        movil
          ? 'fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-900/95 backdrop-blur'
          : maximizado
            ? 'fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur'
            : 'fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur'
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <Sparkles size={14} className="text-white" />
          </span>
          Agente LifeAgente
        </div>
        <div className="flex items-center gap-1.5">
          <Chip className="bg-white/5 text-slate-400 ring-white/10">
            {mensajes.length} msg
          </Chip>
          {!movil && (
            <button
              onClick={() => setMaximizado((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:border-indigo-500/40 hover:text-indigo-300"
              title={maximizado ? 'Volver al panel flotante' : 'Ampliar a pantalla completa'}
              aria-label={maximizado ? 'Restaurar el chat flotante' : 'Ampliar el chat'}
            >
              {maximizado ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
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
