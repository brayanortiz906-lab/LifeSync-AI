/** Panel de acceso: entrar con Google, entrar con correo o seguir en este equipo.
 *
 *  Tres caminos:
 *    1. "Entrar con Google"   -> usa la cuenta de Google ya conectada en
 *       "Conectar IA" (no hay que volver a autorizar nada).
 *    2. "Entrar con mi correo" -> pide un codigo de 6 digitos por correo
 *       (Google, Hotmail, Yahoo... sirve cualquiera).
 *    3. "Seguir en este equipo" -> modo local: todo se queda aqui, sin cuenta
 *       y sin subir nada a ningun servidor.
 */
import { useEffect, useState } from 'react'
import { Check, CircleAlert, Download, HardDriveDownload, LogIn, LogOut, Mail, ShieldCheck, User } from 'lucide-react'
import { api, borrarToken, cuentas, guardarToken } from '../lib/api'
import type { Usuario } from '../types'
import { Aviso, Boton, Campo, Modal } from './ui'

export default function AccesoPanel({
  abierto, onCerrar, onSesionCambiada,
}: {
  abierto: boolean
  onCerrar: () => void
  onSesionCambiada: (usuario: Usuario | null) => void
}) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [paso, setPaso] = useState<'inicio' | 'correo' | 'codigo'>('inicio')
  const [correo, setCorreo] = useState('')
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigoDePrueba, setCodigoDePrueba] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = async () => {
    try {
      const r = await cuentas.yo()
      setUsuario(r.usuario)
      onSesionCambiada(r.usuario)
    } catch {
      setUsuario(null)
    }
  }

  useEffect(() => {
    if (abierto) {
      setPaso('inicio')
      setEstado(null)
      setCodigo('')
      setCodigoDePrueba('')
      void cargar()
    }
  }, [abierto])

  const entrar = (token: string, u: Usuario) => {
    guardarToken(token)
    setUsuario(u)
    onSesionCambiada(u)
    setEstado({ ok: true, texto: `Listo, ${u.nombre || u.correo}. Tus datos ya son solo tuyos.` })
    setPaso('inicio')
  }

  const entrarConGoogle = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.entrarGoogleDesdeConexion()
      entrar(r.token, r.usuario)
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const pedirCodigo = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.pedirCodigo(correo, nombre)
      setEstado({ ok: true, texto: r.mensaje })
      if (r.codigo) setCodigoDePrueba(r.codigo)
      setPaso('codigo')
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const verificar = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.verificarCodigo(correo, codigo)
      entrar(r.token, r.usuario)
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const salir = async () => {
    try {
      await cuentas.salir()
    } catch {
      /* el token se borra igual */
    }
    borrarToken()
    setUsuario(null)
    onSesionCambiada(null)
    setEstado({ ok: true, texto: 'Cerraste sesion. Vuelves al modo local de este equipo.' })
  }

  const descargarRespaldo = async () => {
    setOcupado(true)
    try {
      const datos = await cuentas.respaldo()
      const texto = JSON.stringify(datos, null, 2)
      const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `lifesync-respaldo-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setEstado({ ok: true, texto: 'Respaldo descargado. Guardalo donde quieras.' })
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const guardarEnDrive = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.respaldoDriveDesdeConexion()
      setEstado({ ok: true, texto: `Respaldo guardado en tu Drive: ${r.archivo}.` })
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const conectado = !!usuario && !usuario.es_local

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Tu cuenta de LifeSync AI"
      descripcion="Elige como quieres entrar. Puedes seguir usandolo en este equipo sin crear nada."
    >
      <div className="space-y-4">
        {/* Estado actual */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/6 text-xl">
            {conectado ? <User size={18} className="text-indigo-300" /> : <HardDriveDownload size={18} className="text-emerald-300" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white">
              {conectado ? usuario?.nombre || usuario?.correo : 'Modo local (en este equipo)'}
            </div>
            <div className="truncate text-[11px] text-slate-400">
              {conectado
                ? `${usuario?.correo} · tus datos estan separados de los de otras personas`
                : 'Todo se guarda en tu computador. Nada se sube a ningun servidor.'}
            </div>
          </div>
          {conectado && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
              con cuenta
            </span>
          )}
        </div>

        {!conectado && paso === 'inicio' && (
          <div className="space-y-3">
            <button
              onClick={() => void entrarConGoogle()}
              disabled={ocupado}
              className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/4 p-4 text-left transition hover:bg-white/8 disabled:opacity-60"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/6 text-lg font-bold text-white">G</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white">Entrar con Google</div>
                <div className="text-[11px] leading-relaxed text-slate-400">
                  Un clic. Usamos la cuenta de Google que ya conectaste en "Conectar IA".
                </div>
              </div>
              <LogIn size={15} className="mt-1 shrink-0 text-slate-500" />
            </button>

            <button
              onClick={() => setPaso('correo')}
              className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/4 p-4 text-left transition hover:bg-white/8"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/6">
                <Mail size={17} className="text-indigo-300" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white">Entrar con mi correo</div>
                <div className="text-[11px] leading-relaxed text-slate-400">
                  Google, Hotmail, Yahoo... cualquiera. Te enviamos un codigo de 6 digitos.
                </div>
              </div>
            </button>

            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15">
                <ShieldCheck size={17} className="text-emerald-300" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-emerald-100">Seguir en este equipo</div>
                <div className="text-[11px] leading-relaxed text-emerald-200/70">
                  Sin cuenta y sin subir nada. Tus datos viven en tu computador y puedes
                  guardarlos como respaldo cuando quieras.
                </div>
              </div>
            </div>
          </div>
        )}

        {!conectado && paso === 'correo' && (
          <div className="space-y-3">
            <button onClick={() => setPaso('inicio')} className="text-[11px] font-semibold text-slate-400 hover:text-white">
              &larr; Volver
            </button>
            <Campo etiqueta="Tu correo" ayuda="Con el que te registraste o te quieres registrar.">
              <input
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="tunombre@ejemplo.com"
                type="email"
                autoComplete="email"
                className="ls-input"
              />
            </Campo>
            <Campo etiqueta="Tu nombre (opcional)">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Como te llamamos"
                className="ls-input"
              />
            </Campo>
            <Boton onClick={() => void pedirCodigo()} disabled={ocupado || !correo.includes('@')}>
              {ocupado ? 'Enviando…' : 'Enviarme el código'}
            </Boton>
          </div>
        )}

        {!conectado && paso === 'codigo' && (
          <div className="space-y-3">
            <button onClick={() => setPaso('correo')} className="text-[11px] font-semibold text-slate-400 hover:text-white">
              &larr; Cambiar de correo
            </button>
            <Campo etiqueta="Código de 6 dígitos" ayuda={`Lo enviamos a ${correo}.`}>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                className="ls-input text-center font-mono text-lg tracking-[0.4em]"
              />
            </Campo>
            {codigoDePrueba && (
              <Aviso tono="aviso">
                Este servidor todavia no envia correos: usa el codigo <strong>{codigoDePrueba}</strong> para probar.
              </Aviso>
            )}
            <Boton onClick={() => void verificar()} disabled={ocupado || codigo.length < 6}>
              {ocupado ? 'Comprobando…' : 'Entrar'}
            </Boton>
          </div>
        )}

        {conectado && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Boton variante="secundario" onClick={() => void descargarRespaldo()} disabled={ocupado}>
                <Download size={13} />
                Descargar respaldo
              </Boton>
              <Boton variante="secundario" onClick={() => void guardarEnDrive()} disabled={ocupado}>
                <HardDriveDownload size={13} />
                Guardar en mi Drive
              </Boton>
            </div>
            <Boton variante="fantasma" onClick={() => void salir()} disabled={ocupado}>
              <LogOut size={13} />
              Cerrar sesión y volver al modo local
            </Boton>
          </div>
        )}

        {estado && (
          <Aviso tono={estado.ok ? 'ok' : 'error'}>
            {estado.ok ? <Check size={12} className="mr-1 inline" /> : <CircleAlert size={12} className="mr-1 inline" />}
            {estado.texto}
          </Aviso>
        )}

        <p className="text-[10px] leading-relaxed text-slate-500">
          Nunca guardamos tu contrasena: con correo usamos un codigo temporal y con Google
          autorizas una sola vez en el navegador.
        </p>
      </div>
    </Modal>
  )
}
