# Legal Compliance & Privacy Implementation Plan

> **For Hermes:** Use subagent-driven-development to implement each task independently.

**Goal:** Implement comprehensive legal compliance features (privacy policy, terms, cookie consent, data minimization, third-party audit, dark pattern removal, etc.) and establish automated release process.

**Architecture:** Frontend React pages with modal components, Tailwind UI, API integration for policy versioning, and localStorage for consent management.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Zustand state, React Router

---

## Overview

This plan implements 19 legal compliance requirements:

1. Privacy Policy (Política de privacidad)
2. Terms of Service (Términos y condiciones)
3. Refund Policy (Política de reembolsos)
4. Cookie Policy (Política de cookies)
5. Cookie Consent Banner (Banner consent cookies)
6. Consent Management (Consentimientos formularios)
7. Data Minimization (Recolección datos innecesarios)
8. Third-party SDK Audit (Audita SDKs de terceros)
9. Dark Pattern Removal (Elimina patrones oscuros)
10. Hidden Charges Removal (Elimina cobros ocultos)
11. Fake Reviews Removal (Elimina reseñas falsas)
12. Unsubstantiated Claims Removal (Afirmaciones sin respaldo)
13. Alternative Text (Texto alternativo)
14. Color Correction (Corrección de color)
15. Keyboard Navigation (Navegación con teclado)
16. Business Data (Datos de tu negocio)
17. Parental Consent (Consentimiento parental)
18. Unsubscribe Link (Link de baja)
19. Image License (Licencia imágenes)
20. Data Deletion (Eliminación de datos)

---

## Task 1: Create Legal Pages Structure

**Objective:** Create dedicated routes and pages for all legal documents

**Files:**
- Create: `frontend/src/pages/PrivacyPolicy.tsx`
- Create: `frontend/src/pages/TermsOfService.tsx`
- Create: `frontend/src/pages/RefundPolicy.tsx`
- Create: `frontend/src/pages/CookiePolicy.tsx`
- Modify: `frontend/src/routes.tsx` (add routes)

**Step 1:** Create Privacy Policy page
```tsx
// frontend/src/pages/PrivacyPolicy.tsx
export function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Política de Privacidad</h1>
      <p>Contenido de la política...</p>
    </div>
  )
}
```

**Step 2:** Add routes to router
```tsx
// In routes.tsx, add before Dashboard route:
{ path: '/privacy-policy', component: PrivacyPolicy, protected: false },
{ path: '/terms', component: TermsOfService, protected: false },
{ path: '/refund-policy', component: RefundPolicy, protected: false },
{ path: '/cookie-policy', component: CookiePolicy, protected: false },
```

---

## Task 2: Create Cookie Consent Hook

**Objective:** Create reusable hook for cookie consent management

**Files:**
- Create: `frontend/src/hooks/useCookieConsent.ts`
- Create: `frontend/src/components/CookieConsentBanner.tsx`

**Step 1:** Create cookie consent hook
```typescript
// frontend/src/hooks/useCookieConsent.ts
interface CookieConsent {
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  statistics: boolean;
}

const CONSENT_KEY = 'cookie_consent_v1';

export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(CONSENT_KEY);
    if (saved) {
      setConsent(JSON.parse(saved));
    }
  }, []);

  const acceptAll = () => {
    const allAccepted = { analytics: true, marketing: true, preferences: true, statistics: true };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(allAccepted));
    setConsent(allAccepted);
  };

  const rejectAll = () => {
    const noneAccepted = { analytics: false, marketing: false, preferences: false, statistics: false };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(noneAccepted));
    setConsent(noneAccepted);
  };

  const savePreferences = (prefs: Partial<CookieConsent>) => {
    const newConsent = { ...consent, ...prefs };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(newConsent));
    setConsent(newConsent);
  };

  return { consent, acceptAll, rejectAll, savePreferences };
}
```

**Step 2:** Create Cookie Consent Banner component
```tsx
// frontend/src/components/CookieConsentBanner.tsx
import { useCookieConsent } from '@/hooks/useCookieConsent';

export function CookieConsentBanner() {
  const { consent, acceptAll, rejectAll, savePreferences } = useCookieConsent();

  if (consent) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 md:p-6 shadow-lg z-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-semibold mb-2">We value your privacy</h2>
        <p className="text-sm mb-4">We use cookies to enhance your experience. Choose your preferences.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={acceptAll} className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">Accept All</button>
          <button onClick={rejectAll} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Reject All</button>
          <button onClick={() => savePreferences({ analytics: true, statistics: true })} className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700">Customize</button>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 3: Implement Data Minimization Audit

**Objective:** Audit and remove unnecessary data collection

**Files:**
- Create: `frontend/src/lib/data-audit.ts`
- Modify: `frontend/src/components/Settings.tsx`

**Step 1:** Create data audit utility
```typescript
// frontend/src/lib/data-audit.ts
export const DATA_MINIMIZATION_RULES = {
  required: ['email', 'name'],
  optional: ['phone', 'timezone', 'locale'],
  sensitive: ['credit_card', 'ssn', 'password'],
  not_collected: ['precise_location', 'device_fingerprint', 'behavioral_data']
};

export function auditDataCollection(fields: string[]): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  for (const field of fields) {
    if (DATA_MINIMIZATION_RULES.not_collected.includes(field)) {
      issues.push(`Field '${field}' should not be collected`);
    }
  }
  
  return { valid: issues.length === 0, issues };
}
```

**Step 2:** Audit Settings form fields
- Remove any fields that collect unnecessary data
- Add data minimization documentation tooltip

---

## Task 4: Implement Third-Party SDK Audit Component

**Objective:** Display and audit third-party SDKs

**Files:**
- Create: `frontend/src/components/SDKAudit.tsx`
- Modify: `frontend/src/pages/Settings.tsx` (add tab)

**Step 1:** Create SDK audit component
```tsx
// frontend/src/components/SDKAudit.tsx
const THIRD_PARTY_SDKS = [
  { name: 'Tailwind CSS', version: '3.x', purpose: 'Styling', privacy: 'Low', consents: [] },
  { name: 'Lucide React', version: '0.460.0', purpose: 'Icons', privacy: 'None', consents: [] },
  { name: 'Google Identity Services', version: '1.x', purpose: 'OAuth', privacy: 'High', consents: ['marketing'] },
  { name: 'Supabase JS', version: '2.x', purpose: 'Backend', privacy: 'Medium', consents: ['analytics'] },
];

export function SDKAudit() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Third-Party SDKs</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">SDK</th>
            <th className="text-left p-2">Version</th>
            <th className="text-left p-2">Purpose</th>
            <th className="text-left p-2">Privacy Impact</th>
          </tr>
        </thead>
        <tbody>
          {THIRD_PARTY_SDKS.map(sdk => (
            <tr key={sdk.name} className="border-b">
              <td className="p-2">{sdk.name}</td>
              <td className="p-2">{sdk.version}</td>
              <td className="p-2">{sdk.purpose}</td>
              <td className="p-2">{sdk.privacy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Task 5: Create Consent Management for Forms

**Objective:** Allow users to grant/revoke form consents

**Files:**
- Create: `frontend/src/components/ConsentManager.tsx`
- Modify: `frontend/src/components/forms/*.tsx`

**Step 1:** Create consent manager component
```tsx
// frontend/src/components/ConsentManager.tsx
interface Consent {
  id: string;
  title: string;
  description: string;
  granted: boolean;
  onToggle: (granted: boolean) => void;
}

export function ConsentManager({ consents }: { consents: Consent[] }) {
  return (
    <div className="space-y-3">
      {consents.map(c => (
        <div key={c.id} className="border rounded p-3">
          <label className="flex items-center justify-between">
            <span className="text-sm">{c.title}</span>
            <input
              type="checkbox"
              checked={c.granted}
              onChange={e => c.onToggle(e.target.checked)}
              className="rounded"
            />
          </label>
          <p className="text-xs text-gray-500 mt-1">{c.description}</p>
        </div>
      ))}
    </div>
  );
}
```

---

## Task 6: Remove Dark Patterns from UI

**Objective:** Audit and remove deceptive UI patterns

**Files:**
- Audit: `frontend/src/components/*.tsx`
- Audit: `frontend/src/pages/*.tsx`

**Step 1:** Create dark pattern checklist
```markdown
# Dark Patterns Checklist

- [ ] No pre-checked consent boxes
- [ ] No "dark patterns" in upgrade flows
- [ ] Clear opt-out mechanisms
- [ ] No misleading urgency messages
- [ ] Accurate time displays
- [ ] No hidden costs
- [ ] Transparent pricing
- [ ] Honest testimonials
```

**Step 2:** Run audit and fix issues
- Replace any "Subscribe now, limited time!" with neutral messaging
- Ensure all consent boxes are unchecked by default
- Remove any "You're almost done!" or similar pressure language

---

## Task 7: Implement Accessibility Features

**Objective:** Add alt text, keyboard navigation, color contrast checks

**Files:**
- Create: `frontend/src/lib/accessibility.ts`
- Modify: All component files

**Step 1:** Create accessibility utility
```typescript
// frontend/src/lib/accessibility.ts
export function checkContrast(color1: string, color2: string): { ratio: number; passes: boolean } {
  // Implementation for checking WCAG contrast
  return { ratio: 4.5, passes: true };
}

export const A11Y_LABELS = {
  settings: 'Open settings menu',
  logout: 'Log out of your account',
  search: 'Search in your data'
};
```

**Step 2:** Add alt text to all images
- Search for all `<img>` tags
- Add meaningful `alt` attributes

---

## Task 8: Create Business Data Dashboard

**Objective:** Allow users to view and manage their data

**Files:**
- Create: `frontend/src/components/DataDashboard.tsx`
- Create: `frontend/src/pages/DataManagement.tsx`

**Step 1:** Create data dashboard component
```tsx
// frontend/src/components/DataDashboard.tsx
export function DataDashboard() {
  return (
    <div className="space-y-4">
      <h3>Your Data</h3>
      <div className="grid gap-4">
        <div className="p-4 border rounded">
          <h4>Data Collected</h4>
          <ul className="text-sm">
            <li>Email: for account</li>
            <li>Name: for personalization</li>
            <li>Events/Tasks: your content</li>
          </ul>
        </div>
        <button 
          onClick={() => api.deleteUserData()}
          className="px-4 py-2 bg-red-600 text-white rounded"
        >
          Delete All My Data
        </button>
      </div>
    </div>
  );
}
```

---

## Task 9: Implement Data Deletion Endpoint

**Objective:** Add endpoint for users to delete their data

**Files:**
- Backend: `backend/app/routers/data.py`
- Frontend: `frontend/src/api/data.ts`
- Frontend: `frontend/src/components/DataDeletion.tsx`

**Step 1:** Backend endpoint
```python
# backend/app/routers/data.py
@router.delete("/data")
async def delete_my_data(current_user: User = Depends(get_current_user)):
    # Delete all user data
    await db.execute(delete(UserData).where(UserData.user_id == current_user.id))
    await db.execute(delete(UserSettings).where(UserSettings.user_id == current_user.id))
    # ... other tables
    return {"message": "Data deleted successfully"}
```

---

## Task 10: Implement Parental Consent Component

**Objective:** Add parental consent for users under 13 (COPPA)

**Files:**
- Create: `frontend/src/components/ParentalConsent.tsx`

**Step 1:** Create parental consent modal
```tsx
// frontend/src/components/ParentalConsent.tsx
export function ParentalConsent({ age, onBeforeProceed }: {
  age: number;
  onBeforeProceed: () => void;
}) {
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    if (age < 13) setShowConsent(true);
  }, [age]);

  if (!showConsent) return null;

  return (
    <Modal title="Parental Consent Required">
      <p>Parent or guardian must consent for users under 13.</p>
      <input type="checkbox" onChange={() => onBeforeProceed()} />
      <label>I confirm parent/guardian has given consent</label>
    </Modal>
  );
}
```

---

## Task 11: Create Release Automation Script

**Objective:** Automate version bumping and release creation

**Files:**
- Create: `release.sh`
- Modify: `frontend/package.json`

**Step 1:** Create release script
```bash
#!/bin/bash
# release.sh
set -e

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: ./release.sh <version>"
  exit 1
fi

echo "$VERSION" > VERSION
echo "Bumping to v$VERSION"

# Update changelog
node scripts/update-changelog.js "$VERSION"

# Commit and tag
git add VERSION CHANGELOG.md
git commit -m "chore: v$VERSION
- Legal compliance features
- Cookie consent banner
- Privacy policy page
- Terms of service page
- Data audit tools
- Third-party SDK disclosure
- Accessibility improvements
- Data deletion endpoint
- Parental consent modal
- Release automation"

git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin main
git push origin "v$VERSION"

echo "Release v$VERSION created!"
```

---

## Task 12: Create CHANGELOG Entry Files

**Objective:** Create structured changelog entries for releases

**Files:**
- Create: `CHANGELOG.v2.2.0.md` (template)
- Modify: `frontend/package.json`

**Step 1:** Create changelog template
```markdown
# CHANGELOG v2.2.0

## Legal Compliance & Privacy Features

### Added
- Privacy Policy page (`/privacy-policy`)
- Terms of Service page (`/terms`)
- Refund Policy page (`/refund-policy`)
- Cookie Policy page (`/cookie-policy`)
- Cookie consent banner (auto-show on first visit)
- Consent management for forms
- Third-party SDK audit component
- Data minimization utilities

### Changed
- Removed dark patterns from all UI
- Added WCAG AA contrast improvements
- Added keyboard navigation support
- Added alt text to all images
- Added data deletion endpoint (`/api/data`)

### Fixed
- Fixed consent pre-check issues
- Fixed misleading urgency messages
- Fixed hidden cost displays
```

---

## Verification Steps

After each task:
1. Run TypeScript check: `npm run build --prefix frontend`
2. Verify new files exist in correct locations
3. Test browser rendering of new pages
4. Verify consent banner appears on first visit

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Users reject cookie banner | Make it dismissible, clear explanation |
| Legal liability from new pages | Consult lawyer, add disclaimer "Not legal advice" |
| Breaking changes to existing flows | Use modal, don't modify core functionality |
| Performance impact from audit tools | Lazy load audit components |
| GDPR non-compliance | Review with legal team before launch |

---

## Estimated Timeline

| Task | Est. Time |
|------|-----------|
| Legal pages (1-4) | 4-6 hours |
| Cookie consent (5-6) | 2-3 hours |
| Data minimization (7) | 2 hours |
| SDK audit (8) | 1-2 hours |
| Consent management (9) | 2-3 hours |
| Remove dark patterns (10) | 3-4 hours |
| Accessibility (11) | 4-5 hours |
| Business data (12-13) | 3-4 hours |
| Releases automation (14-15) | 2 hours |

**Total: ~25-35 hours**

---

## Next Steps

1. Start with Task 1: Create legal pages structure
2. Implement Task 2: Cookie consent hook
3. Run build verification after each 2-3 tasks
4. Create release for v2.2.0 with all changes

---

## Release Process

For each subsequent change:
```bash
# Update VERSION file
echo "X.Y.Z" > VERSION

# Update CHANGELOG.md
# Add new section for version X.Y.Z

# Commit and push
git add VERSION CHANGELOG.md
git commit -m "chore: vX.Y.Z - [brief description]"

# Tag and push
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

This will trigger GitHub Actions to create the release automatically.