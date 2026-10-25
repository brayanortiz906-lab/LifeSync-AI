import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import './AuthPages.css';

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { init } = useAuthStore();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Procesando...');

  useEffect(() => {
    const handleCallback = async () => {
      // Verificar si hay error en la URL
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      
      if (error) {
        setStatus('error');
        setMessage(errorDescription || error);
        return;
      }

      // Intercambiar code por sesión (PKCE)
      const code = searchParams.get('code');
      if (code) {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } catch (e: any) {
          setStatus('error');
          setMessage(e.message);
          return;
        }
      }

      // Inicializar auth store
      await init();
      
      setStatus('success');
      setMessage('Sesión iniciada correctamente');
      
      // Redirigir después de 1.5s
      setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
    };

    handleCallback();
  }, [searchParams, navigate, init]);

  return (
    <div className="auth-page">
      <div className="auth-container auth-callback">
        <div className={`callback-icon ${status}`}>
          {status === 'loading' && <Loader2 size={48} className="spin" />}
          {status === 'success' && <CheckCircle size={48} />}
          {status === 'error' && <AlertCircle size={48} />}
        </div>
        <h1>{status === 'loading' ? 'Procesando...' : status === 'success' ? '¡Listo!' : 'Error'}</h1>
        <p>{message}</p>
        {status === 'error' && (
          <button onClick={() => navigate('/login')} className="btn-primary">
            Volver al login
          </button>
        )}
      </div>
    </div>
  );
}