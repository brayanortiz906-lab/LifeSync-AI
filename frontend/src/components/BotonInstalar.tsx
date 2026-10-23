import { useState, useEffect } from 'react';
import { Download, Monitor, Smartphone, CheckCircle, X, Info } from 'lucide-react';
import './BotonInstalar.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function BotonInstalar() {
  const [mostrar, setMostrar] = useState(false);
  const [instalable, setInstalable] = useState(false);
  const [instalando, setInstalando] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [yaInstalada, setYaInstalada] = useState(false);

  useEffect(() => {
    // Detectar si ya está instalada (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone === true;
    
    if (isStandalone) {
      setYaInstalada(true);
      return;
    }

    // Escuchar evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstalable(true);
      setMostrar(true);
    };

    const handleAppInstalled = () => {
      setYaInstalada(true);
      setMostrar(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // También mostrar en mobile si no está en standalone
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (isMobile && !isStandalone) {
      setMostrar(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const instalar = async () => {
    if (!deferredPrompt) return;
    
    setInstalando(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setYaInstalada(true);
        setMostrar(false);
      }
      setDeferredPrompt(null);
    } catch (e) {
      console.error('Error instalando:', e);
    } finally {
      setInstalando(false);
    }
  };

  const cerrar = () => {
    setMostrar(false);
    // No volver a mostrar por un tiempo
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // No mostrar si ya se.dismissed recientemente
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) {
      setMostrar(false);
    }
  }, []);

  if (yaInstalada || !mostrar) return null;

  return (
    <div className="boton-instalar-banner">
      <div className="banner-content">
        <div className="banner-icon">
          <Monitor size={24} />
        </div>
        <div className="banner-text">
          <strong>Instala LifeAgente</strong>
          <span>Funciona como app nativa: offline, notificaciones, acceso rápido</span>
        </div>
      </div>
      <div className="banner-actions">
        <button className="btn-secondary" onClick={cerrar}>
          <X size={16} /> Ahora no
        </button>
        <button 
          className="btn-primary" 
          onClick={instalar} 
          disabled={instalando || !deferredPrompt}
        >
          {instalando ? (
            <>
              <div className="spinner-mini" />
              Instalando...
            </>
          ) : (
            <>
              <Download size={16} />
              {deferredPrompt ? 'Instalar' : 'Abrir en navegador'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}