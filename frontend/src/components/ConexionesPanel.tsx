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
import { useEffect, useState } from 'react'
import {
  ArrowRight, Check, CircleAlert, Cpu, Eye, EyeOff, Loader2, LogIn,
  Plug, RefreshCw, Server, Sparkles, Trash2, Wifi,
} from 'lucide-react'
import { api, guardarUrlApi, leerUrlApi } from '../lib/api'
import type { AutorizacionCuenta, Conexion, MotorLocal, ProveedorCatalogo } from '../types'
import { Boton, Chip, Modal } from './ui'

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
  const [paso, setPaso] = useState<'inicio' | 'detalle'>('inicio')
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

  const cargar = async () => {
    try {
      const [cat, cons, loc] = await Promise.all([
        api.catalogoConexiones(),
        api.conexiones(),
        api.detectarLocales(),
      ])
      setCatalogo(cat.proveedores)
      setConexiones(cons)
      setMotores(loc.motores)
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
    setPaso('detalle')
  }

  /** Paso 1 del flujo de cuenta: pide el codigo de autorizacion al proveedor. */
  const autorizar = async () => {
    if (!seleccion) return
    setOcupado(true)
    setEstado(null)
    try {
      const inicio = await api.iniciarCuenta({
        proveedor: seleccion.id,
        client_id: clientId.trim(),
      })
      setAutorizacion(inicio)
      setEsperando(true)
      await consultarAutorizacion()
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  /** Paso 2: consulta al backend si el usuario ya autorizo en su navegador. */
  const consultarAutorizacion = async () => {
    if (!seleccion || !autorizacion) return
    setEsperando(true)
    try {
      const res = await api.terminarCuenta({
        proveedor: seleccion.id,
        client_id: autorizacion.client_id,
        device_code: autorizacion.device_code,
      })
      if (res.ok) {
        setEstado({ ok: true, texto: res.mensaje })
        setEsperando(false)
        setAutorizacion(null)
        await cargar()
        setPaso('inicio')
      } else {
        setEstado({ ok: false, texto: res.mensaje })
        setEsperando(false)
      }
    } catch (e) {
      setEstado({ ok: false, texto: (e as Error).message })
      setEsperando(false)
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
        texto: verificada.detalle_estado ?? 'Conexion verificada.',
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

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Conectar tu IA" ancho="max-w-2xl">
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
        <div className="rounded-xl border border-white/10 bg-white/4 p-3">
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
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px] text-slate-100 outline-none focus:border-indigo-500/60"
            />
            <Boton
              variante="secundario"
              onClick={() => {
                guardarUrlApi(apiUrl)
                setEstado({ ok: true, texto: 'Direccion de la API guardada. Recargando…' })
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

            {/* Motores locales detectados */}
            {motoresDisponibles.length > 0 && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-200">
                  <Wifi size={13} />
                  Detectamos IA en tu computador
                </div>
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
            <div className="space-y-2">
              {CAMINOS.map((c) => {
                const opciones = porModo(c.modo)
                if (c.modo === 'local') {
                  return (
                    <div key={c.id} className="rounded-xl border border-white/10 bg-white/3 p-3">
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
                    <div key={c.id} className="rounded-xl border border-white/10 bg-white/3 p-3">
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
                        title="Eliminar conexion"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ---------------------------------------------------------------- */
          /* Detalle de un proveedor: onboarding paso a paso                   */
          /* ---------------------------------------------------------------- */
          <div className="space-y-3">
            <button
              onClick={() => setPaso('inicio')}
              className="text-[11px] font-semibold text-slate-400 hover:text-white"
            >
              ← Volver
            </button>

            <div className="flex items-start gap-3">
              <span className="text-2xl">{seleccion?.icono}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white">{seleccion?.nombre}</h3>
                <p className="text-[11px] leading-relaxed text-slate-400">{seleccion?.resumen}</p>
              </div>
              {seleccion?.gratis && (
                <Chip className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">gratis</Chip>
              )}
            </div>

            {/* Ruta "cuenta": inicio de sesion guiado (OAuth device flow) */}
            {seleccion?.modo === 'cuenta' && (
              <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/8 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-200">
                  <LogIn size={13} />
                  Conectar mi cuenta de {seleccion.nombre}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                  Autorizas desde tu navegador normal con tu usuario y contrasena. Tu contrasena
                  nunca pasa por LifeSync.
                </p>

                {!autorizacion ? (
                  <>
                    <ol className="mt-2 space-y-1.5">
                      {(seleccion.instrucciones.length ? seleccion.instrucciones : [
                        'Crea una aplicacion en la consola del proveedor.',
                        'Copia el "ID de cliente" (no es un token ni una contrasena).',
                        'Pega el ID aqui y pulsa "Autorizar en el navegador".',
                      ]).map((pasoTexto, i) => (
                        <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-[9px] font-bold text-indigo-100">
                            {i + 1}
                          </span>
                          {pasoTexto}
                        </li>
                      ))}
                    </ol>
                    {seleccion.url_client_id && (
                      <a
                        href={seleccion.url_client_id}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 underline hover:text-indigo-200"
                      >
                        Abrir la consola del proveedor <ArrowRight size={11} />
                      </a>
                    )}

                    <label className="mt-3 block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-300">
                        ID de cliente
                      </span>
                      <input
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="1234567890.apps.googleusercontent.com"
                        autoComplete="off"
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                      />
                    </label>

                    <div className="mt-2">
                      <Boton
                        variante="secundario"
                        onClick={() => void autorizar()}
                        disabled={ocupado || clientId.trim().length < 10}
                      >
                        {ocupado ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
                        Autorizar en el navegador
                      </Boton>
                    </div>
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
              <div className="rounded-xl border border-white/10 bg-white/3 p-3">
                <div className="mb-2 text-[11px] font-bold text-slate-300">
                  Paso a paso para obtener tu clave
                </div>
                <ol className="space-y-1.5">
                  {seleccion.instrucciones.map((p, i) => (
                    <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-slate-200">
                        {i + 1}
                      </span>
                      {p}
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

                <label className="mt-3 block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-300">
                    Pega aqui tu clave
                  </span>
                  <div className="relative">
                    <input
                      type={visible ? 'text' : 'password'}
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 pr-9 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                    />
                    <button
                      type="button"
                      onClick={() => setVisible(!visible)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      aria-label="Mostrar u ocultar la clave"
                    >
                      {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </label>

                <label className="mt-2 block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-300">
                    Modelo (opcional)
                  </span>
                  <input
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    list="modelos-conexion"
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                  <datalist id="modelos-conexion">
                    {seleccion.modelos.map((m: string) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </label>

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
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3">
                <div className="text-[11px] font-bold text-emerald-200">
                  {seleccion.nombre} no necesita ninguna clave
                </div>
                <ol className="mt-2 space-y-1.5">
                  {seleccion.instrucciones.map((p, i) => (
                    <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/30 text-[9px] font-bold text-emerald-100">
                        {i + 1}
                      </span>
                      {p}
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
                  <label className="mt-3 block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-300">
                      URL del servidor (opcional, se autodetecta)
                    </span>
                    <input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={seleccion.id === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1'}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                    />
                  </label>
                )}
              </div>
            )}

            {/* Ruta "demo" */}
            {seleccion?.modo === 'demo' && (
              <div className="rounded-xl border border-white/10 bg-white/3 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Sparkles size={13} className="text-indigo-300" />
                  Asistente demo integrado
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Entiende citas, tareas, gastos y mantenimiento en español. No usa internet ni
                  claves. Puedes cambiarlo cuando quieras.
                </p>
              </div>
            )}

            {estado && (
              <div
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-[11px] ${
                  estado.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                {estado.ok ? (
                  <Check size={13} className="mt-0.5 shrink-0" />
                ) : (
                  <CircleAlert size={13} className="mt-0.5 shrink-0" />
                )}
                {estado.texto}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-white/8 pt-3">
              <Boton variante="secundario" onClick={() => setPaso('inicio')}>
                Volver
              </Boton>
              {seleccion?.modo !== 'cuenta' && (
                <Boton onClick={() => void conectar()} disabled={ocupado}>
                  {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
                  {seleccion?.modo === 'demo' ? 'Usar el asistente demo' : 'Conectar y verificar'}
                </Boton>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
