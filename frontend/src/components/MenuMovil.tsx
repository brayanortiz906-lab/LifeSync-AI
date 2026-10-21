/**
 * Menu movil: lo que NO cabe en la pantalla de un telefono.
 *
 * En pantallas grandes la agenda usa tres columnas y este menu no existe.
 * En telefonos y tablets pequenas: el calendario se ve completo, debajo van
 * las tres lineas de resumen y aqui vive todo lo demas (tareas, dinero,
 * contexto y la cuenta), en una hoja que sube desde abajo.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardList, Coins, LayoutList, LogOut, MessageSquare, Plug, User, X } from 'lucide-react'
import { useLifeSync } from '../store/useLifeSync'
import AcademicPanel from './AcademicPanel'
import LogbookPanel from './LogbookPanel'
import ContextoLateral from './ContextoLateral'
import { lineasResumen, useResumen } from './ResumenMovil'
import { Boton } from './ui'
import type { Usuario } from '../types'

type Pestana = 'tareas' | 'dinero' | 'contexto' | 'cuenta'

const PESTANAS: Array<{ id: Pestana; texto: string; icono: typeof ClipboardList }> = [
  { id: 'tareas', texto: 'Tareas', icono: ClipboardList },
  { id: 'dinero', texto: 'Dinero', icono: Coins },
  { id: 'contexto', texto: 'Contexto', icono: LayoutList },
  { id: 'cuenta', texto: 'Cuenta', icono: User },
]

export default function MenuMovil({
  abierto,
  onCerrar,
  onAbrirConexiones,
  onAbrirAcceso,
  onAbrirChat,
  usuario,
}: {
  abierto: boolean
  onCerrar: () => void
  onAbrirConexiones: () => void
  onAbrirAcceso: () => void
  onAbrirChat: () => void
  usuario?: Usuario | null
}) {
  const [pestana, setPestana] = useState<Pestana>('tareas')
  const resumen = useResumen()
  const lineas = lineasResumen(resumen)
  const limpiarChat = useLifeSync((s) => s.limpiarChat)

  // Escape cierra y el fondo no se desplaza mientras la hoja esta abierta.
  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alPulsar)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', alPulsar)
      document.body.style.overflow = antes
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onCerrar} />

      <div className="ls-hoja-entra relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-900 shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20" />

        <header className="flex shrink-0 items-start gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white">Todo lo que no cabe en la pantalla</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Consúltalo aquí y vuelve a la agenda cuando quieras.
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar el menu"
          >
            <X size={18} />
          </button>
        </header>

        {/* Las tres lineas: siempre visibles, sea cual sea la pestana. */}
        <div className="shrink-0 px-5">
          <ul className="ls-card ls-card-apretado space-y-1 text-[11px] leading-snug text-slate-300">
            {lineas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </div>

        <div className="ls-scroll mt-3 flex shrink-0 gap-1 overflow-x-auto px-5">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                pestana === p.id
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              <p.icono size={13} />
              {p.texto}
            </button>
          ))}
        </div>

        <div className="ls-scroll ls-hoja min-h-0 flex-1 px-5 pt-3">
          {pestana === 'tareas' && <AcademicPanel />}
          {pestana === 'dinero' && <LogbookPanel />}
          {pestana === 'contexto' && <ContextoLateral fecha={new Date()} />}
          {pestana === 'cuenta' && (
            <div className="space-y-3">
              <section className="ls-card space-y-2.5">
                <h3 className="ls-label">Tu cuenta</h3>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {usuario && !usuario.es_local
                    ? `Sesión iniciada como ${usuario.nombre || usuario.correo}. Tus datos se guardan en la nube, separados de los demás.`
                    : 'Estás usando LifeAgente en este equipo. Entra con tu cuenta para tener tus datos siempre disponibles.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Boton variante="secundario" onClick={onAbrirAcceso}>
                    <User size={14} /> {usuario && !usuario.es_local ? 'Cambiar de cuenta' : 'Acceder'}
                  </Boton>
                  <Boton variante="fantasma" onClick={onAbrirConexiones}>
                    <Plug size={14} /> Conectar IA
                  </Boton>
                </div>
              </section>

              <section className="ls-card space-y-2.5">
                <h3 className="ls-label">Atajos</h3>
                <div className="flex flex-wrap gap-2">
                  <Boton variante="primario" onClick={onAbrirChat}>
                    <MessageSquare size={14} /> Abrir el chat
                  </Boton>
                  <Boton variante="fantasma" onClick={limpiarChat}>
                    <LogOut size={14} /> Limpiar el historial del chat
                  </Boton>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
