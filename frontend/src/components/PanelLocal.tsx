/**
 * Panel "Cosas de local" para la pagina normal.
 *
 * Hasta ahora lo local (motor de reglas, IA del computador, plantillas y
 * pegar texto de otro chat) solo se alcanzaba desde la pantalla de
 * bienvenida o desde el modal de conexiones. Aqui se deja a mano, dentro de
 * la vista principal, para que no haya que salir de lo que estabas mirando.
 */
import { useState } from 'react'
import { Cpu, Plug, Sparkles, Wifi } from 'lucide-react'
import { useLifeAgente } from '../store/useLifeAgente'
import { PLANTILLAS } from '../lib/plantillas'
import { Aviso, Boton, Panel } from './ui'

/** Motores que viven en el computador de la persona. */
const MOTORES_LOCALES = [
  'ollama',
  'lmstudio',
  'jan',
  'gpt4all',
  'llamacpp',
  'localai',
  'textgen',
  'kobold',
  'claude_local',
]

export default function PanelLocal({
  onAbrirConexiones,
}: {
  onAbrirConexiones: () => void
}) {
  const modoLocal = useLifeAgente((s) => s.modoLocal)
  const proveedor = useLifeAgente((s) => s.proveedor)
  const activarModoLocal = useLifeAgente((s) => s.activarModoLocal)
  const cargarPlantilla = useLifeAgente((s) => s.cargarPlantilla)
  const [textoPegado, setTextoPegado] = useState('')
  const [avisos, setAvisos] = useState('')

  const motorLocalConectado = MOTORES_LOCALES.includes(proveedor)
  const hayPlantillas = PLANTILLAS.length > 0

  return (
    <Panel
      titulo="Cosas de local"
      icono={<Cpu size={13} className="text-sky-400" />}
    >
      {/* Estado actual */}
      {motorLocalConectado ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3">
          <Wifi size={14} className="mt-0.5 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-emerald-100">
              Tu IA de este computador esta conectada
            </div>
            <div className="text-[10px] leading-relaxed text-emerald-200/80">
              Trabaja sin claves y sin internet. Todo se queda en tu equipo.
            </div>
          </div>
        </div>
      ) : modoLocal ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/8 p-3">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-sky-300" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-sky-100">
              Modo local: LifeAgente razona con su motor de reglas
            </div>
            <div className="text-[10px] leading-relaxed text-sky-200/80">
              Entiende fechas, horas y montos sin modelo de IA. Se guarda en este
              navegador.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/3 p-3">
          <Plug size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-slate-200">
              Usa la IA de tu computador: gratis, sin claves y sin internet
            </div>
            <div className="text-[10px] leading-relaxed text-slate-400">
              Si ya tienes Ollama, LM Studio u otra IA local, la detectamos y nos
              conectamos solos. Si no, te ayudamos a bajar una ligera de 400 MB.
            </div>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Boton variante="primario" onClick={onAbrirConexiones} className="!px-2.5 !py-1.5 text-[10px]">
          <Plug size={12} />
          {motorLocalConectado ? 'Cambiar de IA' : 'Conectar la IA de mi computador'}
        </Boton>
        {!modoLocal && !motorLocalConectado && (
          <Boton variante="secundario" onClick={activarModoLocal} className="!px-2.5 !py-1.5 text-[10px]">
            <Sparkles size={12} />
            Usar el motor local sin IA
          </Boton>
        )}
      </div>

      {/* Organizadores preestablecidos */}
      {hayPlantillas && (
        <div className="mt-3">
          <div className="ls-label mb-1.5">Empieza con un organizador listo</div>
          <div className="flex flex-wrap gap-1.5">
            {PLANTILLAS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  cargarPlantilla(p.id)
                  setAvisos(`Listo: cargamos el organizador "${p.nombre}".`)
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                title={p.para}
              >
                {p.icono} {p.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pegar informacion de otro chat */}
      <div className="mt-3">
        <div className="ls-label mb-1.5">Ya tienes la info en otro chat? Pegala aqui</div>
        <textarea
          value={textoPegado}
          onChange={(e) => setTextoPegado(e.target.value)}
          rows={3}
          placeholder={'Mañana tengo una cita a las 3 PM y además gasté 25 mil en gasolina'}
          className="ls-input min-h-[62px] resize-y"
        />
        <div className="mt-1.5 flex justify-end">
          <Boton
            variante="secundario"
            disabled={!textoPegado.trim()}
            onClick={() => {
              const { importarTexto } = useLifeAgente.getState()
              importarTexto(textoPegado)
              setAvisos('Listo: registre lo que pegaste.')
              setTextoPegado('')
            }}
            className="!px-2.5 !py-1.5 text-[10px]"
          >
            Registrar lo pegado
          </Boton>
        </div>
      </div>

      {avisos && (
        <div className="mt-2.5">
          <Aviso tono="ok">{avisos}</Aviso>
        </div>
      )}
    </Panel>
  )
}
