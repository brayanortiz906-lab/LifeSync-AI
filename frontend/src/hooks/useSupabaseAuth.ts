// Hook para manejo de autenticación y protección de rutas
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

export function useAuth() {
  const { user, session, loading, initialized, init, signOut, ...actions } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    init();
  }, [init]);

  // Rutas públicas que no requieren autenticación
  const publicRoutes = ['/login', '/register', '/auth/callback', '/auth/reset-password', '/'];

  useEffect(() => {
    if (initialized && !loading && !user && !publicRoutes.includes(location.pathname)) {
      navigate('/login', { replace: true });
    }
    if (initialized && !loading && user && (location.pathname === '/login' || location.pathname === '/register')) {
      navigate('/dashboard', { replace: true });
    }
  }, [initialized, loading, user, location.pathname, navigate]);

  return {
    user,
    session,
    loading: loading || !initialized,
    isAuthenticated: !!user,
    signOut: async () => {
      await signOut();
      navigate('/login', { replace: true });
    },
    ...actions,
  };
}

export function useOptionalAuth() {
  const { user, session, loading, initialized, init } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  return {
    user,
    session,
    loading: loading || !initialized,
    isAuthenticated: !!user,
  };
}