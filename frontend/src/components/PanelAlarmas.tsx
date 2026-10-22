import { useEffect, useState } from 'react'
import { Bell, BellOff, Check, Clock, Trash2 } from 'lucide-react'
import { OPCIONES_AVISO, armarAlarmas, alarmaDe, cancelar, leerAlarmas, pedirPermiso, permiso, programar } from '../lib/alarmas'
import type { Alarma, MinutosAntes } from '../lib/alarmas'
import { aFecha, hhmm } from '../lib/format'
import type { Evento } from '../types'
import { Aviso, Boton, Panel } from './ui'

/**
 * Panel de avisos del celular: aqui se encienden las notificaciones y se
 * ven (y se quitan) las alarmas ya programadas.
 */
export default function PanelAlarmas({ eventos }: { eventos: Evento[] }) {
  const [alarmas, setAlarmas] = useState<Alarma[]>([])
  const [estadoPermiso, setEstadoPermiso] = useState<string>('no-soportado')
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    setAlarmas(leerAlarmas())
    setEstadoPermiso(permiso())
    armarAlarmas()
  }, [])

  const refrescar = () => setAlarmas(leerAlarmas())

  const encender = async () => {
    const ok = await pedirPermiso()
    setEstadoPermiso(permiso())
    setMensaje(
      ok
        ? { ok: true, texto: 'Listo: LifeAgente te puede avisar de tus bloques.' }
        : { ok: false, texto: 'El navegador no dio permiso. Activalo en los ajustes del navegador.' },
    )
  }

  const armar = (evento: Evento, minutos: MinutosAntes) => {
    const alarma = programar(evento.id, evento.titulo, evento.inicio, minutos)
    refrescar()
    setMensaje({ ok: true, texto: `Te avisaremos de "${alarma.titulo}" ${textoMinutos(minutos)}.` })
  }

  const quitar = (id: string) => {
    cancelar(id)
    refrescar()
  }

  const proximos = eventos
    .filter((e) => aFecha(e.inicio).getTime() > Date.now())
    .sort((a, b) => aFecha(a.inicio).getTime() - aFecha(b.inicio).getTime())
    .slice(0, 3)

  return (
    <Panel titulo="Avisos del celular" sub="Alarma antes de un bloque, sin configurations">
      <div className="space-y-3">
        {estadoPermiso === 'granted' ? (
          <Aviso tono="ok">
            Notificaciones activadas: LifeAgente te avisa antes de un bloque, aunque la app este en segundo plano.
          </Aviso>
        ) : estadoPermiso === 'denied' ? (
          <Aviso tono="error">
            Las notificaciones estan bloqueadas. Activalas en los ajustes del navegador (el candado junto a la direccion).
          </Aviso>
        ) : (
          <div className="ls-card flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-slate-300">
              Enciende los avisos para que LifeAgente te llame la atencion antes de un bloque.
            </p>
            <Boton variante="primario" onClick={() => void encender()}>
              <Bell size={13} /> Activar avisos
            </Boton>
          </div>
        )}

        {mensaje && <Aviso tono={mensaje.ok ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}

        {alarmas.length > 0 && (
          <div className="space-y-1.5">
            <p className="ls-label">Avisos ya programados</p>
            {alarmas.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{a.titulo}</p>
                  <p className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock size={10} />
                    {hhmm(a.cuando)} · {textoMinutos(a.minutosAntes)}
                  </p>
                </div>
                <Boton variante="fantasma" onClick={() => quitar(a.id)} titulo="Quitar este aviso">
                  <Trash2 size={13} />
                </Boton>
              </div>
            ))}
          </div>
        )}

        {proximos.length > 0 && (
          <div className="space-y-1.5">
            <p className="ls-label">Avisar de un bloque proximo</p>
            {proximos.map((e) => {
              const yaEsta = alarmaDe(e.id)
              return (
                <div
                  key={e.id}
                  className="rounded-xl border border-white/8 bg-white/3 px-3 py-2"
                >
                  <p className="truncate text-xs font-semibold text-white">{e.titulo}</p>
                  <p className="text-[10px] text-slate-400">
                    {hhmm(e.inicio)} · {e.categoria}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {OPCIONES_AVISO.map((op) => {
                      const activa = yaEsta?.minutosAntes === op.valor
                      return (
                        <button
                          key={op.valor}
                          type="button"
                          onClick={() => armar(e, op.valor)}
                          className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                            activa
                              ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                              : 'bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10'
                          }`}
                        >
                          {activa && <Check size={9} className="mr-1 inline" />}
                          {op.texto}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {alarmas.length === 0 && proximos.length === 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <BellOff size={12} /> Todavia no hay nada agendado. Cuando tengas bloques, aqui los avisas.
          </p>
        )}
      </div>
    </Panel>
  )
}

function textoMinutos(minutos: number): string {
  if (minutos === 0) return 'al empezar'
  if (minutos === 1440) return '1 dia antes'
  if (minutos === 60) return '1 hora antes'
  return `${minutos} min antes`
}
