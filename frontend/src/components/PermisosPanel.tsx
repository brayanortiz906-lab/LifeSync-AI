/** LifeAgente AI — Permisos y autopiloto (v16).
 *
 * Aqui la persona concede, UNA sola vez, los permisos que necesita su cuenta
 * (Drive, Google Calendar, correo) y enciende el "piloto automatico": el
 * servidor trabaja solo con esos permisos, sin que nadie tenga la app abierta.
 *
 * Reglas de la casa:
 *   - la persona NUNCA ve IDs de cliente ni claves: eso lo configura quien
 *     instala (seccion de despliegue).
 *   - cada permiso explica en palabras simples para que sirve.
 *   - el sistema solo pide lo que necesita para funcionar solo.
 */
import { useEffect, useState } from 'react'
import { Check, CloudUpload, Download, KeyRound, Loader2, Mail, RefreshCw, Sparkles, X } from 'lucide-react'
import { cuentas, permisos as apiPermisos } from '../lib/api'
import type { EstadoPermisos } from '../types'
import { Aviso, Boton, Panel, Stat } from './ui'

/** Icono por tipo de permiso (los que no conozco usan un punto). */
const ICONO: Record<string, string> = {
  perfil: '👤',
  drive: '☁️',
  calendario: '📅',
  correo: '✉️',
}

export default function PermisosPanel() {
  const [estado, setEstado] = useState<EstadoPermisos | null>(null)
  const [pendiente, setPendiente] = useState<{
    user_code: string
    verification_uri: string
    device_code: string
  } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = async () => {
    try {
      setEstado(await apiPermisos.estado())
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    }
  }

  useEffect(() => {
    void cargar()
    // v21: el estado del guardado cambia solo (el servidor guarda con
    // retardo), asi que lo consultamos cada 15 segundos.
    const t = setInterval(() => {
      void cargar()
    }, 15000)
    return () => clearInterval(t)
  }, [])

  const autorizar = async () => {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await apiPermisos.autorizar()
      setPendiente({
        user_code: r.user_code,
        verification_uri: r.verification_uri,
        device_code: r.device_code,
      })
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const confirmar = async () => {
    if (!pendiente) return
    setOcupado(true)
    try {
      const r = await apiPermisos.terminar(pendiente.device_code)
      if (!r.ok) {
        setAviso({ ok: false, texto: r.mensaje || 'Todavia falta que autorices en el navegador.' })
        return
      }
      setPendiente(null)
      setAviso({ ok: true, texto: 'Permisos concedidos. Ya podemos trabajar solos.' })
      await cargar()
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const cambiarAutopiloto = async (datos: {
    activo: boolean
    respaldo_auto: boolean
    importar_calendario: boolean
    resumen_diario: boolean
  }) => {
    setOcupado(true)
    try {
      setEstado(await apiPermisos.autopiloto(datos))
      setAviso({ ok: true, texto: datos.activo ? 'Piloto automatico encendido.' : 'Piloto automatico apagado.' })
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  /** v21: guarda ya, sin esperar al retardo. */
  const guardarAhora = async () => {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await apiPermisos.guardar()
      setAviso(
        r.guardado
          ? { ok: true, texto: 'Guardado en tu Drive.' }
          : { ok: false, texto: r.mensaje || 'Todavia no tocaba guardar.' },
      )
      await cargar()
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  /** v21: manda el resumen de manana por correo ahora mismo. */
  const mandarResumen = async () => {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await apiPermisos.correoResumen()
      setAviso(
        r.ok
          ? { ok: true, texto: r.mensaje || 'Resumen enviado.' }
          : { ok: false, texto: r.mensaje || 'No se pudo enviar el correo.' },
      )
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const ejecutar = async () => {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await apiPermisos.ejecutar()
      if (!r.ok) {
        setAviso({ ok: false, texto: r.mensaje || 'El piloto automatico esta apagado.' })
        return
      }
      const respaldo = r.resumen?.respaldo
      const calendario = r.resumen?.calendario
      const partes: string[] = []
      if (respaldo) partes.push(respaldo.ok ? 'Respaldo guardado en tu Drive' : `Respaldo fallo: ${respaldo.mensaje ?? ''}`)
      if (calendario)
        partes.push(
          calendario.ok
            ? `${calendario.importados ?? 0} evento(s) importados de tu calendario`
            : `Calendario fallo: ${calendario.mensaje ?? ''}`,
        )
      setAviso({ ok: true, texto: partes.join(' · ') || 'Trabajo automatico terminado.' })
      await cargar()
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const respaldar = async () => {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await apiPermisos.respaldar()
      setAviso(
        r.ok
          ? { ok: true, texto: `Respaldo guardado: ${r.archivo ?? 'lifesync-respaldo.json'}` }
          : { ok: false, texto: r.mensaje ?? 'No se pudo guardar el respaldo.' },
      )
      await cargar()
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const respaldarACorreo = async () => {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await apiPermisos.respaldoCorreo()
      setAviso(
        r.ok
          ? { ok: true, texto: r.mensaje ?? 'Te mandamos el respaldo a tu correo.' }
          : { ok: false, texto: r.mensaje ?? 'No se pudo enviar el respaldo a tu correo.' },
      )
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const restaurarDesdeDrive = async () => {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await cuentas.restaurarDrive()
      const n = r.restaurados ?? {}
      const total = Object.values(n).reduce((a, b) => a + Number(b ?? 0), 0)
      setAviso({
        ok: true,
        texto: `Recuperamos tu contenido de Drive: ${total} bloque(s) restaurados.`,
      })
      await cargar()
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const importar = async () => {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await apiPermisos.importarCalendario()
      setAviso(
        r.ok
          ? { ok: true, texto: `${r.importados ?? 0} evento(s) importados de tu Google Calendar.` }
          : { ok: false, texto: r.mensaje ?? 'No se pudo importar el calendario.' },
      )
      await cargar()
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const conectado = estado?.conectado ?? false
  const pilot = estado?.autopiloto

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Panel
        titulo="Permisos de tu cuenta"
        icono={<KeyRound size={13} className="text-amber-400" />}
        cuerpoClass="space-y-4"
      >
        <p className="text-[11px] leading-relaxed text-slate-400">
          Con un solo clic autorizas a LifeAgente a trabajar con tu cuenta. A partir de ahi el
          sistema puede <strong className="text-slate-200">arreglarse solo</strong>: respaldar tu
          vida en tu Drive, traer tu agenda de Google y avisarte por correo. Tu contrasena nunca
          pasa por LifeAgente.
        </p>

        {/* Codigo de autorizacion */}
        {pendiente && (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-5 text-center">
            <div className="text-xs font-bold text-amber-100">
              Abre esta pagina e introduce el codigo
            </div>
            <div className="mx-auto mt-3 select-all rounded-xl border border-amber-500/30 bg-black/30 px-4 py-3 font-mono text-2xl font-black tracking-[0.35em] text-amber-100">
              {pendiente.user_code}
            </div>
            <a
              href={pendiente.verification_uri}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-amber-300 underline hover:text-amber-200"
            >
              Abrir la pagina de autorizacion
            </a>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Boton onClick={() => void confirmar()} disabled={ocupado}>
                {ocupado ? 'Comprobando…' : 'Listo, ya autoricé'}
              </Boton>
              <button
                onClick={() => {
                  setPendiente(null)
                  setAviso(null)
                }}
                className="text-[11px] font-semibold text-amber-200/70 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {!conectado && !pendiente && (
          <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
            <div className="text-sm font-bold text-white">Autorizar todo con un clic</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              Conectas tu cuenta de Google y concedes los 4 permisos de una vez. Despues, el
              sistema trabaja solo: no tienes que volver a autorizar nada.
            </p>
            <Boton
              variante="primario"
              className="mt-3"
              onClick={() => void autorizar()}
              disabled={ocupado}
            >
              {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Autorizar todo
            </Boton>
          </div>
        )}

        {/* Lista de permisos */}
        <div className="space-y-2.5">
          {(estado?.permisos ?? []).map((p) => (
            <div
              key={p.id}
              className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/3 p-4"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6 text-lg">
                {ICONO[p.id] ?? '•'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-bold text-slate-100">{p.titulo}</span>
                  {p.concedido ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      <Check size={10} /> Concedido
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                      Pendiente
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{p.descripcion}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{p.por_que}</p>
              </div>
            </div>
          ))}
          {!estado && <p className="text-[11px] text-slate-500">Cargando tus permisos…</p>}
        </div>

        {aviso && <Aviso tono={aviso.ok ? 'ok' : 'error'}>{aviso.texto}</Aviso>}
      </Panel>

      {conectado && (
        <Panel
          titulo="Piloto automatico"
          icono={<RefreshCw size={13} className="text-emerald-400" />}
          cuerpoClass="space-y-4"
        >
          <p className="text-[11px] leading-relaxed text-slate-400">
            Con el piloto encendido, el servidor hace el trabajo por su cuenta aunque no tengas la
            app abierta: guarda el respaldo, importa tu agenda y avisa por correo.
          </p>

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              etiqueta="Conectado como"
              valor={estado?.correo || 'tu cuenta'}
              tono="indigo"
            />
            <Stat
              etiqueta="Ultimo respaldo"
              valor={pilot?.ultimo_respaldo ? pilot.ultimo_respaldo.slice(0, 16).replace('T', ' ') : 'Nunca'}
              tono="emerald"
            />
            <Stat
              etiqueta="Proximo respaldo"
              valor={pilot?.proximo_respaldo ? pilot.proximo_respaldo.slice(0, 16).replace('T', ' ') : '—'}
              tono="amber"
            />
            <Stat
              etiqueta="Estado del guardado"
              valor={
                !pilot?.cambios_pendientes
                  ? 'Todo guardado'
                  : pilot.guarda_en_segundos > 0
                    ? `Guarda en ${pilot.guarda_en_segundos}s`
                    : 'Guardando…'
              }
              tono={pilot?.cambios_pendientes ? 'amber' : 'emerald'}
            />
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            <strong className="text-slate-200">Guardado con retardo:</strong> no se sube nada a la
            nube mientras escribes. Cuando dejas de poner informacion, el sistema espera un poco y
            guarda todo tu contenido en tu Drive. Asi nunca se guardan agendas a medio escribir.
          </p>

          <div className="space-y-2">
            <Interruptor
              etiqueta="Piloto automatico"
              ayuda="Que el sistema trabaje solo, sin que abras la app."
              activo={pilot?.activo ?? false}
              onChange={(v) =>
                void cambiarAutopiloto({
                  activo: v,
                  respaldo_auto: pilot?.respaldo_auto ?? true,
                  importar_calendario: pilot?.importar_calendario ?? true,
                  resumen_diario: pilot?.resumen_diario ?? false,
                })
              }
            />
            <Interruptor
              etiqueta="Respaldar solo en mi Drive"
              ayuda="Una copia de agenda, tareas y gastos: al parar de escribir y cada 12 horas."
              activo={pilot?.respaldo_auto ?? false}
              onChange={(v) =>
                void cambiarAutopiloto({
                  activo: pilot?.activo ?? false,
                  respaldo_auto: v,
                  importar_calendario: pilot?.importar_calendario ?? true,
                  resumen_diario: pilot?.resumen_diario ?? false,
                })
              }
            />
            <Interruptor
              etiqueta="Importar mi Google Calendar"
              ayuda="Trae tus eventos para que el agente no te pida lo mismo dos veces."
              activo={pilot?.importar_calendario ?? false}
              onChange={(v) =>
                void cambiarAutopiloto({
                  activo: pilot?.activo ?? false,
                  respaldo_auto: pilot?.respaldo_auto ?? true,
                  importar_calendario: v,
                  resumen_diario: pilot?.resumen_diario ?? false,
                })
              }
            />
            <Interruptor
              etiqueta="Resumen de manana por correo"
              ayuda="Cada dia te llega un correo con tu agenda de manana, tareas y gastos de ayer."
              activo={pilot?.resumen_diario ?? false}
              onChange={(v) =>
                void cambiarAutopiloto({
                  activo: pilot?.activo ?? false,
                  respaldo_auto: pilot?.respaldo_auto ?? true,
                  importar_calendario: pilot?.importar_calendario ?? true,
                  resumen_diario: v,
                })
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" onClick={() => void ejecutar()} disabled={ocupado}>
              <RefreshCw size={13} /> Ejecutar ahora
            </Boton>
            <Boton variante="secundario" onClick={() => void guardarAhora()} disabled={ocupado}>
              <CloudUpload size={13} /> Guardar ahora
            </Boton>
            <Boton variante="fantasma" onClick={() => void respaldar()} disabled={ocupado}>
              <CloudUpload size={13} /> Respaldar ahora
            </Boton>
            <Boton variante="fantasma" onClick={() => void respaldarACorreo()} disabled={ocupado}>
              <Mail size={13} /> Guardar una copia en tu correo
            </Boton>
            <Boton variante="fantasma" onClick={() => void importar()} disabled={ocupado}>
              Importar mi calendario
            </Boton>
            <Boton variante="fantasma" onClick={() => void mandarResumen()} disabled={ocupado}>
              Mandar el resumen ahora
            </Boton>
            <Boton variante="fantasma" onClick={() => void restaurarDesdeDrive()} disabled={ocupado}>
              <Download size={13} /> Recuperar de Drive
            </Boton>
          </div>
        </Panel>
      )}

      <Aviso tono="info" titulo="Para que no tengas que descargar nada">
        Esta pantalla funciona igual en la nube: el servidor guarda tus datos y trabaja solo. En
        tu equipo, sin descargar nada, tambien funciona: la app detecta la IA que ya tengas
        instalada (Ollama, LM Studio) y se conecta sola. Tu Drive es el almacen real: si el
        servidor se reinicia, al entrar de nuevo recuperamos de ahi todo lo que tenias.
      </Aviso>
    </div>
  )
}

/** Interruptor de una linea. */
function Interruptor({
  etiqueta,
  ayuda,
  activo,
  onChange,
}: {
  etiqueta: string
  ayuda: string
  activo: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!activo)}
      className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3.5 py-3 text-left transition hover:bg-white/6"
    >
      <span
        className={`grid h-5 w-9 shrink-0 place-items-center rounded-full p-0.5 transition ${
          activo ? 'bg-emerald-500/80' : 'bg-white/15'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition ${
            activo ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold text-slate-200">{etiqueta}</span>
        <span className="block text-[10px] leading-relaxed text-slate-500">{ayuda}</span>
      </span>
      {activo ? (
        <Check size={13} className="text-emerald-400" />
      ) : (
        <X size={13} className="text-slate-600" />
      )}
    </button>
  )
}
