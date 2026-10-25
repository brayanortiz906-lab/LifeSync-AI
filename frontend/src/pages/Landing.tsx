import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Chrome, Github, Sparkles, Play, Users, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import './Landing.css';

export function Landing() {
  const navigate = useNavigate();
  const { signInWithOAuth, loading, user, isAuthenticated } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Si ya está autenticado, redirigir a dashboard
  if (isAuthenticated && user) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const handleQuickSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Para demo rápida - usar credenciales de prueba o redirigir a registro
      navigate('/register', { replace: true });
    } catch (e: any) {
      setError(e.message || 'Error');
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    setError('');
    try {
      await signInWithOAuth(provider, `${window.location.origin}/dashboard`);
    } catch (e: any) {
      setError(e.message || `Error con ${provider}`);
    }
  };

  const handleTrialMode = () => {
    // Modo demo limitado - crea sesión temporal sin cuenta
    sessionStorage.setItem('trial_mode', 'true');
    sessionStorage.setItem('trial_expires', Date.now() + 30 * 60 * 1000); // 30 min
    navigate('/dashboard?demo=true', { replace: true });
  };

  return (
    <div className="landing-page">
      <div className="landing-container">
        {/* Header */}
        <header className="landing-header">
          <div className="logo">
            <Sparkles className="logo-icon" />
            <h1>LifeAgente</h1>
          </div>
          <p className="tagline">
            Tu asistente integral de vida y productividad con IA
          </p>
        </header>

        {/* Opciones principales */}
        <div className="landing-options">
          {/* Opción 1: Probar sin cuenta */}
          <div className="option-card trial-card">
            <div className="option-icon">
              <Play size={32} />
            </div>
            <h2>Probar gratis</h2>
            <p>Experimenta LifeAgente sin crear cuenta. Modo demo limitado a 30 minutos.</p>
            <ul className="features-list">
              <li>✓ Chat IA básico</li>
              <li>✓ Ver funcionalidades principales</li>
              <li>✓ Sin compromiso</li>
              <li>✓ Sin datos guardados</li>
            </ul>
            <button 
              onClick={handleTrialMode}
              className="btn-trial"
              disabled={loading}
            >
              <Play size={18} />
              Empezar prueba
            </button>
          </div>

          {/* Opción 2: Entrar con Google */}
          <div className="option-card auth-card">
            <div className="option-icon">
              <Chrome size={32} />
            </div>
            <h2>Entrar con Google</h2>
            <p>Accede rápido con tu cuenta Google. Sincroniza automáticamente con tu calendario y Drive.</p>
            <ul className="features-list">
              <li>✓ Inicio rápido</li>
              <li>✓ Sincronización Calendar/Drive</li>
              <li>✓ Guarda tu progreso</li>
              <li>✓ Acceso desde cualquier dispositivo</li>
            </ul>
            <button 
              onClick={() => handleOAuth('google')}
              className="btn-google"
              disabled={loading}
            >
              <Chrome size={18} />
              Continuar con Google
            </button>
          </div>

          {/* Opción 3: Crear cuenta */}
          <div className="option-card signup-card">
            <div className="option-icon">
              <Users size={32} />
            </div>
            <h2>Crear cuenta gratuita</h2>
            <p>Regístrate con email y contraseña. Trae tu propia API key de Gemini.</p>
            <ul className="features-list">
              <li>✓ $0/mes, sin límites</li>
              <li>✓ Trae tu propia IA (BYOK)</li>
              <li>✓ Datos privados y seguros</li>
              <li>✓ Backup automático</li>
            </ul>
            <button 
              onClick={() => navigate('/register')}
              className="btn-signup"
              disabled={loading}
            >
              Crear cuenta gratis
            </button>
          </div>
        </div>

        {/* Login rápido */}
        <div className="quick-login">
          <div className="divider">
            <span>o</span>
          </div>
          <form onSubmit={handleQuickSignIn} className="quick-form">
            <div className="input-group">
              <Mail size={18} />
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <Lock size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button 
              type="submit" 
              className="btn-login"
              disabled={loading || !email || !password}
            >
              {loading ? 'Cargando...' : 'Iniciar sesión'}
            </button>
          </form>
          {error && <div className="error-message">{error}</div>}
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="footer-content">
            <div className="footer-item">
              <Shield size={16} />
              <span>Datos encriptados y privados</span>
            </div>
            <div className="footer-item">
              <Sparkles size={16} />
              <span>$0/mes con free tier</span>
            </div>
          </div>
          <p className="footer-links">
            <a href="/privacy-policy">Privacidad</a>
            <span>•</span>
            <a href="/terms">Términos</a>
            <span>•</span>
            <a href="/cookie-policy">Cookies</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
