import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import './AuthPages.css';

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { updatePassword, loading: authLoading } = useAuthStore();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  // Verificar token al cargar
  useEffect(() => {
    const verifyToken = async () => {
      const accessToken = searchParams.get('access_token');
      const refreshToken = searchParams.get('refresh_token');
      const type = searchParams.get('type');

      if (type === 'recovery' && accessToken && refreshToken) {
        // Establecer sesión temporal para reset
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          setTokenValid(true);
          return;
        }
      }
      setTokenValid(false);
    };
    verifyToken();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tokenValid) {
      setError('Enlace inválido o expirado. Solicita uno nuevo.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (e: any) {
      setError(e.message || 'Error actualizando contraseña');
    } finally {
      setLoading(false);
    }
  };

  if (tokenValid === null) {
    return (
      <div className="auth-page">
        <div className="auth-container auth-callback">
          <Loader2 size={48} className="spin" />
          <p>Verificando enlace...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="auth-page">
        <div className="auth-container auth-callback">
          <AlertCircle size={48} className="error" />
          <h1>Enlace inválido</h1>
          <p>Este enlace de recuperación ha expirado o ya fue usado.</p>
          <button onClick={() => navigate('/login')} className="btn-primary">
            Volver al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          {success ? (
            <>
              <CheckCircle size={48} className="success" />
              <h1>¡Contraseña actualizada!</h1>
              <p>Redirigiendo al login...</p>
            </>
          ) : (
            <>
              <Lock size={48} />
              <h1>Nueva contraseña</h1>
              <p>Ingresa tu nueva contraseña (mínimo 8 caracteres)</p>
            </>
          )}
        </div>

        {!success && error && <div className="auth-error">{error}</div>}

        {!success && (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="password">Nueva contraseña</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  autoComplete="new-password"
                  disabled={loading}
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="toggle-password"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirmar contraseña</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={loading || !password || !confirmPassword}>
              {loading ? <Loader2 size={20} className="spin" /> : 'Actualizar contraseña'}
            </button>
          </form>
        )}

        {success && (
          <button onClick={() => navigate('/login')} className="btn-primary">
            Ir al login
          </button>
        )}
      </div>
    </div>
  );
}