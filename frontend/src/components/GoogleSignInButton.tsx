/**
 * Botón "Iniciar sesión con Google" usando Google Identity Services (GIS).
 *
 * Este componente usa la librería moderna de Google Identity Services (GIS)
 * para mostrar el botón "Iniciar sesión con Google" y manejar la respuesta
 * del ID token.
 *
 * Diferencia con el flujo actual (Device Authorization):
 * - GIS es para aplicaciones WEB (el usuario hace clic en el botón en el navegador)
 * - El flujo actual (Device Authorization) es para apps de escritorio/CLI
 * - Con GIS, el usuario hace clic en el botón, Google muestra un popup,
 *   y recibimos un ID token (JWT) que enviamos al backend para verificar.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { api, cuentas } from '../lib/api'

interface Props {
  /** Callback cuando el usuario inicia sesión correctamente. */
  onSuccess: (token: string, usuario: { id: number; correo: string; nombre: string; es_local: boolean }) => void
  /** Texto del botón mientras carga. */
  loadingText?: string
  /** Tamaño del botón. */
  size?: 'large' | 'medium' | 'small'
  /** Tema del botón. */
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  /** Ancho del botón. */
  width?: string
}

export default function GoogleSignInButton({
  onSuccess,
  loadingText = 'Iniciando sesión…',
  size = 'large',
  theme = 'outline',
  width = '100%',
}: Props) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gisReady, setGisReady] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    // Esperar a que la librería GIS se cargue
    const checkGis = () => {
      if (window.google?.accounts?.id) {
        setGisReady(true)
      } else {
        setTimeout(checkGis, 100)
      }
    }
    checkGis()

    // Limpiar al desmontar
    return () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect()
      }
    }
  }, [])

  const handleCredentialResponse = async (response: { credential?: string }) => {
    const rawToken = response.credential ?? ''
    if (!rawToken) {
      setError('No se recibió el token de Google')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const responseApi = await cuentas.googleDesdeIdToken(rawToken as string)
      onSuccess(responseApi.token, responseApi.usuario)
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'Error al iniciar sesión con Google'
      setError(mensaje)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!gisReady || !buttonRef.current || initializedRef.current) return

    // Inicializar el cliente GIS
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    // Renderizar el botón
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: theme,
      size: size,
      width: width === '100%' ? undefined : parseInt(width),
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
    })

    initializedRef.current = true
  }, [gisReady, theme, size, width])

  if (!gisReady) {
    return (
      <div
        ref={buttonRef}
        className="w-full animate-pulse bg-slate-800/50 rounded-xl h-12"
        style={{ width }}
      />
    )
  }

  return (
    <div className="w-full" style={{ width }}>
      <div ref={buttonRef} />
      {error && (
        <p className="mt-2 text-[11px] text-amber-300 text-center" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="mt-2 text-[11px] text-indigo-300 text-center flex items-center justify-center gap-1">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingText}
        </p>
      )}
    </div>
  )
}

// Declarar tipos globales para Google Identity Services
declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
            use_fedcm_for_prompt?: boolean
          }) => void
          renderButton: (
            element: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black'
              size?: 'large' | 'medium' | 'small'
              width?: string | number
              text?: 'signin_with' | 'signup_with' | 'continue_with'
              shape?: 'rectangular' | 'circle' | 'pill'
              logo_alignment?: 'left' | 'center'
            }) => void
          prompt: (notificationCallback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDismissedMoment: () => boolean }) => void) => void
          disableAutoSelect: () => void
        }
      }
    }
  }
}
