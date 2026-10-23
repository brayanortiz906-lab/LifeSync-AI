# LifeAgente AI v2.1.0 - Guía Completa de Configuración

> **Tiempo estimado**: 30-45 min para setup completo (Supabase + Render + Vercel + GitHub Actions)

---

## 🎯 Resumen de Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        USUARIO FINAL                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Frontend    │  │ PWA/APK     │  │ Navegador Móvil/Escritorio│  │
│  │ (Vercel)    │  │ (Capacitor) │  │                         │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                       │               │
│         ▼                ▼                       ▼               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SUPABASE (Backend-as-a-Service)             │   │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────┐             │   │
│  │  │ Auth     │  │ Database   │  │ Storage  │             │   │
│  │  │ (JWT)    │  │ (PostgreSQL│  │ (Backups)│             │   │
│  │  │          │  │  + RLS)    │  │          │             │   │
│  │  └──────────┘  └────────────┘  └──────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              FASTAPI BACKEND (Render)                    │   │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────┐             │   │
│  │  │ Supabase │  │ SQLAlchemy │  │ Gemini   │             │   │
│  │  │ Admin    │  │ + asyncpg  │  │ (BYOK)   │             │   │
│  │  │ Client   │  │            │  │          │             │   │
│  │  └──────────┘  └────────────┘  └──────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ SUPABASE SETUP (15 min)

### 1.1 Crear Proyecto
1. Ve a https://supabase.com → "Start your project" → Sign up con GitHub
2. "New project" → Organization: tu cuenta
3. Name: `lifeagente` | Password: **guárdalo** | Region: `eu-west-1` (Frankfurt)
4. "Create new project" → espera 2-3 min

### 1.2 Obtener Credenciales
En **Settings → API**:
```
Project URL:        https://XXXXXXXXXXXX.supabase.co
anon public key:    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (largo)
service_role key:   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (MÁS LARGO - SECRETO)
```

### 1.3 Database URL (para asyncpg)
En **Settings → Database → Connection pooling**:
```
Host:     aws-0-eu-west-1.pooler.supabase.com
Port:     6543 (pooler) / 5432 (directo)
User:     postgres
Password: [el password que pusiste al crear]
Database: postgres

DATABASE_URL = "postgresql+asyncpg://postgres:PASSWORD@aws-0-eu-west-1.pooler.supabase.co:6543/postgres"
```

### 1.4 Ejecutar Migraciones SQL
Ve a **SQL Editor → New query** → Ejecuta **en orden**:

#### Bloque A: Esquema + Tablas
```sql
-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tablas (usuarios, eventos, tareas, paneles, permisos, backups, chats, mensajes)
-- [COPIA EL SQL DEL ARCHIVO backend/migrations/001_schema.sql]
```

#### Bloque B: RLS Policies
```sql
-- Habilitar RLS + Políticas + Función current_user_id()
-- [COPIA EL SQL DEL ARCHIVO backend/migrations/002_rls.sql]
```

#### Bloque C: Storage Bucket
```sql
-- En Dashboard: Storage → New bucket → "backups" (Private)
-- LUEGO ejecuta:
CREATE POLICY "Users can view own backups" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'backups' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own backups" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'backups' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own backups" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'backups' AND auth.uid()::text = (storage.foldername(name))[1]);
```

#### Bloque D: Trigger Auto-perfil
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.usuarios (id, display_name, avatar_url)
    VALUES (new.id, new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'avatar_url');
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 1.5 Auth Config
En **Authentication → Providers**:
- ✅ **Email** (Confirm email: ON, Secure email change: ON)
- ✅ **Google** (Client ID/Secret de Google Cloud Console)
- **Site URL**: `http://localhost:5173` (dev) / `https://tu-frontend.vercel.app` (prod)
- **Redirect URLs**: 
  - `http://localhost:5173/auth/callback`
  - `https://tu-frontend.vercel.app/auth/callback`
  - `capacitor://localhost/auth/callback` (para APK)

---

## 2️⃣ GOOGLE CLOUD CONSOLE (5 min - Opcional para Google Sign-In)

1. https://console.cloud.google.com → "Select project" → "New Project" → `lifeagente`
2. **APIs & Services → Credentials** → "Create Credentials" → "OAuth client ID"
3. Tipo: **Web application**
4. Name: `LifeAgente Web`
5. **Authorized redirect URIs**:
   ```
   http://localhost:5173/auth/callback
   https://tu-frontend.vercel.app/auth/callback
   capacitor://localhost/auth/callback
   ```
6. Copia **Client ID** y **Client Secret**

---

## 3️⃣ GITHUB SECRETS (5 min)

En **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor | Ejemplo |
|--------|-------|---------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | `https://yitkwdveaksiabppwuck.supabase.co` |
| `SUPABASE_ANON_KEY` | `anon key` | `sb_publishable_xxx...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role key` | `sb_secret_xxx...` |
| `DATABASE_URL` | `postgresql+asyncpg://...` | `postgresql+asyncpg://postgres:PASS@aws-0-eu-west-1.pooler.supabase.co:6543/postgres` |
| `ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | `abc123...` (44 chars base64) |
| `RENDER_API_KEY` | Render → Account → API Keys | `rnd_xxxxx` |
| `RENDER_SERVICE_ID_API` | Render → Service → Settings → Service ID | `srv-xxxxx` |
| `VERCEL_TOKEN` | Vercel → Account → Tokens | `xxxxxx` |
| `VERCEL_ORG_ID` | Vercel → Settings → Team ID | `team_xxxxx` |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings → Project ID | `prj_xxxxx` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console | `1234567890-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | `GOCSPX-xxxxx` |

---

## 4️⃣ RENDER BACKEND (10 min)

1. https://dashboard.render.com → "New" → "Web Service"
2. Connect GitHub → `brayanortiz906-lab/LifeSync-AI`
3. Configuración:
   ```
   Name: lifeagente-api
   Runtime: Docker
   Dockerfile Path: ./Dockerfile
   Build Command: (vacío - usa Dockerfile)
   Start Command: (vacío - usa Dockerfile CMD)
   Plan: Free
   Region: Frankfurt (EU Central)
   Auto-Deploy: Yes
   ```
4. **Environment Variables** (Add from secrets):
   ```
   APP_NAME=LifeAgente
   DEBUG=false
   ENVIRONMENT=production
   FRONTEND_URL=https://tu-frontend.vercel.app
   CORS_ORIGINS=["https://tu-frontend.vercel.app", "https://brayanortiz906-lab.github.io", "capacitor://localhost"]
   CRON_TOKEN= (genera uno aleatorio)
   ENCRYPTION_KEY= (del secret ENCRYPTION_KEY)
   SUPABASE_URL= (del secret)
   SUPABASE_ANON_KEY= (del secret)
   SUPABASE_SERVICE_ROLE_KEY= (del secret)
   DATABASE_URL= (del secret)
   GOOGLE_CLIENT_ID= (del secret)
   GOOGLE_CLIENT_SECRET= (del secret)
   ```
5. **Create Web Service** → espera deploy (3-5 min)
6. Copia la URL: `https://lifeagente-api.onrender.com`

### Verificar
```
GET https://lifeagente-api.onrender.com/api/health
→ {"ok": true, "database": "supabase-postgresql", "auth": "supabase", ...}
```

---

## 5️⃣ VERCEL FRONTEND (5 min)

1. https://vercel.com → "Add New Project" → Import `brayanortiz906-lab/LifeSync-AI`
2. Config:
   ```
   Framework Preset: Vite
   Build Command: npm run build
   Output Directory: dist
   Install Command: npm ci
   ```
3. **Environment Variables**:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   VITE_API_URL=https://lifeagente-api.onrender.com/api/v1
   VITE_APP_NAME=LifeAgente
   VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```
4. **Deploy** → espera build (2-3 min)
5. Copia URL: `https://lifeagente.vercel.app`

### Actualizar CORS en Render
Agrega la URL de Vercel a `CORS_ORIGINS` en Render Environment Variables y redeploy.

---

## 6️⃣ GITHUB ACTIONS VERIFICACIÓN (2 min)

1. Ve a **Actions** tab en GitHub
2. Verifica que `ci.yml` corra en push a main
3. Crea tag de prueba:
   ```bash
   git tag v2.1.1-test
   git push upstream v2.1.1-test
   ```
4. Verifica en **Actions** que `release.yml`:
   - Build `.exe` en Windows runner
   - Build source ZIP
   - Crea Release en GitHub
3. Borra tag de prueba:
   ```bash
   git tag -d v2.1.1-test
   git push upstream :refs/tags/v2.1.1-test
   ```

---

## 7️⃣ DESARROLLO LOCAL (Opcional)

### Con Docker (Recomendado)
```bash
# 1. Copia .env.example a .env en backend y frontend
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edita con tus valores

# 2. Genera ENCRYPTION_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Ponla en backend/.env

# 3. Levanta todo
docker-compose up -d

# 3 URLs:
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Sin Docker
```bash
# Terminal 1 - Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py

# Terminal 2 - Frontend
cd frontend
npm ci
npm run dev
```

---

## 8️⃣ CAPACITOR APK (Opcional - 15 min)

### Prerrequisitos
- Java 21 (Temurin): `winget install EclipseAdoptium.Temurin.21.JDK`
- Android Studio + SDK (API 34)
- Node 20+

### Setup
```bash
cd frontend
npm ci
npm run build
npx cap add android
npx cap sync

# Build APK
powershell -ExecutionPolicy Bypass -File capacitor-build.ps1
# APK en: frontend/android/app/build/outputs/apk/release/app-release.apk
# O en raíz: LifeAgente.apk
```

### Firmar para Play Store
```bash
# 1. Genera keystore (guarda passwords!)
keytool -genkey -v -keystore release-key.keystore -alias lifeagente -keyalg RSA -keysize 2048 -validity 10000

# 2. Edita android/app/build.gradle:
# signingConfigs {
#     release {
#         storeFile file("../release-key.keystore")
#         storePassword "TU_PASSWORD"
#         keyAlias "lifeagente"
#         keyPassword "TU_PASSWORD"
#     }
# }
# buildTypes {
#     release { signingConfig signingConfigs.release }
# }

# 3. Build bundle
cd android && ./gradlew bundleRelease
# AAB en: app/build/outputs/bundle/release/app-release.aab
```

---

## 9️⃣ VERIFICACIÓN FINAL

### Checklist Post-Deploy
| Componente | Test | URL |
|------------|------|-----|
| Backend Health | `GET /api/health` | `https://api.onrender.com/api/health` |
| Frontend Load | Carga en navegador | `https://frontend.vercel.app` |
| Login Email | Registro + verify | `/register` → email → `/login` |
| Google OAuth | Botón "Sign in with Google" | `/login` |
| Chat Gemini | Escribe mensaje, ve streaming | `/chat` |
| IA Móvil | Abre panel, ve recomendación | `/settings` → IA |
| IA Ligera | Descarga modelo ultra-ligero | `/settings` → IA |
| Alarmas | Crea alarma, ve notificación | `/alarmas` |
| PWA Install | Banner aparece, instala | Cualquier página |
| APK | Instala en Android, prueba | `adb install LifeAgente.apk` |
| Release | Tag `v2.1.1` → Release GitHub | GitHub Releases |

---

## 🔄 FLUJO DE TRABAJO DIARIO

```bash
# 1. Haces cambios en código
# 2. Commit + push
git add -A
git commit -m "feat: nueva funcionalidad"
git push upstream main
# → CI corre automáticamente (tests + build)

# 2. Nueva versión (cada vez que quieras .exe/.apk nuevo)
echo "2.1.1" > VERSION
# Edita CHANGELOG.md (añade sección ## v2.1.1)
git add VERSION CHANGELOG.md
git commit -m "chore: v2.1.1 - descripción"
git tag v2.1.1
git push upstream main
git push upstream v2.1.1
# → GitHub Actions: .exe + .zip + Release automático
```

---

## 🆘 TROUBLESHOOTING RÁPIDO

| Error | Solución |
|-------|----------|
| `ENCRYPTION_KEY` inválida | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| Supabase RLS error | Verifica políticas en SQL Editor → Authentication → Policies |
| Render 500 | Logs → revisa `DATABASE_URL`, `ENCRYPTION_KEY`, `SUPABASE_*` |
| Vercel 404 refresh | `vercel.json` rewrites + `base` en `vite.config.ts` |
| Google OAuth 400 | Redirect URIs **exactos** en Google Cloud Console |
| CI falla tests | `cd backend && python smoke.py` local |
| APK no firma | `keytool` + `build.gradle` signingConfig |
| PWA no instala | `manifest.json` + `sw.js` + HTTPS requerido |

---

## 📞 SOPORTE Y ENLACES

- **Supabase**: https://supabase.com/dashboard
- **Render**: https://dashboard.render.com
- **Vercel**: https://vercel.com/dashboard
- **Google Cloud**: https://console.cloud.google.com
- **GitHub Actions**: https://github.com/brayanortiz906-lab/LifeSync-AI/actions
- **GitHub Releases**: https://github.com/brayanortiz906-lab/LifeSync-AI/releases
- **Repo**: https://github.com/brayanortiz906-lab/LifeSync-AI

---

**¡Listo! Tu LifeAgente AI v2.1.0 está deployado gratis ($0/mes) con:**
- ✅ Supabase Auth + DB + Storage (Free tier)
- ✅ Render Backend (Free tier)
- ✅ Vercel Frontend (Free tier)
- ✅ Gemini BYOK (Free tier: 1500 req/día)
- ✅ CI/CD automático (GitHub Actions)
- ✅ APK nativo + .exe Windows
- ✅ PWA instalable
- ✅ IA Local + IA Gratis + IA Móvil + Alarmas + Google Sign-In

**Coste total: $0/mes** 🎉