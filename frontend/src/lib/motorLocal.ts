/**
 * Motor local de reglas: entiende frases sin IA.
 *
 * Es el mismo criterio que usa el backend cuando no hay ninguna IA conectada:
 * reconoce PALABRAS CLAVE, FECHAS, HORAS y MONTOS, y devuelve los datos
 * que hay que registrar. Funciona 100 % en el navegador, asi que la app
 * sigue siendo util aunque la API de la nube no este disponible.
 */

export type TipoDatoLocal = 'evento' | 'tarea' | 'gasto' | 'mantenimiento'

export interface DatoLocal {
  tipo: TipoDatoLocal
  titulo: string
  /** Fecha local en formato YYYY-MM-DD. */
  fecha?: string
  /** Hora local en formato HH:MM. */
  hora?: string
  /** Duracion estimada en minutos. */
  duracion?: number
  monto?: number
  categoria?: string
  /** Activo al que pertenece el mantenimiento (moto, carro, hogar...). */
  activo?: string
  detalle?: string
}

export interface AnalisisLocal {
  categorias: string[]
  mensaje: string
  datos: DatoLocal[]
  confianza: number
}

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

/** Quita tildes y pasa a minusculas: asi las palabras clave siempre encajan. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sumarDias(fecha: Date, dias: number): Date {
  const f = new Date(fecha)
  f.setDate(f.getDate() + dias)
  return f
}

function iso(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Proximo dia de la semana (si hoy es ese dia, devuelve hoy). */
function proximoDia(hoy: Date, indice: number): Date | null {
  const actual = (hoy.getDay() + 6) % 7
  const delta = (indice - actual + 7) % 7
  return sumarDias(hoy, delta)
}

/** Detecta la fecha de la frase: hoy, manana, pasado manana, ayer o un dia de la semana. */
export function detectarFecha(texto: string, hoy: Date): Date | null {
  const t = normalizar(texto)
  if (t.includes('pasado manana') || t.includes('pasado mañana')) return sumarDias(hoy, 2)
  if (t.includes('manana') || t.includes('mañana')) return sumarDias(hoy, 1)
  if (t.includes('ayer')) return sumarDias(hoy, -1)
  if (t.includes('hoy') || t.includes('esta tarde') || t.includes('esta noche') || t.includes('ahora')) return hoy
  for (let i = 0; i < DIAS.length; i++) {
    if (t.includes(DIAS[i])) return proximoDia(hoy, i)
  }
  return null
}

/** Detecta la hora: "a las 3", "3 PM", "a las 9:30 am". */
export function detectarHora(texto: string): string | null {
  const t = normalizar(texto)
  const re = /(?:a\s*las\s*|@\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/
  const m = t.match(re)
  if (!m) {
    const re2 = /(?:a\s*las\s*|@\s*)(\d{1,2})(?:[:.](\d{2}))?\b/
    const m2 = t.match(re2)
    if (!m2) return null
    const h = Math.min(23, Math.max(0, Number(m2[1])))
    const min = m2[2] ? Math.min(59, Number(m2[2])) : 0
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  let h = Number(m[1])
  const min = m[2] ? Math.min(59, Number(m[2])) : 0
  const mod = (m[3] || '').replace('.', '')
  if (mod === 'pm' && h < 12) h += 12
  if (mod === 'am' && h === 12) h = 0
  if (h > 23) h = 23
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

const RE_MONTO = /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|millones|miles|mil|k|pesos|bolivares|dolares)?/i
const CONTEXTO_MONETARIO = [
  'por', 'costo', 'costs', 'cuesta', 'precio', 'valor', 'vale', 'gast', 'pagu', 'compr',
  'pago', 'total', 'deuda', 'cuanto', 'cuanto fue', 'me salio', 'salio', 'cobre',
]

/** Detecta un monto. Devuelve null si el numero no venia en contexto de dinero. */
export function detectarMonto(texto: string): number | null {
  const t = normalizar(texto)
  const hayDinero = t.includes('$') || /\b(mil|miles|millones|k|pesos|bolivares|dolares)\b/.test(t)
  const contexto = hayDinero || CONTEXTO_MONETARIO.some((c) => t.includes(c))
  if (!contexto) return null
  const m = t.match(RE_MONTO)
  if (!m) return null
  let valor = Number(m[1].replace(/\s/g, '').replace(',', '.'))
  if (Number.isNaN(valor)) return null
  const sufijo = (m[2] || '').toLowerCase()
  if (sufijo === 'millones') valor *= 1000000
  else if (sufijo === 'miles') valor *= 1000
  else if (sufijo === 'mil') valor *= 1000
  else if (sufijo === 'k') valor *= 1000
  // "20.000" con punto y 3 decimales es separador de miles.
  if (/^\d{1,3}\.\d{3}$/.test(m[1].replace(/\s/g, ''))) valor = Number(m[1].replace(/\./g, ''))
  return Math.round(valor)
}

/** Categoria del gasto segun palabras clave. */
export function detectarCategoriaGasto(texto: string): string {
  const t = normalizar(texto)
  if (/gasolina|gasoleo|tanque|tanquee|cargar nafta|nafta/.test(t)) return 'combustible'
  if (/aceite|service|servicio|taller|mecanico|reparacion|revision/.test(t)) return 'mantenimiento'
  if (/almuerzo|comida|cena|desayuno|cafe|pan|mercado|supermercado|restaurant|pollo/.test(t)) return 'alimentacion'
  if (/taxi|bus|pasaje|uber|transporte|metro|peaje|parking|moto/.test(t)) return 'transporte'
  if (/internet|celular|luz|agua|gas natural|servicio publico|factura/.test(t)) return 'servicios'
  if (/matricula|universidad|colegio|curso|libro|libreria|inscripcion/.test(t)) return 'educacion'
  if (/medico|farmacia|medicina|cita medica|examen medico|dentista/.test(t)) return 'salud'
  if (/cine|juego|fiesta|salida|concierto|bar/.test(t)) return 'ocio'
  return 'otro'
}

/** Activo al que pertenece el mantenimiento. */
export function detectarActivo(texto: string): string {
  const t = normalizar(texto)
  if (/moto|chango|cuatrimoto/.test(t)) return 'moto'
  if (/carro|auto|coche|vehiculo/.test(t)) return 'carro'
  if (/computador|pc|laptop|portatil/.test(t)) return 'computador'
  if (/bicicleta|bici/.test(t)) return 'bicicleta'
  if (/celular|telefono|tablet/.test(t)) return 'celular'
  return 'hogar'
}

/** Categoria del bloque de agenda segun palabras clave. */
export function detectarCategoriaEvento(texto: string): string {
  const t = normalizar(texto)
  if (/clase|examen|parcial|seminario|universidad|colegio|profesor/.test(t)) return 'clase'
  if (/estudio|estudiar|revisar|taller|leer|investigar/.test(t)) return 'estudio'
  if (/trabajo|oficina|reunion|cliente|jornada|turno|empleo/.test(t)) return 'trabajo'
  if (/almuerzo|cena|desayuno|descanso|siesta|cafe|paseo/.test(t)) return 'descanso'
  if (/medico|dentista|psicologo|terapia|hospital/.test(t)) return 'salud'
  if (/fiesta|comida con|cine|concierto|birthday|cumpleanos/.test(t)) return 'social'
  if (/aceite|service|taller|moto|carro|mantenimiento/.test(t)) return 'mantenimiento'
  return 'personal'
}

const CLAVES_MANTENIMIENTO = [
  'aceite', 'filtro', 'freno', 'frenos', 'neumatico', 'service', 'taller', 'revision',
  'cambio de aceite', 'cambio de filtro', 'mecanico', 'latoneria', 'arreglo',
]
const CLAVES_TAREA = [
  'entreg', 'tarea', 'examen', 'quiz', 'parcial', 'ensayo', 'resumen',
  'leer', 'estudiar', 'presentar', 'trabajo', 'investigacion', 'material', 'apuntes',
  'deadline', 'rendir', 'seminario', 'profesor', 'materia',
]
const CLAVES_GASTO = [
  'gasté', 'gaste', 'gasto', 'pagué', 'pague', 'pago', 'compré', 'compre', 'compra',
  'tanqueé', 'tanquee', 'tanking', 'pagar', 'vale', 'factura', 'taxi', 'almorcé',
  'almorce', 'cena', 'café', 'cafe', 'tiquete', 'pasaje', 'me salió', 'costo',
]
const CLAVES_EVENTO = [
  'cita', 'reunion', 'clase', 'trabajo', 'visita', 'medico', 'dentista', 'entrevista',
  'vuelo', 'entrenamiento', 'gimnasio', 'entrenar', 'llamada', 'videollamada', 'examen oral',
]

/** Minusculas sin tildes, conservando la longitud (para poder cortar el original). */
function sinTildes(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const PREFIJOS = /^(hola|buenas|bueno|ok|okay|oye|holi|favor|necesito|quiero|voy a|debo|tengo que|me toca|me acuerdo|recordar|anotar|agendar|registrar|registre|ponle|pon|anota|agenda|registra|ademas|tambien|luego|despues|entonces|pero|hoy|manana|ayer|el|la|los|las|un|una|unos|unas)\b\s*/
const VERBOS = /^(tengo|tuve|hay|me toca|gast\w+|pag\w+|compr\w+|tanque\w+|hice|debo)\s+/

/** Quita prefijos y verbos del principio (varias veces, en cadena). */
function quitarPrefijos(texto: string): string {
  let t = texto.trim()
  for (let i = 0; i < 4; i++) {
    const n = sinTildes(t)
    const m = n.match(PREFIJOS) ?? n.match(VERBOS)
    if (!m || !m[0].length) break
    t = t.slice(m[0].length).trim()
  }
  return t
}

/** Limpia el titulo: quita adverbios, verbos iniciales, hora, fecha y monto. */
export function limpiarTitulo(texto: string): string {
  let t = quitarPrefijos(texto.trim())
  t = t.replace(
    /,?\s*(a\s*las\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/gi,
    '',
  )
  t = t.replace(
    /,?\s*\b(hoy|manana|mañana|pasado manana|pasado mañana|ayer|esta tarde|esta noche)\b/gi,
    '',
  )
  for (const d of DIAS) {
    t = t.replace(new RegExp(`,?\\s*\\b(el|la|este|esta)?\\s*${d}\\b`, 'gi'), '')
  }
  // El monto: "por $20.000", "de 20 mil" o "25 mil" al principio.
  t = t.replace(/,?\s*\bpor\s*\$?\s*[\d.,\s]+(millones|miles|mil|k|pesos|bolivares|dolares)?\b/gi, '')
  t = t.replace(/,?\s*\bde\s*\$?\s*[\d.,\s]+(millones|miles|mil|k|pesos|bolivares|dolares)\b/gi, '')
  t = t.replace(/^\$?\s*[\d.,]+\s*(millones|miles|mil|k)?\s*/i, '')
  t = t.replace(/^(en|para|de|del|con)\s+/i, '')
  t = t.replace(/\s+/g, ' ').replace(/[,\s]+$/, '').replace(/\.\s*$/, '').trim()
  if (!t) t = 'Nota'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Separa una frase en varias intenciones (conectores y fin de oracion). */
export function fragmentar(texto: string): string[] {
  const partes = texto
    .split(/;|\.\s+|\s+y\s+|\s+ademas\s+|\s+tambien\s+|\s+luego\s+|\s+despues\s+|\s+pero\s+|\s+entonces\s+|,\s+(?=[a-zA-Záéíóúñ¿])/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 2)
  return partes.length ? partes : [texto.trim()]
}

function esMantenimiento(t: string) {
  return CLAVES_MANTENIMIENTO.some((c) => t.includes(c))
}
function esTarea(t: string) {
  return CLAVES_TAREA.some((c) => t.includes(c))
}
function esGasto(t: string) {
  return CLAVES_GASTO.some((c) => t.includes(c))
}
function esEvento(t: string) {
  return CLAVES_EVENTO.some((c) => t.includes(c))
}

/** Analiza una frase y devuelve los datos que hay que registrar. */
export function analizarLocal(texto: string, hoyDate: Date = new Date()): AnalisisLocal {
  const hoy = iso(hoyDate)
  const fragmentos = fragmentar(texto)
  const datos: DatoLocal[] = []
  const categorias: string[] = []
  const detalle: string[] = []

  for (const frag of fragmentos) {
    const t = normalizar(frag)
    if (!t) continue
    const fecha = detectarFecha(frag, hoyDate)
    const hora = detectarHora(frag)
    const monto = detectarMonto(frag)
    const titulo = limpiarTitulo(frag)

    const antes = datos.length

    if (esMantenimiento(t) && (esGasto(t) || monto !== null || t.includes('me toca'))) {
      datos.push({
        tipo: 'mantenimiento',
        titulo,
        activo: detectarActivo(frag),
        fecha: fecha ? iso(fecha) : hoy,
        detalle: 'Mantenimiento programado cada 90 dias.',
      })
      categorias.push('MANTENIMIENTO')
    }

    if (esGasto(t) || (monto !== null && !esEvento(t))) {
      datos.push({
        tipo: 'gasto',
        titulo,
        monto: monto ?? 0,
        categoria: detectarCategoriaGasto(frag),
        fecha: fecha ? iso(fecha) : hoy,
      })
      categorias.push('BITACORA_GASTO')
    }

    if (esTarea(t) && !esEvento(t)) {
      datos.push({
        tipo: 'tarea',
        titulo,
        fecha: fecha ? iso(fecha) : hoy,
        detalle: esTarea(t) ? 'Pendiente academico' : undefined,
      })
      categorias.push('TAREA_ACADEMICA')
    }

    if (esEvento(t) || (hora !== null && datos.length === antes)) {
      datos.push({
        tipo: 'evento',
        titulo,
        categoria: detectarCategoriaEvento(frag),
        fecha: fecha ? iso(fecha) : hoy,
        hora: hora ?? '09:00',
        duracion: esEvento(t) && /taller|reparacion|visita|medico|entrevista/.test(t) ? 120 : 60,
      })
      categorias.push('CALENDARIO')
    }
  }

  const unicas = Array.from(new Set(categorias))
  if (!datos.length) {
    return {
      categorias: ['CONVERSACION'],
      mensaje:
        'No encontre ningun dato para registrar. Prueba con algo como "mañana tengo clase a las 9" o "gaste 20 mil en gasolina".',
      datos: [],
      confianza: 0.4,
    }
  }

  for (const d of datos) {
    if (d.tipo === 'evento') {
      detalle.push(`Agende "${d.titulo}" (${d.fecha} ${d.hora})`)
    } else if (d.tipo === 'tarea') {
      detalle.push(`Cree la tarea "${d.titulo}" para el ${d.fecha}`)
    } else if (d.tipo === 'gasto') {
      detalle.push(`Registre ${d.monto?.toLocaleString('es-CO')} en ${d.categoria}`)
    } else {
      detalle.push(`Programe "${d.titulo}"`)
    }
  }

  return {
    categorias: unicas,
    mensaje: `Listo: ${detalle.join('; ')}.`,
    datos,
    confianza: unicas.length > 1 ? 0.8 : 0.9,
  }
}
