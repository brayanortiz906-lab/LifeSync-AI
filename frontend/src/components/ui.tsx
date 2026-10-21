/** Atomos visuales compartidos. */
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Panel({
  titulo, icono, acciones, children, className = '', cuerpoClass = '',
}: {
  titulo?: ReactNode
  icono?: ReactNode
  acciones?: ReactNode
  children: ReactNode
  className?: string
  cuerpoClass?: string
}) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-900/60 shadow-xl shadow-black/30 backdrop-blur ${className}`}
    >
      {(titulo || acciones) && (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-200">
            {icono}
            {titulo}
          </div>
          {acciones && <div className="flex items-center gap-1.5">{acciones}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${cuerpoClass}`}>{children}</div>
    </section>
  )
}

export function Chip({
  children, className = '', onClick, title,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  title?: string
}) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap'
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag title={title} onClick={onClick} className={`${base} ${className}`}>
      {children}
    </Tag>
  )
}

export function Boton({
  children, onClick, variante = 'primario', disabled, type = 'button', className = '', titulo,
}: {
  children: ReactNode
  onClick?: () => void
  variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  titulo?: string
}) {
  const estilos: Record<string, string> = {
    primario:
      'bg-indigo-500 text-white hover:bg-indigo-400 disabled:bg-indigo-500/40 shadow-lg shadow-indigo-500/20',
    secundario:
      'bg-white/8 text-slate-200 hover:bg-white/14 border border-white/10 disabled:opacity-40',
    fantasma: 'text-slate-400 hover:text-slate-100 hover:bg-white/8',
    peligro: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 ring-1 ring-rose-500/30',
  }
  return (
    <button
      type={type}
      title={titulo}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Vacio({ icono, texto, sub }: { icono?: ReactNode; texto: string; sub?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icono && <div className="text-slate-600">{icono}</div>}
      <p className="text-sm font-medium text-slate-400">{texto}</p>
      {sub && <p className="max-w-xs text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

export function Stat({
  etiqueta, valor, tono = 'slate',
}: {
  etiqueta: string
  valor: ReactNode
  tono?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose'
}) {
  const tonos: Record<string, string> = {
    slate: 'text-slate-100',
    indigo: 'text-indigo-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
  }
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2">
      <div className={`text-base font-bold tabular-nums ${tonos[tono]}`}>{valor}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{etiqueta}</div>
    </div>
  )
}

export function Modal({
  abierto, onCerrar, titulo, children, ancho = 'max-w-lg',
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  children: ReactNode
  /** Clase de ancho maximo (Tailwind estatico). */
  ancho?: string
}) {
  if (!abierto) return null
  // Se monta en document.body (portal): dentro de la barra superior (que tiene
  // backdrop-blur) un `position: fixed` se anclaria a la barra y el modal
  // apareceria cortado por arriba.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={onCerrar}
    >
      <div
        className={`ls-fade-up flex max-h-[88vh] w-full ${ancho} flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">{titulo}</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-100" aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
