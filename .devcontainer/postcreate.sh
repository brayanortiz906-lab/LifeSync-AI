#!/usr/bin/env bash
# Prepara el entorno de LifeSync AI dentro del Codespace.
set -euo pipefail

echo "==> Preparando el backend"
cd "$(dirname "$0")/../backend"
python -m venv .venv
. .venv/bin/activate
pip install --upgrade pip >/dev/null
pip install -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Se creo backend/.env a partir de .env.example (revisa APP_SECRET_KEY)"
fi

echo "==> Preparando el frontend"
cd ../frontend
npm install

echo "==> Compilando la interfaz"
npm run build

cat <<'MSG'

LifeSync AI esta listo dentro de Codespaces.

  1) Levanta la API (sirve tambien la interfaz compilada):
       cd backend && . .venv/bin/activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
  2) Abre el puerto 8000 en la pestaña "Ports".

  O bien, en otra terminal, para desarrollo con recarga en caliente:
       cd frontend && npm run dev      (http://localhost:5173)

MSG
