# LifeAgente AI v2.0

**Asistente Integral de Vida y Productividad** — centraliza la rutina diaria, los estudios y las finanzas/mantenimiento personal mediante un agente conversacional con **Gemini (BYOK)** que planifica, reorganiza tu agenda ante imprevistos y registra lo que te pasa en lenguaje natural.

## 🆕 Novedades v2.0 - Migración a Supabase + Gemini

| Antes (v1.x) | Ahora (v2.0) |
|--------------|--------------|
| Auth propio (email/password + Google Device Flow) | **Supabase Auth** (email/password + Magic Link + Google/GitHub OAuth) |
| SQLite local / PostgreSQL propio | **Supabase PostgreSQL** con **Row Level Security (RLS)** |
| Google Drive para backups | **Supabase Storage** (bucket privado con RLS) |
| Múltiples proveedores IA + local | **Gemini BYOK** (cada usuario trae su API key) |
| 167 tests legacy | Arquitectura limpia, preparada para tests nuevos |

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Supabase JS │  │ Zustand     │  │ API Client (Fetch)      │ │
│  │ Client      │  │ Store       │  │ → Backend (FastAPI)     │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
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
│  │              FASTAPI BACKEND (Render/Railway)            │   │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────┐             │   │
│  │  │ Supabase │  │ SQLAlchemy │  │ Gemini   │             │   │
│  │  │ Admin    │  │ + asyncpg  │  │ (google- │             │   │
│  │  │ Client   │  │            │  │ genai)   │             │   │
│  │  └──────────┘  └────────────┘  └──────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Inicio Rápido

### Prerrequisitos
- Cuenta en [Supabase](https://supabase.com) (gratis, sin tarjeta)
- Cuenta en [Google AI Studio](https://aistudio.google.com/apikey) para Gemini API key
- Node.js 20+ y Python 3.11+

### 1. Configurar Supabase
```bash
# En Supabase Dashboard:
# 1. Crear proyecto "lifeagente"
# 2. SQL Editor → Ejecutar migraciones (ver backend/migrations/)
# 3. Storage → New bucket "backups" (Private) + políticas RLS
# 4. Auth → Providers → Habilitar Email + Google OAuth
# 5. Settings → API → Copiar URL, anon key, service_role key
```

### 2. Backend
```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales Supabase
# ENCRYPTION_KEY: genera con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

pip install -r requirements.txt
python run.py  # http://localhost:8000/docs
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
# Editar .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY

npm install
npm run dev  # http://localhost:5173
```

### 4. Usuario: añadir Gemini API Key
1. Ir a **Ajustes > IA (BYOK)**
2. Click "Obtener key" → [Google AI Studio](https://aistudio.google.com/apikey)
3. Pegar key → "Probar" → "Guardar"
4. Ir a **Chat** → Empezar a conversar

---

## 📦 Despliegue Gratis (Plan Free Tier)

| Servicio | Plan | Límites | Uso |
|----------|------|---------|-----|
| **Supabase** | Free | 500MB DB, 1GB Storage, 50K MAU | Auth + DB + Storage + Realtime |
| **Render/Railway** | Free | 512MB RAM, sleep 15min | FastAPI Backend |
| **Vercel/Netlify** | Free | 100GB bandwidth | React Frontend |
| **Gemini API** | Free | 1500 req/día, 1M tokens/min | IA Chat |

**Total: $0/mes** ✅

### Render (Backend)
```bash
# Conectar repo → New Web Service
# Build: pip install -r backend/requirements.txt
# Start: python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT
# Env vars: todas las de backend/.env
```

### Vercel (Frontend)
```bash
# Importar repo → Framework: Vite
# Build: npm run build
# Output: dist
# Env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
```

---

## 🔐 Características Principales

### Autenticación (Supabase Auth)
- ✅ Email/Password con confirmación
- ✅ Magic Links (login sin password)
- ✅ OAuth: Google, GitHub, GitLab
- ✅ JWT tokens con refresh automático
- ✅ Reset password seguro

### Base de Datos (PostgreSQL + RLS)
- ✅ Aislamiento total por usuario (`usuario_id` en todas las tablas)
- ✅ Políticas RLS a nivel de base de datos (imposible de bypassear)
- ✅ UUID v4 como PK en todas las tablas
- ✅ Migraciones versionadas

### Almacenamiento (Supabase Storage)
- ✅ Backups encriptados y comprimidos (gzip)
- ✅ Bucket privado con políticas RLS por usuario
- ✅ URLs firmadas para descarga segura (1h)

### IA (Gemini BYOK)
- ✅ Cada usuario usa SU propia API key (encriptada con Fernet)
- ✅ Streaming SSE para respuestas en tiempo real
- ✅ Function Calling: crear eventos, tareas, buscar notas
- ✅ Modelos: gemini-1.5-flash, gemini-1.5-pro, gemini-1.5-flash-8b
- ✅ System prompts personalizables por chat

### Frontend (React 19 + Vite)
- ✅ Zustand para estado global (auth, chat, UI)
- ✅ TanStack Query para cacheo de datos
- ✅ Tailwind CSS para estilos
- ✅ PWA instalable
- ✅ Rutas protegidas con Supabase Auth

---

## 📁 Estructura del Proyecto

```
lifeagente/
├── backend/
│   ├── app/
│   │   ├── auth/           # Supabase Auth integration
│   │   ├── services/       # Gemini, Storage, Backup
│   │   ├── routers/        # auth, chat, accounts, events, tasks, panels, backups
│   │   ├── config.py       # Settings (pydantic-settings)
│   │   ├── database.py     # asyncpg + SQLAlchemy 2.0 + RLS context
│   │   ├── models.py       # 10 modelos UUID + relaciones
│   │   ├── crypto.py       # Fernet encrypt/decrypt
│   │   ├── supabase_client.py
│   │   └── main.py         # FastAPI app + CORS + lifespan
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── lib/            # supabase.ts, api.ts
│   │   ├── store/          # useAuthStore.ts
│   │   ├── hooks/          # useSupabaseAuth.ts, useGeminiChat.ts
│   │   ├── components/     # ChatInterface, UI components
│   │   ├── pages/          # Login, Register, Dashboard, Settings, AuthCallback
│   │   ├── App.tsx         # Routing + providers
│   │   └── index.css       # Global styles + theme variables
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── .env
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## 🧪 Desarrollo

### Backend
```bash
cd backend
pip install -r requirements.txt
# Tests: pytest (cuando se añadan)
python run.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # Desarrollo
npm run build    # Producción (genera dist/)
npm run preview  # Preview build
```

### Docker (todo en uno)
```bash
docker build -t lifeagente .
docker run -p 8000:8000 --env-file backend/.env lifeagente
```

---

## 📋 Roadmap v2.x

- [ ] Tests automatizados (pytest + vitest + playwright)
- [ ] Notificaciones push (Supabase Realtime + Service Workers)
- [ ] Google Calendar sync (opcional, OAuth)
- [ ] Búsqueda semántica con embeddings (Gemini + pgvector)
- [ ] Modo offline completo (IndexedDB + sync)
- [ ] App móvil (Capacitor) / Desktop (Tauri)
- [ ] Multi-idioma (i18n)

---

## 🤝 Contribuir

1. Fork del repo
2. Crear rama: `git checkout -b feature/nueva-funcion`
3. Commit: `git commit -m "feat: nueva función"`
4. Push: `git push origin feature/nueva-funcion`
5. Abrir Pull Request

---

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE)

---

## 🙏 Agradecimientos

- [Supabase](https://supabase.com) - Backend-as-a-Service increíble
- [Google AI Studio](https://aistudio.google.com) - Gemini API gratis
- [Render](https://render.com) / [Vercel](https://vercel.com) - Hosting gratis
- [FastAPI](https://fastapi.tiangolo.com) / [React](https://react.dev) - Frameworks base