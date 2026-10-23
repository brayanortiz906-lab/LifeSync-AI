// Motor de reglas local (sin red): fechas, horas, montos, categorías, plantillas
// Funciona 100% offline en el navegador

export interface EntidadExtraida {
  tipo: 'evento' | 'tarea' | 'recordatorio' | 'nota' | 'alarma';
  titulo: string;
  descripcion?: string;
  fecha?: string;      // ISO YYYY-MM-DD
  hora?: string;       // HH:MM
  duracion_min?: number;
  prioridad?: 0 | 1 | 2;  // 0=normal, 1=alta, 2=urgente
  categoria?: string;
  monto?: number;
  recurrencia?: string;  // RRULE simplificado
  confianza: number;     // 0-1
}

export interface ResultadoProcesamiento {
  entidades: EntidadExtraida[];
  accion_sugerida: 'crear_evento' | 'crear_tarea' | 'crear_recordatorio' | 'crear_nota' | 'consultar' | 'desconocido';
  respuesta_natural: string;
  necesita_confirmacion: boolean;
}

// Patrones de fecha/hora en español
const PATRONES = {
  // Fechas relativas
  hoy: /\bhoy\b/i,
  manana: /\bmañana\b/i,
  pasado_manana: /\bpasado\s+mañana\b/i,
  esta_semana: /\besta\s+semana\b/i,
  proxima_semana: /\bpr[oó]xima\s+semana\b/i,
  este_mes: /\beste\s+mes\b/i,
  proximo_mes: /\bpr[oó]ximo\s+mes\b/i,
  
  // Días de la semana
  lunes: /\blunes\b/i,
  martes: /\bmartes\b/i,
  miercoles: /\bmi[eé]rcoles\b/i,
  jueves: /\bjueves\b/i,
  viernes: /\bviernes\b/i,
  sabado: /\bs[aá]bado\b/i,
  domingo: /\bdomingo\b/i,
  
  // Horas
  hora: /(\d{1,2})[:h](\d{2})?\s*(am|pm|a\.?m\.?|p\.?m\.?)?/i,
  en_X_minutos: /\ben\s+(\d+)\s*min/i,
  en_X_horas: /\ben\s+(\d+)\s*h/i,
  
  // Montos
  monto: /\b(\d+[.,]?\d*)\s*(€|EUR|USD|\$|pesos|mxn|eur|usd)\b/i,
  
  // Prioridad
  urgente: /\burgente\b|\bYA\b|\bAHORA\b/i,
  alta: /\bimportante\b|\balta\s+prioridad\b/i,
  normal: /\bnormal\b|\bcuando\s+puedas\b/i,
  
  // Categorías
  categoria_trabajo: /\btrabajo\b|\bcurro\b|\bempleo\b|\breunion\b|\bmeeting\b/i,
  categoria_estudio: /\bestudio\b|\bclase\b|\bexamen\b|\btarea\b|\bdeberes\b/i,
  categoria_salud: /\bsalud\b|\bmedico\b|\bcita\b|\bgimnasio\b|\bdeporte\b/i,
  categoria_finanzas: /\bdinero\b|\bbanco\b|\bpagar\b|\bcobrar\b|\bpresupuesto\b/i,
  categoria_casa: /\bcasa\b|\blimpiar\b|\bcomprar\b|\bsupermercado\b|\bmercado\b/i,
  categoria_personal: /\bpersonal\b|\bllamada\b|\bemail\b|\bcorreo\b/i,
  
  // Acciones
  accion_crear: /\bcrea\b|\bagrega\b|\bpon\b|\banota\b|\bapunta\b|\bprograma\b|\bagenda\b/i,
  accion_recordar: /\brecu[eé]rdame\b|\bavisa[me]?\b|\balerta\b|\bnotifica\b/i,
  accion_consultar: /\bqu[eé]\b|\bcu[aá]ndo\b|\bd[oó]nde\b|\bc[oó]mo\b|\bcu[aá]nto\b/i,
  
  // Plantillas
  plantilla_reunion: /\breuni[oó]n\b|\bmeeting\b|\bcall\b|\bvideollamada\b/i,
  plantilla_cita: /\bcita\b|\bappointmen\b|\bturno\b/i,
  plantilla_recordatorio: /\brecordator\b|\baviso\b|\balerta\b/i,
};

// Utilidades de fecha
function getFechaBase(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

function sumarDias(fecha: Date, dias: number): Date {
  const f = new Date(fecha);
  f.setDate(f.getDate() + dias);
  return f;
}

function obtenerDiaSemana(nombre: string): number {
  const dias: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6
  };
  return dias[nombre.toLowerCase()] ?? -1;
}

function proximaFechaDiaSemana(diaSemana: number): Date {
  const hoy = getFechaBase();
  const diaHoy = hoy.getDay();
  let diff = diaSemana - diaHoy;
  if (diff <= 0) diff += 7;
  return sumarDias(hoy, diff);
}

function parsearHora(texto: string): { hora: string; minuto: string } | null {
  const match = texto.match(/(\d{1,2})[:h](\d{2})?\s*(am|pm|a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return null;
  
  let hora = parseInt(match[1], 10);
  const minuto = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
  
  if (ampm && (ampm.startsWith('p') || ampm === 'pm')) {
    if (hora !== 12) hora += 12;
  } else if (ampm && (ampm.startsWith('a') || ampm === 'am')) {
    if (hora === 12) hora = 0;
  }
  
  if (hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59) {
    return { hora: hora.toString().padStart(2, '0'), minuto: minuto.toString().padStart(2, '0') };
  }
  return null;
}

function formatearFecha(fecha: Date): string {
  return fecha.toISOString().split('T')[0];
}

// Extractor principal
export function extraerEntidades(texto: string): ResultadoProcesamiento {
  const lower = texto.toLowerCase().trim();
  const entidades: EntidadExtraida[] = [];
  let accion_sugerida: ResultadoProcesamiento['accion_sugerida'] = 'desconocido';
  let respuesta_natural = '';
  let necesita_confirmacion = false;
  
  // Detectar acción principal
  if (PATRONES.accion_crear.test(lower) || PATRONES.accion_recordar.test(lower)) {
    if (PATRONES.plantilla_reunion.test(lower)) accion_sugerida = 'crear_evento';
    else if (PATRONES.plantilla_cita.test(lower)) accion_sugerida = 'crear_evento';
    else if (PATRONES.plantilla_recordatorio.test(lower)) accion_sugerida = 'crear_recordatorio';
    else accion_sugerida = 'crear_tarea';
  } else if (PATRONES.accion_consultar.test(lower)) {
    accion_sugerida = 'consultar';
  } else {
    accion_sugerida = 'crear_nota';
  }
  
  // Extraer fecha
  let fechaBase = getFechaBase();
  let fecha: Date | null = null;
  
  if (PATRONES.hoy.test(lower)) fecha = fechaBase;
  else if (PATRONES.manana.test(lower)) fecha = sumarDias(fechaBase, 1);
  else if (PATRONES.pasado_manana.test(lower)) fecha = sumarDias(fechaBase, 2);
  else if (PATRONES.esta_semana.test(lower)) fecha = fechaBase;
  else if (PATRONES.proxima_semana.test(lower)) fecha = sumarDias(fechaBase, 7);
  
  // Días de la semana
  for (const [dia, regex] of Object.entries({
    lunes: PATRONES.lunes, martes: PATRONES.martes, miercoles: PATRONES.miercoles,
    jueves: PATRONES.jueves, viernes: PATRONES.viernes, sabado: PATRONES.sabado, domingo: PATRONES.domingo
  })) {
    if (regex.test(lower)) {
      fecha = proximaFechaDiaSemana(obtenerDiaSemana(dia));
      break;
    }
  }
  
  // Extraer hora
  const horaMatch = lower.match(PATRONES.hora);
  let horaStr: string | undefined;
  if (horaMatch) {
    const parsed = parsearHora(horaMatch[0]);
    if (parsed) horaStr = `${parsed.hora}:${parsed.minuto}`;
  }
  
  // Extraer prioridad
  let prioridad: 0 | 1 | 2 = 0;
  if (PATRONES.urgente.test(lower)) prioridad = 2;
  else if (PATRONES.alta.test(lower)) prioridad = 1;
  else if (PATRONES.normal.test(lower)) prioridad = 0;
  
  // Extraer categoría
  let categoria = 'general';
  for (const [cat, regex] of Object.entries({
    trabajo: PATRONES.categoria_trabajo, estudio: PATRONES.categoria_estudio,
    salud: PATRONES.categoria_salud, finanzas: PATRONES.categoria_finanzas,
    casa: PATRONES.categoria_casa, personal: PATRONES.categoria_personal
  })) {
    if (regex.test(lower)) {
      categoria = cat;
      break;
    }
  }
  
  // Extraer monto
  const montoMatch = lower.match(PATRONES.monto);
  let monto: number | undefined;
  if (montoMatch) {
    monto = parseFloat(montoMatch[1].replace(',', '.'));
  }
  
  // Construir título (primeras palabras significativas)
  const palabras = texto.split(/\s+/).filter(p => p.length > 2);
  const titulo = palabras.slice(0, 8).join(' ') || texto.slice(0, 50);
  
  // Crear entidad
  const entidad: EntidadExtraida = {
    tipo: accion_sugerida === 'crear_evento' ? 'evento' :
          accion_sugerida === 'crear_recordatorio' ? 'recordatorio' :
          accion_sugerida === 'crear_tarea' ? 'tarea' : 'nota',
    titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
    descripcion: texto.length > titulo.length ? texto : undefined,
    fecha: fecha ? formatearFecha(fecha) : undefined,
    hora: horaStr,
    prioridad,
    categoria,
    monto,
    confianza: fecha ? 0.85 : 0.6,
  };
  
  entidades.push(entidad);
  
  // Respuesta natural
  const partes: string[] = [];
  partes.push(`Entendido: **${entidad.titulo}**`);
  if (fecha) partes.push(`para el ${fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`);
  if (horaStr) partes.push(`a las ${horaStr}`);
  if (prioridad > 0) partes.push(`(prioridad ${prioridad === 2 ? 'urgente' : 'alta'})`);
  if (categoria !== 'general') partes.push(`[${categoria}]`);
  if (monto) partes.push(`${monto}€`);
  
  respuesta_natural = partes.join(' ') + '. ¿Lo creo?';
  necesita_confirmacion = true;
  
  return {
    entidades,
    accion_sugerida,
    respuesta_natural,
    necesita_confirmacion,
  };
}

// Procesador de comandos de voz/texto rápido
export function procesarComandoRapido(texto: string): { tipo: string; datos: any } | null {
  const lower = texto.toLowerCase().trim();
  
  // "borra todo" / "limpia"
  if (/\bborra\s+todo\b|\blimpia\s+todo\b|\belimina\s+todo\b/i.test(lower)) {
    return { tipo: 'borrar_todo', datos: {} };
  }
  
  // "qué tengo hoy" / "agenda hoy"
  if (/\bqu[eé]\s+tengo\s+hoy\b|\bagenda\s+hoy\b|\bhoy\b.*\bqu[eé]\b/i.test(lower)) {
    return { tipo: 'consultar_hoy', datos: {} };
  }
  
  // "próxima semana"
  if (/\bpr[oó]xima\s+semana\b/i.test(lower)) {
    return { tipo: 'consultar_semana', datos: {} };
  }
  
  return null;
}

// Exportar patrones para testing
export { PATRONES };