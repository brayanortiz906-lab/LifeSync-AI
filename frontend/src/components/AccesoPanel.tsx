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
import { Check, CircleAlert, Download, HardDriveDownload, KeyRound, LogIn, LogOut, Mail, ShieldCheck, User } from 'lucide-react'
import { useLifeAgente } from '../store/useLifeAgente'
import { api, borrarToken, cuentas, guardarToken, permisos as apiPermisos } from '../lib/api'
import type { InfoProveedores, Usuario } from '../types'
import { Aviso, Boton, Campo, Modal } from './ui'

export default function AccesoPanel({
  abierto, onCerrar, onSesionCambiada, onAbrirConexiones,
}: {
  abierto: boolean
  onCerrar: () => void
  onSesionCambiada: (usuario: Usuario | null) => void
  /** Abre el Centro de Conexiones (para quien instala LifeAgente). */
  onAbrirConexiones?: () => void
}) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [paso, setPaso] = useState<'inicio' | 'correo' | 'codigo' | 'google' | 'password' | 'permisos'>('inicio')
  const [googleAuth, setGoogleAuth] = useState<{
    user_code: string
    verification_uri: string
    device_code: string
  } | null>(null)
  const [permisosAuth, setPermisosAuth] = useState<{
    user_code: string
    verification_uri: string
    device_code: string
  } | null>(null)
  const [correo, setCorreo] = useState('')
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [modoCorreo, setModoCorreo] = useState<'crear' | 'entrar'>('entrar')
  const [codigo, setCodigo] = useState('')
  const [codigoDePrueba, setCodigoDePrueba] = useState('')
  /** Como se mando el codigo: "smtp", "consola" o "ninguno" (v36). */
  const [modoEnvio, setModoEnvio] = useState('')
  /** Se enciende cuando Drive no deja guardar: entonces se ofrecen las otras vias. */
  const [driveSinAutorizar, setDriveSinAutorizar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [googleDisponible, setGoogleDisponible] = useState<boolean | null>(null)
  const [info, setInfo] = useState<InfoProveedores | null>(null)
  const [proveedorActivo, setProveedorActivo] = useState<string | null>(null)
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null)
  /** v44: en local no hay cuentas ni Drive. */
  const perfil = useLifeAgente((s) => s.perfil)

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
      setPassword('')
      void cargar()
      // ¿El servidor tiene el acceso con Google listo? (para no mostrar un error)
      void cuentas
        .googleDisponible()
        .then((r: { disponible: boolean }) => setGoogleDisponible(r.disponible))
        .catch(() => setGoogleDisponible(null))
      // Que cuentas se pueden usar para entrar y cuales estan activadas aqui.
      void cuentas
        .proveedores()
        .then((r: { proveedores: any[] }) => setInfo({ ok: true, proveedores: r.proveedores, correo: { disponible: true, mensaje: '' }, local: { disponible: true, mensaje: '' } }))
        .catch(() => setInfo(null))
    }
  }, [abierto])

  const entrar = (token: string | undefined, u: Usuario | undefined) => {
    if (!token || !u) return
    guardarToken(token)
    setUsuario(u)
    onSesionCambiada(u)
    setEstado({ ok: true, texto: `Listo, ${u.nombre || u.correo}. Tus datos ya son solo tuyos.` })
    setPaso('inicio')
  }

  /** Paso 1: pedir el codigo de autorizacion (la app ya tiene el permiso). */
  const entrarConGoogle = async (proveedor = 'google_cuenta') => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.iniciarAccesoGoogle(proveedor) as { user_code: string; verification_uri: string; device_code: string }
      setGoogleAuth({ user_code: r.user_code, verification_uri: r.verification_uri, device_code: r.device_code })
      setProveedorActivo(proveedor)
      setPaso('google')
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  /** Un proveedor que este servidor no tiene: explica y ofrece salida. */
  const avisarNoDisponible = (proveedor: string) => {
    const p = info?.proveedores.find((x) => x.id === proveedor)
    setEstado({
      ok: false,
      texto: p?.mensaje ?? 'Este servidor todavia no tiene ese acceso activado.',
    })
  }

  /** Paso 2: la persona ya autorizo en su navegador -> abrir su sesion. */
  const confirmarGoogle = async () => {
    if (!googleAuth) return
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.terminarAccesoGoogle(googleAuth.device_code, proveedorActivo ?? 'google_cuenta') as { ok: boolean; token?: string; usuario?: any; mensaje?: string }
      if (r.ok && r.token && r.usuario) {
        entrar(r.token, r.usuario)
        setGoogleAuth(null)
        return
      }
      setEstado({ ok: false, texto: r.mensaje || 'Todavia falta que autorices en el navegador.' })
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
      const r = await cuentas.pedirCodigo(correo) as { mensaje: string; codigo?: string; modo?: string }
      setEstado({ ok: true, texto: r.mensaje })
      if (r.codigo) setCodigoDePrueba(r.codigo)
      setModoEnvio(r.modo || '')
      setPaso('codigo')
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  /** Crea la cuenta con correo y contrasena (v19). */
  const crearCuenta = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.registrar({ correo, nombre, password }) as { mensaje: string; codigo?: string; modo?: string }
      setEstado({ ok: true, texto: r.mensaje })
      if (r.codigo) setCodigoDePrueba(r.codigo)
      setModoEnvio(r.modo || '')
      setPaso('codigo')
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  /** Reenvía el código de verificación (por correo o en pantalla). */
  const reenviarCodigo = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.reenviarCodigo(correo) as { mensaje?: string; codigo?: string; modo?: string }
      if (r.codigo) setCodigoDePrueba(r.codigo)
      setModoEnvio(r.modo || '')
      setEstado({ ok: true, texto: r.mensaje || 'Te mandamos un codigo nuevo.' })
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  /** Entra con correo y contrasena (v19). */
  const entrarConPassword = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.entrar({ correo, password }) as { token: string; usuario: any }
      entrar(r.token, r.usuario)
    } catch (e) {
      const texto = (e as Error).message
      setEstado({ ok: false, texto })
      // Si falta confirmar el correo, seguimos al paso del codigo.
      if (texto.toLowerCase().includes('codigo') || texto.toLowerCase().includes('confirma')) {
        setPaso('codigo')
      }
    } finally {
      setOcupado(false)
    }
  }

  /**
   * Entra o crea la cuenta con un solo boton (v33).
   * El servidor decide: si la cuenta existe entra, si no la crea y manda el
   * codigo de verificacion.
   */
  const entrarOCrear = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await cuentas.entrarOCrear({ correo, password, nombre }) as { accion: string; token?: string; usuario?: any; verificacion_pendiente?: boolean; mensaje?: string; codigo?: string; modo?: string }
      if (r.accion === 'entrar' && r.token) {
        entrar(r.token, r.usuario)
        if (r.verificacion_pendiente) {
          setEstado({ ok: true, texto: r.mensaje ?? 'Entraste, pero tu correo sigue sin confirmar.' })
        }
        return
      }
      // La cuenta es nueva o falta confirmar: seguimos al paso del codigo.
      if (r.codigo) setCodigo(r.codigo)
      if (r.modo) setModoEnvio(r.modo)
      setEstado({ ok: true, texto: r.mensaje ?? 'Revisa tu correo.' })
      setPaso('codigo')
    } catch (e) {
      const texto = (e as Error).message
      setEstado({ ok: false, texto })
      if (texto.toLowerCase().includes('codigo') || texto.toLowerCase().includes('confirma')) {
        setPaso('codigo')
      }
    } finally {
      setOcupado(false)
    }
  }

  /** Pide TODOS los permisos de una vez (Drive, Calendar, correo) (v19). */
  const pedirTodosLosPermisos = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      const r = await apiPermisos.autorizar() as { user_code: string; verification_uri: string; device_code: string }
      setPermisosAuth({
        user_code: r.user_code,
        verification_uri: r.verification_uri,
        device_code: r.device_code,
      })
      setPaso('permisos')
    } catch (e) {
      const msg = (e as Error).message
      if (/drive|autoriz|activad|permiso|identificador/i.test(msg)) setDriveSinAutorizar(true)
      setEstado({ ok: false, texto: msg })
    } finally {
      setOcupado(false)
    }
  }

  /** Ya autorizo en el navegador: guardamos los permisos. */
  const confirmarPermisos = async () => {
    if (!permisosAuth) return
    setOcupado(true)
    setEstado(null)
    try {
      const r = await apiPermisos.terminar() as { ok: boolean; mensaje?: string }
      if (r.ok) {
        setPermisosAuth(null)
        setEstado({
          ok: true,
          texto: 'Listo: autorizaste todo de una vez. LifeAgente ya puede trabajar solo.',
        })
      } else {
        setEstado({ ok: false, texto: r.mensaje || 'Todavia falta que autorices en el navegador.' })
      }
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
      const r = await cuentas.verificarCodigo(correo, codigo) as { token: string; usuario: any }
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
    setDriveSinAutorizar(false)
    try {
      const r = await cuentas.respaldoDriveDesdeConexion() as { archivo: string }
      setEstado({ ok: true, texto: `Respaldo guardado en tu Drive: ${r.archivo}.` })
    } catch (e) {
      const msg = (e as Error).message
      // Si lo que falla es que Drive todavia no esta autorizado, no se deja
      // un error seco: se ofrecen las otras dos vias (subirlo a mano o
      // activar el acceso), que siempre funcionan.
      if (/drive|autoriz|activad|permiso/i.test(msg)) {
        setDriveSinAutorizar(true)
        setEstado({
          ok: false,
          texto:
            'Tu Drive todavia no esta autorizado en este servidor. Abajo tienes las otras dos formas de guardarlo.',
        })
      } else {
        setEstado({ ok: false, texto: msg })
      }
    } finally {
      setOcupado(false)
    }
  }

  /** Descarga la copia y abre el uploader de Drive: siempre funciona, sin claves. */
  const descargarYSubirADrive = async () => {
    await descargarRespaldo()
    window.open('https://drive.google.com/drive/uploader', '_blank', 'noopener')
  }

  const conectado = !!usuario && !usuario.es_local

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={perfil === 'local' ? 'LifeAgente AI en este equipo' : 'Tu cuenta de LifeAgente AI'}
      descripcion={
        perfil === 'local'
          ? 'Version local: tus datos se guardan en este computador. No hace falta cuenta ni conexion.'
          : 'Elige como quieres entrar. Puedes seguir usandolo en este equipo sin crear nada.'
      }
    >
      <div className="space-y-4">
        {/* Estado actual */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/6 text-xl">
            {conectado ? <User size={18} className="text-indigo-300" /> : <HardDriveDownload size={18} className="text-emerald-300" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white">
              {perfil === 'local'
                ? 'Version local (en este equipo)'
                : conectado
                  ? usuario?.nombre || usuario?.correo
                  : 'Modo local (en este equipo)'}
            </div>
            <div className="truncate text-[11px] text-slate-400">
              {perfil === 'local'
                ? 'Tus datos viven en la base de datos de este equipo. Nada sale de tu computador.'
                : conectado
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
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Entra con la cuenta que tengas
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {(info?.proveedores ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => (p.disponible ? void entrarConGoogle(p.id) : avisarNoDisponible(p.id))}
                  disabled={ocupado}
                  className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition disabled:opacity-60 ${
                    p.disponible
                      ? 'border-white/10 bg-white/4 hover:bg-white/8'
                      : 'border-white/8 bg-white/2 hover:bg-white/5'
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6 text-base">
                    {p.icono || p.nombre.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white">{p.nombre}</div>
                    <div className="text-[10px] leading-relaxed text-slate-400">{p.detalle}</div>
                    <span
                      className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        p.disponible
                          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                          : 'bg-amber-500/12 text-amber-300 ring-1 ring-amber-500/25'
                      }`}
                    >
                      {p.disponible ? 'Listo, un clic' : 'No disponible aqui'}
                    </span>
                  </div>
                </button>
              ))}

              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/8 p-3.5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15">
                    <Mail size={16} className="text-indigo-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white">Cualquier correo</div>
                    <div className="text-[10px] leading-relaxed text-slate-400">
                      Google, Hotmail, Yahoo, iCloud... el que sea. Funciona siempre.
                    </div>
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                      Listo, un clic
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Boton variante="primario" onClick={() => { setModoCorreo('entrar'); setPaso('password') }}>
                    Entrar
                  </Boton>
                  <Boton variante="secundario" onClick={() => setPaso('correo')}>
                    Usar un codigo
                  </Boton>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/15">
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

        {!conectado && paso === 'password' && (
          <div className="space-y-3">
            <button onClick={() => setPaso('inicio')} className="text-[11px] font-semibold text-slate-400 hover:text-white">
              &larr; Volver
            </button>
            <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
              <strong className="text-slate-300">Un solo boton</strong>: si la cuenta ya existe
              entras, y si no, la creamos aqui mismo. Tu contrasena siempre va cifrada.
            </div>
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
            <Campo etiqueta="Tu nombre (opcional)" ayuda="Solo si quieres que te llamemos por otro nombre.">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Como te llamamos"
                className="ls-input"
              />
            </Campo>
            <Campo
              etiqueta="Tu contrasena"
              ayuda="Seis caracteres o mas. Solo la guardamos cifrada."
            >
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                autoComplete={modoCorreo === 'crear' ? 'new-password' : 'current-password'}
                className="ls-input"
              />
            </Campo>
            <Boton
              onClick={() => void entrarOCrear()}
              disabled={ocupado || !correo.includes('@') || password.length < 6}
            >
              {ocupado ? 'Un momento…' : 'Entrar o crear mi cuenta'}
            </Boton>
          </div>
        )}

        {!conectado && paso === 'permisos' && permisosAuth && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/8 p-4">
              <div className="text-xs font-bold text-indigo-200">Autoriza todo de una vez</div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                Da permiso para guardar tus respaldos en Drive, leer tu calendario y avisarte por
                correo. Tu contrasena nunca pasa por LifeAgente.
              </p>
              <div className="mt-3 select-all rounded-xl border border-indigo-500/30 bg-black/30 px-3 py-2 text-center font-mono text-lg font-bold tracking-widest text-indigo-100">
                {permisosAuth.user_code}
              </div>
              <a
                href={permisosAuth.verification_uri}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 underline hover:text-indigo-200"
              >
                Abrir la pagina de autorizacion <LogIn size={11} />
              </a>
              <div className="mt-3 flex items-center gap-2">
                <Boton onClick={() => void confirmarPermisos()} disabled={ocupado}>
                  {ocupado ? 'Comprobando...' : 'Listo, ya autorice'}
                </Boton>
                <button
                  onClick={() => { setPaso('inicio'); setPermisosAuth(null) }}
                  className="text-[11px] font-semibold text-slate-400 hover:text-white"
                >
                  Ahora no
                </button>
              </div>
            </div>
          </div>
        )}

        {!conectado && paso === 'google' && googleAuth && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/8 p-4">
              <div className="text-xs font-bold text-indigo-200">Autoriza en tu navegador</div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                Elige tu cuenta de Google y pulsa "Permitir". Tu contrasena nunca pasa por LifeAgente.
              </p>
              <div className="mt-3 select-all rounded-xl border border-indigo-500/30 bg-black/30 px-3 py-2 text-center font-mono text-lg font-bold tracking-widest text-indigo-100">
                {googleAuth.user_code}
              </div>
              <a
                href={googleAuth.verification_uri}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 underline hover:text-indigo-200"
              >
                Abrir la pagina de autorizacion <LogIn size={11} />
              </a>
              <div className="mt-3 flex items-center gap-2">
                <Boton onClick={() => void confirmarGoogle()} disabled={ocupado}>
                  {ocupado ? 'Comprobando...' : 'Listo, ya autorice'}
                </Boton>
                <button
                  onClick={() => {
                    setPaso('inicio')
                    setGoogleAuth(null)
                  }}
                  className="text-[11px] font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
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
            {modoEnvio === 'ninguno' ? (
              <Aviso tono="error">
                <strong>No pudimos enviarte el correo.</strong> Este servidor todavia no esta
                configurado para enviar correos, asi que el codigo no llego. Puedes: entrar con
                Google, Outlook o GitHub (un clic, sin codigo), entrar con tu correo y contrasena,
                o seguir en este equipo. Si eres quien instala LifeAgente, activa el correo en
                &laquo;Conectar IA &rarr; Ajustes tecnicos&raquo;.
              </Aviso>
            ) : codigoDePrueba ? (
              <Aviso tono="aviso">
                Este servidor todavia no envia correos: usa el codigo <strong>{codigoDePrueba}</strong> para entrar.
              </Aviso>
            ) : (
              <Aviso tono="info">
                Te enviamos el codigo a <strong>{correo}</strong>. Revisa tambien la carpeta de
                correo no deseado. El codigo vale 15 minutos.
              </Aviso>
            )}
            <Boton onClick={() => void verificar()} disabled={ocupado || codigo.length < 6}>
              {ocupado ? 'Comprobando…' : 'Entrar'}
            </Boton>
            <button
              onClick={() => void reenviarCodigo()}
              disabled={ocupado}
              className="text-[11px] font-semibold text-slate-400 hover:text-white disabled:opacity-50"
            >
              ¿No te llegó el código? Pide otro
            </button>
          </div>
        )}

        {conectado && perfil !== 'local' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/8 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15">
                  <KeyRound size={16} className="text-indigo-300" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-indigo-100">Pedir todos los permisos de una vez</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-slate-300">
                    Con un clic autorizas Drive, tu calendario y el correo. LifeAgente guarda tus
                    respaldos, trae tu agenda y te avisa, sin que tengas que hacer nada.
                  </div>
                  <div className="mt-2.5">
                    <Boton onClick={() => void pedirTodosLosPermisos()} disabled={ocupado}>
                      {ocupado ? 'Abriendo…' : 'Autorizar todo'}
                    </Boton>
                  </div>
                </div>
              </div>
            </div>
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
            {driveSinAutorizar && (
              <div className="space-y-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4">
                <div className="text-[11px] font-bold text-amber-100">
                  Guardar en Drive: dos caminos que siempre funcionan
                </div>
                <p className="text-[11px] leading-relaxed text-amber-100/80">
                  El acceso automatico a Drive necesita que el dueno de la app active una vez el
                  identificador publico de Google. Mientras tanto puedes copiar tu respaldo a
                  Drive a mano: se descarga el archivo y se abre el uploader de Drive (dos toques).
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <Boton variante="secundario" onClick={() => void descargarYSubirADrive()} disabled={ocupado}>
                    <Download size={13} />
                    Descargar y subir a Drive
                  </Boton>
                  {onAbrirConexiones && (
                    <Boton variante="fantasma" onClick={onAbrirConexiones}>
                      <KeyRound size={13} />
                      Activar el acceso a Google
                    </Boton>
                  )}
                </div>
              </div>
            )}
            <Boton variante="fantasma" onClick={() => void salir()} disabled={ocupado}>
              <LogOut size={13} />
              Cerrar sesión y volver al modo local
            </Boton>
          </div>
        )}

        {!conectado && estado && !estado.ok && onAbrirConexiones && (() => {
          const txt = estado.texto.toLowerCase()
          const fallaProveedor =
            txt.includes('google') ||
            txt.includes('acceso con') ||
            txt.includes('activado') ||
            txt.includes('outlook') ||
            txt.includes('github')
          if (!fallaProveedor) return null
          const enFalta = (info?.proveedores ?? []).find((p) => !p.disponible)
          return (
            <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
              <div className="text-[11px] font-bold text-slate-200">¿Eres quien instala LifeAgente?</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Los accesos con cuenta (Google, Outlook, GitHub) se activan una sola vez, en el
                servidor. Si esta es tu maquina puedes dejarlo listo aqui (tarda un minuto) y a
                partir de ahora todo el mundo entra con un clic. Mientras tanto, entrar con tu
                correo funciona igual de bien.
              </p>
              {enFalta?.url_registro && (
                <a
                  href={enFalta.url_registro}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[11px] font-semibold text-indigo-300 underline hover:text-indigo-200"
                >
                  Abrir el panel de {enFalta.nombre} <LogIn size={11} className="inline" />
                </a>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Boton variante="secundario" onClick={() => { onAbrirConexiones(); onCerrar() }}>
                  Activar el acceso con cuenta
                </Boton>
                <Boton variante="fantasma" onClick={() => { setModoCorreo('entrar'); setPaso('password') }}>
                  Entrar con mi correo
                </Boton>
              </div>
            </div>
          )
        })()}

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
