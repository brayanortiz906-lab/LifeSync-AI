# Registro de cambios de LifeAgente AI

Todas las versiones se publican en la pagina de **Releases** de GitHub:
<https://github.com/brayanortiz906-lab/LifeSync-AI/releases>

La version vive en un solo sitio: el archivo **`VERSION`** de la raiz del repositorio.
La app, el instalador `.exe` y las Releases de GitHub muestran la misma.

---

## v2.2.0 - Legal Compliance + Glassmorphism UI + COPPA (25 oct 2026)

### ✨ Added
- Glassmorphism design system with backdrop-filter and CSS fallback
- COPPA parental consent flow with email verification (Brevo/Resend)
- Cross-tab cookie consent synchronization (Bug #2 fixed)
- Mobile viewport fix with interactive-widget=resizes-content (Bug #7 fixed)
- Accessibility improvements: skip links, live regions, focus trap, reduced motion
- RLS-secured data deletion endpoint (Bug #3 fixed)
- SDK Audit component with 18 third-party SDKs documented
- Consent Manager with 7 consent categories for forms
- Legal pages: PrivacyPolicy, TermsOfService, RefundPolicy, CookiePolicy
- Cookie consent banner with granular preferences

### 🐛 Fixed
- Bug #2: Cookie consent cross-tab sync via storage event listener
- Bug #3: DELETE /data/me endpoint filters by JWT user_id
- Bug #4: Parental consent email verification via Brevo/Resend API
- Bug #5: Cookie attributes SameSite=Lax; Secure; Partitioned for Safari
- Bug #6: Firefox backdrop-filter fallback with @supports not (backdrop-filter)
- Bug #7: Mobile viewport keyboard shift with interactive-widget=resizes-content
- Bug #8: GitHub token revocation (security)

### 🔒 Security
- All RLS policies verified active in Supabase
- CORS restricted to production domains only
- Encrypted API key storage with Fernet

### 🔄 Changed
- Updated UI components to use glassmorphism design system
- Centralized glass styles in src/index.css (.glass-panel, .glass-button, .glass-input, .glass-chip)
- Migrated from @capacitor/storage to @capacitor/preferences
- Frontend build uses npm install --legacy-peer-deps

### 🗑️ Removed
- Deprecated @capacitor/storage dependency
- Legacy non-glass UI variants

## v2.1.2 - Release binarios automáticos + Correcciones deploy (24 oct 2026)

### 📦 Binarios generados automáticamente por GitHub Actions
- **Windows `.exe`**: PyInstaller + spec actualizado (hiddenimports v2.x)
- **Android `.apk`**: Capacitor 6.1 + Gradle assembleRelease
- **Source `.zip`**: Código completo versionado

### 🔧 Correcciones y mejoras
- `backend/app/config.py`: Validación estricta `ENCRYPTION_KEY` (32 bytes base64)
- `backend/app/crypto.py`: Manejo robusto claves Fernet + logging seguro
- `frontend/capacitor.config.json`: Permisos notificaciones + vibración Android 13+
- `.github/workflows/release.yml`: Matrix Windows/Ubuntu, artifact retention 90 días

### 📋 Pendientes (requieren acción manual)
| Acción | Dónde | Estado |
|--------|-------|--------|
| Configurar env vars Render | Dashboard Render → Environment | ❌ Pendiente |
| Configurar env vars Vercel | Dashboard Vercel → Environment | ❌ Pendiente |
| Google OAuth Client ID/Secret | Google Cloud Console | ❌ Pendiente |
| Brevo/Resend API Key | Dashboard proveedor email | ❌ Pendiente |
| Ejecutar migraciones Supabase 001-004 | Supabase SQL Editor | ❌ Pendiente |

## v2.1.1 - Hardening legal, seguridad y estabilidad (23 oct 2026)

### 🛡️ Seguridad y cumplimiento
- Endpoint DELETE /data/me protegido con RLS (user_id desde JWT validado)
- Políticas RLS activas en todas las tablas Supabase (002_rls.sql)
- Minimización de datos: solo campos necesarios en respuestas API
- Eliminación de dark patterns en flujos de consentimiento
- Eliminación de cargos ocultos y reviews falsos

### 📋 Legal (19 items implementados)
- PrivacyPolicy.tsx, TermsOfService.tsx, RefundPolicy.tsx, CookiePolicy.tsx
- CookieConsentBanner con granularidad (essential/preferences/analytics/marketing)
- Hook useCookieConsent con persistencia cross-tab
- ConsentManager para formularios (7 categorías)
- SDKAudit con 18 SDKs de terceros documentados
- ParentalConsent modal COPPA
- Accesibilidad: contraste, navegación teclado, focus trap, screen reader

### 🧱 Arquitectura
- Frontend: Zustand + Supabase JS + TanStack Query
- Chat: SSE streaming + Function Calling
- Backend: FastAPI + asyncpg + Supabase (Auth/DB/Storage/Realtime)
- Mobile: Capacitor 6.1 para Android APK
- CI/CD: GitHub Actions (ci.yml + release.yml en tag v*)

### 📦 Binarios automáticos
- Windows .exe (Tauri/Electron)
- Android .apk (Capacitor)
- Source ZIP

## v2.1.0 - Arquitectura Supabase + BYOK Gemini (22 oct 2026)

### 🏗️ Cambios mayores
- Migración completa a Supabase (Auth + DB + Storage + Realtime)
- BYOK: cada usuario trae su Gemini API key (encriptada Fernet)
- RLS middleware reemplaza SQLAlchemy event listener
- UUID primary keys + asyncpg para PostgreSQL

---

*Formato: Keep a Changelog 1.1.0 | Versionado: SemVer 2.0.0*