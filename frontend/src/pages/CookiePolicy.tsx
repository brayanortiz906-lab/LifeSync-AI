import { useState } from 'react';
import { Cookie, Eye, Database, Shield, Globe, Settings, Trash2, CheckCircle } from 'lucide-react';
import { Panel, Boton, Chip } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { useCookieConsent, type CookieConsent } from '@/hooks/useCookieConsent';

export function CookiePolicy() {
  const navigate = useNavigate();
  const { consent, acceptAll, rejectAll, savePreferences } = useCookieConsent();
  const consentMap = consent as Record<string, boolean> | null;

  const cookieCategories = [
    {
      id: 'essential',
      icon: Shield,
      title: 'Esenciales (Siempre activas)',
      description: 'Necesarias para que la app funcione: autenticación, seguridad, preferencias de sesión.',
      cookies: ['supabase-auth-token', 'session-id', 'csrf-token'],
      required: true,
    },
    {
      id: 'preferences',
      icon: Settings,
      title: 'Preferencias',
      description: 'Recuerdan tus ajustes: tema (claro/oscuro), idioma, zona horaria, panel abierto.',
      cookies: ['theme', 'locale', 'timezone', 'panel-id'],
      required: false,
    },
    {
      id: 'analytics',
      icon: Database,
      title: 'Analíticas (Anónimas)',
      description: 'Nos ayudan a entender uso agregado (páginas visitadas, errores, rendimiento). Sin datos personales.',
      cookies: ['plausible_session', 'umami_session'],
      required: false,
    },
    {
      id: 'marketing',
      icon: Globe,
      title: 'Marketing / Terceros',
      description: 'Usadas por proveedores externos (Google OAuth, calendarios) solo si tú las activas.',
      cookies: ['g_state', 'google_calendar_token'],
      required: false,
    },
  ];

  const thirdPartyCookies = [
    { name: 'Google Identity Services', purpose: 'Login con Google (OAuth)', domain: 'accounts.google.com', required: 'Solo si usas "Entrar con Google"' },
    { name: 'Google Calendar API', purpose: 'Sincronizar tu calendario', domain: 'calendar.google.com', required: 'Solo si activas Calendar Sync' },
    { name: 'Supabase Realtime', purpose: 'Sincronización en vivo', domain: '*.supabase.co', required: 'Siempre (backend)' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-amber-500/10 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 mb-6 text-sm font-medium text-amber-300">
            <Cookie className="h-4 w-4" /> Actualizado: 25 oct 2026 · v2.2.0
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-amber-300 bg-clip-text text-transparent">
            Política de Cookies
          </h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Qué guardamos, por qué y cómo controlarlo. Tú mandas.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-8">
        {/* Current Consent Status */}
        <Panel icono={<Cookie className="h-5 w-5 text-amber-400" />} titulo="Tu estado actual de consentimiento" sub={consent ? 'Gestiona tus preferencias abajo' : 'Aún no has elegido. El banner aparecerá en tu próxima visita.'}>
          <div className="flex flex-wrap gap-2">
            {cookieCategories.map(c => (
              <Chip
                key={c.id}
                className={`capitalize ${consentMap?.[c.id] ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-slate-400 border-white/10'}`}
              >
                {c.title.split(' ')[0]}: {consentMap?.[c.id] ? '✓' : '✗'}
              </Chip>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Boton onClick={acceptAll} variante="primario">Aceptar todas</Boton>
            <Boton onClick={rejectAll} variante="secundario">Rechazar no esenciales</Boton>
          </div>
        </Panel>

        {/* Cookie Categories */}
        <Panel icono={<Eye className="h-5 w-5 text-amber-400" />} titulo="Categorías de cookies que usamos">
          <div className="space-y-4">
            {cookieCategories.map((cat) => (
              <details key={cat.id} className="group rounded-xl border border-white/10 bg-white/5 p-4 open:bg-white/8 transition-all">
                <summary className="flex items-start gap-3 cursor-pointer list-none">
                  <cat.icon className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-100">{cat.title}</h4>
                      {cat.required && <Chip className="text-xs bg-rose-500/20 text-rose-300 border-rose-500/30">Obligatoria</Chip>}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{cat.description}</p>
                  </div>
                  <span className="ml-auto text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {cat.cookies.map((cookie, i) => (
                    <div key={i} className="text-xs font-mono bg-slate-900/50 rounded px-2 py-1 text-slate-300">{cookie}</div>
                  ))}
                </div>
                {!cat.required && (
                  <div className="mt-3 flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentMap?.[cat.id] ?? false}
                        onChange={(e) => savePreferences({ [cat.id]: e.target.checked })}
                        className="rounded border-white/20 text-indigo-500 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-300">Activar esta categoría</span>
                    </label>
                  </div>
                )}
              </details>
            ))}
          </div>
        </Panel>

        {/* Third Party */}
        <Panel icono={<Globe className="h-5 w-5 text-amber-400" />} titulo="Cookies de terceros (solo con tu consentimiento explícito)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/10 text-slate-500 uppercase tracking-wider text-[11px]">
                  <th className="pb-3 pr-4">Proveedor</th>
                  <th className="pb-3 pr-4">Finalidad</th>
                  <th className="pb-3 pr-4">Dominio</th>
                  <th className="pb-3">Cuándo se usa</th>
                </tr>
              </thead>
              <tbody>
                {thirdPartyCookies.map((t, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-3 pr-4 font-medium text-slate-200">{t.name}</td>
                    <td className="py-3 pr-4 text-slate-400">{t.purpose}</td>
                    <td className="py-3 pr-4 font-mono text-slate-500">{t.domain}</td>
                    <td className="py-3"><Chip className="text-xs bg-indigo-500/20 text-indigo-300 border-indigo-500/30">{t.required}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* How to manage */}
        <Panel icono={<Settings className="h-5 w-5 text-amber-400" />} titulo="Cómo gestionar o borrar cookies">
          <div className="space-y-4 text-slate-300 leading-relaxed">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-semibold text-amber-300 mb-2 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Desde el navegador</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Chrome: <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+Shift+Del</kbd></li>
                  <li>Firefox: <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+Shift+Del</kbd></li>
                  <li>Safari: Preferencias → Privacidad → Gestionar datos</li>
                  <li>Edge: <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+Shift+Del</kbd></li>
                </ul>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-semibold text-amber-300 mb-2 flex items-center gap-2"><Shield className="h-4 w-4" /> Desde la app</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Botón "Aceptar todas" / "Rechazar no esenciales" arriba</li>
                  <li>Checkboxes por categoría (arriba)</li>
                  <li>Ajustes → Notificaciones → Consentimientos</li>
                  <li>Eliminar cuenta borra TODO (incluye cookies)</li>
                </ul>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Nota: Si bloqueas cookies esenciales, la app no funcionará (no podrás loguearte, guardar preferencias, etc.).
            </p>
          </div>
        </Panel>

        <div className="text-center">
          <Boton
            variante="secundario"
            onClick={() => navigate('/')}
            className="w-full sm:w-auto"
          >
            ← Volver al inicio
          </Boton>
        </div>

        <div className="text-center text-sm text-slate-500 border-t border-white/5 pt-8">
          <p>LifeAgente AI · <a href="/privacy-policy" className="text-amber-400 hover:underline">Privacidad</a> · <a href="/terms" className="text-amber-400 hover:underline">Términos</a> · <a href="/refund-policy" className="text-amber-400 hover:underline">Reembolsos</a></p>
        </div>
      </main>
    </div>
  );
}