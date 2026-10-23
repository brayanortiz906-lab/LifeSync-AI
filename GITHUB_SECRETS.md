# GitHub Actions Secrets Configuration

Configura estos secrets en: **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**

---

## 🔐 Secrets Obligatorios (Para CI/CD y Deploy)

### Supabase
| Secret | Valor | Dónde conseguir |
|--------|-------|-----------------|
| `SUPABASE_URL` | `https://tu-proyecto.supabase.co` | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Supabase Dashboard → Settings → API → Project API keys → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Supabase Dashboard → Settings → API → Project API keys → service_role (SECRETA) |

### Database (Render PostgreSQL o Supabase)
| Secret | Valor | Dónde conseguir |
|--------|-------|-----------------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:PASS@db.supabase.co:6543/postgres` | Supabase Dashboard → Settings → Database → Connection pooling → URI |

### Encryption
| Secret | Valor | Cómo generar |
|--------|-------|--------------|
| `ENCRYPTION_KEY` | `base64-encoded-32-byte-key` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |

### Render Deploy
| Secret | Valor | Dónde conseguir |
|--------|-------|-----------------|
| `RENDER_API_KEY` | `rnd_xxxxxxxxxxxxx` | Render Dashboard → Account Settings → API Keys → Create API Key |
| `RENDER_SERVICE_ID_API` | `srv-xxxxxxxxx` | Render Dashboard → tu servicio API → Settings → Service ID |
| `RENDER_SERVICE_ID_WEB` | `srv-xxxxxxxxx` | Render Dashboard → tu servicio Web (si usas uno separado) → Service ID |

### Vercel Deploy (Frontend)
| Secret | Valor | Dónde conseguir |
|--------|-------|-----------------|
| `VERCEL_TOKEN` | `xxxxxxxxxxxx` | Vercel Dashboard → Account Settings → Tokens → Create Token |
| `VERCEL_ORG_ID` | `team_xxxxx` | Vercel Dashboard → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | `prj_xxxxx` | Vercel Dashboard → Project Settings → General → Project ID |

### Google OAuth (Opcional)
| Secret | Valor | Dónde conseguir |
|--------|-------|-----------------|
| `GOOGLE_CLIENT_ID` | `1234567890-abc.apps.googleusercontent.com` | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxx` | Google Cloud Console → APIs & Services → Credentials |

### Email (Opcional - Brevo/Resend/SMTP)
| Secret | Valor | Dónde conseguir |
|--------|-------|-----------------|
| `BREVO_API_KEY` | `xkeysib-xxxxx` | Brevo Dashboard → SMTP & API → API Keys |
| `RESEND_API_KEY` | `re_xxxxx` | Resend Dashboard → API Keys |
| `SMTP_HOST` | `smtp.tu-proveedor.com` | Tu proveedor email |
| `SMTP_USER` | `tu-email@dominio.com` | Tu proveedor email |
| `SMTP_PASSWORD` | `tu-password` | Tu proveedor email |

---

## 📋 Checklist de Configuración

### 1. Supabase (Hacer PRIMERO)
- [ ] Crear proyecto en supabase.com
- [ ] Ejecutar migraciones SQL (ver `backend/migrations/`)
- [ ] Configurar Auth: Email + Google OAuth
- [ ] Storage: Crear bucket `backups` (Private) + políticas RLS
- [ ] Copiar URL, anon key, service_role key

### 2. GitHub Secrets
- [ ] Agregar todos los secrets de arriba en GitHub Repo → Settings → Secrets

### 3. Render (Backend)
- [ ] New Web Service → Connect GitHub repo
- [ ] Build: `pip install -r backend/requirements.txt`
- [ ] Start: `python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`
- [ ] Environment Variables: Agregar todas (usar secrets de GitHub)
- [ ] Auto Deploy: ON

### 4. Vercel (Frontend)
- [ ] Import Project → GitHub repo
- [ ] Framework: Vite
- [ ] Build: `npm run build`
- [ ] Output: `dist`
- [ ] Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`

### 4. Google Cloud Console (Opcional)
- [ ] APIs & Services → Credentials → Create OAuth Client ID
- [ ] Tipo: Web application
- [ ] Authorized redirect URIs:
  - `http://localhost:5173/auth/callback`
  - `https://tu-frontend.vercel.app/auth/callback`
- [ ] Copiar Client ID y Secret a GitHub Secrets

### 5. Verificar Deploy
- [ ] Push a main → CI corre (Actions)
- [ ] Tag `v2.1.1` → Release workflow corre
- [ ] Verificar Release en GitHub con `.exe` y `.zip`
- [ ] Probar frontend en Vercel URL
- [ ] Probar API en Render URL `/api/health`
- [ ] Probar login, chat, alarmas, IA móvil, etc.

---

## 🔄 Flujo de Trabajo

```bash
# Desarrollo local
docker-compose up -d

# Desarrollo sin Docker
cd backend && python run.py
cd frontend && npm run dev

# Nueva versión
echo "2.1.1" > VERSION
# Edita CHANGELOG.md
git add VERSION CHANGELOG.md
git commit -m "chore: v2.1.1"
git tag v2.1.1
git push upstream main
git push upstream v2.1.1
# → GitHub Actions hace todo lo demás
```

---

## 🆘 Troubleshooting

| Problema | Solución |
|----------|----------|
| CI falla en tests | Revisa logs en Actions → corre `python backend/smoke.py` local |
| Render 500 | Logs Render → revisa env vars, `DATABASE_URL` correcta |
| Vercel 404 en refresh | `vercel.json` rewrites configurado |
| Supabase RLS error | Verifica políticas en SQL Editor |
| Google OAuth 400 | Redirect URIs exactos en Google Cloud Console |
| APK no firma | Genera keystore, configura `build.gradle` |
| `ENCRYPTION_KEY` error | Regenera con comando Python arriba |

---

## 📞 Enlaces Útiles

- **Supabase Dashboard**: https://supabase.com/dashboard
- **Render Dashboard**: https://dashboard.render.com
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Google Cloud Console**: https://console.cloud.google.com
- **GitHub Actions**: https://github.com/brayanortiz906-lab/LifeSync-AI/actions
- **GitHub Releases**: https://github.com/brayanortiz906-lab/LifeSync-AI/releases