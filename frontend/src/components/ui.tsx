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
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-200">
            {icono}
            {titulo}
          </div>
          {acciones && <div className="flex items-center gap-1.5">{acciones}</div>}
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
    <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
      <div className={`text-base font-bold tabular-nums ${tonos[tono]}`}>{valor}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{etiqueta}</div>
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
        className={`ls-fade-up flex max-h-[88vh] w-full ${ancho} flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl`}
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
}: {
  children: ReactNode
  className?: string
  apretado?: boolean
}) {
  return <div className={`ls-card ${apretado ? 'ls-card-apretado' : ''} ${className}`}>{children}</div>
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
    info: 'border-indigo-500/25 bg-indigo-500/8 text-indigo-100',
    ok: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-200',
    error: 'border-rose-500/30 bg-rose-500/8 text-rose-200',
    aviso: 'border-amber-500/30 bg-amber-500/8 text-amber-200',
  }
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-[11px] leading-relaxed ${estilos[tono]}`}>
      {titulo && <div className="mb-1 text-xs font-bold">{titulo}</div>}
      {children}
    </div>
  )
}
