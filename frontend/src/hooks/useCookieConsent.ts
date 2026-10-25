import { useState, useEffect, useCallback } from 'react';

export interface CookieConsent {
  essential: boolean;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
}

const CONSENT_KEY = 'cookie_consent_v1';
const CONSENT_VERSION = 1;

const defaultConsent: CookieConsent = {
  essential: true, // Always required
  preferences: false,
  analytics: false,
  marketing: false,
};

export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Load consent from localStorage
  const loadConsent = useCallback(() => {
    const saved = localStorage.getItem(CONSENT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.version === CONSENT_VERSION && parsed.consent) {
          setConsent({ ...defaultConsent, ...parsed.consent });
          setHasInteracted(true);
          return;
        }
      } catch {
        // Invalid stored data, will show banner
      }
    }
    setConsent(null);
    setHasInteracted(false);
  }, []);

  useEffect(() => {
    loadConsent();

    // Bug #2: Cross-tab sync - listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CONSENT_KEY && e.newValue !== e.oldValue) {
        loadConsent();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadConsent]);

  const saveConsent = useCallback((newConsent: Partial<CookieConsent>) => {
    const updated = { ...defaultConsent, ...consent, ...newConsent, essential: true };
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      version: CONSENT_VERSION,
      consent: updated,
      timestamp: Date.now(),
    }));
    setConsent(updated);
    setHasInteracted(true);
  }, [consent]);

  const acceptAll = useCallback(() => {
    saveConsent({ preferences: true, analytics: true, marketing: true });
  }, [saveConsent]);

  const rejectAll = useCallback(() => {
    saveConsent({ preferences: false, analytics: false, marketing: false });
  }, [saveConsent]);

  const savePreferences = useCallback((prefs: Partial<Omit<CookieConsent, 'essential'>>) => {
    saveConsent(prefs);
  }, [saveConsent]);

  const resetConsent = useCallback(() => {
    localStorage.removeItem(CONSENT_KEY);
    setConsent(null);
    setHasInteracted(false);
  }, []);

  const shouldShowBanner = !consent && !hasInteracted;

  return {
    consent,
    hasInteracted,
    shouldShowBanner,
    acceptAll,
    rejectAll,
    savePreferences,
    resetConsent,
  };
}

// Helper to check if a category is allowed
export function useCookieCategory(category: keyof Omit<CookieConsent, 'essential'>) {
  const { consent } = useCookieConsent();
  return consent?.[category] ?? false;
}

// Helper for scripts that should only load with consent
export function useScriptConsent(category: keyof Omit<CookieConsent, 'essential'>) {
  const allowed = useCookieCategory(category);
  return allowed;
}