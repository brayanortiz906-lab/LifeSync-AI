// Recursos del movil y recomendacion de IA ligera.
// El objetivo: que la app proponga SIEMPRE una IA que el aparato pueda
// sostener (memoria y processor) y que no se coma la bateria ni la RAM.

export interface RecursosMovil {
  esMovil: boolean
  esAndroid: boolean
  ramGb: number | null
  nucleos: number | null
  descripcion: string
}

export interface RecomendacionIa {
  modelo: string
  nombre: string
  tamanoMb: number
  motivo: string
  aviso: string
}

/** Lee los recursos del aparato (sin pedir permisos ni instalar nada). */
export function detectarRecursosMovil(): RecursosMovil {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator)
  const agente = String(nav.userAgent ?? '')
  const esAndroid = /Android/i.test(agente)
  const esMovil =
    esAndroid ||
    /iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(agente) ||
    (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true)

  const nucleos = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null
  const ramGb =
    typeof (nav as unknown as { deviceMemory?: number }).deviceMemory === 'number'
      ? Number((nav as unknown as { deviceMemory?: number }).deviceMemory)
      : null

  let descripcion = 'Equipo de escritorio'
  if (esAndroid) descripcion = 'Android'
  else if (/iPhone|iPad|iPod/i.test(agente)) descripcion = 'iPhone o iPad'
  else if (esMovil) descripcion = 'Movil'
  if (ramGb) descripcion += ` · ${ramGb} GB de RAM`
  if (nucleos) descripcion += ` · ${nucleos} nucleos`

  return { esMovil, esAndroid, ramGb, nucleos, descripcion }
}

/**
 * Elige la IA que este aparato puede sostener.
 * - Con poca RAM (< 3 GB): la mas pequena de todas.
 * - Con 3-6 GB: el equilibrio.
 * - Con 6 GB o mas: la mas capaz que aun sigue siendo ligera.
 */
export function recomendarIa(r: RecursosMovil): RecomendacionIa {
  const ram = r.ramGb ?? 2
  const nucleos = r.nucleos ?? 2

  if (ram < 3 || nucleos <= 2) {
    return {
      modelo: 'qwen2.5:0.5b',
      nombre: 'IA minima (texto)',
      tamanoMb: 400,
      motivo: `Con ${ram} GB de RAM y ${nucleos} nucleos cabe, y responde rapido.`,
      aviso:
        'Este modelo solo piensa en texto: no lee imagenes ni documentos. Es el que mejor gasta la bateria.',
    }
  }
  if (ram < 6) {
    return {
      modelo: 'llama3.2:1b',
      nombre: 'IA ligera (equilibrio)',
      tamanoMb: 1300,
      motivo: `Con ${ram} GB de RAM puedes correr un modelo de 1B sin que se trabe.`,
      aviso: 'Sigue siendo ligera: 1,3 GB en el disco y usa poca memoria mientras responde.',
    }
  }
  return {
    modelo: 'gemma3:1b',
    nombre: 'IA ligera (mas capaz)',
    tamanoMb: 815,
    motivo: `Con ${ram} GB de RAM y ${nucleos} nucleos puedes correr un modelo mas listo sin problema.`,
    aviso: 'Un poco mas de memoria al responder, pero sigue siendo muchisimo mas barata que la nube.',
  }
}

/** Los otros modelos que tambien caben en un movil (por tamano). */
export const MODELOS_MOVIL = [
  {
    modelo: 'qwen2.5:0.5b',
    nombre: 'IA minima (texto)',
    tamanoMb: 400,
    para: 'Poco RAM. La mas rapida y economica.',
  },
  {
    modelo: 'gemma3:1b',
    nombre: 'IA ligera (mas capaz)',
    tamanoMb: 815,
    para: '3 GB o mas de RAM.',
  },
  {
    modelo: 'llama3.2:1b',
    nombre: 'IA ligera (equilibrio)',
    tamanoMb: 1300,
    para: '4 GB o mas de RAM. Buena para razonar.',
  },
  {
    modelo: 'phi3.5:mini',
    nombre: 'IA media (3,8 B)',
    tamanoMb: 2200,
    para: '6 GB o mas de RAM. La mas capaz que aun es ligera.',
  },
]
