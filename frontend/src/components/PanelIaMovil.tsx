// Panel "IA de tu movil": propone la IA que el aparato puede sostener,
// deja descargarla con un toque y pide permiso para los avisos.
import { useEffect, useState } from 'react'
import { Bell, Check, Cpu, Download, Loader2, Smartphone } from 'lucide-react'
import { api } from '../lib/api'
import { MODELOS_MOVIL, detectarRecursosMovil, recomendarIa } from '../lib/iaMovil'
import { pedirPermiso, permiso as permisoActual } from '../lib/alarmas'
import { Aviso, Boton, Panel } from './ui'

export default function PanelIaMovil({ alCambiar }: { alCambiar?: () => void }) {
  const [recursos] = useState(() => detectarRecursosMovil())
  const [reco] = useState(() => recomendarIa(recursos))
  const [permiso, setPermiso] = useState<string>(() => permisoActual())
  const [descargando, setDescargando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [mensaje, setMensaje] = useState('')
  const [yaEsta, setYaEsta] = useState(false)


  // Si la descarga ya esta en marcha, se sigue el progreso.
  useEffect(() => {
    if (!descargando) return
    const t = window.setInterval(() => {
      void api
        .descargas()
        .then((r) => {
          const d = r.descargas?.[0]
          if (!d) return
          setProgreso(d.progreso ?? 0)
          if (d.estado === 'listo') {
            setDescargando(false)
            setYaEsta(true)
            setMensaje('Listo: la IA ya esta en tu telefono.')
            alCambiar?.()
          } else if (d.estado === 'error') {
            setDescargando(false)
            setMensaje(d.mensaje ?? 'No se pudo descargar.')
          }
        })
        .catch(() => undefined)
    }, 2500)
    return () => window.clearInterval(t)
  }, [descargando, alCambiar])

  const descargar = async (modelo: string) => {
    setMensaje('')
    setProgreso(0)
    setDescargando(true)
    try {
      await api.descargarModelo(modelo)
      setMensaje('Descargando… no cierres la app.')
    } catch (e) {
      setDescargando(false)
      setMensaje(e instanceof Error ? e.message : 'No se pudo empezar la descarga.')
    }
  }

  const pedirAvisos = async () => {
    const ok = await pedirPermiso()
    setPermiso(ok ? 'granted' : 'denied')
    if (ok) setMensaje('Listo: te avisare cuando tengas que revisar algo.')
  }

  return (
    <Panel titulo="IA de tu movil" sub="La que este aparato puede sostener sin tragarse la bateria">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Smartphone size={13} className="text-emerald-300" />
          <span>{recursos.descripcion}</span>
        </div>

        {/* La recomendacion SIEMPRE sale primero */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-4">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-emerald-300" />
            <span className="text-xs font-black text-emerald-100">Recomendada para tu movil</span>
          </div>
          <div className="mt-2 text-sm font-bold text-white">{reco.nombre}</div>
          <div className="text-[11px] text-emerald-200/80">
            {reco.modelo} · {reco.tamanoMb} MB · {reco.motivo}
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-emerald-200/70">{reco.aviso}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton
              variante="primario"
              onClick={() => void descargar(reco.modelo)}
              disabled={descargando || yaEsta}
            >
              {descargando ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Descargando {progreso}%
                </>
              ) : yaEsta ? (
                <>
                  <Check size={13} /> Ya esta instalada
                </>
              ) : (
                <>
                  <Download size={13} /> Descargar la recomendada
                </>
              )}
            </Boton>
          </div>
          {descargando && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progreso}%` }} />
            </div>
          )}
        </div>

        {/* Los avisos del celular */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Bell size={13} className="text-amber-300" />
            Avisos de tu celular
          </div>
          {permiso === 'granted' ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Listo: te avisare cuando tengas un bloque cerca o cuando el agente termine de
              reorganizar tu dia.
            </p>
          ) : permiso === 'denied' ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Las notificaciones estan bloqueadas en este navegador. Activalas en los ajustes del
              navegador (icono del candado, a la izquierda de la direccion) y vuelve a abrir la app.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                LifeAgente necesita permiso para avisarte cuando tienes que revisar algo. No
                mandamos nada sin que lo pidas.
              </p>
              <Boton variante="secundario" onClick={() => void pedirAvisos()} className="mt-2">
                <Bell size={13} /> Activar los avisos
              </Boton>
            </>
          )}
        </div>

        {/* Los otros modelos que caben */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
          <div className="text-xs font-bold text-white">Tambien caben en tu movil</div>
          <ul className="mt-2 space-y-2">
            {MODELOS_MOVIL.filter((m) => m.modelo !== reco.modelo).map((m) => (
              <li key={m.modelo} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-slate-200">{m.nombre}</div>
                  <div className="text-[10px] text-slate-500">
                    {m.modelo} · {m.tamanoMb} MB · {m.para}
                  </div>
                </div>
                <Boton variante="fantasma" onClick={() => void descargar(m.modelo)} disabled={descargando}>
                  <Download size={12} />
                </Boton>
              </li>
            ))}
          </ul>
        </div>

        {mensaje && <Aviso tono={yaEsta ? 'ok' : 'info'}>{mensaje}</Aviso>}

        <p className="text-[10px] leading-relaxed text-slate-500">
          En el movil solo se ofrecen IAs que corren en tu propio aparato: no gastan datos, no
          dependen de internet y nadie mas ve lo que escribes.
        </p>
      </div>
    </Panel>
  )
}
