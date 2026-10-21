/** Panel de Responsabilidad: gobierno, aprobaciones, auditoria y cumplimiento. */
import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, BookOpen, CheckCircle2, FileText, Fingerprint, Info,
  Lock, Scale, ShieldCheck, ShieldAlert, Trash2, XCircle,
} from 'lucide-react'
import { api } from '../lib/api'
import { monto } from '../lib/format'
import { useLifeSync } from '../store/useLifeSync'
import type { EntradaAuditoria, Politica } from '../types'
import { Boton, Chip, Panel, Stat, Vacio } from './ui'

type SubPanel = 'aprobaciones' | 'auditoria' | 'politica' | 'cumplimiento'

const COLOR_RIESGO: Record<string, string> = {
  bajo: 'bg-emerald-500/12 text-emerald-300 ring-emerald-500/25',
  medio: 'bg-amber-500/12 text-amber-300 ring-amber-500/25',
  alto: 'bg-rose-500/12 text-rose-300 ring-rose-500/25',
}

const COLOR_ACTOR: Record<string, string> = {
  agente: 'text-indigo-300',
  usuario: 'text-emerald-300',
  sistema: 'text-amber-300',
}

const COLOR_RESULTADO: Record<string, string> = {
  ok: 'text-emerald-300',
  aplicado: 'text-emerald-300',
  pendiente: 'text-amber-300',
  bloqueado: 'text-rose-300',
  rechazado: 'text-rose-300',
  aprobado: 'text-emerald-300',
  reubicado: 'text-slate-300',
}

function Interruptor({
  activo, onChange, etiqueta, descripcion,disabled,
}: {
  activo: boolean
  onChange: (v: boolean) => void
  etiqueta: string
  descripcion: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!activo)}
      className="flex w-full items-start gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-left transition hover:bg-white/6 disabled:opacity-50"
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
          activo ? 'bg-indigo-500' : 'bg-white/15'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition ${
            activo ? 'translate-x-4' : ''
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-200">{etiqueta}</span>
        <span className="block text-[11px] leading-snug text-slate-500">{descripcion}</span>
      </span>
    </button>
  )
}

export default function ResponsibilityPanel() {
  const {
    politica, aprobaciones, auditoria, resumenAuditoria, cumplimiento, cargandoResponsable,
    cargarResponsable, guardarPolitica, decidirAprobacion, purgarAuditoria,
  } = useLifeSync()
  const [sub, setSub] = useState<SubPanel>('aprobaciones')
  const [guardando, setGuardando] = useState(false)
  const [nota, setNota] = useState<Record<number, string>>({})
  const [pruebaTexto, setPruebaTexto] = useState('')
  const [prueba, setPrueba] = useState<{
    texto_original: string
    texto_redactado: string
    categorias: string[]
  } | null>(null)
  const [inventario, setInventario] = useState<Awaited<ReturnType<typeof api.inventario>> | null>(null)

  useEffect(() => {
    void cargarResponsable()
  }, [cargarResponsable])

  useEffect(() => {
    if (sub === 'cumplimiento' && !inventario) {
      void api.inventario().then(setInventario).catch(() => setInventario(null))
    }
  }, [sub, inventario])

  const pendientes = useMemo(() => aprobaciones.filter((a) => a.estado === 'pendiente'), [aprobaciones])

  async function alternar(campo: keyof Politica, valor: boolean | number) {
    setGuardando(true)
    try {
      await guardarPolitica({ [campo]: valor } as Partial<Politica>)
    } finally {
      setGuardando(false)
    }
  }

  async function probarRedaccion() {
    if (!pruebaTexto.trim()) return
    const r = await api.redactar(pruebaTexto)
    setPrueba(r)
  }

  const subTabs: { id: SubPanel; label: string; icono: typeof ShieldCheck; badge?: number }[] = [
    { id: 'aprobaciones', label: 'Aprobaciones', icono: ShieldAlert, badge: pendientes.length },
    { id: 'auditoria', label: 'AuditorÃ­a', icono: Fingerprint },
    { id: 'politica', label: 'PolÃ­tica', icono: Scale },
    { id: 'cumplimiento', label: 'Cumplimiento', icono: BookOpen },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5">
      {/* Cabecera con navegacion por sub-paneles */}
      <Panel
        className="shrink-0"
        titulo={
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Responsabilidad
          </span>
        }
        acciones={
          cumplimiento ? (
            <Chip className={cumplimiento.puntaje >= 75 ? 'bg-emerald-500/12 text-emerald-300 ring-emerald-500/25' : 'bg-amber-500/12 text-amber-300 ring-amber-500/25'}>
              Cumplimiento {cumplimiento.puntaje}%
            </Chip>
          ) : null
        }
        cuerpoClass="p-4"
      >
        <div className="flex flex-wrap gap-1.5">
          {subTabs.map((t) => {
            const Icono = t.icono
            const activo = sub === t.id
            return (
              <button
                key={t.id}
                onClick={() => setSub(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activo
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                <Icono className="h-3.5 w-3.5" />
                {t.label}
                {t.badge ? (
                  <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                    {t.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </Panel>

      <div className="min-h-0 flex-1">
        {/* ---------------------------------------------------- APROBACIONES */}
        {sub === 'aprobaciones' && (
          <Panel
            className="h-full"
            titulo="Bandeja de aprobaciones"
            icono={<ShieldAlert className="h-4 w-4 text-amber-400" />}
            acciones={
              <Chip className="bg-white/6 text-slate-400 ring-white/10">
                {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
              </Chip>
            }
            cuerpoClass="overflow-y-auto p-4 space-y-3"
          >
            {pendientes.length === 0 ? (
              <Vacio
                icono={<CheckCircle2 className="h-8 w-8" />}
                texto="Nada espera tu aprobaciÃ³n"
                sub="El agente solo te consulta cuando una acciÃ³n es sensible: borrados, gastos altos o confianza baja."
              />
            ) : (
              pendientes.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100">{p.resumen}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {p.motivo}
                      </p>
                    </div>
                    <Chip className={COLOR_RIESGO[p.riesgo] ?? COLOR_RIESGO.medio}>
                      riesgo {p.riesgo}
                    </Chip>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Chip className="bg-white/6 text-slate-400 ring-white/10">regla: {p.regla}</Chip>
                    {p.confianza != null && (
                      <Chip className="bg-white/6 text-slate-400 ring-white/10">
                        confianza {(p.confianza * 100).toFixed(0)}%
                      </Chip>
                    )}
                  </div>

                  <input
                    value={nota[p.id] ?? ''}
                    onChange={(e) => setNota((n) => ({ ...n, [p.id]: e.target.value }))}
                    placeholder="Nota para la bitÃ¡cora (opcional)"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/60 focus:outline-none"
                  />

                  <div className="mt-2 flex gap-2">
                    <Boton
                      variante="primario"
                      onClick={() => void decidirAprobacion(p.id, true, nota[p.id])}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar y ejecutar
                    </Boton>
                    <Boton
                      variante="peligro"
                      onClick={() => void decidirAprobacion(p.id, false, nota[p.id])}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Rechazar
                    </Boton>
                  </div>
                </div>
              ))
            )}
          </Panel>
        )}

        {/* ------------------------------------------------------ AUDITORIA */}
        {sub === 'auditoria' && (
          <Panel
            className="h-full"
            titulo="BitÃ¡cora de auditorÃ­a"
            icono={<Fingerprint className="h-4 w-4 text-indigo-400" />}
            acciones={
              <Boton
                variante="fantasma"
                onClick={() => void purgarAuditoria()}
                titulo="Purgar entradas mÃ¡s antiguas que la retenciÃ³n configurada"
              >
                <Trash2 className="h-3.5 w-3.5" /> Purgar
              </Boton>
            }
            cuerpoClass="overflow-y-auto p-4 space-y-3"
          >
            {resumenAuditoria && (
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat etiqueta="Decisiones" valor={resumenAuditoria.total} tono="indigo" />
                <Stat
                  etiqueta="Con motivo"
                  valor={`${resumenAuditoria.explicabilidad_pct}%`}
                  tono="emerald"
                />
                <Stat
                  etiqueta="Riesgo alto"
                  valor={resumenAuditoria.por_riesgo?.alto ?? 0}
                  tono="rose"
                />
                <Stat
                  etiqueta="Bloqueadas"
                  valor={resumenAuditoria.por_resultado?.bloqueado ?? 0}
                  tono="amber"
                />
              </div>
            )}

            {auditoria.length === 0 ? (
              <Vacio
                icono={<Activity className="h-8 w-8" />}
                texto="Sin registros todavÃ­a"
                sub="Cada decisiÃ³n del agente (aplicada, bloqueada, aprobada o rechazada) quedarÃ¡ anotada aquÃ­."
              />
            ) : (
              auditoria.map((e) => <FilaAuditoria key={e.id} entrada={e} />)
            )}
          </Panel>
        )}

        {/* ------------------------------------------------------- POLITICA */}
        {sub === 'politica' && (
          <div className="h-full overflow-y-auto space-y-3">
            <Panel
              titulo="ParÃ¡metros de gobierno"
              icono={<Scale className="h-4 w-4 text-slate-400" />}
              cuerpoClass="p-4 space-y-3"
            >
              {!politica ? (
                <Vacio texto="Cargando polÃ­tica..." />
              ) : (
                <>
                  <Interruptor
                    activo={politica.modo_prudente}
                    onChange={(v) => void alternar('modo_prudente', v)}
                    etiqueta="Modo prudente"
                    descripcion="El agente propone y NUNCA ejecuta por su cuenta: todo pasa por tu bandeja de aprobaciones."
                  />
                  <Interruptor
                    activo={politica.eliminar_requiere_aprobacion}
                    onChange={(v) => void alternar('eliminar_requiere_aprobacion', v)}
                    etiqueta="Borrados requieren aprobaciÃ³n"
                    descripcion="Eliminar un registro es irreversible, asÃ­ que siempre te lo consulta."
                  />
                  <Interruptor
                    activo={politica.gasto_alto_requiere_aprobacion}
                    onChange={(v) => void alternar('gasto_alto_requiere_aprobacion', v)}
                    etiqueta="Gastos altos requieren aprobaciÃ³n"
                    descripcion={`Los gastos por encima de ${monto(politica.gasto_max_autonomo)} pasan a tu bandeja.`}
                  />
                  <Interruptor
                    activo={politica.baja_confianza_requiere_aprobacion}
                    onChange={(v) => void alternar('baja_confianza_requiere_aprobacion', v)}
                    etiqueta="Baja confianza requiere aprobaciÃ³n"
                    descripcion={`Si el modelo duda (menos de ${(politica.umbral_confianza * 100).toFixed(0)}% de confianza), te pregunta antes de actuar.`}
                  />
                  <Interruptor
                    activo={politica.exigir_motivo}
                    onChange={(v) => void alternar('exigir_motivo', v)}
                    etiqueta="Exigir motivo"
                    descripcion="Ninguna acciÃ³n se aplica sin una explicaciÃ³n de por quÃ©."
                  />
                  <Interruptor
                    activo={politica.redactar_pii}
                    onChange={(v) => void alternar('redactar_pii', v)}
                    etiqueta="Redactar datos personales"
                    descripcion="CÃ©dulas, telÃ©fonos, correos, tarjetas y claves se ocultan antes de enviar nada al modelo."
                  />
                  <Interruptor
                    activo={politica.registrar_auditoria}
                    onChange={(v) => void alternar('registrar_auditoria', v)}
                    etiqueta="Registrar auditorÃ­a"
                    descripcion="Guarda quiÃ©n hizo quÃ©, con quÃ© motivo y con quÃ© riesgo."
                  />
                  <Interruptor
                    activo={politica.permitir_ia_externa}
                    onChange={(v) => void alternar('permitir_ia_externa', v)}
                    etiqueta="Permitir IA externa"
                    descripcion="Si lo desactivas, todo se procesa con el motor local y nada sale de tu equipo."
                  />
                  {guardando && (
                    <p className="text-[11px] text-slate-500">Guardando polÃ­tica...</p>
                  )}
                </>
              )}
            </Panel>

            <Panel
              titulo="Umbrales numÃ©ricos"
              icono={<AlertTriangle className="h-4 w-4 text-amber-400" />}
              cuerpoClass="p-4 space-y-3.5"
            >
              {politica && (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-300">
                      Umbral de confianza: {(politica.umbral_confianza * 100).toFixed(0)}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(politica.umbral_confianza * 100)}
                      onChange={(e) => void alternar('umbral_confianza', Number(e.target.value) / 100)}
                      className="mt-1 w-full accent-indigo-500"
                    />
                    <span className="text-[11px] text-slate-500">
                      Por debajo de este valor, el agente te consulta en vez de actuar.
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-300">
                      Gasto mÃ¡ximo autÃ³nomo: {monto(politica.gasto_max_autonomo)}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={politica.gasto_max_autonomo}
                      onChange={(e) => void alternar('gasto_max_autonomo', Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-300">
                      MÃ¡ximo de acciones por mensaje: {politica.max_acciones_por_mensaje}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={politica.max_acciones_por_mensaje}
                      onChange={(e) => void alternar('max_acciones_por_mensaje', Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-300">
                      RetenciÃ³n de auditorÃ­a: {politica.dias_retencion_auditoria} dÃ­as
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      value={politica.dias_retencion_auditoria}
                      onChange={(e) => void alternar('dias_retencion_auditoria', Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500/60 focus:outline-none"
                    />
                  </label>
                </>
              )}
            </Panel>

            <Panel
              titulo="Prueba de redacciÃ³n de datos personales"
              icono={<Lock className="h-4 w-4 text-emerald-400" />}
              cuerpoClass="p-4 space-y-3"
            >
              <p className="max-w-2xl text-[11px] text-slate-500">
                Escribe un texto con datos personales y comprueba quÃ© se ocultarÃ­a antes de enviarlo al modelo.
              </p>
              <div className="flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-start">
                <textarea
                  value={pruebaTexto}
                  onChange={(e) => setPruebaTexto(e.target.value)}
                  rows={3}
                  placeholder="Ej.: llama a Juan al 3105551234, correo juan@correo.com, cedula 1094884721"
                  className="min-h-[72px] flex-1 resize-y rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/60 focus:outline-none"
                />
                <Boton variante="secundario" onClick={() => void probarRedaccion()} className="shrink-0 sm:mt-0.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Comprobar
                </Boton>
              </div>
              {prueba && (
                <div className="max-w-2xl space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {prueba.categorias.length === 0 ? (
                      <Chip className="bg-emerald-500/12 text-emerald-300 ring-emerald-500/25">
                        No se detectaron datos personales
                      </Chip>
                    ) : (
                      prueba.categorias.map((c) => (
                        <Chip key={c} className="bg-emerald-500/12 text-emerald-300 ring-emerald-500/25">
                          {c} redactado
                        </Chip>
                      ))
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-white/8 bg-white/3 p-2.5">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Original
                      </div>
                      <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-400">
                        {prueba.texto_original}
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
                        Lo que ve el modelo
                      </div>
                      <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300">
                        {prueba.texto_redactado}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* --------------------------------------------------- CUMPLIMIENTO */}
        {sub === 'cumplimiento' && (
          <div className="h-full overflow-y-auto space-y-3">
            <Panel
              titulo="Controles de IA responsable"
              icono={<BookOpen className="h-4 w-4 text-emerald-400" />}
              acciones={
                cumplimiento ? (
                  <Chip
                    className={
                      cumplimiento.puntaje >= 75
                        ? 'bg-emerald-500/12 text-emerald-300 ring-emerald-500/25'
                        : 'bg-amber-500/12 text-amber-300 ring-amber-500/25'
                    }
                  >
                    {cumplimiento.puntaje}% de cumplimiento
                  </Chip>
                ) : null
              }
              cuerpoClass="p-4 space-y-3"
            >
              {!cumplimiento ? (
                <Vacio texto="Cargando controles..." />
              ) : (
                cumplimiento.controles.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5"
                  >
                    {c.estado === 'cumple' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    ) : c.estado === 'parcial' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">{c.nombre}</span>
                        <Chip className="bg-white/6 text-slate-500 ring-white/10">{c.marco}</Chip>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{c.detalle}</p>
                    </div>
                  </div>
                ))
              )}
            </Panel>

            <Panel
              titulo="Inventario de datos tratados"
              icono={<FileText className="h-4 w-4 text-slate-400" />}
              cuerpoClass="overflow-x-auto p-4"
            >
              {!inventario ? (
                <Vacio texto="Cargando inventario..." />
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="py-1.5 pr-3 font-semibold">CategorÃ­a</th>
                      <th className="py-1.5 pr-3 font-semibold">Dato</th>
                      <th className="py-1.5 pr-3 font-semibold">Finalidad</th>
                      <th className="py-1.5 font-semibold">Base legal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventario.categorias_datos.map((c) => (
                      <tr key={c.categoria} className="border-t border-white/6 align-top">
                        <td className="py-1.5 pr-3 font-medium text-slate-300">{c.categoria}</td>
                        <td className="py-1.5 pr-3 text-slate-400">{c.dato}</td>
                        <td className="py-1.5 pr-3 text-slate-400">{c.finalidad}</td>
                        <td className="py-1.5 text-slate-500">{c.base_legal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            {inventario && (
              <>
                <Panel
                  titulo="Terceros y transferencias"
                  icono={<Info className="h-4 w-4 text-slate-400" />}
                  cuerpoClass="p-4 space-y-3"
                >
                  {inventario.terceros.map((t) => (
                    <div key={t.nombre} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                      <p className="text-xs font-semibold text-slate-200">{t.nombre}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Dato enviado: {t.dato} Â· PropÃ³sito: {t.proposito}
                      </p>
                      <p className="mt-0.5 text-[11px] text-emerald-300">Control: {t.control}</p>
                    </div>
                  ))}
                </Panel>

                <Panel
                  titulo="Tus derechos sobre tus datos"
                  icono={<Scale className="h-4 w-4 text-slate-400" />}
                  cuerpoClass="p-4 space-y-2"
                >
                  {Object.entries(inventario.derechos).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[11px]">
                      <span className="w-28 shrink-0 font-semibold capitalize text-slate-300">{k}</span>
                      <span className="text-slate-500">{v}</span>
                    </div>
                  ))}
                </Panel>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FilaAuditoria({ entrada }: { entrada: EntradaAuditoria }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium text-slate-200">{entrada.descripcion}</p>
        <Chip className={COLOR_RIESGO[entrada.riesgo] ?? COLOR_RIESGO.bajo}>
          {entrada.riesgo}
        </Chip>
      </div>
      {entrada.motivo && (
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{entrada.motivo}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
        <span className={COLOR_ACTOR[entrada.actor] ?? 'text-slate-400'}>{entrada.actor}</span>
        <span>Â·</span>
        <span>{entrada.tipo}</span>
        <span>Â·</span>
        <span className={COLOR_RESULTADO[entrada.resultado] ?? 'text-slate-400'}>
          {entrada.resultado}
        </span>
        {entrada.confianza != null && (
          <>
            <span>Â·</span>
            <span>confianza {(entrada.confianza * 100).toFixed(0)}%</span>
          </>
        )}
        <span>Â·</span>
        <span>{new Date(entrada.creado_en).toLocaleString('es-CO')}</span>
        {!entrada.reversible && (
          <>
            <span>Â·</span>
            <span className="text-rose-300">irreversible</span>
          </>
        )}
      </div>
    </div>
  )
}
