import { Cookie, X, Check, ChevronDown, ChevronUp, Shield, Settings, BarChart2, Megaphone } from 'lucide-react';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { Panel, Boton, Chip } from '@/components/ui';
import { useState } from 'react';

export function CookieConsentBanner() {
  const { consent, shouldShowBanner, acceptAll, rejectAll, savePreferences, hasInteracted } = useCookieConsent();
  const [expanded, setExpanded] = useState(false);

  if (!shouldShowBanner) return null;

  const categories = [
    {
      id: 'essential',
      icon: Shield,
      label: 'Esenciales',
      desc: 'Autenticación, seguridad, sesión. Siempre activas.',
      enabled: true,
      required: true,
    },
    {
      id: 'preferences',
      icon: Settings,
      label: 'Preferencias',
      desc: 'Tema, idioma, zona horaria, paneles abiertos.',
      enabled: consent?.preferences ?? false,
      required: false,
    },
    {
      id: 'analytics',
      icon: BarChart2,
      label: 'Analíticas',
      desc: 'Uso anónimo para mejorar la app. Sin datos personales.',
      enabled: consent?.analytics ?? false,
      required: false,
    },
    {
      id: 'marketing',
      icon: Megaphone,
      label: 'Marketing / Terceros',
      desc: 'Google OAuth, Calendar solo si tú los activas.',
      enabled: consent?.marketing ?? false,
      required: false,
    },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="max-w-4xl mx-auto px-4 pb-4 md:pb-6">
        {/* Compact Banner */}
        <Panel
          className="bg-slate-900/95 backdrop-blur-xl border-white/10 shadow-2xl shadow-black/50"
          cuerpoClass="p-0"
        >
          <div className="p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <Cookie className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100">Valoramos tu privacidad</h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Usamos cookies para que la app funcione, recordar tus preferencias y entender uso anónimo.
                    <span className="font-medium text-indigo-300"> Tú decides.</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:ml-4">
                <Boton
                  variante="primario"
                  onClick={acceptAll}
                  className="whitespace-nowrap"
                >
                  <Check className="h-3 w-3 mr-1.5" /> Aceptar todas
                </Boton>
                <Boton
                  variante="secundario"
                  onClick={rejectAll}
                  className="whitespace-nowrap"
                >
                  <X className="h-3 w-3 mr-1.5" /> Solo esenciales
                </Boton>
                <Boton
                  variante="fantasma"
                  onClick={() => setExpanded(!expanded)}
                  className="whitespace-nowrap"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1.5" /> Ocultar opciones
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1.5" /> Personalizar
                    </>
                  )}
                </Boton>
              </div>
            </div>

            {/* Expanded Preferences */}
            {expanded && (
              <div className="mt-4 pt-4 border-t border-white/10 animate-fade-in">
                <p className="text-xs text-slate-500 mb-3">
                  Las esenciales no se pueden desactivar. El resto son opcionales.
                </p>
                <div className="space-y-3" role="group" aria-label="Categorías de cookies">
                  {categories.map((cat) => (
                    <label
                      key={cat.id}
                      className={`flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                        cat.enabled
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-white/5 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        <cat.icon className={`h-5 w-5 ${cat.enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-100">{cat.label}</span>
                          {cat.required && (
                            <Chip className="text-[10px] bg-rose-500/20 text-rose-300 border-rose-500/30">
                              Requerida
                            </Chip>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{cat.desc}</p>
                      </div>
                      {cat.required ? (
                        <div className="flex-shrink-0">
                          <Chip className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                            ✓ Siempre
                          </Chip>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            savePreferences({ [cat.id]: !cat.enabled });
                          }}
                          className={`flex-shrink-0 relative w-10 h-6 rounded-full transition-colors ${
                            cat.enabled
                              ? 'bg-emerald-500'
                              : 'bg-white/10 hover:bg-white/20'
                          }`}
                          role="switch"
                          aria-checked={cat.enabled}
                          aria-label={cat.enabled ? `Desactivar ${cat.label}` : `Activar ${cat.label}`}
                        >
                          <span
                            className={`absolute top-0.5 transition-transform ${
                              cat.enabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          >
                            <span className="block w-5 h-5 rounded-full bg-white shadow-lg" />
                          </span>
                        </button>
                      )}
                    </label>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-white/10">
                  <Boton
                    variante="primario"
                    onClick={acceptAll}
                    className="w-full sm:w-auto"
                  >
                    <Check className="h-3 w-3 mr-1.5" /> Guardar preferencias
                  </Boton>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Small notice */}
        <p className="text-center text-[11px] text-slate-500 mt-3 max-w-4xl mx-auto px-4">
          Puedes cambiar estoいつでも en <a href="/cookie-policy" className="text-indigo-400 hover:underline">Política de Cookies</a> o en Ajustes → Consentimientos.
        </p>
      </div>
    </div>
  );
}

// Also export a provider wrapper for easy integration
export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CookieConsentBanner />
    </>
  );
}