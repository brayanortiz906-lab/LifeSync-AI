# 🔧 Checklist Reparar Problemas Pendientes - LifeAgente v2.1.2

> **Tiempo estimado**: 15-20 min configurando todo en los dashboards
> **Archivos generados**: `backend/.env.production` y `frontend/.env.production` con valores listos para copiar

---

## 1️⃣ RENDER BACKEND (5 min)

### Pasos:
1. Ve a https://dashboard.render.com → **lifeagente-api** → **Environment**
2. **Borra todas las variables existentes** (empieza limpio)
3. **Copia y pega CADA una** desde `backend/.env.production`:

| Variable | Valor (copia exacto) |
|----------|---------------------|
| `APP_NAME` | `LifeAgente` |
| `DEBUG` | `false` |
| `ENVIRONMENT` | `production` |
| `API_V1_PREFIX` | `/api/v1` |
| `FRONTEND_URL` | `https://lifeagente.vercel.app` |
| `CORS_ORIGINS` | `["https://lifeagente.vercel.app", "https://brayanortiz906-lab.github.io", "capacitor://localhost"]` |
| `SUPABASE_URL` | `https://yitkwdveaksiabppwuck.supabase.co` |
| `SUPABASE_ANON_KEY` | `REDACTED` |
| `SUPABASE_SERVICE_ROLE_KEY` | `REDACTED` |
| `DATABASE_URL` | `REDACTED` |
| `ENCRYPTION_KEY` | `REDACTED` |
| `GOOGLE_CLIENT_ID` | *(deja vacío por ahora - paso 3)* |
| `GOOGLE_CLIENT_SECRET` | *(deja vacío por ahora - paso 3)* |
| `BREVO_API_KEY` | *(deja vacío por ahora - paso 4)* |
| `CRON_TOKEN` | `REDACTED` |

4. Click **Save Changes** → **Manual Deploy** → **Deploy latest commit**

### Verificar:
```
GET https://lifeagente-api.onrender.com/api/health
→ {"ok": true, "database": "supabase-postgresql", "auth": "supabase", ...}
```

---

## 2️⃣ VERCEL FRONTEND (3 min)

### Pasos:
1. Ve a https://vercel.com/dashboard → **lifeagente-frontend** → **Settings** → **Environment Variables**
2. **Borra todas las variables existentes**
3. **Copia y pega** desde `frontend/.env.production`:

| Variable | Valor (copia exacto) |
|----------|---------------------|
| `VITE_SUPABASE_URL` | `https://yitkwdveaksiabppwuck.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_hxdrYmrXrFuahW9i_YiR2Q_gu51z6gp` |
| `VITE_API_URL` | `https://lifeagente-api.onrender.com/api/v1` |
| `VITE_APP_NAME` | `LifeAgente` |
| `VITE_GOOGLE_CLIENT_ID` | *(deja vacío por ahora - paso 3)* |

4. **Redeploy**: Deployments → **Redeploy** último commit

### Verificar:
- https://lifeagente.vercel.app carga sin errores
- Login/Register funciona

---

## 3️⃣ GOOGLE OAUTH (5 min) — Para "Sign in with Google"

### En Google Cloud Console:
1. https://console.cloud.google.com/apis/credentials
2. **Create Credentials** → **OAuth client ID** → **Web application**
3. Name: `LifeAgente Production`
4. **Authorized redirect URIs** (EXACTOS, uno por línea):
   ```
   https://lifeagente.vercel.app/auth/callback
   capacitor://localhost/auth/callback
   ```
5. **Create** → Copia **Client ID** y **Client Secret**

### Actualiza en Render + Vercel:
| Plataforma | Variable | Valor |
|------------|----------|-------|
| Render | `GOOGLE_CLIENT_ID` | `1234567890-xyz.apps.googleusercontent.com` |
| Render | `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxxxxxx` |
| Vercel | `VITE_GOOGLE_CLIENT_ID` | `1234567890-xyz.apps.googleusercontent.com` |

6. **Redeploy** ambos (Render + Vercel)

### En Supabase Auth:
1. https://supabase.com/dashboard/project/yitkwdveaksiabppwuck/auth/providers
2. **Google** → Enable → Pega mismo Client ID/Secret
3. **Site URL**: `https://lifeagente.vercel.app`
4. **Redirect URLs**: agrega `https://lifeagente.vercel.app/auth/callback`

---

## 4️⃣ EMAIL - BREVO (3 min) — Para Magic Links y notificaciones

### Opción A: Brevo (recomendado, 300 emails/día gratis)
1. https://app.brevo.com → **Settings** → **API Keys** → **Create API Key**
2. Nombre: `LifeAgente Production` → **Generate**
3. Copia la key (empieza con `xkeysib-`)

### Actualiza en Render:
| Variable | Valor |
|----------|-------|
| `BREVO_API_KEY` | `xkeysib-tu-key-aqui` |
| `EMAIL_FROM` | `noreply@lifeagente.app` |

### Opción B: Resend (3000 emails/mes gratis)
1. https://resend.com/api-keys → **Create API Key**
2. Copia key (empieza con `re_`)
3. En Render usa `RESEND_API_KEY` en vez de `BREVO_API_KEY`

---

## 5️⃣ REVOCAR TOKENS GITHUB EXPUESTOS (2 min) — 🔴 CRÍTICO

1. https://github.com/settings/tokens (Personal access tokens)
2. **Revoke** cualquier token que hayas compartido o expuesto
3. https://github.com/settings/applications (OAuth Apps) → Revoca apps no usadas
4. **Genera nuevo PAT** si necesitas: **Generate new token (classic)** → scopes: `repo`, `workflow`, `write:packages`

---

## 6️⃣ EJECUTAR MIGRACIONES SUPABASE (5 min)

### En Supabase SQL Editor (https://supabase.com/dashboard/project/yitkwdveaksiabppwuck/sql/new):

**Ejecuta EN ORDEN** (copia cada archivo completo):

1. **`backend/migrations/001_schema.sql`** → Run
2. **`backend/migrations/002_rls.sql`** → Run
3. **`backend/migrations/003_storage.sql`** → Run
4. **`backend/migrations/004_triggers.sql`** → Run

### Verificar:
```sql
-- Tablas creadas
\dt public.*

-- Políticas RLS
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Bucket backups
SELECT * FROM storage.buckets WHERE id = 'backups';
```

---

## 7️⃣ VERIFICACIÓN FINAL (2 min)

| Test | URL | Esperado |
|------|-----|----------|
| Backend Health | `https://lifeagente-api.onrender.com/api/health` | `{"ok": true, ...}` |
| Frontend | `https://lifeagente.vercel.app` | Carga app |
| Login Email | `/register` → email → `/login` | Funciona |
| Google OAuth | Botón "Sign in with Google" | Redirige a Google |
| Chat Gemini | `/chat` escribe mensaje | Streaming SSE |
| IA Móvil | `/settings` → IA | Detecta hardware |
| Alarmas | `/alarmas` crea una | Notificación nativa |

---

## 📋 RESUMEN VALORES CLAVE (copia rápida)

```bash
# Supabase
URL: https://yitkwdveaksiabppwuck.supabase.co
Anon: REDACTED
Service: REDACTED

# Database
REDACTED

# Encryption (NUEVA - generada hoy)
REDACTED

# Render URL (backend)
https://lifeagente-api.onrender.com

# Vercel URL (frontend)
https://lifeagente.vercel.app
```

---

## ⚡ ORDEN RECOMENDADO DE EJECUCIÓN

1. **Render env vars** → Deploy → Verifica `/api/health`
2. **Vercel env vars** → Redeploy → Verifica carga
3. **Google OAuth** → Actualiza Render+Vercel+Supabase → Redeploy
4. **Brevo/Resend** → Actualiza Render
5. **Migraciones Supabase** (4 bloques SQL)
6. **Revoca tokens GitHub**
7. **Test completo** (tabla arriba)

---

**¡Una vez completado, todo funciona en producción gratis ($0/mes)!** 🎉