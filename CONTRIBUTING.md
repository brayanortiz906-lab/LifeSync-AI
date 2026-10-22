# Cómo contribuir a LifeAgente AI

¡Gracias por querer mejorar el proyecto! Esto es lo que necesitas saber.

## 1. Ponlo a correr en tu equipo

```powershell
git clone https://github.com/brayanortiz906-lab/LifeSync-AI.git
cd LifeSync-AI

# API
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# Interfaz (en otra terminal)
cd frontend
npm install
npm run dev
```

Más opciones (instalador `.exe`, Docker, Codespaces) en
[`MANUAL-LOCAL.md`](MANUAL-LOCAL.md).

## 2. Antes de tocar nada: las reglas del proyecto

| Regla | Por qué |
|---|---|
| **Todo en español** (código, comentarios, textos) | es la lingua franca del proyecto |
| **Nada de caracteres chinos** (CJK) | hay un escaneo automático que lo bloquea |
| El System Prompt manda | si el agente se porta mal, se arregla en `shared/system_prompt.txt`, no en el código |
| `Depends(get_db, scope="function")` en **todos** los routers | si no, el `commit` llega tarde y un `GET` inmediato no ve la fila recién escrita |
| Fechas con `aIso(new Date())` | `toISOString()` es UTC y desplaza el día |
| Toda escritura necesita su respaldo | el respaldo a Drive solo guarda lo que se le dice |
| **La IA nunca escribe en la base de datos** | emite intenciones tipadas (JSON); el código las ejecuta |

## 3. Antes de abrir un PR: comprueba

```powershell
# 1. Las 157  comprobaciones del sistema
backend\.venv\Scripts\python.exe backend\smoke.py

# 2. Que la interfaz compila sin errores de tipos
cd frontend; npm run build; cd ..

# 3. Que no hay caracteres CJK ni doble codificacion
#    (el CI tambien lo revisa)
```

Mensaje de commit estilo Conventional Commits:

```
feat(agenda): Adds the week view on mobile
fix(cuentas): Fixes the 500 when restoring a snapshot
docs: Updates the deployment guide
```

## 4. Dónde tocar cada cosa

| Quiero… | Archivo |
|---|---|
| Cambiar cómo razona el agente | `shared/system_prompt.txt` |
| Añadir una fuente de datos | `backend/app/routers/` + `backend/app/models.py` |
| Añadir un proveedor de IA | `backend/app/connections.py` + `backend/app/providers.py` |
| Cambiar una regla de gobierno (umbrales, aprobaciones) | `backend/app/policy.py` |
| Cambiar el aspecto de la interfaz | `frontend/src/index.css` + `frontend/src/components/ui.tsx` |
| Añadir una pantalla | `frontend/src/components/` + `frontend/src/App.tsx` |
| Escribir documentación | `docs/` + el índice `docs/00-INDICE.md` |

## 5. Antes de abrir un issue

- Si es un **error**, usa la plantilla de *Bug report* y pega la salida de
  `GET /api/diagnostico` (eso dice si el problema es de la base de datos).
- Si es una **idea**, usa la plantilla de *Idea*.
- **Nunca pegues tokens ni claves de IA** en un issue (ver
  [`SECURITY.md`](SECURITY.md)).

## 6. Código de conducta

Sé amable, respeta la privacidad de los demás y trabaja sobre el issue
asignado. Este proyecto trata datos personales: Think before you commit.

---

Licencia MIT. Ver [`LICENSE`](LICENSE).
