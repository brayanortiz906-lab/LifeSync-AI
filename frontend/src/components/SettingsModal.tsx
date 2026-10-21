/** Modal de ajustes: proveedor de IA, modelo y API Key del usuario (BYOK). */
import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, Save, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useLifeSync } from '../store/useLifeSync'
import { Boton, Chip, Modal } from './ui'

const MODELOS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'],
  mock: ['clasificador local'],
}

export default function SettingsModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { proveedor, modelo, apiKey, guardarAjustes, setApiKey } = useLifeSync()
  const [prov, setProv] = useState(proveedor)
  const [mod, setMod] = useState(modelo)
  const [key, setKey] = useState(apiKey)
  const [visible, setVisible] = useState(false)
  const [guardarEnServidor, setGuardarEnServidor] = useState(false)
  const [estado, setEstado] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (abierto) {
      setProv(proveedor)
      setMod(modelo)
      setKey(apiKey)
    }
  }, [abierto, proveedor, modelo, apiKey])

  const guardar = async () => {
    setOcupado(true)
    setEstado(null)
    try {
      await guardarAjustes({
        proveedor: prov,
        modelo: mod,
        ...(key !== apiKey ? { api_key: key } : {}),
        ...(guardarEnServidor && key ? { api_key: key } : {}),
      })
      if (!guardarEnServidor) {
        setApiKey(key)
      }
      setEstado(
        guardarEnServidor
          ? 'API Key cifrada y guardada en el servidor (AES/Fernet).'
          : 'API Key guardada solo en este navegador (localStorage).',
      )
    } catch (e) {
      setEstado(`Error: ${(e as Error).message}`)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Conectar tu IA (BYOK)">
      <div className="space-y-4">
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/8 p-3 text-xs leading-relaxed text-indigo-100">
          LifeSync funciona con <strong>tu propia clave</strong>: nada se comparte con terceros.
          Elige proveedor, pega la clave y el agente empieza a clasificar y organizar tu vida.
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-300">Proveedor</span>
          <div className="grid grid-cols-3 gap-2">
            {(['mock', 'openai', 'gemini'] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setProv(p)
                  setMod(MODELOS[p][0])
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition ${
                  prov === p
                    ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200'
                    : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/10'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <span className="mt-1.5 block text-[10px] text-slate-500">
            <strong>mock</strong> = clasificador local por reglas. Sirve para demostrar el
            prototipo sin gastar tokens ni registrar claves.
          </span>
        </label>

        {prov !== 'mock' && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-300">Modelo</span>
              <input
                value={mod}
                onChange={(e) => setMod(e.target.value)}
                list="modelos-lista"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
              />
              <datalist id="modelos-lista">
                {(MODELOS[prov] ?? []).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <div className="mt-1 flex flex-wrap gap-1">
                {(MODELOS[prov] ?? []).map((m) => (
                  <Chip
                    key={m}
                    onClick={() => setMod(m)}
                    className="cursor-pointer bg-white/5 text-slate-400 ring-white/10 hover:bg-white/12"
                  >
                    {m}
                  </Chip>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-300">API Key</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={visible ? 'text' : 'password'}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={prov === 'openai' ? 'sk-...' : 'AIza...'}
                    autoComplete="off"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-9 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(!visible)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    aria-label="Mostrar u ocultar la clave"
                  >
                    {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2 rounded-lg border border-white/8 bg-white/3 p-2.5">
              <input
                type="checkbox"
                checked={guardarEnServidor}
                onChange={(e) => setGuardarEnServidor(e.target.checked)}
                className="mt-0.5 accent-indigo-500"
              />
              <span className="text-[11px] leading-relaxed text-slate-400">
                <span className="flex items-center gap-1 font-semibold text-slate-300">
                  <ShieldCheck size={12} /> Recordar la clave en el servidor
                </span>
                Se cifra con AES (Fernet) usando <code>APP_SECRET_KEY</code>. Si lo desactivas,
                la clave viaja solo en cada petición y se guarda únicamente en este navegador.
              </span>
            </label>
          </>
        )}

        {estado && (
          <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-[11px] text-slate-300">
            {estado.startsWith('Error') ? (
              <TriangleAlert size={13} className="mt-0.5 shrink-0 text-rose-400" />
            ) : (
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-400" />
            )}
            {estado}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-white/8 pt-3">
          <Chip className="bg-white/5 text-slate-400 ring-white/10">
            <KeyRound size={11} />
            {key ? 'clave configurada' : 'sin clave'}
          </Chip>
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={onCerrar}>
              Cerrar
            </Boton>
            <Boton onClick={guardar} disabled={ocupado}>
              {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Guardar
            </Boton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
