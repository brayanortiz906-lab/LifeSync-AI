import { useEffect, useRef, useState } from 'react';
import { Chrome, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import './GoogleSignInButton.css';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean; use_fedcm_for_prompt?: boolean }) => void;
          renderButton: (element: HTMLElement, options: { type: string; theme: string; size: string; text: string; shape: string; logo_alignment: string; width: string | number; locale: string }) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

interface Props {
  onSuccess?: () => void;
  className?: string;
  variant?: 'default' | 'compact' | 'icon-only';
}

export function GoogleSignInButton({ onSuccess, className = '', variant = 'default' }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signInWithOAuth } = useAuthStore();

  useEffect(() => {
    // Cargar Google Identity Services (GIS)
    if (!window.google?.accounts?.id) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => inicializarGIS();
      document.head.appendChild(script);
    } else {
      inicializarGIS();
    }

    return () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect();
      }
    };
  }, []);

  const inicializarGIS = () => {
    if (!containerRef.current || !window.google?.accounts?.id) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID no configurado');
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
    });

    // Renderizar boton personalizado
    if (containerRef.current) {
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: variant === 'icon-only' ? 48 : '100%',
        locale: 'es',
      });
    }
  };

  const handleCredentialResponse = async (response: { credential: string }) => {
    setLoading(true);
    setError(null);

    try {
      // Enviar ID token al backend
      await api.cuentas.googleDesdeIdToken(response.credential);
      // El auth store se actualiza via onAuthStateChange
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || 'Error con Google Sign-In');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    // Trigger manual si el boton GIS no responde
    if (window.google?.accounts?.id?.prompt) {
      window.google.accounts.id.prompt();
    }
  };

  if (variant === 'icon-only') {
    return (
      <button
        ref={buttonRef}
        onClick={handleClick}
        disabled={loading}
        className={`google-btn-icon ${className}`}
        aria-label="Iniciar sesion con Google"
      >
        {loading ? <Loader2 size={20} className="spin" /> : <Chrome size={20} />}
      </button>
    );
  }

  return (
    <div className={`google-signin-wrapper ${className}`}>
      <div ref={containerRef} className="google-btn-container" onClick={handleClick} />

      {error && (
        <div className="google-error" role="alert">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {variant === 'default' && (
        <p className="google-hint">
          O usa <a href="/login">email y contrasena</a>
        </p>
      )}
    </div>
  );
}