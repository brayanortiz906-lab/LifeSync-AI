import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, Github, Chrome } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import './AuthPages.css';

export function Login() {
  const navigate = useNavigate();
  const { signIn, signInWithOAuth, signInWithMagicLink, loading } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'password') {
        await signIn(email, password);
      } else {
        await signInWithMagicLink(email);
        setError('Magic link enviado. Revisa tu email.');
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch (e: any) {
      setError(e.message || 'Error al iniciar sesión');
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    setError('');
    try {
      await signInWithOAuth(provider);
    } catch (e: any) {
      setError(e.message || `Error con ${provider}`);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>LifeAgente</h1>
          <p>Inicia sesión para continuar</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-tabs">
            <button 
              type="button" 
              className={mode === 'password' ? 'active' : ''}
              onClick={() => setMode('password')}
            >
              <Lock size={16} /> Contraseña
            </button>
            <button 
              type="button" 
              className={mode === 'magic' ? 'active' : ''}
              onClick={() => setMode('magic')}
            >
              <Mail size={16} /> Magic Link
            </button>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>
          </div>

          {mode === 'password' && (
            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={loading}
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
          )}

          <button type="submit" className="btn-primary" disabled={loading || !email || (mode === 'password' && !password)}>
            {loading ? <Loader2 size={20} className="spin" /> : 'Iniciar sesión'}
          </button>
        </form>

        <div className="auth-divider">
          <span>o continuar con</span>
        </div>

        <div className="oauth-buttons">
          <button 
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={loading}
            className="btn-oauth"
          >
            <Chrome size={20} /> Google
          </button>
          <button 
            type="button"
            onClick={() => handleOAuth('github')}
            disabled={loading}
            className="btn-oauth"
          >
            <Github size={20} /> GitHub
          </button>
        </div>

        <p className="auth-footer">
          ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
        </p>
      </div>
    </div>
  );
}