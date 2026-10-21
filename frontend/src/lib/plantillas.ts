/**
 * Organizadores preestablecidos: plantillas con informacion de ejemplo
 * (agenda, tareas, gastos y mantenimiento) listas para cargar con un clic.
 *
 * Sirven para probar LifeAgente sin tener que escribir nada: la persona ve
 * como queda una agenda real y luego la cambia por la suya.
 */
import type { CategoriaEvento, CategoriaGasto, Evento, Mantenimiento, Registro, Tarea } from '../types'

export interface EventoPlantilla {
  titulo: string
  categoria: CategoriaEvento
  /** Dias desde hoy (0 = hoy, 1 = manana, -1 = ayer). */
  dia: number
  hora: string
  duracion: number
  inamovible?: boolean
}

export interface TareaPlantilla {
  titulo: string
  materia: string
  dia: number
  prioridad: Tarea['prioridad']
  minutos: number
}

export interface RegistroPlantilla {
  descripcion: string
  monto: number
  categoria: CategoriaGasto
  dia: number
}

export interface MantenimientoPlantilla {
  tarea: string
  intervalo_dias: number
  costo: number
  dia: number
}

export interface Plantilla {
  id: string
  nombre: string
  icono: string
  para: string
  eventos: EventoPlantilla[]
  tareas: TareaPlantilla[]
  registros: RegistroPlantilla[]
  mantenimiento: MantenimientoPlantilla[]
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'estudiante',
    nombre: 'Estudiante',
    icono: '🎓',
    para: 'Clases, parciales y gastos de la universidad.',
    eventos: [
      { titulo: 'Clase de Calculo', categoria: 'clase', dia: 0, hora: '08:00', duracion: 90, inamovible: true },
      { titulo: 'Estudio: parcial de algebra', categoria: 'estudio', dia: 0, hora: '14:00', duracion: 120 },
      { titulo: 'Seminario de Metodologia', categoria: 'clase', dia: 1, hora: '10:00', duracion: 90, inamovible: true },
      { titulo: 'Almuerzo en la cafeteria', categoria: 'descanso', dia: 0, hora: '12:30', duracion: 45 },
    ],
    tareas: [
      { titulo: 'Entregar el ensayo de Metodologia', materia: 'Metodologia', dia: 3, prioridad: 'alta', minutos: 120 },
      { titulo: 'Hacer el taller de Calculo', materia: 'Calculo', dia: 1, prioridad: 'media', minutos: 90 },
      { titulo: 'Leer el capitulo 4', materia: 'Algebra', dia: 2, prioridad: 'baja', minutos: 45 },
    ],
    registros: [
      { descripcion: 'Pago de la matricula', monto: 800000, categoria: 'educacion', dia: -2 },
      { descripcion: 'Almuerzo en la cafeteria', monto: 18000, categoria: 'alimentacion', dia: 0 },
      { descripcion: 'Pasaje a la universidad', monto: 6000, categoria: 'transporte', dia: 0 },
    ],
    mantenimiento: [],
  },
  {
    id: 'oficina',
    nombre: 'Trabajo de oficina',
    icono: '💼',
    para: 'Jornada laboral, reuniones y gastos de la semana.',
    eventos: [
      { titulo: 'Trabajo en oficina', categoria: 'trabajo', dia: 0, hora: '08:00', duracion: 240, inamovible: true },
      { titulo: 'Reunion de proyecto', categoria: 'trabajo', dia: 0, hora: '14:00', duracion: 60, inamovible: true },
      { titulo: 'Almuerzo', categoria: 'descanso', dia: 0, hora: '12:30', duracion: 60 },
      { titulo: 'Trabajo en casa', categoria: 'trabajo', dia: 1, hora: '09:00', duracion: 240 },
    ],
    tareas: [
      { titulo: 'Revisar el informe mensual', materia: 'Trabajo', dia: 1, prioridad: 'alta', minutos: 90 },
      { titulo: 'Preparar la presentacion', materia: 'Trabajo', dia: 2, prioridad: 'media', minutos: 120 },
    ],
    registros: [
      { descripcion: 'Pago de internet y celular', monto: 95000, categoria: 'servicios', dia: -1 },
      { descripcion: 'Cafe de la oficina', monto: 9000, categoria: 'alimentacion', dia: 0 },
      { descripcion: 'Taxi al trabajo', monto: 12000, categoria: 'transporte', dia: 0 },
    ],
    mantenimiento: [],
  },
  {
    id: 'emprendedor',
    nombre: 'Emprendedor',
    icono: '🚀',
    para: 'Clientes, ventas y gastos del negocio.',
    eventos: [
      { titulo: 'Trabajo en el negocio', categoria: 'trabajo', dia: 0, hora: '09:00', duracion: 300, inamovible: true },
      { titulo: 'Visita de cliente', categoria: 'personal', dia: 0, hora: '15:00', duracion: 120 },
      { titulo: 'Sesion de marketing', categoria: 'estudio', dia: 1, hora: '10:00', duracion: 90 },
    ],
    tareas: [
      { titulo: 'Cobrar la factura del cliente', materia: 'Ventas', dia: 1, prioridad: 'alta', minutos: 30 },
      { titulo: 'Publicar en redes', materia: 'Marketing', dia: 2, prioridad: 'media', minutos: 60 },
    ],
    registros: [
      { descripcion: 'Compra de material de oficina', monto: 85000, categoria: 'servicios', dia: -1 },
      { descripcion: 'Advertising en redes', monto: 120000, categoria: 'ocio', dia: 0 },
    ],
    mantenimiento: [
      { tarea: 'Revision del computador', intervalo_dias: 120, costo: 45000, dia: 10 },
    ],
  },
  {
    id: 'moto',
    nombre: 'Moto y mantenimiento',
    icono: '🏍️',
    para: 'Transporte propio y el mantenimiento que no se puede olives.',
    eventos: [
      { titulo: 'Trabajo en oficina', categoria: 'trabajo', dia: 0, hora: '08:00', duracion: 240, inamovible: true },
      { titulo: 'Taller de la moto', categoria: 'mantenimiento', dia: 2, hora: '10:00', duracion: 120, inamovible: true },
    ],
    tareas: [
      { titulo: 'Revisar el correo del trabajo', materia: 'Trabajo', dia: 0, prioridad: 'baja', minutos: 20 },
    ],
    registros: [
      { descripcion: 'Tanqueo de la moto', monto: 20000, categoria: 'combustible', dia: 0 },
      { descripcion: 'Cambio de aceite de la moto', monto: 85000, categoria: 'mantenimiento', dia: -5 },
    ],
    mantenimiento: [
      { tarea: 'Cambio de aceite', intervalo_dias: 90, costo: 85000, dia: 85 },
      { tarea: 'Cambio de filtro', intervalo_dias: 120, costo: 45000, dia: 115 },
      { tarea: 'Revision de frenos', intervalo_dias: 60, costo: 60000, dia: 55 },
    ],
  },
  {
    id: 'simple',
    nombre: 'Semana simple',
    icono: '🗓️',
    para: 'Lo minimo para ver como se ve la agenda.',
    eventos: [
      { titulo: 'Trabajo en oficina', categoria: 'trabajo', dia: 0, hora: '09:00', duracion: 180, inamovible: true },
      { titulo: 'Almuerzo', categoria: 'descanso', dia: 0, hora: '12:30', duracion: 60 },
    ],
    tareas: [{ titulo: 'Organizar la semana', materia: 'Personal', dia: 1, prioridad: 'baja', minutos: 30 }],
    registros: [{ descripcion: 'Almuerzo del dia', monto: 15000, categoria: 'alimentacion', dia: 0 }],
    mantenimiento: [],
  },
]

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const d2 = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${d2}`
}

function dia(hoy: Date, delta: number): string {
  const f = new Date(hoy)
  f.setDate(f.getDate() + delta)
  return iso(f)
}

function sumarHoras(fecha: string, hora: string, minutos: number): string {
  const [h, m] = hora.split(':').map(Number)
  const total = h * 60 + m + minutos
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${fecha}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
}

export interface DatosPlantilla {
  eventos: Evento[]
  tareas: Tarea[]
  registros: Registro[]
  mantenimiento: Mantenimiento[]
}

/** Convierte una plantilla en datos reales (con ids negativos para no chocar con el servidor). */
export function materializarPlantilla(plantilla: Plantilla, hoyDate: Date = new Date()): DatosPlantilla {
  let id = -100
  const siguiente = () => id--
  return {
    eventos: plantilla.eventos.map((e) => ({
      id: siguiente(),
      titulo: e.titulo,
      categoria: e.categoria,
      inicio: `${dia(hoyDate, e.dia)}T${e.hora}:00`,
      fin: sumarHoras(dia(hoyDate, e.dia), e.hora, e.duracion),
      inamovible: e.inamovible ?? false,
      notas: '',
      fuente: 'plantilla',
      duracion_min: e.duracion,
    })),
    tareas: plantilla.tareas.map((t) => ({
      id: siguiente(),
      titulo: t.titulo,
      materia: t.materia,
      fecha_entrega: dia(hoyDate, t.dia),
      estado: 'pendiente' as const,
      prioridad: t.prioridad,
      minutos_estimados: t.minutos,
      resumen: null,
      material: null,
      preguntas: [],
      fuente: 'plantilla',
    })),
    registros: plantilla.registros.map((r) => ({
      id: siguiente(),
      descripcion: r.descripcion,
      monto: r.monto,
      moneda: 'COP',
      categoria: r.categoria,
      fecha: dia(hoyDate, r.dia),
      notas: '',
    })),
    mantenimiento: plantilla.mantenimiento.map((m) => ({
      id: siguiente(),
      activo: 'true',
      tarea: m.tarea,
      intervalo_dias: m.intervalo_dias,
      ultima_realizacion: dia(hoyDate, -1),
      proxima_fecha: dia(hoyDate, m.dia),
      costo_estimado: m.costo,
      notas: '',
      dias_restantes: m.dia,
      vencido: false,
    })),
  }
}
