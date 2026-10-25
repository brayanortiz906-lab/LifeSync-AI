import { useState } from 'react';
import { Shield, Lock, Database, Eye, Trash2, Mail, Globe } from 'lucide-react';
import { Panel, Boton } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { deleteMyData } from '@/lib/api';

export function PrivacyPolicy() {
  const navigate = useNavigate();
  const { signOut } = useAuthStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!confirm('¿Estás seguro? Esta acción es irreversible y eliminará todos tus datos permanentemente.')) return;
    setDeleting(true);
    try {
      await deleteMyData();
      await signOut();
      navigate('/login');
    } catch (e: any) {
      alert(e.message || 'Error al eliminar la cuenta');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const sections = [
    {
      icon: Shield,
      title: 'Datos que recopilamos',
      items: [
        'Email y nombre: para crear y gestionar tu cuenta.',
        'Eventos, tareas, notas y gastos: tu contenido personal.',
        'Claves API BYOK (encriptadas): solo tú las ves, nosotros no.',
        'Preferencias de UI: tema, idioma, zona horaria.',
      ],
    },
    {
      icon: Lock,
      title: 'Seguridad y encriptación',
      items: [
        'Tus claves API se guardan cifradas con Fernet (AES-256) en Supabase.',
        'Row Level Security (RLS): nadie accede a datos ajenos, ni siquiera admins.',
        'Comunicación HTTPS/TLS 1.3 en todo momento.',
        'Tokens JWT de corta vida con refresh automático seguro.',
      ],
    },
    {
      icon: Database,
      title: 'Almacenamiento y respaldos',
      items: [
        'Base de datos PostgreSQL en Supabase (UE/EE. UU. según región).',
        'Backups encriptados en bucket privado `backups` (RLS por usuario).',
        'URLs firmadas de 1 hora para descarga/restauración.',
        'Opción de exportar todo tu contenido en JSON cuando quieras.',
      ],
    },
    {
      icon: Eye,
      title: 'Tus derechos (GDPR / CCPA)',
      items: [
        'Acceso: ve todos tus datos en "Mis datos" (ajustes).',
        'Rectificación: edita tu perfil en cualquier momento.',
        'Supresión: botón "Eliminar mi cuenta" abajo (irreversible).',
        'Portabilidad: exporta JSON completo desde Ajustes → Seguridad.',
        'Oposición: revoca consentimientos en Ajustes → Notificaciones.',
      ],
    },
    {
      icon: Globe,
      title: 'Servicios de terceros',
      items: [
        'Google OAuth: solo email/name para login (scope `openid email profile`).',
        'Google Calendar: lectura/escritura solo si tú lo activas.',
        'Google Drive: backups solo si das permiso explícito.',
        'Gemini API: tu clave, tus peticiones, cero logging nuestro.',
        'Servicios IA gratis (Groq, OpenRouter, etc.): peticiones directas desde tu navegador.',
      ],
    },
    {
      icon: Mail,
      title: 'Comunicaciones',
      items: [
        'Resumen diario opcional (tú eliges hora).',
        'Avisos de seguridad (login nuevo, cambios de contraseña).',
        'Nunca spam, nunca vendemos tu email.',
        'Baja en un clic desde cualquier email o en Ajustes.',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-indigo-500/10 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 mb-6 text-sm font-medium text-indigo-300">
            <Shield className="h-4 w-4" /> Actualizado: 25 oct 2026 · v2.2.0
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
            Política de Privacidad
          </h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Tu privacidad no es una opción, es la base. Aquí explicamos, sin letra pequeña, qué datos guardamos, por qué y cómo controlas cada bit.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-8">
        {sections.map((s, i) => (
          <Panel key={i} icono={<s.icon className="h-5 w-5 text-indigo-400" />} titulo={s.title} className="transition-all duration-300 hover:border-white/15 hover:shadow-xl hover:shadow-indigo-500/5">
            <ul className="space-y-3">
              {s.items.map((item, j) => (
                <li key={j} className="flex gap-3 text-slate-300 leading-relaxed">
                  <span className="mt-1.5 flex-shrink-0 text-indigo-400">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}

        {/* Danger Zone */}
        <Panel
          icono={<Trash2 className="h-5 w-5 text-rose-400" />}
          titulo="Zona de peligro"
          sub="Acciones irreversibles. Úsalas solo si estás seguro."
          className="border-rose-500/20 bg-rose-500/5"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <h4 className="font-semibold text-rose-300 mb-2">Eliminar mi cuenta y todos mis datos</h4>
              <p className="text-sm text-slate-400 mb-3">
                Borra permanentemente: eventos, tareas, notas, gastos, paneles, chats, claves API, preferencias y backups. No se puede deshacer.
              </p>
              <Boton
                variante="peligro"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                className="w-full sm:w-auto"
              >
                {deleting ? 'Eliminando...' : 'Eliminar mi cuenta'}
              </Boton>
            </div>

            <Boton
              variante="fantasma"
              onClick={() => navigate('/settings?tab=security')}
              className="w-full sm:w-auto"
            >
              ← Volver a Ajustes de Seguridad
            </Boton>
          </div>
        </Panel>

        <div className="text-center text-sm text-slate-500 border-t border-white/5 pt-8">
          <p>¿Dudas? Escríbenos a <a href="mailto:privacy@lifeagente.ai" className="text-indigo-400 hover:underline">privacy@lifeagente.ai</a></p>
          <p className="mt-2">LifeAgente AI · Hecho con privacidad por diseño · <a href="/terms" className="text-indigo-400 hover:underline">Términos</a> · <a href="/cookie-policy" className="text-indigo-400 hover:underline">Cookies</a></p>
        </div>
      </main>
    </div>
  );
}

