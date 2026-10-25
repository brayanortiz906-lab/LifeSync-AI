/** Pantalla de bienvenida: el apartado que aparece ANTES de iniciar sesion.
 *
 *  Aqui la persona elige COMO entrar, con un solo clic:
 *    - Google, Outlook o GitHub (inicio de sesion en el navegador).
 *    - Más opciones (correo con codigo, sin cuenta, modo de prueba).
 *    - Sin cuenta: se queda en su equipo, con la IA que ya tenga instalada.
 *
 *  El paso tecnico (configurar un cliente OAuth) lo hace una sola vez quien
 *  instala LifeAgente; aqui jamas se le pide nada a quien usa la app.
 */
import { useEffect, useState } from 'react'
import {
  Check, CircleAlert, Cpu, FlaskConical, LogIn, Mail, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import { useLifeAgente } from '../store/useLifeAgente'
import { cuentas, guardarToken } from '../lib/api'
import { PLANTILLAS } from '../lib/plantillas'
import type { InfoProveedores, Usuario } from '../types'
import { Aviso, Boton } from './ui'

type Proveedor = 'google_cuenta' | 'outlook_cuenta' | 'github_cuenta'

const OPCIONES: Array<{ id: Proveedor; titulo: string; texto: string; icono: string }> = [
  {
    id: 'google_cuenta',
    titulo: 'Continuar con Google',
    texto: 'Un clic. Autorizas en tu navegador y entras.',
    icono: 'G',
  },
  {
    id: 'outlook_cuenta',
    titulo: 'Continuar con Outlook',
    texto: 'Tu cuenta de Outlook o Hotmail, igual de rápido.',
    icono: '🪟',
  },
  {
    id: 'github_cuenta',
    titulo: 'Continuar con GitHub',
    texto: 'Ideal si ya trabajas con GitHub.',
    icono: '🐙',
  },
]

export default function Bienvenida({
  abierto, onCerrar, onSesion, onAbrirAcceso, onModoPrueba, onContinuarLocal,
  onCargarPlantilla, onPegarTexto,
}: {
  abierto: boolean
  onCerrar: () => void
  onSesion: (token: string, usuario: Usuario) => void
  onAbrirAcceso: () => void
  onModoPrueba: () => void
  onContinuarLocal: () => void
  onCargarPlantilla: (id: string) => void
  onPegarTexto: (texto: string) => void
}) {
  const [pendiente, setPendiente] = useState<{
    proveedor: Proveedor
    user_code: string
    verification_uri: string
    device_code: string
  } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [textoPegado, setTextoPegado] = useState('')
  /** Que cuentas estan activadas en este servidor (para no prometer lo que no hay). */
  const [info, setInfo] = useState<InfoProveedores | null>(null)
  /** v44: en la version local no hay cuentas: todo vive en este equipo. */
  const perfil = useLifeAgente((s) => s.perfil)

  useEffect(() => {
    if (!abierto) return
    void cuentas
      .proveedores()
      .then((r: { proveedores: any[] }) => setInfo({ ok: true, proveedores: r.proveedores, correo: { disponible: true, mensaje: '' }, local: { disponible: true, mensaje: '' } }))
      .catch(() => setInfo(null))
  }, [abierto])

  if (!abierto) return null

  const iniciar = async (proveedor: Proveedor) => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.iniciarAccesoGoogle(proveedor) as { user_code: string; verification_uri: string; device_code: string }
      setPendiente({
        proveedor,
        user_code: r.user_code,
        verification_uri: r.verification_uri,
        device_code: r.device_code,
      })
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const confirmar = async () => {
    if (!pendiente) return
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.terminarAccesoGoogle(pendiente.device_code, pendiente.proveedor) as { ok: boolean; token?: string; usuario?: any; mensaje?: string }
      if (r.ok && r.token && r.usuario) {
        guardarToken(r.token)
        onSesion(r.token, r.usuario)
        onCerrar()
        return
      }
      setEstado({
        ok: false,
        texto: r.mensaje || 'Todavia falta que autorices en el navegador.',
      })
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-6 p-6">
        {/* Cabecera */}
        <div className="relative text-center">
          <button
            onClick={onCerrar}
            className="absolute right-0 top-0 rounded-lg p-1.5 text-slate-500 hover:bg-white/8 hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-300/80">
            LifeAgente AI
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Tu vida entera en un solo agente
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-slate-400">
            Agenda, estudios, gastos y mantenimiento. Le cuentas tu vida en palabras
            simples y el agente lo ordena todo: agenda, clasifica y reorganiza tu día
            sin que se te solape nada.
          </p>
        </div>

        {/* Código de autorización */}
        {pendiente && (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-5 text-center">
            <div className="text-xs font-bold text-emerald-100">
              Abre esta pagina e introduce el codigo
            </div>
            <div className="mx-auto mt-3 select-all rounded-xl border border-emerald-500/30 bg-black/30 px-4 py-3 font-mono text-2xl font-black tracking-[0.35em] text-emerald-100">
              {pendiente.user_code}
            </div>
            <a
              href={pendiente.verification_uri}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-300 underline hover:text-emerald-200"
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
                  setEstado(null)
                }}
                className="text-[11px] font-semibold text-emerald-200/70 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* v44: version local: primero la IA de tu computador, sin cuentas. */}
        {perfil === 'local' && (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-5">
            <div className="text-sm font-black text-emerald-100">
              Version local: no necesitas crear cuenta
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-emerald-200/80">
              LifeAgente guarda todo en la base de datos de este computador
              (en la carpeta de datos de la app). No se sube nada a ningun servidor y
              puedes usar la IA que ya tengas instalada.
            </p>
          </div>
        )}

        {/* Opciones de acceso */}
        {!pendiente && (
          <div className="grid gap-3 sm:grid-cols-3">
            {OPCIONES.map((o) => {
              const estadoProv = info?.proveedores.find((p) => p.id === o.id)
              const listo = estadoProv ? estadoProv.disponible : true
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    if (listo) void iniciar(o.id)
                    else setEstado({ ok: false, texto: estadoProv?.mensaje ?? 'Ese acceso no esta disponible en este servidor.' })
                  }}
                  disabled={ocupado}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition disabled:opacity-60 ${
                    listo
                      ? 'border-white/10 bg-white/4 hover:border-white/20 hover:bg-white/8'
                      : 'border-white/8 bg-white/2 hover:bg-white/5'
                  }`}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/8 text-xl font-black text-white">
                    {o.icono}
                  </span>
                  <span className="text-[13px] font-bold text-white">{o.titulo}</span>
                  <span className="text-[11px] leading-relaxed text-slate-400">
                    {listo ? o.texto : 'Este servidor aun no lo tiene activado: usa tu correo o el modo local.'}
                  </span>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      listo
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'bg-amber-500/12 text-amber-300 ring-1 ring-amber-500/25'
                    }`}
                  >
                    {listo ? 'Listo, un clic' : 'No disponible aqui'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Más opciones */}
        {!pendiente && (
          <div className="grid gap-3 sm:grid-cols-3">
            {perfil !== 'local' && (
            <button
              onClick={onAbrirAcceso}
              className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/3 p-4 text-left transition hover:bg-white/6"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6">
                <Mail size={16} className="text-indigo-300" />
              </span>
              <span>
                <span className="block text-[12px] font-bold text-white">Más opciones</span>
                <span className="block text-[11px] leading-relaxed text-slate-400">
                  Entrar con un correo cualquiera (Hotmail, Yahoo, Gmail) con tu contrasena o con
                  un codigo de 6 digitos.
                </span>
              </span>
            </button>
            )}

            <button
              onClick={onContinuarLocal}
              className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/6 p-4 text-left transition hover:bg-emerald-500/10"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15">
                <Cpu size={16} className="text-emerald-300" />
              </span>
              <span>
                <span className="block text-[12px] font-bold text-emerald-100">
                  Sin cuenta, en este equipo
                </span>
                <span className="block text-[11px] leading-relaxed text-emerald-200/70">
                  Usamos la IA que ya tengas instalada (Ollama, LM Studio) y todo se
                  queda aqui.
                </span>
              </span>
            </button>

            <button
              onClick={onModoPrueba}
              className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/6 p-4 text-left transition hover:bg-amber-500/10"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15">
                <FlaskConical size={16} className="text-amber-300" />
              </span>
              <span>
                <span className="block text-[12px] font-bold text-amber-100">Modo de prueba</span>
                <span className="block text-[11px] leading-relaxed text-amber-200/70">
                  Temporal: los datos desaparecen en cuanto recargas la pagina.
                </span>
              </span>
            </button>
          </div>
        )}

        {estado && (
          <Aviso tono={estado.ok ? 'ok' : 'error'}>
            {estado.ok ? <Check size={12} className="mr-1 inline" /> : <CircleAlert size={12} className="mr-1 inline" />}
            {estado.texto}
          </Aviso>
        )}

        {/* Organizadores preestablecidos: informacion de ejemplo lista para usar. */}
        {!pendiente && (
          <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
            <div className="mb-1 text-[12px] font-bold text-white">
              O empieza con un organizador listo
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
              Plantillas con agenda, tareas y gastos de ejemplo. Cargalas con un clic y
              cambiala por la tuya. Funciona aunque no haya ninguna IA conectada.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PLANTILLAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onCargarPlantilla(p.id)}
                  className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/3 p-3 text-left transition hover:border-white/20 hover:bg-white/6"
                >
                  <span className="text-lg leading-none">{p.icono}</span>
                  <span>
                    <span className="block text-[11.5px] font-bold text-white">{p.nombre}</span>
                    <span className="block text-[10.5px] leading-relaxed text-slate-400">
                      {p.para}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 border-t border-white/8 pt-3">
              <label className="ls-label">Ya tienes la info en otro chat? Pegala aqui</label>
              <textarea
                value={textoPegado}
                onChange={(e) => setTextoPegado(e.target.value)}
                rows={2}
                placeholder="Mañana tengo clase a las 9 y gaste 20 mil en gasolina..."
                className="ls-input mt-1.5 resize-y"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-slate-500">
                  LifeAgente lee fechas, horas, montos y palabras clave. Sin IA, sin claves.
                </span>
                <Boton
                  variante="secundario"
                  onClick={() => {
                    onPegarTexto(textoPegado)
                    setTextoPegado('')
                  }}
                >
                  Registrar lo pegado
                </Boton>
              </div>
            </div>
          </div>
        )}

        {/* Pie */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={12} /> Cada persona ve solo sus datos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={12} /> Funciona sin clave de IA (modo local)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LogIn size={12} /> Nunca guardamos tu contrasena
          </span>
        </div>
      </div>
    </div>
  )
}
