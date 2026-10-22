/** Centro de conexiones de IA: onboarding guiado paso a paso.
 *
 *  Objetivo: que una persona sin conocimientos tecnicos conecte LifeAgente
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
  ArrowRight, Check, ChevronDown, CircleAlert, Cpu, Eye, EyeOff, Loader2, LogIn,
  Mail, MonitorSmartphone, Plug, RefreshCw, Search, Server, Settings, ShieldCheck, Sparkles,
  Trash2, Wifi, Wrench,
} from 'lucide-react'
import { api, apiGuardadaEsEstatica, cuentas, guardarUrlApi, leerUrlApi, urlApiEnUso } from '../lib/api'
import type {
  AgenteLocal, AutorizacionCuenta, CatalogoModelos, Conexion, Diagnostico, EstadoGoogle,
  InfoEstiloUrl, ServicioIaGratis,
  ModeloCatalogo, MotorLocal, ProveedorCatalogo,
} from '../types'
import { useLifeAgente } from '../store/useLifeAgente'
import { Aviso, Boton, Campo, Chip, Modal } from './ui'
import BloqueIaLigera from './BloqueIaLigera'

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

/** Seccion numerada: separa los caminos para que se entienda de un vistazo. */
function BloqueSeccion({
  numero,
  titulo,
  descripcion,
  children,
}: {
  numero: string
  titulo: string
  descripcion: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-start gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-indigo-500/20 text-[11px] font-black text-indigo-200 ring-1 ring-indigo-400/30">
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white">{titulo}</div>
          <div className="text-[11px] leading-relaxed text-slate-400">{descripcion}</div>
        </div>
      </div>
      <div className="pl-0 sm:pl-[34px]">{children}</div>
    </section>
  )
}

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
  /** Ajustes tecnicos plegados (solo para quien instala). */
  const [verAjustes, setVerAjustes] = useState(false)
  /** v44: en local no hay cuentas: solo IA de tu computador, clave o demo. */
  const perfil = useLifeAgente((s) => s.perfil)
  /** Envio de correo del servidor (v36): lo configura el administrador, una vez. */
  const [verCorreo, setVerCorreo] = useState(false)
  const [smtpInfo, setSmtpInfo] = useState<{
    ok: boolean
    configurado: boolean
    origen: string
    host?: string
    puerto?: number
    usuario?: string
    desde?: string
    mensaje?: string
  } | null>(null)
  const [smtpForm, setSmtpForm] = useState({ host: '', puerto: 587, usuario: '', clave: '', desde: '' })
  const [modelos, setModelos] = useState<ModeloCatalogo[]>([])
  const [familias, setFamilias] = useState<{ familia: string; modelos: number }[]>([])
  const [filtroModelo, setFiltroModelo] = useState('')
  const [cargandoModelos, setCargandoModelos] = useState(false)
  /** Autodiagnostico del servidor (v37): que falta por configurar. */
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null)
  /** Conexion manual por URL (v40): cualquier IA o agente con su direccion. */
  const [urlManual, setUrlManual] = useState('')
  const [claveManual, setClaveManual] = useState('')
  const [estiloUrl, setEstiloUrl] = useState<InfoEstiloUrl | null>(null)
  const [probandoUrl, setProbandoUrl] = useState(false)
  /** IA gratis con tu cuenta (v43). */
  const [serviciosGratis, setServiciosGratis] = useState<ServicioIaGratis[]>([])
  const [servicioAbierto, setServicioAbierto] = useState<string | null>(null)
  const [claveServicio, setClaveServicio] = useState('')
  /** Sistemas de IA con interfaz ya instalados en el equipo (v43). */
  const [agentes, setAgentes] = useState<AgenteLocal[]>([])

  /** Conecta un servicio de IA gratis con la clave que pegó la persona. */
  const conectarServicioGratis = async (s: ServicioIaGratis) => {
    if (s.requiere_cuenta && !claveServicio.trim()) {
      setEstado({
        ok: false,
        texto: `Pega la clave de ${s.nombre} (la copias en ${s.donde_clave}).`,
      })
      return
    }
    setOcupado(true)
    setEstado({ ok: false, texto: `Conectando con ${s.nombre}…` })
    try {
      const guardada = await api.guardarConexion({
        proveedor: 'personalizado',
        nombre: s.nombre,
        modo: 'local',
        base_url: s.base_url,
        api_key: claveServicio.trim() || undefined,
        modelo: s.modelo_sugerido || '',
        estilo: s.estilo,
      })
      const verificada = await api.verificarConexion(guardada.id)
      setEstado({
        ok: verificada.estado === 'activa',
        texto: verificada.detalle_estado ?? `Conectado con ${s.nombre}.`,
      })
      setClaveServicio('')
      setServicioAbierto(null)
      await cargar()
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const cargar = async () => {
    try {
      const [cat, cons, loc, google, diag, gratis, ag] = await Promise.all([
        api.catalogoConexiones(),
        api.conexiones(),
        api.detectarLocales(),
        api.estadoGoogle(),
        api.diagnostico().catch(() => null),
        api.iaGratis().catch(() => ({ servicios: [] as ServicioIaGratis[] })),
        api.agentesLocales().catch(() => ({ agentes: [] as AgenteLocal[] })),
      ])
      setServiciosGratis(gratis.servicios ?? [])
      setAgentes(ag.agentes ?? [])
      setDiagnostico(diag)
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

  /** Prueba una direccion a mano y averigua sola como hablarle (v40). */
  const probarUrlManual = async () => {
    const url = urlManual.trim()
    if (!url) {
      setEstado({ ok: false, texto: 'Escribe la direccion de tu sistema de IA (por ejemplo http://127.0.0.1:4000).' })
      return
    }
    setProbandoUrl(true)
    setEstado(null)
    setEstiloUrl(null)
    try {
      const info = await api.probarUrl(url, claveManual.trim() || undefined)
      setEstiloUrl(info)
      setEstado({ ok: info.ok, texto: info.mensaje })
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setProbandoUrl(false)
    }
  }

  /** Guarda la conexion manual con el estilo y el modelo detectados. */
  const guardarUrlManual = async () => {
    if (!estiloUrl?.ok) return
    setOcupado(true)
    try {
      const guardada = await api.guardarConexion({
        proveedor: 'personalizado',
        base_url: urlManual.trim(),
        api_key: claveManual.trim() || undefined,
        modelo: estiloUrl.modelos[0],
        estilo: estiloUrl.estilo,
        nombre: `Mi sistema (${estiloUrl.estilo})`,
        modo: 'local',
      })
      const verificada = await api.verificarConexion(guardada.id)
      setEstado({
        ok: verificada.estado === 'activa',
        texto: verificada.detalle_estado ?? 'Conectado.',
      })
      setClaveManual('')
      await cargar()
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const porModo = (modo: string) => catalogo.filter((c) => c.modo === modo)
  const motoresDisponibles = motores.filter((m) => porModo('local').some((c) => c.id === m.id))
  /** Cuentas de entrada que no son Google (Outlook, GitHub). */
  const otrasCuentas = porModo('cuenta').filter((c) => c.id !== 'google_cuenta')
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


        {paso === 'inicio' ? (
          <>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Cuatro caminos, del mas facil al mas manual. <strong className="text-slate-300">No
              necesitas saber que es una API key</strong>: si eliges una cuenta, te guio con cada
              paso.
            </p>

            {/* ============ 1 · Entrar con tu cuenta ============ */}
            {perfil !== 'local' && (
            <BloqueSeccion
              numero="1"
              titulo="Entra con tu cuenta"
              descripcion="Lo mas facil: un clic, autorizas en el navegador y ya estas dentro. Tu agenda queda guardada en tu cuenta."
            >
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
                        Tu contrasena nunca pasa por LifeAgente
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {otrasCuentas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">O entra con:</span>
                  {otrasCuentas.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => abrirDetalle(o)}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                    >
                      {o.icono} {o.nombre}
                    </button>
                  ))}
                </div>
              )}
            </BloqueSeccion>

                        )}
{/* ============ 2 Â· IA gratis con tu cuenta ============ */}
            {perfil !== 'local' && (
            <BloqueSeccion
              numero="2"
              titulo="IA gratis con tu cuenta"
              descripcion="Sin instalar nada y sin pagar: entra con la cuenta que ya tienes y empieza. Cada servicio dice exactamente donde pegar la clave."
            >
              {serviciosGratis.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No pudimos leer el catalogo. Recarga el panel.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {serviciosGratis.map((s) => (
                    <div key={s.id} className="rounded-xl border border-white/10 bg-white/4 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold text-white">
                          {s.icono} {s.nombre}
                        </div>
                        {s.conectado && (
                          <Chip className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">
                            conectado
                          </Chip>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-300">{s.resumen}</p>
                      <p className="mt-1 text-[10px] font-semibold text-emerald-300">{s.plan}</p>
                      <ol className="mt-2 space-y-1">
                        {s.pasos.map((paso, i) => (
                          <li key={i} className="ls-paso">
                            <span className="ls-paso-num">{i + 1}</span>
                            <span>{paso}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                        <span className="text-slate-500">Donde esta la clave: </span>
                        {s.donde_clave}
                      </p>
                      {servicioAbierto === s.id ? (
                        <div className="mt-2 space-y-1.5">
                          {s.requiere_cuenta && (
                            <input
                              type="password"
                              value={claveServicio}
                              onChange={(e) => setClaveServicio(e.target.value)}
                              placeholder="Pega aqui tu clave"
                              className="ls-input font-mono"
                            />
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Boton
                              variante="primario"
                              onClick={() => void conectarServicioGratis(s)}
                              disabled={ocupado}
                            >
                              <Plug size={12} />
                              {s.requiere_cuenta ? 'Guardar y conectar' : 'Conectar'}
                            </Boton>
                            <a
                              href={s.url_registro}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                            >
                              Abrir el sitio
                            </a>
                            <button
                              onClick={() => setServicioAbierto(null)}
                              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:text-slate-200"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Boton
                            variante="secundario"
                            onClick={() => {
                              setServicioAbierto(s.id)
                              setClaveServicio('')
                            }}
                          >
                            <Plug size={12} />
                            Conectar
                          </Boton>
                          <a
                            href={s.url_registro}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                          >
                            Abrir el sitio
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </BloqueSeccion>

                        )}
{/* ============ 2 · La IA de tu computador ============ */}
            <BloqueSeccion
              numero={perfil === 'local' ? '1' : '3'}
              titulo="Usa la IA de tu computador"
              descripcion="Gratis y privado: la IA se queda en tu equipo y nadie mas la ve."
            >
              <div className="rounded-xl border border-white/10 bg-white/4 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <MonitorSmartphone size={13} />
                  Sistemas de IA que ya tienes en este computador
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  Miramos tu computador y vemos que programas de agentes y editores con IA tienes
                  (Claude Code, OpenCode, Codex, Cursor...). Los que Admiten servidor se pueden
                  conectar como motor de LifeAgente.
                </p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {agentes.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-1.5"
                    >
                      <span className="text-sm">{a.icono}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-semibold text-slate-200">
                          {a.nombre}
                          {a.instalado && (
                            <span className="ml-1 text-[9px] font-bold text-emerald-300">instalado</span>
                          )}
                        </div>
                        <div className="truncate text-[9px] text-slate-500" title={a.que_es}>
                          {a.instalado ? a.version || a.que_es : a.que_es}
                        </div>
                      </div>
                      {a.servidor ? (
                        <button
                          onClick={() => {
                            setUrlManual(a.servidor)
                            setClaveManual('')
                            void probarUrlManual()
                          }}
                          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-slate-300 transition hover:bg-white/12"
                        >
                          Conectar
                        </button>
                      ) : a.url ? (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-slate-300 transition hover:bg-white/12"
                        >
                          Abrir
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {motoresDisponibles.length > 0 ? (
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
              ) : (
                <BloqueIaLigera alCambiar={() => void cargar()} />
              )}

              {/* Conexion manual por URL (v40): cualquier IA o agente. */}
              <div className="rounded-xl border border-white/10 bg-white/3 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                  <Plug size={13} />
                  ¿Tienes otro sistema de IA o de agentes? Conéctalo con su URL
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  Si tu IA vive en otro puerto o es un agente tuyo (LiteLLM, Open WebUI, vLLM,
                  un servidor propio...), pega su dirección. LifeAgente averigua solo cómo hablarle.
                </p>
                <div className="mt-2 space-y-2">
                  <input
                    className="ls-input"
                    placeholder="http://127.0.0.1:4000"
                    value={urlManual}
                    onChange={(e) => {
                      setUrlManual(e.target.value)
                      setEstiloUrl(null)
                    }}
                  />
                  <input
                    className="ls-input"
                    type="password"
                    placeholder="Clave (si el sistema la pide) - opcional"
                    value={claveManual}
                    onChange={(e) => setClaveManual(e.target.value)}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Boton
                    variante="secundario"
                    onClick={() => void probarUrlManual()}
                    disabled={probandoUrl || ocupado}
                    className="!px-3 !py-1.5 text-[11px]"
                  >
                    {probandoUrl ? 'Probando…' : 'Probar esta dirección'}
                  </Boton>
                  {estiloUrl?.ok && (
                    <Boton
                      variante="primario"
                      onClick={() => void guardarUrlManual()}
                      disabled={ocupado}
                      className="!px-3 !py-1.5 text-[11px]"
                    >
                      Guardar conexión
                    </Boton>
                  )}
                </div>
                {estiloUrl && (
                  <div
                    className={`mt-2 rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${
                      estiloUrl.ok
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    }`}
                  >
                    {estiloUrl.mensaje}
                    {estiloUrl.ok && estiloUrl.modelos.length > 0 && (
                      <div className="mt-1 text-slate-300">
                        Modelos: {estiloUrl.modelos.slice(0, 6).join(', ')}
                        {estiloUrl.total > 6 ? `… y ${estiloUrl.total - 6} mas` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </BloqueSeccion>

            {/* ============ 3 · Conectar una IA con clave ============ */}
            <BloqueSeccion
              numero={perfil === 'local' ? '2' : '4'}
              titulo="Conecta una IA con clave"
              descripcion="Si ya tienes una clave de API (OpenAI, Anthropic, Gemini, OpenRouter...). Te digo donde conseguirla."
            >
              <div className="flex flex-wrap gap-1.5">
                {porModo('api_key').map((o) => (
                  <button
                    key={o.id}
                    onClick={() => abrirDetalle(o)}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                  >
                    {o.icono} {o.nombre}
                  </button>
                ))}
                {porModo('local').map((o) => (
                  <button
                    key={o.id}
                    onClick={() => abrirDetalle(o)}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                  >
                    {o.icono} {o.nombre}
                  </button>
                ))}
              </div>
            </BloqueSeccion>

            {/* ============ 5 · Solo quiero ver como funciona ============ */}
            <BloqueSeccion
              numero={perfil === 'local' ? '3' : '5'}
              titulo="Solo quiero ver como funciona"
              descripcion="El asistente de prueba, sin cuentas ni claves. Ideal para echar un vistazo."
            >
              <button
                onClick={() => {
                  const demo = porModo('demo')[0]
                  if (demo) abrirDetalle(demo)
                }}
                className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/3 p-3 text-left transition hover:bg-white/8"
              >
                <span className="text-xl">✨</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white">Asistente demo (integrado)</div>
                  <div className="text-[11px] leading-relaxed text-slate-400">
                    Funciona sin configurar nada. Puedes conectarte a una IA de verdad cuando quieras.
                  </div>
                </div>
                <ArrowRight size={14} className="mt-1 shrink-0 text-slate-500" />
              </button>
            </BloqueSeccion>

            {/* ============ Tus conexiones ============ */}
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

            {/* ============ Ajustes tecnicos (colapsado) ============ */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-3">
              <button
                onClick={() => setVerAjustes((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
              >
                <Settings size={13} className="text-slate-400" />
                <span className="text-[11px] font-bold text-slate-300">
                  Ajustes tecnicos (solo si algo va mal)
                </span>
                <ChevronDown
                  size={14}
                  className={`ml-auto text-slate-500 transition ${verAjustes ? 'rotate-180' : ''}`}
                />
              </button>
              {verAjustes && (
                <div className="mt-3 space-y-3">
                  <p className="text-[10px] leading-relaxed text-slate-400">
                    Esta parte es para quien instala LifeAgente en su servidor. Si solo quieres
                    usar la app, no tienes que tocar nada de aqui.
                  </p>

                  {/* ---- Estado del servidor: que falta por configurar (v37) ---- */}
                  {diagnostico && diagnostico.pendientes.length > 0 && (
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                        <ShieldCheck size={13} />
                        Estado del servidor
                        {diagnostico.listo ? (
                          <span className="ml-auto rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-200">
                            todo listo
                          </span>
                        ) : (
                          <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-200">
                            falta algo
                          </span>
                        )}
                      </div>
                      <ul className="mt-2 space-y-2">
                        {diagnostico.pendientes.map((p) => (
                          <li key={p.titulo} className="flex gap-2 text-[10px] leading-relaxed">
                            <span
                              className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                                p.estado === 'listo'
                                  ? 'bg-emerald-400'
                                  : p.estado === 'opcional'
                                    ? 'bg-sky-400'
                                    : 'bg-amber-400'
                              }`}
                            />
                            <span>
                              <span className="font-semibold text-slate-200">{p.titulo}</span>
                              <span className="block text-slate-400">{p.como}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <Server size={13} />
                      Direccion de la API
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      Si abriste LifeAgente desde GitHub Pages, pon aqui la direccion donde vive el
                      servidor (por ejemplo{' '}
                      <code className="text-slate-300">https://lifesync-api.onrender.com/api</code>).
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
                    {apiGuardadaEsEstatica() && (
                      <div className="mt-2">
                        <Aviso tono="aviso">
                          La direccion guardada no sirve: no es una direccion de API valida (o apunta
                          a <strong>GitHub Pages</strong>, que solo sirve archivos). Ahi no hay API y
                          por eso las cuentas fallaban. Ya se esta usando la del despliegue (
                          <code className="text-slate-300">{urlApiEnUso()}</code>), pero puedes
                          corregirla aqui.
                          <div className="mt-2">
                            <Boton
                              variante="fantasma"
                              onClick={() => {
                                guardarUrlApi('')
                                setApiUrl(urlApiEnUso())
                                setEstado({ ok: true, texto: 'Direccion guardada borrada. Recargando…' })
                                setTimeout(() => window.location.reload(), 600)
                              }}
                            >
                              Borrar la direccion guardada
                            </Boton>
                          </div>
                        </Aviso>
                      </div>
                    )}
                  </div>

                  <Boton
                    variante="fantasma"
                    className="w-full"
                    onClick={() => setPaso('wizard')}
                  >
                    <Settings size={13} />
                    Configuracion avanzada (activar el acceso con una cuenta)
                  </Boton>

                  {/* ---- Envio de correo del servidor (v36) ---- */}
                  <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
                    <button
                      onClick={async () => {
                        const abierto = !verCorreo
                        setVerCorreo(abierto)
                        if (abierto) {
                          try {
                            const info = await cuentas.smtp()
                            setSmtpInfo(info)
                            setSmtpForm({
                              host: info.host ?? '',
                              puerto: info.puerto ?? 587,
                              usuario: info.usuario ?? '',
                              clave: '',
                              desde: info.desde ?? '',
                            })
                          } catch (e) {
                            setEstado({ ok: false, texto: (e as Error).message })
                          }
                        }
                      }}
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <Mail size={14} className="text-slate-400" />
                      <span className="text-[11px] font-bold text-slate-200">
                        Envio de correo (para que llegue el codigo de verificacion)
                      </span>
                      {smtpInfo?.configurado && (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-200">
                          ya configurado
                        </span>
                      )}
                    </button>
                    {verCorreo && (
                      <div className="mt-3 space-y-2.5">
                        <p className="ls-hint">
                          Con esto el servidor puede enviar el codigo de verificacion al correo de
                          quien se registra. Usa una clave de aplicacion, no tu contrasena. Si no lo
                          configuras, la persona puede entrar con Google, Outlook, GitHub o seguir
                          en su equipo.
                        </p>
                        <input
                          className="ls-input"
                          placeholder="Servidor SMTP (smtp.gmail.com)"
                          value={smtpForm.host}
                          onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                        />
                        <input
                          className="ls-input"
                          placeholder="Puerto (587)"
                          type="number"
                          value={smtpForm.puerto}
                          onChange={(e) => setSmtpForm({ ...smtpForm, puerto: Number(e.target.value) })}
                        />
                        <input
                          className="ls-input"
                          placeholder="Usuario del correo"
                          value={smtpForm.usuario}
                          onChange={(e) => setSmtpForm({ ...smtpForm, usuario: e.target.value })}
                        />
                        <input
                          className="ls-input"
                          placeholder="Clave de aplicacion"
                          type="password"
                          value={smtpForm.clave}
                          onChange={(e) => setSmtpForm({ ...smtpForm, clave: e.target.value })}
                        />
                        <input
                          className="ls-input"
                          placeholder="Correo que aparece como remitente"
                          value={smtpForm.desde}
                          onChange={(e) => setSmtpForm({ ...smtpForm, desde: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Boton
                            variante="secundario"
                            disabled={ocupado}
                            onClick={async () => {
                              setOcupado(true)
                              try {
                                const r = await cuentas.guardarSmtp({
                                  host: smtpForm.host,
                                  puerto: smtpForm.puerto,
                                  usuario: smtpForm.usuario,
                                  password: smtpForm.clave || undefined,
                                  desde: smtpForm.desde,
                                })
                                setEstado({ ok: r.ok, texto: r.mensaje })
                                if (r.ok) setSmtpInfo({ ...(smtpInfo ?? ({} as never)), ok: true, configurado: true, origen: 'app' })
                              } catch (e) {
                                setEstado({ ok: false, texto: (e as Error).message })
                              } finally {
                                setOcupado(false)
                              }
                            }}
                          >
                            Guardar
                          </Boton>
                          <Boton
                            variante="fantasma"
                            disabled={ocupado}
                            onClick={async () => {
                              setOcupado(true)
                              try {
                                const r = await cuentas.probarSmtp()
                                setEstado({ ok: r.ok, texto: r.mensaje })
                              } catch (e) {
                                setEstado({ ok: false, texto: (e as Error).message })
                              } finally {
                                setOcupado(false)
                              }
                            }}
                          >
                            Mandar un correo de prueba
                          </Boton>
                        </div>
                        {smtpInfo?.origen === 'servidor' && (
                          <Aviso tono="ok">
                            Este servidor ya tiene el correo configurado por variable de entorno
                            (SMTP_HOST). No hace falta hacer nada aqui.
                          </Aviso>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : paso === 'wizard' ? (
          /* ---------------------------------------------------------------- */
          /* Asistente de acceso con Google: 3 caminos, ninguno deja bloqueado */
          /* ---------------------------------------------------------------- */
          <div className="space-y-3">
            <button
              onClick={() => setPaso('inicio')}
              className="text-[11px] font-semibold text-slate-400 hover:text-white"
            >
              &larr; Volver (no necesito esto)
            </button>
            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/8 p-4 sm:p-5">
              <div className="flex items-center gap-2.5 text-sm font-bold text-blue-100">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-base font-black text-blue-600">
                  G
                </span>
                Configuracion avanzada (una sola vez)
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                Si solo quieres <strong className="text-slate-200">usar</strong> LifeAgente, no
                necesitas nada de esto: abre el boton <strong className="text-slate-200">Acceder</strong> y
                entra con tu cuenta de Google con un solo clic.
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                Esta pantalla es para quien <strong>instala</strong> LifeAgente en un servidor: deja
                preparado el acceso con Google una vez y a partir de ahi todas las personas entran
                solas. Necesita un identificador publico de aplicacion de Google (no es tu
                contrasena ni una clave secreta).
              </p>
            </div>

            {/* Camino 1 */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5">
              <div className="text-xs font-bold text-white">
                Camino 1 · Activar el acceso con Google (solo quien instala: 1 minuto, queda guardado)
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
            {motoresDisponibles.length > 0 ? (
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
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5">
                  <div className="text-xs font-bold text-white">
                    Camino 3 · Usar la IA de tu computador (gratis, sin cuentas)
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                    Todavia no hay IA en tu equipo. Puedes descargar un modelo
                    ligero y usarlo sin claves ni cuentas.
                  </p>
                </div>
                <BloqueIaLigera alCambiar={() => void cargar()} />
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
                  pasa por LifeAgente.
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
                        ayuda="Caracteres publicos de una aplicación: no es un token ni tu contraseña. Dejalo vacio si esta copia de LifeAgente ya trae uno."
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