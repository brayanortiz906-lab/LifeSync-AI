/** Centro de conexiones de IA: onboarding guiado paso a paso.
 *
 *  Objetivo: que una persona sin conocimientos tecnicos conecte LifeSync
 *  con "la cuenta de IA que ya tiene" sin saber que es un token o una API key.
 *
 *  Caminos ofrecidos:
 *    1. "Ya tengo mi cuenta"  -> inicio de sesion guiado (OpenAI, Anthropic, Google)
 *    2. "Tengo una clave"     -> BYOK con instrucciones paso a paso
 *    3. "En mi computador"     -> Ollama / LM Studio, sin credenciales
 *    4. "Solo quiero ver"      -> asistente demo integrado
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Check, CircleAlert, Cpu, Eye, EyeOff, Loader2, LogIn,
  Plug, RefreshCw, Search, Server, Sparkles, Trash2, Wifi,
} from 'lucide-react'
import { api, guardarUrlApi, leerUrlApi } from '../lib/api'
import type {
  AutorizacionCuenta, CatalogoModelos, Conexion, EstadoGoogle, ModeloCatalogo, MotorLocal,
  ProveedorCatalogo,
} from '../types'
import { Aviso, Boton, Campo, Chip, Modal } from './ui'

/** Los 4 caminos, ordenados de mas facil a mas avanzado. */
const CAMINOS: Array<{ id: string; titulo: string; texto: string; icono: string; modo: string }> = [
  {
    id: 'cuenta',
    titulo: 'Ya tengo mi cuenta de IA',
    texto: 'Conecta ChatGPT, Claude o Google con un clic. Sin copiar claves.',
    icono: '🔑',
    modo: 'cuenta',
  },
  {
    id: 'local',
    titulo: 'Usar la IA de mi computador',
    texto: 'Gratis, sin internet y sin ninguna clave. Detecta Ollama o LM Studio solo.',
    icono: '🏠',
    modo: 'local',
  },
  {
    id: 'clave',
    titulo: 'Tengo una clave de API',
    texto: 'Te guio paso a paso para obtenerla donde ya tienes tu cuenta.',
    icono: '🧠',
    modo: 'api_key',
  },
  {
    id: 'demo',
    titulo: 'Solo quiero ver como funciona',
    texto: 'El asistente demo, integrado y sin configurar nada.',
    icono: '✨',
    modo: 'demo',
  },
]

export default function ConexionesPanel({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [catalogo, setCatalogo] = useState<ProveedorCatalogo[]>([])
  const [conexiones, setConexiones] = useState<Conexion[]>([])
  const [motores, setMotores] = useState<MotorLocal[]>([])
  const [autoconectado, setAutoconectado] = useState<{
    id: number; proveedor: string; nombre: string; modelo: string; ok: boolean; mensaje: string
  } | null>(null)
  const [paso, setPaso] = useState<'inicio' | 'detalle' | 'elegir' | 'wizard'>('inicio')
  const [googleInfo, setGoogleInfo] = useState<EstadoGoogle | null>(null)
  const [caminos, setCaminos] = useState<string[]>([])
  const [seleccion, setSeleccion] = useState<ProveedorCatalogo | null>(null)
  const [clave, setClave] = useState('')
  const [visible, setVisible] = useState(false)
  const [modelo, setModelo] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [clientId, setClientId] = useState('')
  const [autorizacion, setAutorizacion] = useState<AutorizacionCuenta | null>(null)
  const [esperando, setEsperando] = useState(false)
  const [apiUrl, setApiUrl] = useState(() => leerUrlApi())
  const [modelos, setModelos] = useState<ModeloCatalogo[]>([])
  const [familias, setFamilias] = useState<{ familia: string; modelos: number }[]>([])
  const [filtroModelo, setFiltroModelo] = useState('')
  const [cargandoModelos, setCargandoModelos] = useState(false)

  const cargar = async () => {
    try {
      const [cat, cons, loc, google] = await Promise.all([
        api.catalogoConexiones(),
        api.conexiones(),
        api.detectarLocales(),
        api.estadoGoogle(),
      ])
      setCatalogo(cat.proveedores)
      setConexiones(cons)
      setMotores(loc.motores)
      setAutoconectado(loc.autoconectado ?? null)
      setGoogleInfo(google)
    } catch {
      /* el panel muestra el estado vacio */
    }
  }

  useEffect(() => {
    if (abierto) {
      setPaso('inicio')
      setSeleccion(null)
      setEstado(null)
      setClientId('')
      setAutorizacion(null)
      setEsperando(false)
      void cargar()
    }
  }, [abierto])

  const abrirDetalle = (p: ProveedorCatalogo) => {
    setSeleccion(p)
    setClave('')
    setEstado(null)
    setModelo(p.modelo_defecto)
    setBaseUrl('')
    setClientId('')
    setAutorizacion(null)
    setEsperando(false)
    setFiltroModelo('')
    setPaso('detalle')
    if (p.permite_seleccion_modelo) void cargarModelos(p.id)
  }

  /** Catalogo amplio de modelos (OpenRouter: mas de 300 IAs distintas). */
  const cargarModelos = async (proveedor: string) => {
    setCargandoModelos(true)
    try {
      const cat: CatalogoModelos = await api.modelosDisponibles(proveedor)
      setModelos(cat.modelos)
      setFamilias(cat.familias)
    } catch {
      setModelos([])
      setFamilias([])
    } finally {
      setCargandoModelos(false)
    }
  }

  /** Paso 1 del flujo de cuenta: pide el codigo de autorizacion al proveedor. */
  const autorizar = async (prov?: ProveedorCatalogo) => {
    const objetivo = prov ?? seleccion
    if (!objetivo) return
    setOcupado(true)
    setEstado(null)
    try {
      const inicio = await api.iniciarCuenta({
        proveedor: objetivo.id,
        client_id: clientId.trim(),
      })
      setAutorizacion(inicio)
      setEsperando(true)
      await consultarAutorizacion(objetivo, inicio)
    } catch (e) {
      const mensaje = (e as Error).message
      setEstado({ ok: false, texto: mensaje })
      // Si falta el ID de cliente de Google no dejamos un callejon sin salida:
      // abrimos el asistente con caminos que si funcionan.
      if (mensaje.toLowerCase().includes('id de cliente de google')) {
        setPaso('wizard')
      }
    } finally {
      setOcupado(false)
    }
  }

  /** Paso 2: consulta al backend si el usuario ya autorizo en su navegador. */
  const consultarAutorizacion = async (prov?: ProveedorCatalogo, auth?: AutorizacionCuenta) => {
    const objetivo = prov ?? seleccion
    const actual = auth ?? autorizacion
    if (!objetivo || !actual) return
    setEsperando(true)
    try {
      const res = await api.terminarCuenta({
        proveedor: objetivo.id,
        client_id: actual.client_id,
        device_code: actual.device_code,
      })
      if (res.ok) {
        setEstado({ ok: true, texto: res.mensaje })
        setEsperando(false)
        setAutorizacion(null)
        await cargar()
        if (objetivo.id === 'google_cuenta') {
          // Ya entro con Google: ahora elige con que IA quiere trabajar.
          setPaso('elegir')
        } else {
          setPaso('inicio')
        }
      } else {
        setEstado({ ok: false, texto: res.mensaje })
        setEsperando(false)
      }
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
      setEsperando(false)
    }
  }

  /** Entrar con Google: si ya hay ID de cliente, arranca solo; si no, al asistente. */
  const entrarConGoogle = async () => {
    const google = catalogo.find((c) => c.id === 'google_cuenta')
    if (!google) return
    if (!googleInfo?.configurado) {
      setPaso('wizard')
      return
    }
    abrirDetalle(google)
    await autorizar(google)
  }

  /** Guarda el ID de cliente de Google y entra de una vez. */
  const guardarClientIdYEntrar = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      await api.guardarGoogleClientId(clientId.trim())
      setGoogleInfo({
        configurado: true,
        origen: 'app',
        pista: 'ID de cliente de Google guardado. La próxima vez entras con un clic.',
      })
      const google = catalogo.find((c) => c.id === 'google_cuenta')
      if (google) {
        abrirDetalle(google)
        await autorizar(google)
      }
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const conectar = async () => {
    if (!seleccion) return
    setOcupado(true)
    setEstado(null)
    try {
      const guardada = await api.guardarConexion({
        proveedor: seleccion.id,
        api_key: clave || undefined,
        modelo: modelo || undefined,
        base_url: baseUrl || undefined,
      })
      const verificada = await api.verificarConexion(guardada.id)
      setEstado({
        ok: verificada.estado === 'activa',
        texto: verificada.detalle_estado ?? 'Conexión verificada.',
      })
      await cargar()
      if (verificada.estado === 'activa') {
        setPaso('inicio')
      }
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const conectarLocal = async (motor: MotorLocal) => {
    setOcupado(true)
    setEstado(null)
    try {
      const prov = catalogo.find((c) => c.id === motor.id)
      const guardada = await api.guardarConexion({
        proveedor: motor.id,
        base_url: motor.url,
        modelo: motor.modelos[0] ?? prov?.modelo_defecto,
      })
      const verificada = await api.verificarConexion(guardada.id)
      setEstado({
        ok: verificada.estado === 'activa',
        texto: verificada.detalle_estado ?? 'Conectado.',
      })
      await cargar()
      if (verificada.estado === 'activa') setPaso('inicio')
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const eliminarConexion = async (id: number) => {
    await api.eliminarConexion(id)
    await cargar()
  }

  const porModo = (modo: string) => catalogo.filter((c) => c.modo === modo)
  const motoresDisponibles = motores.filter((m) => porModo('local').some((c) => c.id === m.id))
  const activa = conexiones.find((c) => c.activa)
  // "Google (con mi cuenta de Google)" -> "Google": evita titles duplicados.
  const nombreCorto =
    (seleccion?.nombre ?? '').replace(/\s*\(.*\)\s*$/, '').trim() || (seleccion?.nombre ?? '')

  /** Modelos que coinciden con el filtro de busqueda ("cualquier IA"). */
  const modelosFiltrados = useMemo(() => {
    const f = filtroModelo.trim().toLowerCase()
    if (!f) return modelos.slice(0, 60)
    return modelos
      .filter((m) => m.id.toLowerCase().includes(f) || m.nombre.toLowerCase().includes(f))
      .slice(0, 60)
  }, [modelos, filtroModelo])

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Conectar tu IA"
      descripcion="Elige como conectarte. No necesitas saber que es una API key: te guio paso a paso."
      ancho="max-w-2xl"
      pie={
        paso === 'detalle' ? (
          <>
            <Boton variante="fantasma" onClick={() => setPaso('inicio')}>
              Volver
            </Boton>
            {seleccion?.modo !== 'cuenta' && (
              <Boton onClick={() => void conectar()} disabled={ocupado}>
                {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
                {seleccion?.modo === 'demo' ? 'Usar el asistente demo' : 'Conectar y verificar'}
              </Boton>
            )}
          </>
        ) : null
      }
    >
      <div className="space-y-4">
        {/* Resumen del estado actual */}
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 p-3">
          <span className="text-2xl">{activa?.icono ?? '✨'}</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white">
              {activa ? activa.nombre : 'Asistente demo (integrado)'}
            </div>
            <div className="truncate text-[11px] text-slate-400">
              {activa
                ? `${activa.modelo} · ${activa.estado === 'activa' ? 'conectado y listo' : activa.estado}`
                : 'Funciona sin configurar nada. Puedes conectarte cuando quieras.'}
            </div>
          </div>
          {activa && (
            <Chip className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">activo</Chip>
          )}
        </div>

        {/* Direccion de la API: util cuando la interfaz esta en GitHub Pages */}
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Server size={13} />
            Direccion de la API
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            Si abriste LifeSync desde GitHub Pages, pon aqui la direccion donde vive el
            servidor (por ejemplo <code className="text-slate-300">https://lifesync-api.onrender.com/api</code>).
            Se guarda solo en este navegador.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="dejala vacio si la API esta en este mismo sitio"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-100 outline-none transition focus:border-indigo-500/60"
            />
            <Boton
              variante="secundario"
              onClick={() => {
                guardarUrlApi(apiUrl)
                setEstado({ ok: true, texto: 'Dirección de la API guardada. Recargando…' })
                setTimeout(() => window.location.reload(), 600)
              }}
            >
              Guardar
            </Boton>
          </div>
        </div>

        {paso === 'inicio' ? (
          <>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Elige como quieres conectarte. <strong className="text-slate-300">No necesitas saber
              qué es una API key</strong>: si eliges una cuenta, te guio con cada paso.
            </p>

            {/* Camino destacado: entrar con Google y luego elegir IA */}
            <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/15 via-slate-900/60 to-slate-900/60 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-lg font-black text-blue-600 shadow-lg">
                  G
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white">Continuar con Google</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                    Entra con la misma cuenta de Google que usas para el correo. Despues eliges
                    con que IA quieres trabajar: <strong className="text-slate-200">Gemini, GPT,
                    Claude, Llama, DeepSeek</strong> y mas de 300 modelos.
                  </p>
                  {googleInfo?.configurado ? (
                    <p className="mt-1 text-[10px] font-semibold text-emerald-300">
                      Listo: el acceso con Google ya esta configurado en esta instalacion.
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-400">
                      Te guio con los pasos la primera vez (queda guardado para siempre).
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Boton
                      variante="primario"
                      onClick={() => void entrarConGoogle()}
                      disabled={!catalogo.some((c) => c.id === 'google_cuenta')}
                    >
                      <LogIn size={13} />
                      Entrar con Google
                    </Boton>
                    <span className="self-center text-[10px] text-slate-500">
                      Tu contrasena nunca pasa por LifeSync
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Motores locales detectados */}
            {motoresDisponibles.length > 0 && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-200">
                  <Wifi size={13} />
                  Detectamos IA en tu computador
                </div>
                {autoconectado && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-200">
                    <Check size={12} />
                    Conectado automaticamente a {autoconectado.nombre} ({autoconectado.modelo})
                  </div>
                )}
                <div className="mt-2 space-y-1.5">
                  {motoresDisponibles.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2">
                      <Cpu size={13} className="text-emerald-300" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-slate-200">{m.nombre}</div>
                        <div className="truncate text-[10px] text-slate-500">
                          {m.modelos_disponibles} modelo(s) · {m.url}
                        </div>
                      </div>
                      <Boton
                        variante="secundario"
                        onClick={() => conectarLocal(m)}
                        disabled={ocupado}
                        className="!px-2 !py-1 text-[10px]"
                      >
                        Conectar
                      </Boton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Los 4 caminos */}
            <div className="space-y-3">
              {CAMINOS.map((c) => {
                const opciones = porModo(c.modo)
                if (c.modo === 'local') {
                  return (
                    <div key={c.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{c.icono}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white">{c.titulo}</div>
                          <div className="text-[11px] leading-relaxed text-slate-400">{c.texto}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {opciones.map((o) => (
                              <button
                                key={o.id}
                                onClick={() => abrirDetalle(o)}
                                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                              >
                                {o.nombre}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }
                if (c.modo === 'cuenta' || c.modo === 'api_key') {
                  return (
                    <div key={c.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{c.icono}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white">{c.titulo}</div>
                          <div className="text-[11px] leading-relaxed text-slate-400">{c.texto}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {opciones.map((o) => (
                              <button
                                key={o.id}
                                onClick={() => abrirDetalle(o)}
                                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                              >
                                {o.icono} {o.nombre}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }
                // demo
                const demo = opciones[0]
                return (
                  <button
                    key={c.id}
                    onClick={() => demo && abrirDetalle(demo)}
                    className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/3 p-3 text-left transition hover:bg-white/8"
                  >
                    <span className="text-xl">{c.icono}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white">{c.titulo}</div>
                      <div className="text-[11px] leading-relaxed text-slate-400">{c.texto}</div>
                    </div>
                    <ArrowRight size={14} className="mt-1 shrink-0 text-slate-500" />
                  </button>
                )
              })}
            </div>

            {/* Conexiones guardadas */}
            {conexiones.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300">Tus conexiones</span>
                  <button onClick={() => void cargar()} className="text-slate-500 hover:text-slate-300">
                    <RefreshCw size={12} />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {conexiones.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/4 px-2.5 py-2">
                      <span className="text-sm">{c.icono}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-semibold text-slate-200">{c.nombre}</div>
                        <div className="truncate text-[10px] text-slate-500">
                          {c.modelo} · {c.detalle_estado ?? c.estado}
                        </div>
                      </div>
                      {c.activa && (
                        <Chip className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">activa</Chip>
                      )}
                      <button
                        onClick={() => void eliminarConexion(c.id)}
                        className="text-slate-500 hover:text-rose-400"
                        title="Eliminar conexión"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : paso === 'wizard' ? (
          /* ---------------------------------------------------------------- */
          /* Asistente de acceso con Google: 3 caminos, ninguno deja bloqueado */
          /* ---------------------------------------------------------------- */
          <div className="space-y-3">
            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/8 p-4 sm:p-5">
              <div className="flex items-center gap-2.5 text-sm font-bold text-blue-100">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-base font-black text-blue-600">
                  G
                </span>
                Entrar con Google
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                LifeSync necesita un identificador publico de aplicacion de Google (no es tu
                contrasena ni una clave secreta). Puedes crearlo en un minuto, o usar cualquiera
                de las otras dos vias: los tres caminos funcionan igual de bien.
              </p>
            </div>

            {/* Camino 1 */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5">
              <div className="text-xs font-bold text-white">
                Camino 1 · Activar el acceso con Google (1 minuto, queda guardado)
              </div>
              <ol className="mt-2.5 space-y-2">
                {[
                  'Abre la consola de Google Cloud y crea un proyecto (o usa el que ya tienes).',
                  'Ve a "APIs y servicios" > "Credenciales" y pulsa "Crear credenciales".',
                  'Elige "ID de cliente OAuth" y el tipo "App de escritorio".',
                  'Copia el "ID de cliente": son unos caracteres y un punto, no tu contraseña.',
                ].map((t, i) => (
                  <li key={i} className="ls-paso">
                    <span className="ls-paso-num">{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 underline hover:text-blue-200"
              >
                Abrir la consola de Google Cloud <ArrowRight size={11} />
              </a>
              <div className="mt-4">
                <Campo
                  etiqueta="ID de cliente"
                  ayuda="Es público: se puede guardar y borrar cuando quieras. No da acceso a tu cuenta sin que autorices."
                >
                  <input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="1234567890-abc.apps.googleusercontent.com"
                    autoComplete="off"
                    className="ls-input font-mono"
                  />
                </Campo>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Boton
                  variante="primario"
                  onClick={() => void guardarClientIdYEntrar()}
                  disabled={ocupado || clientId.trim().length < 10}
                >
                  {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Guardar y entrar con Google
                </Boton>
                <span className="text-[10px] text-slate-500">
                  Se guarda y no vuelve a pedirse: la proxima vez es un clic.
                </span>
              </div>
            </div>

            {/* Camino 2 */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5">
              <div className="text-xs font-bold text-white">
                Camino 2 · Entrar con Google en OpenRouter (sin crear nada en Google)
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                OpenRouter tiene boton "Sign in with Google". Con esa cuenta entras a mas de 300
                IAs (GPT, Claude, Gemini, Llama, DeepSeek) eligiendo el modelo en una lista.
              </p>
              <ol className="mt-2.5 space-y-2">
                {[
                  'Abre openrouter.ai y pulsa "Sign in with Google".',
                  'Entra a "Keys" y crea una clave (empieza por sk-or-).',
                  'Pega la clave en el siguiente paso: es la unica que necesitaras.',
                ].map((t, i) => (
                  <li key={i} className="ls-paso">
                    <span className="ls-paso-num">{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
              <Boton
                variante="secundario"
                onClick={() => {
                  const openrouter = catalogo.find((c) => c.id === 'openrouter')
                  if (openrouter) abrirDetalle(openrouter)
                }}
                className="mt-4"
              >
                Ir al paso de la clave <ArrowRight size={12} />
              </Boton>
            </div>

            {/* Camino 3 */}
            {motoresDisponibles.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4 sm:p-5">
                <div className="text-xs font-bold text-emerald-100">
                  Camino 3 · Usar la IA de tu computador (gratis, sin cuentas)
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                  Ya detectamos IA instalada en tu equipo. No necesitas ni Google ni claves.
                </p>
                <div className="mt-3 space-y-2">
                  {motoresDisponibles.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5"
                    >
                      <Cpu size={13} className="shrink-0 text-emerald-300" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-slate-200">{m.nombre}</div>
                        <div className="truncate text-[10px] text-slate-500">
                          {m.modelos_disponibles} modelo(s) · {m.url}
                        </div>
                      </div>
                      <Boton
                        variante="secundario"
                        onClick={() => void conectarLocal(m)}
                        disabled={ocupado}
                        className="!px-2.5 !py-1 text-[10px]"
                      >
                        Conectar
                      </Boton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {estado && (
              <Aviso tono={estado.ok ? 'ok' : 'error'}>
                {estado.texto}
              </Aviso>
            )}

            <div className="flex justify-end">
              <Boton variante="secundario" onClick={() => setPaso('inicio')}>
                Volver
              </Boton>
            </div>
          </div>
        ) : paso === 'elegir' ? (
          /* ---------------------------------------------------------------- */
          /* Tras entrar con Google: elegir con que IA trabajar               */
          /* ---------------------------------------------------------------- */
          <div className="space-y-3">
            <button
              onClick={() => setPaso('inicio')}
              className="text-[11px] font-semibold text-slate-400 hover:text-white"
            >
              ← Volver
            </button>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-200">
                <Check size={13} />
                Ya estas conectado con Google
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                Ahora elige con que IA quieres trabajar. Puedes cambiarla cuando quieras.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {catalogo.map((c) => (
                <button
                  key={c.id}
                  onClick={() => abrirDetalle(c)}
                  className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/4 p-3 text-left transition hover:bg-white/10"
                >
                  <span className="text-lg">{c.icono}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[11px] font-bold text-white">{c.nombre}</span>
                      {c.permite_google && (
                        <span className="shrink-0 rounded bg-blue-500/20 px-1 text-[9px] font-bold text-blue-300">
                          Google
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-400">
                      {c.resumen}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {c.gratis && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                          gratis
                        </span>
                      )}
                      {c.permite_seleccion_modelo && (
                        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">
                          300+ IAs
                        </span>
                      )}
                    </span>
                  </span>
                  <ArrowRight size={13} className="mt-1 shrink-0 text-slate-500" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ---------------------------------------------------------------- */
          /* Detalle de un proveedor: onboarding paso a paso                   */
          /* ---------------------------------------------------------------- */
          <div className="space-y-4">
            <div className="flex items-start gap-3.5 rounded-2xl border border-white/8 bg-white/3 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/6 text-xl">
                {seleccion?.icono}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{seleccion?.nombre}</h3>
                  {seleccion?.gratis && (
                    <Chip className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">gratis</Chip>
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{seleccion?.resumen}</p>
              </div>
            </div>

            {/* Ruta "cuenta": inicio de sesion guiado (OAuth device flow) */}
            {seleccion?.modo === 'cuenta' && (
              <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/8 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-200">
                  <LogIn size={14} />
                  Iniciar sesion con {nombreCorto}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                  Autorizas desde tu navegador con tu usuario y contrasena. Tu contrasena nunca
                  pasa por LifeSync.
                </p>

                {!autorizacion ? (
                  <>
                    <ol className="mt-4 space-y-2.5">
                      {(seleccion.instrucciones.length ? seleccion.instrucciones : [
                        'Crea una aplicación en la consola del proveedor.',
                        'Copia el "ID de cliente" (no es un token ni una contraseña).',
                        'Pega el ID aquí y pulsa "Autorizar en el navegador".',
                      ]).map((pasoTexto, i) => (
                        <li key={i} className="ls-paso">
                          <span className="ls-paso-num">{i + 1}</span>
                          <span>{pasoTexto}</span>
                        </li>
                      ))}
                    </ol>
                    {seleccion.url_client_id && (
                      <a
                        href={seleccion.url_client_id}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 underline hover:text-indigo-200"
                      >
                        Abrir la consola del proveedor <ArrowRight size={11} />
                      </a>
                    )}

                    <div className="mt-5">
                      <Campo
                        etiqueta="ID de cliente (opcional)"
                        ayuda="Caracteres publicos de una aplicación: no es un token ni tu contraseña. Dejalo vacio si esta copia de LifeSync ya trae uno."
                      >
                        <input
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder={
                            seleccion.id === 'google_cuenta'
                              ? 'dejalo vacio si la app ya tiene uno'
                              : '1234567890.apps.googleusercontent.com'
                          }
                          autoComplete="off"
                          className="ls-input font-mono"
                        />
                      </Campo>
                    </div>

                    <div className="mt-4">
                      <Boton
                        variante="secundario"
                        onClick={() => void autorizar()}
                        disabled={
                          ocupado ||
                          (seleccion.id !== 'google_cuenta' && clientId.trim().length < 10)
                        }
                      >
                        {ocupado ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
                        Autorizar en el navegador
                      </Boton>
                    </div>
                    {seleccion.pasos_ayuda.length > 0 && (
                      <ul className="mt-5 space-y-1.5 border-t border-white/8 pt-3.5">
                        {seleccion.pasos_ayuda.map((p, i) => (
                          <li key={i} className="flex gap-2 text-[10px] leading-relaxed text-slate-400">
                            <CircleAlert size={11} className="mt-0.5 shrink-0" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3">
                    <div className="text-[11px] font-bold text-emerald-200">
                      Abre esta pagina e introduce el codigo
                    </div>
                    <div className="mt-1.5 select-all rounded-lg border border-emerald-500/30 bg-black/30 px-3 py-2 text-center font-mono text-lg font-bold tracking-widest text-emerald-100">
                      {autorizacion.user_code}
                    </div>
                    <a
                      href={autorizacion.verification_uri}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 underline hover:text-emerald-200"
                    >
                      Abrir la pagina de autorizacion <ArrowRight size={11} />
                    </a>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                      {esperando ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Esperando que confirmes en el navegador...
                        </>
                      ) : (
                        <>
                          <CircleAlert size={12} />
                          Cuando termines, pulsa "Ya autorice".
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Boton variante="secundario" onClick={() => void consultarAutorizacion()} disabled={esperando}>
                        {esperando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        Ya autorice
                      </Boton>
                      <button
                        onClick={() => {
                          setAutorizacion(null)
                          setEsperando(false)
                        }}
                        className="text-[11px] font-semibold text-slate-400 hover:text-white"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Ruta "clave": BYOK guiado */}
            {seleccion?.modo === 'api_key' && (
              <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5">
                <div className="ls-label">Paso a paso para obtener tu clave</div>
                <ol className="mt-3 space-y-2.5">
                  {seleccion.instrucciones.map((p, i) => (
                    <li key={i} className="ls-paso">
                      <span className="ls-paso-num">{i + 1}</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ol>
                {seleccion.url_registro && (
                  <a
                    href={seleccion.url_registro}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 underline hover:text-indigo-200"
                  >
                    Abrir donde crear la clave <ArrowRight size={11} />
                  </a>
                )}

                <div className="mt-5">
                  <Campo etiqueta="Pega aquí tu clave">
                    <div className="relative">
                      <input
                        type={visible ? 'text' : 'password'}
                        value={clave}
                        onChange={(e) => setClave(e.target.value)}
                        placeholder="sk-..."
                        autoComplete="off"
                        className="ls-input pr-10 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setVisible(!visible)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        aria-label="Mostrar u ocultar la clave"
                      >
                        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </Campo>
                </div>

                <div className="mt-4">
                  <Campo etiqueta="Modelo (opcional)">
                    <input
                      value={modelo}
                      onChange={(e) => setModelo(e.target.value)}
                      list="modelos-conexion"
                      className="ls-input"
                    />
                    <datalist id="modelos-conexion">
                      {seleccion.modelos.map((m: string) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </Campo>
                </div>

                {/* Selector amplio: "cualquier IA que seleccione la persona" */}
                {seleccion.permite_seleccion_modelo && (
                  <div className="mt-3 rounded-xl border border-indigo-500/25 bg-indigo-500/8 p-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-200">
                      <Sparkles size={13} />
                      Elige cualquiera de las {modelos.length || '300+'} IAs disponibles
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      Una sola conexion te da acceso a GPT, Claude, Gemini, Llama, DeepSeek, Qwen
                      y mas. Escribe para filtrar.
                    </p>
                    <div className="relative mt-2">
                      <Search
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <input
                        value={filtroModelo}
                        onChange={(e) => setFiltroModelo(e.target.value)}
                        placeholder="filtrar: claude, gpt, llama, deepseek..."
                        className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-8 pr-3 text-[11px] text-slate-100 outline-none focus:border-indigo-500/60"
                      />
                    </div>
                    {cargandoModelos ? (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                        <Loader2 size={12} className="animate-spin" />
                        Cargando el catalogo de IAs...
                      </div>
                    ) : (
                      <>
                        {familias.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {familias.slice(0, 14).map((f) => (
                              <span
                                key={f.familia}
                                className="rounded bg-black/25 px-1.5 py-0.5 text-[9px] text-slate-400"
                              >
                                {f.familia} ({f.modelos})
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                          {modelosFiltrados.length === 0 && (
                            <div className="text-[11px] text-slate-500">
                              Ningun modelo coincide con la busqueda.
                            </div>
                          )}
                          {modelosFiltrados.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => setModelo(m.id)}
                              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
                                modelo === m.id
                                  ? 'border-indigo-400/60 bg-indigo-500/20'
                                  : 'border-white/8 bg-white/4 hover:bg-white/10'
                              }`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-semibold text-slate-200">
                                  {m.nombre}
                                </span>
                                <span className="block truncate text-[9px] text-slate-500">{m.id}</span>
                              </span>
                              {m.gratis && (
                                <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                                  gratis
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {seleccion.pasos_ayuda.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {seleccion.pasos_ayuda.map((p, i) => (
                      <li key={i} className="flex gap-1.5 text-[10px] leading-relaxed text-slate-500">
                        <CircleAlert size={11} className="mt-0.5 shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Ruta "local": sin credenciales */}
            {seleccion?.modo === 'local' && (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4 sm:p-5">
                <div className="text-[11px] font-bold text-emerald-200">
                  {seleccion.nombre} no necesita ninguna clave
                </div>
                <ol className="mt-3 space-y-2.5">
                  {seleccion.instrucciones.map((p, i) => (
                    <li key={i} className="ls-paso">
                      <span className="ls-paso-num">{i + 1}</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ol>
                {seleccion.url_registro && (
                  <a
                    href={seleccion.url_registro}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 underline hover:text-emerald-200"
                  >
                    Descargarlo <ArrowRight size={11} />
                  </a>
                )}
                {baseUrl === '' && (
                  <div className="mt-5">
                    <Campo etiqueta="URL del servidor (opcional, se autodetecta)">
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder={seleccion.id === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1'}
                        className="ls-input font-mono"
                      />
                    </Campo>
                  </div>
                )}
              </div>
            )}

            {/* Ruta "demo" */}
            {seleccion?.modo === 'demo' && (
              <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Sparkles size={13} className="text-indigo-300" />
                  Asistente demo integrado
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  Entiende citas, tareas, gastos y mantenimiento en español. No usa internet ni
                  claves. Puedes cambiarlo cuando quieras.
                </p>
              </div>
            )}

            {estado && (
              <Aviso tono={estado.ok ? 'ok' : 'error'}>
                <span className="flex items-start gap-2">
                  {estado.ok ? (
                    <Check size={13} className="mt-0.5 shrink-0" />
                  ) : (
                    <CircleAlert size={13} className="mt-0.5 shrink-0" />
                  )}
                  <span>{estado.texto}</span>
                </span>
              </Aviso>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
