import { useEffect, useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { LayoutDashboard, Settings, MessageSquare, Kanban, Database, Brain, LogOut, User, Bell, Key, Palette, Share2, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/lib/api';
import './Dashboard.css';

const navigation = [
  { name: 'Chat', href: '/dashboard', icon: MessageSquare },
  { name: 'Eventos', href: '/events', icon: LayoutDashboard },
  { name: 'Tareas', href: '/tasks', icon: LayoutDashboard },
  { name: 'Paneles', href: '/panels', icon: Kanban },
  { name: 'Respaldos', href: '/backups', icon: Database },
  { name: 'Ajustes', href: '/settings', icon: Settings },
];

export function Dashboard() {
  const { user, isAuthenticated, loading, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [trialMode, setTrialMode] = useState(false);

  useEffect(() => {
    // Verificar modo demo
    const isDemo = sessionStorage.getItem('trial_mode') === 'true';
    const expires = sessionStorage.getItem('trial_expires');
    if (isDemo && expires && Date.now() < parseInt(expires)) {
      setTrialMode(true);
    } else {
      sessionStorage.removeItem('trial_mode');
      sessionStorage.removeItem('trial_expires');
    }

    if (!loading && !isAuthenticated && !trialMode) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, loading, navigate, trialMode]);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Trial Mode Banner */}
      {trialMode && (
        <div className="trial-banner">
          <div className="trial-content">
            <Sparkles size={20} />
            <span>Modo demo activo - Prueba limitada (30 minutos)</span>
            <button 
              onClick={() => {
                sessionStorage.removeItem('trial_mode');
                sessionStorage.removeItem('trial_expires');
                navigate('/');
              }}
              className="trial-close"
            >
              Salir de demo
            </button>
          </div>
        </div>
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <h1 className={sidebarOpen ? '' : 'hidden'}>LifeAgente</h1>
          <button 
            className="sidebar-toggle" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Colapsar' : 'Expandir'}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
              {sidebarOpen ? (
                <polyline points="15 18 9 12 15 6" />
              ) : (
                <polyline points="9 18 15 12 9 6" />
              )}
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          {navigation.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className="nav-item"
              data-active={window.location.pathname === item.href || window.location.pathname.startsWith(item.href + '/')}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.name}</span>}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info" onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <div className="user-avatar">
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="" />
              ) : (
                <User size={20} />
              )}
            </div>
            {sidebarOpen && (
              <div className="user-details">
                <span className="user-name">{user?.user_metadata?.display_name || user?.email || 'Usuario'}</span>
                <span className="user-email">{user?.email}</span>
              </div>
            )}
            {sidebarOpen && (
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} className="chevron">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </div>
          
          {userMenuOpen && (
            <div className="user-menu">
              <a href="/settings/profile" className="menu-item"><User size={16} /> Perfil</a>
              <a href="/settings/ai" className="menu-item"><Brain size={16} /> IA (BYOK)</a>
              <a href="/settings/notifications" className="menu-item"><Bell size={16} /> Notificaciones</a>
              <a href="/settings/appearance" className="menu-item"><Palette size={16} /> Apariencia</a>
              <hr />
              <button onClick={async () => { await signOut(); navigate('/login'); }} className="menu-item danger">
                <LogOut size={16} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && window.innerWidth < 1024 && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <main className="main-content">
        <header className="top-bar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="page-title">{getPageTitle()}</h1>
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function getPageTitle() {
  const path = window.location.pathname;
  if (path === '/dashboard' || path.startsWith('/chat')) return 'Chat IA';
  if (path.startsWith('/events')) return 'Eventos';
  if (path.startsWith('/tasks')) return 'Tareas';
  if (path.startsWith('/panels')) return 'Paneles';
  if (path.startsWith('/backups')) return 'Respaldos';
  if (path.startsWith('/settings')) return 'Ajustes';
  return 'LifeAgente';
}