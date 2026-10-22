import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

/** Evento que dispara el navegador cuando la app se puede instalar (PWA). */
interface EventoInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * v44: boton "Instalar en el celular".
 *
 * Chrome y Edge disparan `beforeinstallprompt` cuando la app cumple los
 * requisitos de una PWA (manifest + service worker). Con ese evento
 * podemos abrir el dialogo de instalacion nativo, que en Android crea el
 * icono de la app y la abre a pantalla completa, sin navegador.
 */
export default function BotonInstalar() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)
  const [oculto, setOculto] = useState(false)

  useEffect(() => {
    const alPedir = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalacion)
    }
    const alInstalar = () => {
      setEvento(null)
      setOculto(true)
    }
    window.addEventListener('beforeinstallprompt', alPedir)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPedir)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  if (!evento || oculto) return null

  return (
    <button
      onClick={() => {
        void (async () => {
          try {
            await evento.prompt()
            const r = await evento.userChoice
            if (r.outcome === 'accepted') setOculto(true)
          } catch {
            /* el navegador no quiere instalar: no hacemos nada */
          }
          setEvento(null)
        })()
      }}
      className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10"
      aria-label="Instalar la app en el celular"
      title="Instalar LifeAgente en el celular (funciona sin internet)"
    >
      <Download size={17} />
    </button>
  )
}
