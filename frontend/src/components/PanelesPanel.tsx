/** Paneles: espacios de trabajo con acceso por persona (v19).
 *
 *  Cada panel es un trozo de vida con nombre propio ("Mi trabajo", "La casa",
 *  "Universidad"). Tuyos y los que otras personas te compartieron. Nadie ve un
 *  panel ajeno sin permiso: tu lo compartes una vez por correo y le eliges si
 *  solo puede mirar o tambien puede agregar cosas.
 */
import { useEffect, useState } from 'react'
import { Eye, FolderPlus, LayoutGrid, Pencil, Share2, Trash2, UserPlus } from 'lucide-react'
import { paneles as apiPaneles } from '../lib/api'
import type { MiembroPanel, Panel } from '../types'
import { useLifeAgente } from '../store/useLifeAgente'
import { Aviso, Boton, Campo, Panel as PanelCaja, Stat } from './ui'

const TIPOS = [
  { id: 'agenda', nombre: 'Agenda y vida diaria', color: 'indigo' },
  { id: 'academia', nombre: 'Estudio y universidad', color: 'sky' },
  { id: 'finanzas', nombre: 'Dinero y gastos', color: 'emerald' },
  { id: 'hogar', nombre: 'Casa y mantenimiento', color: 'amber' },
  { id: 'personal', nombre: 'Personal', color: 'violet' },
]

const COLOR_CHIP: Record<string, string> = {
  indigo: 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/30',
  sky: 'bg-sky-500/20 text-sky-200 ring-sky-500/30',
  emerald: 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/30',
  amber: 'bg-amber-500/20 text-amber-200 ring-amber-500/30',
  violet: 'bg-violet-500/20 text-violet-200 ring-violet-500/30',
}

export default function PanelesPanel() {
  const paneles = useLifeAgente((s) => s.paneles)
  const panelId = useLifeAgente((s) => s.panelId)
  const cargarPaneles = useLifeAgente((s) => s.cargarPaneles)
  const seleccionarPanel = useLifeAgente((s) => s.seleccionarPanel)
  const crearPanel = useLifeAgente((s) => s.crearPanel)
  const compartirPanel = useLifeAgente((s) => s.compartirPanel)
  const quitarAcceso = useLifeAgente((s) => s.quitarAcceso)
  const borrarPanel = useLifeAgente((s) => s.borrarPanel)

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('agenda')
  const [mover, setMover] = useState(true)
  const [compartiendo, setCompartiendo] = useState<number | null>(null)
  const [correo, setCorreo] = useState('')
  const [nivel, setNivel] = useState<'ver' | 'editar'>('ver')
  const [miembros, setMiembros] = useState<MiembroPanel[]>([])
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    void cargarPaneles()
  }, [cargarPaneles])

  const abrirMiembros = async (id: number) => {
    setCompartiendo(compartiendo === id ? null : id)
    setMiembros([])
    if (compartiendo === id) return
    try {
      const r = await apiPaneles.miembros(id)
      setMiembros(r.miembros)
    } catch (e) {
      setMensaje({ ok: false, texto: (e as Error).message })
    }
  }

  const crear = async () => {
    setOcupado(true)
    setMensaje(null)
    await crearPanel({ nombre, tipo, color: TIPOS.find((t) => t.id === tipo)?.color || 'indigo', mover_personal: mover })
    setNombre('')
    setOcupado(false)
    setMensaje({ ok: true, texto: 'Panel creado. Ya puedes abrirlo desde la barra superior.' })
  }

  const compartir = async (id: number) => {
    setOcupado(true)
    setMensaje(null)
    try {
      await apiPaneles.compartir(id, correo, nivel)
      setCorreo('')
      const r = await apiPaneles.miembros(id)
      setMiembros(r.miembros)
      setMensaje({ ok: true, texto: `Listo: ${correo} ya puede ver este panel.` })
    } catch (e) {
      setMensaje({ ok: false, texto: (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  const propios = paneles.filter((p) => p.es_propio)
  const ajenos = paneles.filter((p) => !p.es_propio)

  return (
    <div className="space-y-4">
      <PanelCaja
        titulo="Tus paneles"
        sub="Cada panel es un espacio de trabajo con su propia agenda. Tuyos y los que te compartieron."
      >
        <div className="space-y-3">
          {paneles.length === 0 && (
            <p className="text-[11px] text-slate-500">
              Todavia no tienes paneles. Crea el primero abajo: por ejemplo "Universidad" o "Mi trabajo".
            </p>
          )}
          <TarjetaPanel
            panel={{
              id: -1, nombre: 'Todo', tipo: 'agenda', color: 'indigo', descripcion: 'Sin filtro: ves todo lo tuyo.',
              rol: 'dueno', es_propio: true, miembros: 0, eventos: 0, tareas: 0,
            }}
            abierto={panelId === null}
            onAbrir={() => void seleccionarPanel(null)}
            acciones={null}
          />
          {paneles.map((p) => (
            <TarjetaPanel
              key={p.id}
              panel={p}
              abierto={panelId === p.id}
              onAbrir={() => void seleccionarPanel(p.id)}
              acciones={
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.es_propio && (
                    <Boton variante="secundario" onClick={() => void abrirMiembros(p.id)}>
                      <Share2 size={12} /> Compartir
                    </Boton>
                  )}
                  {p.es_propio && (
                    <Boton variante="peligro" onClick={() => void borrarPanel(p.id)}>
                      <Trash2 size={12} /> Borrar
                    </Boton>
                  )}
                </div>
              }
            />
          ))}
        </div>
      </PanelCaja>

      {compartiendo !== null && (
        <PanelCaja titulo="Compartir este panel" sub="Escribe el correo de la persona y elige que puede hacer.">
          <div className="space-y-3">
            <Campo etiqueta="Correo de la persona" ayuda="Debe tener cuenta en LifeAgente.">
              <input
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="persona@ejemplo.com"
                type="email"
                className="ls-input"
              />
            </Campo>
            <Campo etiqueta="Que puede hacer" ayuda="'Solo ver' no deja tocar nada; 'Editar' si puede agregar cosas.">
              <div className="flex gap-2">
                <Boton variante={nivel === 'ver' ? 'primario' : 'secundario'} onClick={() => setNivel('ver')}>
                  <Eye size={12} /> Solo ver
                </Boton>
                <Boton variante={nivel === 'editar' ? 'primario' : 'secundario'} onClick={() => setNivel('editar')}>
                  <Pencil size={12} /> Editar
                </Boton>
              </div>
            </Campo>
            <Boton onClick={() => void compartir(compartiendo)} disabled={ocupado || !correo.includes('@')}>
              <UserPlus size={13} /> Dar acceso
            </Boton>
            {miembros.length > 0 && (
              <div className="space-y-1.5 border-t border-white/8 pt-3">
                {miembros.map((m) => (
                  <div key={m.usuario_id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{m.correo}</span>
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-300">
                      {m.nivel === 'editar' ? 'puede editar' : 'solo ver'}
                    </span>
                    <button
                      onClick={() => void quitarAcceso(compartiendo, m.usuario_id)}
                      className="text-[10px] font-semibold text-rose-300 hover:text-rose-200"
                    >
                      quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PanelCaja>
      )}

      <PanelCaja titulo="Crear un panel" sub="Dale un nombre y elige de que va.">
        <div className="space-y-3">
          <Campo etiqueta="Nombre" ayuda="Por ejemplo: Universidad, Mi trabajo, La casa.">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Mi panel"
              className="ls-input"
            />
          </Campo>
          <Campo etiqueta="De que va">
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTipo(t.id)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 transition ${
                    tipo === t.id
                      ? COLOR_CHIP[t.color] || COLOR_CHIP.indigo
                      : 'bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10'
                  }`}
                >
                  {t.nombre}
                </button>
              ))}
            </div>
          </Campo>
          <label className="flex items-start gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={mover} onChange={(e) => setMover(e.target.checked)} className="mt-0.5" />
            Mover aqui lo que ya tengo (agenda, tareas y gastos sin panel)
          </label>
          <Boton onClick={() => void crear()} disabled={ocupado || !nombre.trim()}>
            <FolderPlus size={13} /> Crear panel
          </Boton>
        </div>
      </PanelCaja>

      {ajenos.length > 0 && (
        <PanelCaja titulo="Paneles que te compartieron" sub="Puedes verlos. Para cambiar algo, pide permiso de edicion.">
          <div className="grid gap-2 sm:grid-cols-3">
            {ajenos.map((p) => (
              <Stat
                key={p.id}
                etiqueta={p.rol === 'editar' ? 'puedes editar' : 'solo ver'}
                valor={String(p.nombre)}
                sub={`${p.eventos} bloques · ${p.tareas} tareas`}
              />
            ))}
          </div>
        </PanelCaja>
      )}

      {mensaje && (
        <Aviso tono={mensaje.ok ? 'ok' : 'error'}>{mensaje.texto}</Aviso>
      )}
    </div>
  )
}

function TarjetaPanel({
  panel, abierto, onAbrir, acciones,
}: {
  panel: Panel
  abierto: boolean
  onAbrir: () => void
  acciones: React.ReactNode
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        abierto ? 'border-indigo-500/40 bg-indigo-500/8' : 'border-white/8 bg-white/3'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6">
          <LayoutGrid size={15} className="text-indigo-300" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-white">{panel.nombre}</span>
            {panel.rol !== 'dueno' && (
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-200 ring-1 ring-sky-500/30">
                {panel.rol === 'editar' ? 'puedes editar' : 'solo ver'}
              </span>
            )}
            {panel.rol === 'dueno' && panel.miembros > 0 && (
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-300">
                {panel.miembros} con acceso
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            {panel.es_propio
              ? `${panel.eventos} bloques · ${panel.tareas} tareas`
              : 'de otra persona'}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Boton variante={abierto ? 'secundario' : 'primario'} onClick={onAbrir}>
              {abierto ? 'Abierto ahora' : 'Abrir este panel'}
            </Boton>
            {acciones}
          </div>
        </div>
      </div>
    </div>
  )
}
