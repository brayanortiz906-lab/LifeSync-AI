/**
 * Alarmas y notificaciones del celular.
 *
 * Funciona en los dos lados:
 * - En la web (PWA): usa la API de Notification del navegador.
 * - En el APK de Android: si esta el plugin de Capacitor, la alarma se
 *   agenda en el sistema (suena aunque la app este cerrada); si no, se usa
 *   la API de la web como respaldo.
 *
 * Las alarmas se guardan en este navegador, asi que sobreviven a que se
 * cierre la app: al volver a abrirla se vuelven a armar.
 */

export type MinutosAntes = 0 | 10 | 30 | 60 | 1440

export interface Alarma {
  /** Identificador unico de la alarma. */
  id: string
  /** Id del evento en la agenda (0 si es una alarma manual). */
  eventoId: number
  /** Titulo que se muestra en la notificacion. */
  titulo: string
  /** Momento exacto del aviso, en ISO local. */
  cuando: string
  /** Cuantos minutos antes del evento suena. */
  minutosAntes: MinutosAntes
  /** Cuando se creo la alarma (ISO). */
  creada: string
}

const CLAVE = 'lifesync.alarmas'

/** Opciones de aviso que se ofrecen al usuario. */
export const OPCIONES_AVISO: { valor: MinutosAntes; texto: string }[] = [
  { valor: 0, texto: 'Al empezar' },
  { valor: 10, texto: '10 min antes' },
  { valor: 30, texto: '30 min antes' },
  { valor: 60, texto: '1 hora antes' },
  { valor: 1440, texto: '1 dia antes' },
]

/* --------------------------------------------------------------------- */
/* Guardado                                                                */
/* --------------------------------------------------------------------- */

export function leerAlarmas(): Alarma[] {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return []
    const lista = JSON.parse(crudo)
    return Array.isArray(lista) ? (lista as Alarma[]) : []
  } catch {
    return []
  }
}

export function guardarAlarmas(listas: Alarma[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(listas))
  } catch {
    /* si el navegador no deja guardar, se sigue igual */
  }
}

/* --------------------------------------------------------------------- */
/* Permiso de notificaciones                                              */
/* --------------------------------------------------------------------- */

export function soportado(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function permiso(): NotificationPermission | 'no-soportado' {
  if (!soportado()) return 'no-soportado'
  return Notification.permission
}

/** Pide permiso para avisar. Devuelve si ya se puede notificar. */
export async function pedirPermiso(): Promise<boolean> {
  if (!soportado()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const r = await Notification.requestPermission()
    return r === 'granted'
  } catch {
    return false
  }
}

/* --------------------------------------------------------------------- */
/* Crear, cancelar y disparar                                             */
/* --------------------------------------------------------------------- */

/** Calcula el momento en que debe sonar el aviso. */
export function momentoAviso(inicio: string, minutosAntes: number): Date {
  const base = new Date(inicio)
  const ms = base.getTime()
  return new Date(ms - minutosAntes * 60_000)
}

/** Crea (o reemplaza) la alarma de un evento y la agenda. */
export function programar(
  eventoId: number,
  titulo: string,
  inicio: string,
  minutosAntes: MinutosAntes,
): Alarma {
  const alarma: Alarma = {
    id: `a${eventoId}-${minutosAntes}`,
    eventoId,
    titulo,
    cuando: momentoAviso(inicio, minutosAntes).toISOString(),
    minutosAntes,
    creada: new Date().toISOString(),
  }
  const lista = leerAlarmas().filter((a) => a.id !== alarma.id)
  lista.push(alarma)
  guardarAlarmas(lista)
  agendar(alarma)
  return alarma
}

export function cancelar(id: string): void {
  guardarAlarmas(leerAlarmas().filter((a) => a.id !== id))
}

export function alarmaDe(eventoId: number): Alarma | undefined {
  return leerAlarmas().find((a) => a.eventoId === eventoId)
}

/* --------------------------------------------------------------------- */
/* Motor                                                                    */
/* --------------------------------------------------------------------- */

interface PluginNotificaciones {
  schedule?: (opciones: Record<string, unknown>) => Promise<unknown>
  cancel?: (opciones: Record<string, unknown>) => Promise<unknown>
}

function plugin(): PluginNotificaciones | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
  return (cap?.Plugins?.LocalNotifications as PluginNotificaciones | undefined) ?? null
}

/** Agenda la alarma en el sistema (si es el APK) y deja un recordatorio en la web. */
function agendar(alarma: Alarma): void {
  const cuando = new Date(alarma.cuando).getTime()
  if (Number.isNaN(cuando)) return
  const p = plugin()
  if (p?.schedule) {
    try {
      void p.schedule({
        notifications: [
          {
            id: hashNumero(alarma.id),
            title: alarma.titulo,
            body: 'LifeAgente te avisa de este bloque',
            schedule: { at: new Date(cuando), allowWhileIdle: true },
          },
        ],
      })
    } catch {
      /* si falla el plugin, sigue la copia de la web */
    }
  }
  // Respaldo en la web: si la app esta abierta, se avisa en el momento.
  const espera = Math.min(cuando - Date.now(), 2_147_483_000)
  if (espera > 0) {
    window.setTimeout(() => avisar(alarma), espera)
  }
}

/** Muestra la notificacion. */
export function avisar(alarma: Alarma): void {
  if (!soportado() || Notification.permission !== 'granted') return
  const opciones: NotificationOptions = {
    body: 'LifeAgente te avisa de este bloque',
    icon: 'icon-192.png',
    tag: alarma.id,
  }
  // En Android el navegador exige que avise el service worker.
  const reg = navigator.serviceWorker?.getRegistration?.()
  if (reg) {
    reg
      .then((r) => r?.showNotification?.(alarma.titulo, opciones))
      .catch(() => {
        try {
          new Notification(alarma.titulo, opciones)
        } catch {
          /* nada que hacer */
        }
      })
    return
  }
  try {
    new Notification(alarma.titulo, opciones)
  } catch {
    /* algunos navegadores móvil requieren el service worker */
  }
}

/**
 * Vuelve a armar todas las alarmas al abrir la app.
 * Las que ya pasaron hace mas de una hora se descartan.
 */
export function armarAlarmas(): void {
  const ahora = Date.now()
  const validas = leerAlarmas().filter((a) => {
    const cuando = new Date(a.cuando).getTime()
    return !Number.isNaN(cuando) && cuando - ahora < 3_600_000
  })
  guardarAlarmas(validas)
  for (const a of validas) agendar(a)
}

/** Convierte un id de texto en un numero (lo exige el plugin de Android). */
function hashNumero(texto: string): number {
  let n = 0
  for (let i = 0; i < texto.length; i += 1) n = (n * 31 + texto.charCodeAt(i)) % 2_000_000_000
  return Math.abs(n) + 1
}
