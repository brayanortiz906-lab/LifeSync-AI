/** Atomos visuales compartidos. */
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Panel({
  titulo, sub, icono, acciones, children, className = '', cuerpoClass = '',
  variant = 'glass',
}: {
  titulo?: ReactNode
  /** Texto corto que explica de que va el panel (una sola linea). */
  sub?: ReactNode
  icono?: ReactNode
  acciones?: ReactNode
  children: ReactNode
  className?: string
  cuerpoClass?: string
  /** Variante visual: 'default' | 'elevated' | 'glass' | 'glass-light' */
  variant?: 'default' | 'elevated' | 'glass' | 'glass-light'
}) {
  const variantClasses = {
    default: 'bg-slate-900/60 border-white/8 shadow-xl shadow-black/30 backdrop-blur',
    elevated: 'bg-slate-900/70 border-white/10 shadow-2xl shadow-black/40 backdrop-blur-md',
    glass: 'glass-panel',
    'glass-light': 'glass-panel-light',
  }
  
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border ${variantClasses[variant]} ${className}`}
    >
      {(titulo || acciones) && (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-200">
              {icono}
              {titulo}
            </div>
            {sub && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{sub}</p>}
          </div>
          {acciones && <div className="flex shrink-0 items-center gap-1.5">{acciones}</div>}
        </header>
      )}
      {/* Padding por defecto para que el contenido nunca quede pegado al borde
          del panel. Los paneles que gestionan su propio padding (listas
          largas, tablas) lo anulan pasando cuerpoClass. */}
      <div className={`min-h-0 flex-1 ${cuerpoClass || 'p-4'}`}>{children}</div>
    </section>
  )
}

export function Chip({
  children, className = '', onClick, title,
  variant = 'default',
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  title?: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'active'
}) {
  const variantClasses = {
    default: 'glass-chip',
    active: 'glass-chip active',
    accent: 'glass-chip glass-chip-accent',
    success: 'glass-chip active',
    warning: 'glass-chip glass-chip-accent',
    danger: 'glass-chip glass-chip-accent',
    info: 'glass-chip glass-chip-accent',
  }
  
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap'
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag title={title} onClick={onClick} className={`${base} ${variantClasses[variant]} ${className}`}>
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
    primario: 'glass-button',
    secundario: 'glass-button-secondary',
    fantasma: 'glass-button-ghost',
    peligro: 'glass-button-danger',
  }
  return (
    <button
      type={type}
      title={titulo}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
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
  etiqueta, valor, sub, tono = 'slate',
}: {
  etiqueta: string
  valor: ReactNode
  /** Texto pequeno debajo del valor. */
  sub?: ReactNode
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
    <div className="glass-panel rounded-xl p-4">
      <div className={`text-base font-bold tabular-nums ${tonos[tono]}`}>{valor}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{etiqueta}</div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
    </div>
  )
}

export function Modal({
  abierto, onCerrar, titulo, descripcion, children, ancho = 'max-w-lg', pie,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  descripcion?: string
  children: ReactNode
  /** Clase de ancho maximo (Tailwind estatico). */
  ancho?: string
  /** Acciones fijas al pie: siempre visibles aunque el cuerpo sea largo. */
  pie?: ReactNode
}) {
  if (!abierto) return null
  // Se monta en document.body (portal): dentro de la barra superior (que tiene
  // backdrop-blur) un `position: fixed` se anclaria a la barra y el modal
  // apareceria cortado por arriba.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onCerrar}
    >
      <div
        className={`ls-fade-up flex max-h-[88vh] w-full ${ancho} flex-col overflow-hidden rounded-3xl glass-panel`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">{titulo}</h2>
            {descripcion && (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{descripcion}</p>
            )}
          </div>
          <button
            onClick={onCerrar}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {pie && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/8 bg-white/2 px-6 py-3.5">
            {pie}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------
   Bloques de organizacion: tarjetas, secciones, campos y avisos.
   Son la base para que ninguna pantalla se vea "pegada": todo bloque
   respira con el mismo aire y los bordes nunca tocan al bloque vecino.
   ------------------------------------------------------------------------- */

export function Tarjeta({
  children, className = '', apretado = false,
  variant = 'glass',
}: {
  children: ReactNode
  className?: string
  apretado?: boolean
  /** Variante visual: 'default' | 'glass' | 'glass-light' */
  variant?: 'default' | 'glass' | 'glass-light'
}) {
  const variantClasses = {
    default: 'bg-slate-900/60 border border-white/8 shadow-xl shadow-black/30 backdrop-blur rounded-2xl',
    glass: 'glass-panel rounded-2xl',
    'glass-light': 'glass-panel-light rounded-2xl',
  }
  return <div className={`${variantClasses[variant]} ${apretado ? 'p-3' : 'p-4'} ${className}`}>{children}</div>
}

export function Seccion({
  titulo, descripcion, children, className = '',
}: {
  titulo: string
  descripcion?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      <header>
        <h3 className="ls-label">{titulo}</h3>
        {descripcion && <p className="ls-hint mt-1">{descripcion}</p>}
      </header>
      {children}
    </section>
  )
}

export function Campo({
  etiqueta, ayuda, children, className = '',
}: {
  etiqueta: string
  ayuda?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="block text-[11px] font-semibold text-slate-300">{etiqueta}</span>
      {children}
      {ayuda && <span className="ls-hint block">{ayuda}</span>}
    </label>
  )
}

export function Aviso({
  tono = 'info', titulo, children,
}: {
  tono?: 'info' | 'ok' | 'error' | 'aviso'
  titulo?: string
  children: ReactNode
}) {
  const estilos: Record<string, string> = {
    info: 'glass-panel border-indigo-500/30',
    ok: 'glass-panel border-emerald-500/30',
    error: 'glass-panel border-rose-500/30',
    aviso: 'glass-panel border-amber-500/30',
  }
  return (
    <div className={`rounded-xl px-3.5 py-3 text-[11px] leading-relaxed ${estilos[tono]}`}>
      {titulo && <div className="mb-1 text-xs font-bold">{titulo}</div>}
      {children}
    </div>
  )
}
