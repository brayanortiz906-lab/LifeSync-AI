import { useEffect, useState } from 'react'

/**
 * Suscribe un componente a una media query del navegador.
 *
 * Tailwind permite esconder cosas por tamano de pantalla, pero a veces
 * necesitamos saber el tamano en JavaScript (por ejemplo: en un telefono
 * movemos los paneles a un menu, en un escritorio los dejamos visibles).
 *
 * @param query Media query CSS (por ejemplo '(min-width: 1024px)').
 * @returns `true` si la consulta se cumple en este momento.
 */
export function useMediaQuery(query: string): boolean {
  const [coincide, setCoincide] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const alCambiar = () => setCoincide(mql.matches)
    alCambiar()
    mql.addEventListener('change', alCambiar)
    return () => mql.removeEventListener('change', alCambiar)
  }, [query])

  return coincide
}

/** Punto de corte que separa el movil del escritorio. */
export const ESCRITORIO = '(min-width: 1024px)'
/** Punto de corte de las pantallas grandes (3 columnas). */
export const PANTALLA_GRANDE = '(min-width: 1280px)'
