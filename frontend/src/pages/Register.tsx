import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import './AuthPages.css';

export function Register() {
  const navigate = useNavigate();
  const { signUp, loading } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    try {
      await signUp(email, password, displayName);
      navigate('/dashboard', { replace: true });
    } catch (e: any) {
      setError(e.message || 'Error al registrarse');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>LifeAgente</h1>
          <p>Crea tu cuenta gratuita</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="displayName">Nombre (opcional)</label>
            <div className="input-wrapper">
              <User size={18} className="input-icon" />
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre"
                maxLength={100}
                disabled={loading}
              />
            </div>
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

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
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

          <button type="submit" className="btn-primary" disabled={loading || !email || !password || !confirmPassword}>
            {loading ? <Loader2 size={20} className="spin" /> : 'Crear cuenta'}
          </button>
        </form>

        <p className="auth-footer">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}