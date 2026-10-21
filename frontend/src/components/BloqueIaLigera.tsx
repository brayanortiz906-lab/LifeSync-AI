/** Bloque "Descarga una IA ligera": baja un modelo pequeño para usar IA en el
 *  computador sin claves, sin cuentas y sin internet (despues de descargarlo).
 *
 *  La descarga la hace el backend (que es el que tiene a Ollama), en segundo
 *  plano: la interfaz solo pregunta como va.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, CircleAlert, Cpu, Download, Loader2, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import type { DescargaIA, InfoModelosLigeros } from '../types'
import { Aviso, Boton } from './ui'

export default function BloqueIaLigera({ alCambiar }: { alCambiar?: () => void }) {
  const [info, setInfo] = useState<InfoModelosLigeros | null>(null)
  const [descargas, setDescargas] = useState<DescargaIA[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [ligeros, lista] = await Promise.all([api.modelosLigeros(), api.descargas()])
      setInfo(ligeros)
      setDescargas(lista.descargas ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar la IA local.')
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Mientras haya descargas en marcha, se consulta el progreso cada 2 segundos.
  useEffect(() => {
    const hayDescargando = descargas.some((d) => d.estado === 'descargando')
    if (!hayDescargando) return
    const t = window.setInterval(() => {
      void api
        .descargas()
        .then((r) => setDescargas(r.descargas ?? []))
        .catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(t)
  }, [descargas])

  const bajar = async (modelo: string) => {
    setOcupado(true)
    setError('')
    try {
      await api.descargarModelo(modelo)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la descarga.')
    } finally {
      setOcupado(false)
    }
  }

  const enMarcha = descargas.find((d) => d.estado === 'descargando')
  const terminada = descargas.find((d) => d.estado === 'listo')
  const fallida = descargas.find((d) => d.estado === 'error')
  const yaInstalado = info?.motores?.some((m) => (m.modelos_disponibles ?? 0) > 0)

  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-500/8 p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-sky-100">
        <Download size={14} />
        Descarga una IA ligera
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
        No detectamos una IA en tu computador. Puedes bajar un modelo pequeno
        (gratis, sin cuentas, sin claves): se instala en tu equipo y despues
        LifeAgente trabaja aunque no tengas internet.
      </p>

      {info && !info.hay_motor && (
        <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[10px] font-semibold text-amber-200">
          <div className="flex items-center gap-1.5">
            <CircleAlert size={12} />
            Primero hay que instalar el motor (Ollama). El instalador de Windows
            lo hace por ti con un clic.
          </div>
        </div>
      )}

      {yaInstalado && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-200">
          <Check size={12} />
          Ya tienes {info?.motores?.[0]?.modelos_disponibles} modelo(s) instalado(s).
        </div>
      )}

      {/* Progreso de la descarga en curso */}
      {enMarcha && (
        <div className="mt-2.5 rounded-lg border border-white/10 bg-black/25 p-2.5">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-200">
            <span className="flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Bajando {enMarcha.modelo}
            </span>
            <span>{Math.round(enMarcha.progreso)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sky-400 transition-all"
              style={{ width: `${Math.max(2, Math.min(100, enMarcha.progreso))}%` }}
            />
          </div>
          {enMarcha.log?.length > 0 && (
            <pre className="mt-1.5 max-h-20 overflow-auto whitespace-pre-wrap break-words text-[9px] leading-snug text-slate-500">
              {enMarcha.log.slice(-4).join('\n')}
            </pre>
          )}
        </div>
      )}

      {terminada && (
        <Aviso tono="ok">
          <span className="flex items-center gap-1.5">
            <Check size={12} /> {terminada.modelo} esta listo. Ya puedes usarlo desde
            &quot;Conectar IA&quot; o deja que LifeAgente lo detecte solo.
          </span>
        </Aviso>
      )}

      {fallida && (
        <div className="mt-2.5">
          <Aviso tono="error">{fallida.mensaje || 'La descarga fallo.'}</Aviso>
        </div>
      )}

      {error && (
        <div className="mt-2.5">
          <Aviso tono="error">{error}</Aviso>
        </div>
      )}

      {/* Catalogo de modelos ligeros */}
      <div className="mt-2.5 space-y-1.5">
        {(info?.modelos ?? []).map((m) => {
          const enCurso = enMarcha?.modelo === m.id
          const listo = descargas.some((d) => d.modelo === m.id && d.estado === 'listo')
          return (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2"
            >
              <Cpu size={13} className="shrink-0 text-sky-300" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                  {m.nombre}
                  {m.recomendado && (
                    <span className="rounded-md bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-200">
                      recomendado
                    </span>
                  )}
                </div>
                <div className="truncate text-[10px] text-slate-500">
                  {m.tamano_mb} MB · {m.nota}
                </div>
              </div>
              <Boton
                variante={listo ? 'fantasma' : 'secundario'}
                onClick={() => void bajar(m.id)}
                disabled={ocupado || enCurso}
                className="!px-2 !py-1 text-[10px]"
              >
                {enCurso ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : listo ? (
                  <Check size={11} />
                ) : (
                  <Download size={11} />
                )}
                {enCurso ? 'Bajando' : listo ? 'Repetir' : 'Bajar'}
              </Boton>
            </div>
          )
        })}
      </div>

      {terminada && (
        <div className="mt-2.5">
          <Boton
            variante="primario"
            className="w-full"
            onClick={() => {
              void api
                .detectarLocales()
                .then(() => alCambiar?.())
                .catch(() => undefined)
            }}
          >
            <Sparkles size={12} />
            Buscar la IA descargada
          </Boton>
        </div>
      )}
    </div>
  )
}
