import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AuthCallback } from './pages/AuthCallback';
import { ResetPassword } from './pages/ResetPassword';
import { ChatInterface } from './components/Chat/ChatInterface';
import { Settings } from './pages/Settings';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { RefundPolicy } from './pages/RefundPolicy';
import { CookiePolicy } from './pages/CookiePolicy';
import { useAuth } from './hooks/useSupabaseAuth';
import { CookieConsentProvider } from './components/CookieConsentBanner';
import './index.css';

// Query client para React Query (caching, etc)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Rutas públicas (no requieren auth)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

// Rutas protegidas (requieren auth)
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CookieConsentProvider>
          <Routes>
            {/* Rutas públicas */}
            <Route element={<PublicRoute><Login /></PublicRoute>}>
              <Route path="/login" element={<Login />} />
            </Route>
            <Route element={<PublicRoute><Register /></PublicRoute>}>
              <Route path="/register" element={<Register />} />
            </Route>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
            
            {/* Páginas legales (públicas, sin auth) */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/cookie-policy" element={<CookiePolicy />} />
            
            {/* Rutas protegidas */}
            <Route element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/chat" element={<ChatInterface />} />
              <Route path="/settings/*" element={<Settings />} />
              {/* Placeholders para otras páginas */}
              <Route path="/events" element={<div className="page-placeholder"><h2>Eventos</h2><p>Próximamente</p></div>} />
              <Route path="/tasks" element={<div className="page-placeholder"><h2>Tareas</h2><p>Próximamente</p></div>} />
              <Route path="/panels" element={<div className="page-placeholder"><h2>Paneles</h2><p>Próximamente</p></div>} />
              <Route path="/backups" element={<div className="page-placeholder"><h2>Respaldos</h2><p>Próximamente</p></div>} />
            </Route>
            
            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </CookieConsentProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;