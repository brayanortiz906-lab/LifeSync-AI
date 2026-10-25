import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shield, UserCheck, Mail, Lock, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Panel, Boton } from '@/components/ui';
import { sendParentalVerification, verifyParentalCode } from '@/lib/api';

interface ParentalConsentProps {
  /** User's age (if known) */
  age?: number;
  /** Current user ID (required for API calls) */
  userId?: string;
  /** Callback when consent is granted */
  onConsentGranted: () => void;
  /** Callback when consent is denied */
  onConsentDenied?: () => void;
  /** Whether to show the modal */
  isOpen?: boolean;
  /** Callback when modal closes */
  onClose?: () => void;
}

const PARENTAL_CONSENT_KEY = 'parental_consent_v1';
const CONSENT_VERSION = 1;

export function ParentalConsent({
  age,
  userId,
  onConsentGranted,
  onConsentDenied,
  isOpen: controlledOpen,
  onClose,
}: ParentalConsentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'age' | 'consent' | 'verify' | 'complete'>('age');
  const [parentEmail, setParentEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  // Check if already has valid consent
  useEffect(() => {
    const saved = localStorage.getItem(PARENTAL_CONSENT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.version === CONSENT_VERSION && parsed.granted && parsed.verified) {
          setVerified(true);
          onConsentGranted();
          return;
        }
      } catch {
        // Invalid data
      }
    }

    // Auto-open if age < 13 or controlled
    if (controlledOpen !== undefined) {
      setIsOpen(controlledOpen);
    } else if (age !== undefined && age < 13) {
      setIsOpen(true);
    }
  }, [age, controlledOpen, onConsentGranted]);

  const handleAgeSubmit = (userAge: number) => {
    if (userAge >= 13) {
      // No parental consent needed
      localStorage.setItem(PARENTAL_CONSENT_KEY, JSON.stringify({
        version: CONSENT_VERSION,
        granted: true,
        verified: true,
        age: userAge,
        timestamp: Date.now(),
      }));
      setVerified(true);
      onConsentGranted();
      if (!controlledOpen) setIsOpen(false);
    } else {
      setStep('consent');
    }
  };

  const handleConsentSubmit = async () => {
    if (!parentEmail || !parentEmail.includes('@')) {
      setError('Introduce un email válido de tu padre/madre/tutor');
      return;
    }
    if (!userId) {
      setError('Error: ID de usuario no disponible');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Send verification email via backend API
      await sendParentalVerification(parentEmail, userId);
      
      // Show verification step
      setStep('verify');
    } catch (e: any) {
      setError(e.message || 'Error enviando verificación. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifySubmit = async () => {
    if (verificationCode.length !== 6) {
      setError('El código tiene 6 dígitos');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Verify code via backend API
      await verifyParentalCode(parentEmail, verificationCode);
      
      // Success!
      localStorage.setItem(PARENTAL_CONSENT_KEY, JSON.stringify({
        version: CONSENT_VERSION,
        granted: true,
        verified: true,
        parentEmail,
        age,
        timestamp: Date.now(),
      }));
      
      setVerified(true);
      setStep('complete');
      onConsentGranted();
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        if (!controlledOpen) setIsOpen(false);
        if (onClose) onClose();
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Código incorrecto o expirado');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeny = () => {
    localStorage.setItem(PARENTAL_CONSENT_KEY, JSON.stringify({
      version: CONSENT_VERSION,
      granted: false,
      verified: false,
      timestamp: Date.now(),
    }));
    onConsentDenied?.();
    if (!controlledOpen) setIsOpen(false);
    if (onClose) onClose();
  };

  const handleResendCode = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Simulate resend
    } catch {
      setError('Error reenviando código');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen && !controlledOpen) return null;
  if (verified && !controlledOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="parental-consent-title">
      <div className="w-full max-w-md">
        <Panel className="bg-slate-900/95 backdrop-blur-xl border-white/10 shadow-2xl" cuerpoClass="p-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-white/10">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h2 id="parental-consent-title" className="text-xl font-bold text-slate-100">Consentimiento Parental Requerido</h2>
                <p className="text-sm text-slate-400">COPPA: Usuarios menores de 13 años</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {step === 'age' && (
              <AgeStep onSubmit={handleAgeSubmit} />
            )}

            {step === 'consent' && (
              <ConsentStep
                parentEmail={parentEmail}
                setParentEmail={setParentEmail}
                consentGiven={consentGiven}
                setConsentGiven={setConsentGiven}
                onSubmit={handleConsentSubmit}
                submitting={submitting}
                error={error}
              />
            )}

            {step === 'verify' && (
              <VerifyStep
                parentEmail={parentEmail}
                verificationCode={verificationCode}
                setVerificationCode={setVerificationCode}
                onSubmit={handleVerifySubmit}
                onResend={handleResendCode}
                submitting={submitting}
                error={error}
              />
            )}

            {step === 'complete' && (
              <CompleteStep />
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Protegido por COPPA (Children's Online Privacy Protection Act)
            </p>
            {step !== 'complete' && step !== 'age' && (
              <Boton
                variante="fantasma"
                onClick={() => {
                  if (step === 'consent') setStep('age');
                  else if (step === 'verify') setStep('consent');
                }}
              >
                ← Volver
              </Boton>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;

  return createPortal(modalContent, document.body);
}

function AgeStep({ onSubmit }: { onSubmit: (age: number) => void }) {
  const [age, setAge] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const userAge = parseInt(age, 10);
    if (isNaN(userAge) || userAge < 1 || userAge > 120) {
      setError('Introduce una edad válida');
      return;
    }
    onSubmit(userAge);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-slate-300 mb-4">
          Para cumplir con la ley COPPA, necesitamos verificar tu edad.
          Si tienes menos de 13 años, requerimos consentimiento de un padre, madre o tutor legal.
        </p>
        <label className="block text-sm font-medium text-slate-300 mb-2">¿Cuántos años tienes?</label>
        <input
          type="number"
          value={age}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAge(e.target.value); setError(''); }}
          placeholder="Ej: 12"
          min={1}
          max={120}
          className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${error ? 'border-rose-500/50' : ''}`}
          autoFocus
        />
        {error && <p className="text-sm text-rose-400 mt-1">{error}</p>}
      </div>
      <Boton type="submit" className="w-full">
        Continuar
      </Boton>
    </form>
  );
}

function ConsentStep({
  parentEmail,
  setParentEmail,
  consentGiven,
  setConsentGiven,
  onSubmit,
  submitting,
  error,
}: {
  parentEmail: string;
  setParentEmail: (v: string) => void;
  consentGiven: boolean;
  setConsentGiven: (v: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-slate-300">
            <p className="font-semibold text-rose-300 mb-1">Menor de 13 años detectado</p>
            <p>La ley COPPA requiere que un padre, madre o tutor legal dé su consentimiento verificado antes de que podamos recopilar cualquier información personal.</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={e => setConsentGiven(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-white/20 text-indigo-500 focus:ring-indigo-500"
          />
          <div className="text-sm text-slate-300">
            <p className="font-medium text-slate-100">Autorizo a LifeAgente AI a recopilar y procesar los datos de mi hijo/a</p>
            <p className="mt-1">Entiendo que esto incluye: email, nombre, eventos, tareas, notas, gastos, preferencias y claves API encriptadas. He leído la <a href="/privacy-policy" className="underline hover:text-indigo-300">Política de Privacidad</a>.</p>
          </div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Email del padre/madre/tutor *</label>
        <input
          type="email"
          value={parentEmail}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParentEmail(e.target.value)}
          placeholder="padre@ejemplo.com"
          className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${error ? 'border-rose-500/50' : ''}`}
          disabled={!consentGiven}
        />
      </div>

      {error && <p className="text-sm text-rose-400 flex items-center gap-1"><XCircle className="h-4 w-4" />{error}</p>}

      <Boton
        onClick={onSubmit}
        disabled={!consentGiven || !parentEmail || submitting}
        className="w-full"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Enviando verificación...
          </>
        ) : (
          'Enviar código de verificación →'
        )}
      </Boton>

      <p className="text-center text-xs text-slate-500">
        Enviaremos un código de 6 dígitos a <strong>{parentEmail || 'ese email'}</strong>
      </p>
    </div>
  );
}

function VerifyStep({
  parentEmail,
  verificationCode,
  setVerificationCode,
  onSubmit,
  onResend,
  submitting,
  error,
}: {
  parentEmail: string;
  verificationCode: string;
  setVerificationCode: (v: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4 text-center">
      <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
        <Mail className="h-8 w-8 text-indigo-400 mx-auto mb-2" />
        <p className="font-medium text-slate-100">Código enviado a</p>
        <p className="text-indigo-300 font-mono">{parentEmail}</p>
      </div>

      <p className="text-slate-400">Introduce el código de 6 dígitos que recibiste por email</p>

      <div className="flex justify-center gap-2">
        {[...Array(6)].map((_, i) => (
          <input
            key={i}
            type="text"
            maxLength={1}
            value={verificationCode[i] || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const val = e.target.value.toUpperCase();
              if (/^[A-Z0-9]*$/.test(val)) {
                const newCode = verificationCode.substring(0, i) + val + verificationCode.substring(i + 1);
                setVerificationCode(newCode);
                // Auto-focus next
                if (val && i < 5) {
                  const nextInput = (e.currentTarget.parentNode as HTMLElement)?.children[i + 1] as HTMLInputElement | null;
                  nextInput?.focus();
                }
              }
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Backspace' && !verificationCode[i] && i > 0) {
                const prevInput = (e.currentTarget.parentNode as HTMLElement)?.children[i - 1] as HTMLInputElement | null;
                prevInput?.focus();
              }
            }}
            className="w-10 h-12 text-center text-xl font-bold bg-white/5 border border-white/10 rounded-xl focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus={i === 0}
          />
        ))}
      </div>

      {error && <p className="text-sm text-rose-400 flex items-center justify-center gap-1"><XCircle className="h-4 w-4" />{error}</p>}

      <Boton
        onClick={onSubmit}
        disabled={verificationCode.length !== 6 || submitting}
        className="w-full"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Verificando...
          </>
        ) : (
          'Verificar y continuar →'
        )}
      </Boton>

      <Boton
        variante="fantasma"
        onClick={onResend}
        disabled={submitting}
        className="w-full"
      >
        Reenviar código
      </Boton>
    </div>
  );
}

function CompleteStep() {
  return (
    <div className="text-center py-4">
      <div className="p-3 rounded-full bg-emerald-500/20 text-emerald-400 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
        <CheckCircle className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-bold text-slate-100 mb-2">¡Consentimiento verificado!</h3>
      <p className="text-slate-400">
        Tu padre/madre/tutor ha autorizado el uso de LifeAgente AI.
        Ya puedes disfrutar de todas las funcionalidades.
      </p>
    </div>
  );
}

// Hook for easy integration
export function useParentalConsent() {
  const [consentStatus, setConsentStatus] = useState<'unknown' | 'not_required' | 'required' | 'granted' | 'denied'>('unknown');

  useEffect(() => {
    const saved = localStorage.getItem(PARENTAL_CONSENT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.version === CONSENT_VERSION) {
          setConsentStatus(parsed.granted && parsed.verified ? 'granted' : 'denied');
        }
      } catch {
        setConsentStatus('unknown');
      }
    } else {
      setConsentStatus('unknown');
    }
  }, []);

  const checkAge = (age: number) => {
    if (age >= 13) {
      setConsentStatus('not_required');
      localStorage.setItem(PARENTAL_CONSENT_KEY, JSON.stringify({
        version: CONSENT_VERSION,
        granted: true,
        verified: true,
        age,
        timestamp: Date.now(),
      }));
    } else {
      setConsentStatus('required');
    }
  };

  return { consentStatus, checkAge };
}