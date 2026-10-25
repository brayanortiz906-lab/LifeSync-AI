# LifeAgente AI · imagen unificada (API FastAPI + interfaz compilada)
# Uso:  docker build -t lifeagente-ai .   &&   docker run -p 8000:8000 --env-file .env lifeagente-ai
# Despliegue: Render, Railway, Fly.io, Cloud Run

# ---------- Etapa 1: compilar la interfaz ----------
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
ARG VITE_API_URL=""
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---------- Etapa 2: API + interfaz ----------
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencias del sistema
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install -r backend/requirements.txt

# App code
COPY backend/app ./backend/app

# Frontend compilado
COPY --from=web /web/dist ./frontend/dist

# Variables de entorno (se sobreescriben con --env-file o en plataforma)
ENV DATABASE_URL="postgresql+asyncpg://postgres:password@db.supabase.co:6543/postgres" \
    SUPABASE_URL="https://xxx.supabase.co" \
    SUPABASE_ANON_KEY="anon-key" \
    SUPABASE_SERVICE_ROLE_KEY="service-role-key" \
    ENCRYPTION_KEY="32-bytes-base64-fernet-key" \
    GEMINI_API_KEY="" \
    ENVIRONMENT="production" \
    DEBUG="false" \
    FRONTEND_URL="https://tu-dominio.com" \
    CORS_ORIGINS='["https://tu-dominio.com"]' \
    CRON_TOKEN="cron-secret-token" \
    GOOGLE_CLIENT_ID="" \
    GOOGLE_CLIENT_SECRET=""

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]