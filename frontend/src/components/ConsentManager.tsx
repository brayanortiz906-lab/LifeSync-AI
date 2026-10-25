import { useState, useEffect, useCallback } from 'react';
import { Check, X, Loader2, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Panel, Boton, Chip } from '@/components/ui';

export interface FormConsent {
  id: string;
  title: string;
  description: string;
  required: boolean;
  category: 'essential' | 'functional' | 'analytics' | 'marketing';
  version: number;
  granted?: boolean;
  pending?: boolean;
}

const CONSENT_STORAGE_KEY = 'form_consents_v1';

const DEFAULT_CONSENTS: FormConsent[] = [
  {
    id: 'terms',
    title: 'Términos y Condiciones',
    description: 'Acepto los <a href="/terms" className="underline hover:text-indigo-300">Términos de Servicio</a> de LifeAgente AI.',
    required: true,
    category: 'essential',
    version: 1,
  },
  {
    id: 'privacy',
    title: 'Política de Privacidad',
    description: 'He leído y acepto la <a href="/privacy-policy" className="underline hover:text-indigo-300">Política de Privacidad</a> (GDPR/CCPA).',
    required: true,
    category: 'essential',
    version: 1,
  },
  {
    id: 'ai-processing',
    title: 'Procesamiento con IA (BYOK)',
    description: 'Entiendo que mis mensajes se envían a proveedores de IA (Gemini, Groq, OpenRouter, etc.) usando mis claves API. Los proveedores tienen sus propias políticas de privacidad.',
    required: true,
    category: 'functional',
    version: 1,
  },
  {
    id: 'calendar-sync',
    title: 'Sincronización con Google Calendar',
    description: 'Autorizo acceso a mi Google Calendar para leer/escribir eventos. Tokens encriptados con Fernet. Revocable en Ajustes.',
    required: false,
    category: 'functional',
    version: 1,
  },
  {
    id: 'drive-backups',
    title: 'Backups en Google Drive',
    description: 'Autorizo guardar backups encriptados en mi Google Drive. Los archivos se cifran en el cliente antes de subir. Revocable en Ajustes.',
    required: false,
    category: 'functional',
    version: 1,
  },
  {
    id: 'analytics',
    title: 'Analíticas anónimas de uso',
    description: 'Permito métricas agregadas (páginas, errores, rendimiento) para mejorar la app. Sin datos personales. Puedo revocar en Ajustes → Consentimientos.',
    required: false,
    category: 'analytics',
    version: 1,
  },
  {
    id: 'email-notifications',
    title: 'Notificaciones por email',
    description: 'Resumen diario opcional + avisos de seguridad. Nunca spam. Baja en un clic desde cualquier email o en Ajustes.',
    required: false,
    category: 'marketing',
    version: 1,
  },
];

export function useFormConsents() {
  const [consents, setConsents] = useState<FormConsent[]>(() => {
    const saved = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return DEFAULT_CONSENTS.map((def) => {
          const savedConsent = parsed[def.id];
          if (savedConsent && savedConsent.version === def.version) {
            return { ...def, granted: savedConsent.granted };
          }
          return def;
        });
      } catch {
        return DEFAULT_CONSENTS;
      }
    }
    return DEFAULT_CONSENTS;
  });

  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(
      Object.fromEntries(consents.map(c => [c.id, { granted: c.granted, version: c.version, timestamp: Date.now() }]))
    ));
  }, [consents]);

  const toggleConsent = useCallback((id: string, value?: boolean) => {
    setConsents(prev => prev.map(c => {
      if (c.id === id) {
        const newValue = value ?? !c.granted;
        if (c.required && !newValue) return c; // Can't uncheck required
        return { ...c, granted: newValue };
      }
      return c;
    }));
    setDirty(true);
  }, []);

  const grantAll = useCallback(() => {
    setConsents(prev => prev.map(c => ({ ...c, granted: true })));
    setDirty(true);
  }, []);

  const revokeOptional = useCallback(() => {
    setConsents(prev => prev.map(c => c.required ? c : { ...c, granted: false }));
    setDirty(true);
  }, []);

  const resetToDefaults = useCallback(() => {
    setConsents(DEFAULT_CONSENTS);
    setDirty(true);
  }, []);

  const allRequiredGranted = consents.filter(c => c.required).every(c => c.granted);
  const optionalConsents = consents.filter(c => !c.required);
  const optionalGranted = optionalConsents.filter(c => c.granted).length;

  return {
    consents,
    dirty,
    allRequiredGranted,
    optionalGranted,
    optionalTotal: optionalConsents.length,
    toggleConsent,
    grantAll,
    revokeOptional,
    resetToDefaults,
  };
}

interface ConsentManagerProps {
  /** Filter by category */
  category?: FormConsent['category'];
  /** Show only required */
  requiredOnly?: boolean;
  /** Compact mode for forms */
  compact?: boolean;
  /** Custom title */
  title?: string;
  /** Custom subtitle */
  subtitle?: string;
  /** Callback when all required are granted */
  onAllRequiredGranted?: () => void;
  /** Callback when any consent changes */
  onChange?: (consents: FormConsent[]) => void;
}

export function ConsentManager({
  category,
  requiredOnly,
  compact = false,
  title,
  subtitle,
  onAllRequiredGranted,
  onChange,
}: ConsentManagerProps) {
  const {
    consents,
    dirty,
    allRequiredGranted,
    optionalGranted,
    optionalTotal,
    toggleConsent,
    grantAll,
    revokeOptional,
    resetToDefaults,
  } = useFormConsents();

  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    if (allRequiredGranted && onAllRequiredGranted) {
      onAllRequiredGranted();
    }
    if (onChange) onChange(consents);
  }, [consents, allRequiredGranted, onAllRequiredGranted, onChange]);

  const filteredConsents = consents.filter(c => {
    if (category && c.category !== category) return false;
    if (requiredOnly && !c.required) return false;
    return true;
  });

  const categoryInfo = {
    essential: { icon: Info, label: 'Esencial', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    functional: { icon: Info, label: 'Funcional', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
    analytics: { icon: Info, label: 'Analíticas', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    marketing: { icon: Info, label: 'Marketing', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  } as const;

  if (compact && filteredConsents.length === 0) return null;

  return (
    <Panel
      titulo={title || 'Consentimientos'}
      sub={subtitle || (compact ? undefined : `${optionalGranted}/${optionalTotal} opcionales aceptados`)}
      icono={!compact ? <Info className="h-5 w-5 text-indigo-400" /> : undefined}
      className={compact ? 'border-white/10' : ''}
    >
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Boton
            variante={dirty ? 'primario' : 'fantasma'}
            onClick={grantAll}
            disabled={consents.every(c => c.granted)}
          >
            <Check className="h-3 w-3 mr-1.5" /> Aceptar todos
          </Boton>
          <Boton variante="secundario" onClick={revokeOptional} disabled={optionalGranted === 0}>
            <X className="h-3 w-3 mr-1.5" /> Rechazar opcionales
          </Boton>
          <Boton variante="fantasma" onClick={resetToDefaults} disabled={!dirty}>
            Restablecer
          </Boton>
          <Boton
            variante="fantasma"
            onClick={() => setExpanded(!expanded)}
            className="ml-auto"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Boton>
        </div>
      )}

      {expanded && (
        <div className="space-y-3" role="group" aria-label="Lista de consentimientos">
          {filteredConsents.map((consent) => (
            <ConsentItem
              key={consent.id}
              consent={consent}
              onToggle={toggleConsent}
              compact={compact}
            />
          ))}
        </div>
      )}

      {!expanded && !compact && (
        <div className="text-center text-sm text-slate-500 py-2">
          {allRequiredGranted ? (
            <span className="flex items-center justify-center gap-1 text-emerald-400">
              <Check className="h-4 w-4" /> Requisitos cumplidos
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1 text-amber-400">
              <AlertCircle className="h-4 w-4" /> Falta aceptar obligatorios
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}

interface ConsentItemProps {
  consent: FormConsent;
  onToggle: (id: string, value?: boolean) => void;
  compact: boolean;
}

function ConsentItem({ consent, onToggle, compact }: ConsentItemProps) {
  const catInfo = {
    essential: { label: 'Esencial', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    functional: { label: 'Funcional', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
    analytics: { label: 'Analíticas', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    marketing: { label: 'Marketing', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  }[consent.category];

  const isChecked = consent.granted ?? false;
  const isRequired = consent.required;

  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer ${
        isChecked
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'bg-white/5 border border-white/10 hover:border-white/20'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (!isRequired) onToggle(consent.id);
          }}
          disabled={isRequired}
          className={`relative w-5 h-5 rounded border-2 transition-all flex-shrink-0 ${
            isChecked
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-white/20 hover:border-white/40'
          } ${isRequired ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-checked={isChecked}
          aria-label={isChecked ? `Revocar ${consent.title}` : `Aceptar ${consent.title}`}
        >
          {isChecked && <Check className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 text-white" />}
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-100">{consent.title}</span>
          {isRequired && (
            <Chip className="text-[10px] bg-rose-500/20 text-rose-300 border-rose-500/30">Obligatorio</Chip>
          )}
          <Chip className={catInfo.color}>{catInfo.label}</Chip>
        </div>
        <div className="mt-1 text-sm text-slate-400" dangerouslySetInnerHTML={{ __html: consent.description }} />
      </div>

      {consent.pending && <Loader2 className="h-4 w-4 text-slate-500 animate-spin" />}
    </label>
  );
}

// Hook for checking consent in components
export function useConsent(id: string) {
  const { consents } = useFormConsents();
  return consents.find(c => c.id === id)?.granted ?? false;
}

// Helper for conditional rendering based on consent
export function ConsentGate({ consentId, children, fallback = null }: {
  consentId: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const granted = useConsent(consentId);
  return granted ? <>{children}</> : <>{fallback}</>;
}