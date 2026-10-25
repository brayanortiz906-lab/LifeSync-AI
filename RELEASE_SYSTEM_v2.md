# Sistema de Releases v2.x - LifeAgente AI

## 📍 Estado Actual

**Releases Actuales:**
- ❌ `v1.5.0` (Latest) - Sistema legado desktop (.exe, .apk)
- ✅ `v2.2.0` (Tag creado) - **Nueva arquitectura web** (pendiente de release automático)

## 🔄 Cambios en el Sistema de Releases

### Antes (v1.x - Sistema Legacy Desktop)
```
Tag v1.x → Build .exe (Windows) → Build .apk (Android) → Source ZIP
└─ PyInstaller + Capacitor 6.1
└─ Archivos binarios pesados
└─ Instalación local
```

### Ahora (v2.x - Sistema Web Primario)
```
Tag v2.x → Build Frontend → Release GitHub Web
└─ React + Vite build
└─ Assets estáticos en GitHub Releases
└─ Documentación de deploy
└─ $0/mes en Render/Vercel/Supabase
```

## 📦 Workflows Actualizados

### 1. `release.yml` (Activo para v2.x)
- **Trigger**: Tags `v2.*`
- **Build**: Solo frontend (React Vite)
- **Release**: Notas automáticas + assets web
- **Costo**: $0 (GitHub Actions minutos gratuitos)

### 2. `web-release.yml` (Nuevo)
- **Trigger**: Tags `v2.*`
- **Build**: Frontend con secrets opcionales
- **Release**: Documentación completa de deploy
- **Extras**: Archive de código fuente

### 3. `build-installer.yml` (Legacy v1.x)
- **Trigger**: Tags `v*` (incluye v1.x y v2.x)
- **Build**: .exe + .apk (si existen)
- **Status**: Obsoleto para v2.x

### 4. `build-apk.yml` (Legacy v1.x)
- **Trigger**: Manual o tag
- **Build**: Android APK
- **Status**: No aplicable a v2.x web

## 🎯 Tareas Pendientes para Completar v2.2.0

### ✅ Completado
1. ✅ Tag v2.2.0 creado y actualizado
2. ✅ Workflows actualizados para web
3. ✅ README actualizado para arquitectura web
4. ✅ CHANGELOG actualizado con v2.2.0
5. ✅ Glassmorphism UI implementado
6. ✅ Legal compliance (19 items)
7. ✅ COPPA parental consent
8. ✅ Dockerfiles corregidos

### ⏳ Pendiente (Requiere acción manual)
1. ⏳ **GitHub Actions ejecutar release** - Esperar 2-5 min tras push tag
2. ⏳ Configurar env vars Render (12 variables)
3. ⏳ Configurar env vars Vercel (4 variables)
4. ⏳ Google OAuth Client ID/Secret
5. ⏳ Brevo/Resend API Key
6. ⏳ Ejecutar migraciones Supabase 001-004
7. ⏳ Revocar tokens GitHub expuestos

## 📊 Comparativa v1.x vs v2.x

| Característica | v1.x (Legacy) | v2.x (Web) |
|----------------|---------------|------------|
| **Arquitectura** | Desktop .exe / .apk | Web PWA / React |
| **Backend** | SQLite local | Supabase (PostgreSQL) |
| **Auth** | Local | Supabase Auth |
| **IA** | Local + online | Gemini BYOK |
| **Deploy** | Manual | Render + Vercel |
| **Costo** | $0 (local) | $0/mes (free tier) |
| **Costo real** | $0 | $0 |
| **Escalabilidad** | Limitada | Ilimitada |
| **Releases** | Binarios .exe/.apk | Web assets + docs |
| **Actualización** | Manual | Automática (CDN) |
| **Cross-platform** | Parcial | Sí (web) |

## 🚀 Cómo Funciona Ahora

### Para Desarrolladores
```bash
# Clonar y desarrollar
git clone https://github.com/brayanortiz906-lab/LifeSync-AI.git
cd LifeSync-AI

# Backend local
cd backend
python run.py

# Frontend local
cd frontend
npm run dev
```

### Para Deploy Producción
```bash
# 1. Render (Backend)
# Deploy automático desde GitHub
# Variables: SUPABASE_URL, DATABASE_URL, ENCRYPTION_KEY, etc.

# 2. Vercel (Frontend)
# Deploy automático desde GitHub
# Variables: VITE_SUPABASE_URL, VITE_API_URL, etc.

# 3. Supabase
# Ejecutar migraciones SQL
# Crear bucket backups
# Configurar RLS policies
```

### Para Crear Release
```bash
# Incrementar VERSION
echo "2.2.1" > VERSION

# Actualizar CHANGELOG.md

# Commit y tag
git add .
git commit -m "feat: v2.2.1 - new features"
git tag v2.2.1
git push origin main --tags

# GitHub Actions crea release automáticamente
```

## 📝 Formato de Release Notes v2.x

```
# 🌐 LifeAgente AI v2.x - Web App

**Arquitectura Web-Primero** | Supabase + Render + Vercel + Gemini BYOK

## 🚀 ¿Cómo usar?

### 🌐 Web App (Recomendado)
1. Visita: https://lifeagente.vercel.app
2. Entra con Supabase Auth
3. Activa tu Gemini API key

## 🔧 Configuración Producción
- Backend (Render): Variables de entorno
- Frontend (Vercel): Variables de entorno
- Supabase: Migraciones SQL

## ✨ Nuevas funcionalidades
[Lístage del CHANGELOG]

## 📋 Checklist Deploy
- [ ] Variables configuradas
- [ ] Google OAuth
- [ ] Brevo API Key
- [ ] Migraciones ejecutadas
```

## 🔗 Enlaces Importantes

- **Repo**: https://github.com/brayanortiz906-lab/LifeSync-AI
- **Releases**: https://github.com/brayanortiz906-lab/LifeSync-AI/releases
- **Web App**: https://lifeagente.vercel.app (próximamente)
- **Supabase**: https://supabase.com/dashboard/project/yitkwdveaksiabppwuck
- **Render**: https://dashboard.render.com
- **Vercel**: https://vercel.com/dashboard

## 📞 Soporte

- **Issues**: https://github.com/brayanortiz906-lab/LifeSync-AI/issues
- **Docs**: Ver README.md y CHANGELOG.md
- **Changelog**: https://github.com/brayanortiz906-lab/LifeSync-AI/blob/main/CHANGELOG.md

---

**Última actualización**: 25 octubre 2026
**Versión actual**: v2.2.0
**Estado**: ✅ Sistema de releases actualizado para arquitectura web
