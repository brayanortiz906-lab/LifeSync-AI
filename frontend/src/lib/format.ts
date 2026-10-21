/** Utilidades de fecha y formato (es-CO). */
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const HORA_INICIO = 6
export const HORA_FIN = 23

export function aFecha(iso: string): Date {
  return parseISO(iso)
}

export function aIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function hhmm(iso: string): string {
  const d = aFecha(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function fechaCorta(iso: string): string {
  const d = aFecha(iso)
  if (isToday(d)) return 'Hoy'
  if (isTomorrow(d)) return 'Mañana'
  return format(d, 'EEE d MMM', { locale: es })
}

export function fechaLarga(d: Date): string {
  return format(d, "EEEE d 'de' MMMM, yyyy", { locale: es })
}

export function etiquetaDia(d: Date): string {
  if (isToday(d)) return 'Hoy'
  if (isTomorrow(d)) return 'Mañana'
  return format(d, "EEEE d 'de' MMMM", { locale: es })
}

export function duracionLegible(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function monto(m: number | null | undefined, moneda = 'COP'): string {
  if (m === null || m === undefined) return '—'
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: moneda, maximumFractionDigits: 0,
    }).format(m)
  } catch {
    return `${m.toLocaleString('es-CO')} ${moneda}`
  }
}

/** Minutos desde las 00:00 (para posicionar bloques en la línea de tiempo). */
export function minutosDelDia(iso: string): number {
  const d = aFecha(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export function mismoDia(iso: string, dia: Date): boolean {
  const d = aFecha(iso)
  return d.getFullYear() === dia.getFullYear() && d.getMonth() === dia.getMonth() && d.getDate() === dia.getDate()
}
