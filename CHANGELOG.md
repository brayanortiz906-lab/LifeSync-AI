# Registro de cambios de LifeAgente AI

Todas las versiones se publican en la pagina de **Releases** de GitHub:
<https://github.com/brayanortiz906-lab/LifeSync-AI/releases>

La version vive en un solo sitio: el archivo **`VERSION`** de la raiz del repositorio.
La app, el instalador `.exe` y las Releases de GitHub muestran la misma.

---

## v2.1.0 - Fusión completa v1.x + v2.x + APK/EXE automáticos (23 oct 2026)

### 🎯 Fusión total: Lo mejor de v1.x + v2.x en una sola arquitectura

**Supabase + Gemini BYOK (v2.x) + Features completas v1.x (IA local, IA gratis, móvil, alarmas, Google Sign-In, paneles, permisos, IA responsable)**

---

### 🏗️ Backend (FastAPI + Supabase + asyncpg)

| Archivo | Función |
|---------|---------|
| `app/auth/` | Supabase Auth: JWT, Magic Links, OAuth Google/GitHub, refresh, verify_jwt |
| `app/services/gemini.py` | **Gemini BYOK**: streaming SSE, Function Calling (crear eventos/tareas/buscar), system prompts |
| `app/services/ia_local.py` | **IA Local**: 18 motores (Ollama, LM Studio, Jan, vLLM, MLX, etc.), detección, descarga con progreso |
| `app/services/ia_gratis.py` | **IA Gratis**: 11 servicios (Pollinations, Groq, OpenRouter, HuggingFace, Cohere, Together, DeepInfra, Perplexity, NVIDIA, Gemini), 12 agentes predefinidos |
| `app/services/ia_movil.py` | **IA Móvil**: detección RAM/CPU/GPU → recomendación modelo, descarga con progreso SSE |
| `app/services/storage.py` | Supabase Storage: backups encriptados (gzip), URLs firmadas, bucket `backups` con RLS |
| `app/services/backup.py` | Backup completo/restauración (eventos, tareas, paneles, chats, permisos) |
| `app/routers/chat.py` | Chat SSE streaming con Gemini BYOK, historial, tokens |
| `app/routers/auth.py` | Supabase Auth endpoints: register, login, magic-link, OAuth, reset password |
| `app/routers/accounts.py` | Perfil, API keys BYOK (encriptadas Fernet), test keys, proveedores |
| `app/routers/events.py` | CRUD eventos + Google Calendar sync |
| `app/routers/tasks.py` | CRUD tareas + bulk update/delete, prioridades, paneles |
| `app/routers/panels.py` | Paneles Kanban + permisos (ver/editar/admin) + públicos por código |
| `app/routers/backups.py` | Backups automáticos + manuales + restore con overwrite |
| `app/ia_local.py` | Motor reglas local (sin red): fechas, horas, montos, categorías, plantillas |
| `app/ia_gratis.py` | 11 servicios gratis + 12 agentes (planner, analyst, writer, coder, etc.) |
| `app/ia_movil.py` | Detección hardware → recomendación modelo, descarga progreso |
| `app/crypto.py` | Fernet encrypt/decrypt para API keys BYOK |
| `app/supabase_client.py` | Admin client (service_role) + Public client (anon) |
| `app/database.py` | asyncpg + SQLAlchemy 2.0 + RLS context via middleware |
| `app/models.py` | 10 modelos UUID + RLS ready + relaciones |

---

### 🎨 Frontend (React 19 + Vite + Zustand + Tailwind)

| Archivo | Función |
|---------|---------|
| `lib/supabase.ts` | Supabase JS client (browser) con PKCE, auto-refresh |
| `lib/api.ts` | API client con Bearer token, SSE streaming para chat |
| `store/useAuthStore.ts` | Zustand auth: signUp, signIn, OAuth, magic-link, signOut, updateProfile |
| `hooks/useSupabaseAuth.ts` | Route protection, auth state sync |
| `hooks/useGeminiChat.ts` | Chat SSE streaming, create/load/delete chats, streaming tokens |
| `components/Chat/ChatInterface.tsx` | UI chat completa: sidebar, streaming, markdown, tokens, modelo badge |
| `components/GoogleSignInButton.tsx` | Botón "Sign in with Google" usando Google Identity Services (GIS) |
| `components/PanelIaMovil.tsx` | **IA Móvil**: detección hardware, recomendación, descarga con progreso |
| `components/BloqueIaLigera.tsx` | **IA Ligera**: catálogo modelos por RAM, descarga con progreso SSE |
| `components/PanelAlarmas.tsx` | **Alarmas**: CRUD, repetir, sonidos, notificaciones nativas, vibración |
| `components/BotonInstalar.tsx` | **PWA Install**: banner inteligente, beforeinstallprompt, standalone detection |
| `pages/Login.tsx` / `Register.tsx` / `AuthCallback.tsx` / `ResetPassword.tsx` | Auth pages completas |
| `pages/Settings.tsx` | 5 tabs: Perfil, IA (BYOK), Notificaciones, Apariencia, Seguridad |
| `pages/Dashboard.tsx` | Layout con sidebar colapsable, navegación, user menu |

---

### 📱 Capacitor (APK nativo Android)

| Archivo | Función |
|---------|---------|
| `capacitor.config.json` | Config completa: appId, plugins, Android/iOS, permissions, splash, status bar |
| `capacitor-build.ps1` | Script build completo: npm ci → build → cap sync → gradle assembleRelease |
| `package.json` | Capacitor 6.1: core, android, ios, plugins (notifications, splash, keyboard, etc.) |

---

### 🔧 CI/CD GitHub Actions

| Workflow | Trigger | Qué hace |
|----------|---------|----------|
| `release.yml` | Tag `v*` | Build .exe (Windows), source ZIP, crea Release en GitHub |
| `ci.yml` | Push/PR main | Backend smoke tests + imports, Frontend build + typecheck |

---

### 📦 Deploy Gratis ($0/mes)

| Servicio | Plan | Uso |
|----------|------|-----|
| **Supabase** | Free | Auth + DB (500MB) + Storage (1GB) + Realtime (50K MAU) |
| **Render/Railway** | Free | FastAPI Backend (512MB RAM) |
| **Vercel/Netlify** | Free | React Frontend (100GB bandwidth) |
| **Gemini API** | Free | 1500 req/día, 1M tokens/min |

---

### 🧪 Smoke Tests v2.1.0

- Tests existentes v1.x (167 checks) adaptados a rutas `/api/v1/`
- Nuevos tests: Supabase Auth, Gemini BYOK, IA Local, IA Gratis, IA Móvil, Alarmas, Alarmas nativas, PWA Install, Capacitor config
- Rutas actualizadas a `/api/v1/...` + health en `/api/health`

---

### 🐛 Fixes y mejoras

- **RLS middleware** en lugar de event listener (mejor para async)
- **Health endpoint** en `/api/health` con info completa
- **CORS** incluye `capacitor://localhost` para APK
- **Rutas limpias**: routers sin prefijo `/api` duplicado
- **Google Sign-In** con GIS (ID token) en frontend + backend
- **Motor reglas local** 100% offline en navegador
- **Notificaciones nativas** + vibración en alarmas
- **PWA Install banner** inteligente con beforeinstallprompt
- **Descargas con progreso SSE** para modelos IA

---

## v2.0.1 - Instalador .exe automático + CI/CD completo (23 oct 2026)

### Automatización total de releases

- **GitHub Actions workflows** completos: `release.yml` (build .exe + source ZIP en tag push) y `ci.yml` (tests + build check en push/PR).
- **Instalador .exe actualizado** (`desktop/LifeAgente.spec`) con todos los módulos v2.0: Supabase Auth, Gemini BYOK, routers nuevos, asyncpg, cryptography.
- **Release automático**: al pushear tag `v*`, compila .exe en Windows runner, crea source ZIP, publica Release en GitHub con ambos archivos y body del CHANGELOG.
- **CI en cada push**: tests backend (smoke + imports v2.0), build frontend (Vite + TypeScript), lint opcional.

### Correcciones y mejoras

- `.spec` limpio: eliminados módulos v1.x obsoletos (`app.cuentas`, `app.permisos`, `app.ia_local`, `app.routers.cuentas`, etc.), añadidos v2.0 (`app.auth.*`, `app.services.*`, `app.routers.*`, `supabase`, `google.generativeai`, `asyncpg`).
- Workflows listos para plan gratuito: runners ubuntu-latest + windows-latest, timeouts ajustados, artifacts con retención 90 días.

---

## v2.0.0 - Migración completa a Supabase + Gemini BYOK (23 oct 2026)

### Cambio de arquitectura total: $0/mes en plan gratuito

- **Supabase Auth** reemplaza al auth propio: JWT estándar, Magic Links, OAuth (Google, GitHub, GitLab), refresh automático, reset password seguro.
- **PostgreSQL + Row Level Security (RLS)**: aislamiento total por usuario a nivel de base de datos (imposible de bypassear). UUID v4 en todas las tablas.
- **Supabase Storage** para backups: bucket `backups` privado con políticas RLS por usuario, URLs firmadas (1h), compresión gzip.
- **Gemini BYOK (Bring Your Own Key)**: cada usuario trae SU propia API key de Google AI Studio, encriptada con Fernet en el servidor. Nada de keys globales.
- **Streaming SSE** en chat: respuestas token a token en tiempo real.
- **Function Calling**: Gemini puede crear eventos, tareas, buscar notas vía tools.

### Backend (FastAPI + SQLAlchemy 2.0 + asyncpg)
- `app/auth/` — Supabase Auth integration (verify_jwt, create_user, update_user, magic_link, oauth_url)
- `app/services/gemini.py` — GeminiService BYOK, streaming, function calling, system prompts
- `app/services/storage.py` — SupabaseStorage (upload/download/list/delete backups)
- `app/services/backup.py` — BackupService (full backup + restore con overwrite opcional)
- `app/routers/` — auth, chat, accounts, events, tasks, panels, backups (REST + SSE)
- `app/crypto.py` — Fernet encrypt/decrypt para API keys de usuarios
- `app/supabase_client.py` — Admin client (service_role) + Public client (anon)
- `app/database.py` — asyncpg + NullPool + RLS context via ContextVar + SET LOCAL
- `app/models.py` — 10 modelos: Usuario, Evento, Tarea, Panel, PermisoPanel, Backup, Chat, MensajeChat, EventType
- `app/config.py` — Settings centralizadas sin GEMINI_API_KEY global, ENCRYPTION_KEY para BYOK

### Frontend (React 19 + Vite + Zustand + Tailwind)
- `lib/supabase.ts` — Supabase JS client (browser) con PKCE, auto-refresh
- `store/useAuthStore.ts` — Zustand auth store (signUp, signIn, signInWithOAuth, magicLink, signOut, updateProfile)
- `hooks/useSupabaseAuth.ts` — Route protection, auth state sync
- `hooks/useGeminiChat.ts` — Chat con streaming SSE, historial, create/load/delete chats
- `components/Chat/ChatInterface.tsx` — UI completa: sidebar chats, streaming, markdown, tokens
- `pages/` — Login, Register, AuthCallback, ResetPassword, Dashboard, Settings (5 tabs)
- `App.tsx` — PublicRoute / ProtectedRoute, QueryClientProvider
- `index.css` — CSS variables para theming (light/dark/system), markdown styles

### Deploy gratis (sin tarjeta)
| Servicio | Plan | Uso |
|----------|------|-----|
| Supabase | Free | Auth + DB (500MB) + Storage (1GB) + Realtime (50K MAU) |
| Render/Railway | Free | FastAPI Backend (512MB RAM) |
| Vercel/Netlify | Free | React Frontend (100GB bandwidth) |
| Gemini API | Free | 1500 req/día, 1M tokens/min |

### Migración de datos
- Tablas nuevas con UUID + FK + índices + RLS policies
- Trigger `handle_new_user` crea perfil al registrarse
- Backup v2.0 exporta/importa: eventos, tareas, paneles, permisos, chats, mensajes

---

## v1.5.0 - La guia de las cuentas DENTRO de la app (y un boton que comprueba el identificador)

### Que quedaba: "no me deja entrar con Google / Hotmail / GitHub"

- **Guia paso a paso dentro de la app** (en *Conectar IA > Ajustes tecnicos > Entrar con Google, Outlook o GitHub*): los 6 pasos exactos de cada proveedor, con el enlace a su consola y que copiar. Sin tecnicismos.
- **Boton "Comprobar"**: antes de guardar, la app pregunta al propio proveedor si el identificador sirve. Si esta mal copiado, lo dice claro ("Ese ID de cliente no existe...") y no se guarda nada.
- En una **instalacion local** (la que se descarga), el usuario local es el dueno de la maquina y puede activar las cuentas sin buscar un administrador.
- Las tarjetas de Google / Outlook / GitHub ya se ven tambien en la **pantalla de bienvenida** de la version local.

### Lo demas

- El Drive tiene siempre salida: si no esta autorizado, "Descargar y subir a Drive" (abre el uploader de Google) o "Activar el acceso a Google".
- La vista del celular empieza por "Tu dia de un vistazo" y el panel "IA de tu movil" recomienda el modelo segun la RAM y los nucleos del aparato.
- 167 comprobaciones automaticas (2 nuevas: la activacion responde y un identificador falso se rechaza con mensaje claro).

## v1.4.0 - Entrar con Google, Outlook o GitHub (para toda la gente) + IA del movil

### Las cuentas de verdad, activables desde la app

- Nuevo bloque **"Entrar con Google, Outlook o GitHub"** en *Conectar IA > Ajustes tecnicos*: tres campos, enlace directo a la consola de cada proveedor y un boton **"Guardar y activarlo para todos"**.
- Los identificadores son **publicos** (no son secretos) y se guardan en la configuracion del servidor: valen para toda la gente que use el sistema.
- **La primera cuenta de una instalacion nueva nace administradora**, asi el dueno puede activarlo sin tocar variables de entorno.
- El mensaje de error ya no culpa al usuario: "Lo activa el dueno de la app en un solo paso... No te frena: entra con tu correo y tu contrasena, o sigue usando LifeAgente aqui".
- Las tarjetas de Google / Outlook / GitHub **tambien** se ven en la version local.

### Drive siempre tiene salida

- Si Drive no esta autorizado, el panel de cuenta **no muestra un error seco**: ofrece **"Descargar y subir a Drive"** (descarga el respaldo y abre el uploader de Google: dos toques) y **"Activar el acceso a Google"**.

### IA para el celular, segun sus recursos

- Nuevo panel **"IA de tu movil"**: detecta la RAM y los nucleos y **recomienda siempre un modelo primero**.
  - menos de 3 GB -> `qwen2.5:0.5b` (400 MB, solo texto, el que mejor gasta la bateria)
  - 3 a 6 GB -> `llama3.2:1b` (1,3 MB -> 1,3 GB, equilibrio)
  - 6 GB o mas -> `gemma3:1b` (815 MB, la mas capaz que cabe)
- Barra de progreso real de la descarga, aviso honesto del **permiso de notificaciones** y la nota: solo IAs que corren en tu propio aparato (no gastan datos, no dependen de internet).

### El movil, mas amigable

- La vista del celular empieza por **"Tu dia de un vistazo"** (las 3 lineas) y luego calendario, IA del movil, cosas de local y avisos.