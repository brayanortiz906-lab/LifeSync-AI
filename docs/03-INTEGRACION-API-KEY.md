# 03 — Integración de API Key (BYOK)

> **Modelo:** *Bring Your Own Key*. El usuario pega su propia key de OpenAI, Google Gemini o
> usa el proveedor `mock` local. LifeAgente **nunca** cobra ni revende tokens, y **no** expone
> keys de terceros.

---

## 1. Resumen del flujo en 4 pasos

| # | Paso | Dónde se hace | Efecto |
|---|---|---|---|
| 1 | El usuario pega su key en **Configuración → Conectar IA** | `frontend/src/components/SettingsModal.tsx` | Se guarda en `localStorage` (`lifesync.apiKey`) |
| 2 | Cada chat envía la key en el cuerpo (`api_key`) o el backend usa la cifrada en la BD | `frontend/src/store/useLifeAgente.ts` → `POST /api/agent/chat` | `providers.complete()` la usa para llamar al proveedor |
| 3 | Si el usuario marca "recordar en el servidor", la key se **cifra con Fernet** y se guarda en `app_settings.api_key_cifrada` | `backend/app/routers/agent.py` (`PUT /api/settings`) → `backend/app/security.py` | Sobrevive al recargar el navegador |
| 4 | El backend llama a OpenAI o Gemini por HTTP directo | `backend/app/providers.py` | La key nunca sale de tu máquina |

---

## 2. Paso a paso para el usuario final

### Paso 1 — Obtener la key

| Proveedor | Dónde | Modelo sugerido (en `Configuración`) |
|---|---|---|
| OpenAI | https://platform.openai.com/api-keys | `gpt-4o-mini` (barato) o `gpt-4o` (mejor razonamiento) |
| Google Gemini | https://aistudio.google.com/apikey | `gemini-2.0-flash` (barato) o `gemini-2.0-pro` |
| Sin key | — | `mock` — clasificador local por reglas, **gratis e instantáneo** |

### Paso 2 — Pegarla en la app

1. Click en **"Conectar IA"** (arriba a la derecha, en `TopBar`).
2. Elige el proveedor: `mock` / `openai` / `gemini`.
3. Escribe o pega la key en el campo **API Key** (se muestra como contraseña; botón con ojo para revelar).
4. Elige el modelo (el campo tiene autocompletado con `datalist`).
5. Opcional: marca **"recordar en el servidor (cifrada)"**.
6. Click en **Guardar**.

### Paso 3 — Verificar

- El chip de proveedor en la barra superior cambia a `openai`/`gemini` con el modelo activo.
- En `Configuración` verás *"Key guardada y cifrada"* o *"Key solo en este navegador"*.
- Escribe en el chat: *"Tengo una cita hoy a las 3 PM"* → debe responder con el bloque movido.
- Si algo falla, el backend devuelve HTTP 502 con el detalle del proveedor.

### Paso 4 — Cambiar o borrar

- Cambiar de key: pega la nueva y guarda (sobrescribe).
- Borrar: `PUT /api/settings` con `{"borrar_api_key": true}` (la UI lo dispara al desmarcar y guardar).
- Verificar que quedó borrada: `GET /api/settings` → `tiene_api_key: false`.

---

## 3. Paso a paso para el desarrollador (integración real)

### 3.1 Configuración del backend

`backend/.env` (copia de `.env.example`):

```dotenv
APP_SECRET_KEY=cambia-esto-por-una-cadena-aleatoria-larga
DATABASE_URL=sqlite:///./lifesync.db

DEFAULT_LLM_PROVIDER=mock          # mock | openai | gemini
DEFAULT_OPENAI_MODEL=gpt-4o-mini
DEFAULT_GEMINI_MODEL=gemini-2.0-flash
DEFAULT_CURRENCY=COP

DAY_START=07:00
DAY_END=22:00

CORS_ORIGINS=http://localhost:5173
```

> `APP_SECRET_KEY` **es lo único** que protege las keys cifradas en la BD. Si lo pierdes, las
> keys guardadas son irrecuperables (hay que pegarlas de nuevo). Si lo filtras, regenera y
> vuelve a cifrar.

Genera una key segura:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 3.2 Dónde se guarda la key

| Momento | Ubicación | Cifrado | Persiste |
|---|---|---|---|
| Solo en el navegador | `localStorage["lifesync.apiKey"]` | ❌ | Hasta borrar datos del navegador |
| "Recordar en el servidor" | `app_settings.api_key_cifrada` (SQLite) | ✅ Fernet | Sí |

**Fernet** (`backend/app/security.py`): clave derivada con `SHA-256(APP_SECRET_KEY)`; cifrado
simétrico AEAD con autenticación. La key en claro **nunca** se escribe en la BD ni en los logs.

### 3.3 El contrato de las llamadas salientes

| Proveedor | Endpoint | Autenticación | Forzar JSON |
|---|---|---|---|
| OpenAI | `POST https://api.openai.com/v1/chat/completions` | `Authorization: Bearer <key>` | `response_format: {"type":"json_object"}` |
| Gemini | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | header `x-goog-api-key: <key>` | `generationConfig.responseMimeType = "application/json"` |

Implementación: `backend/app/providers.py` → `_call_openai()` y `_call_gemini()` (vía `httpx`).

### 3.4 Cliente vs. servidor

| Enfoque | Key viaja | Ventaja | Riesgo |
|---|---|---|---|
| **Solo cliente** (recomendado al inicio) | Browser → tu backend → proveedor | El backend nunca almacena secretos | El navegador expone la key (solo para quien usa la app) |
| **Servidor cifrado** | Browser → tu backend → proveedor | La key sobrevive al recargar | Si tu servidor se compromete, la key se expone |

Para un prototipo personal, **"solo cliente"** es lo más simple y seguro. Si la app pasa a
multiusuario, migra a servidor + cifrado + **nunca** devuelvas la key por la API (solo `tiene_api_key: boolean`).

---

## 4. Seguridad

| Amenaza | Mitigación | Dónde |
|---|---|---|
| Key filtrada en el navegador | Solo browser→backend; nunca renderizar la key en respuestas de la API | `api.ts`, `SettingsOut.tiene_api_key` |
| Key en texto plano en la BD | Fernet (AES-128-EDE + HMAC) | `security.py` |
| Key en los logs | Nunca se loguea `payload.api_key` ni el request body completo | `agent.py`, `providers.py` |
| Servidor comprometido | `APP_SECRET_KEY` en variable de entorno, nunca en el repo | `.env` + `.gitignore` |
| Key de terceros abusada | El usuario pega **su** key: el riesgo es suyo y es visible en su panel de OpenAI/Gemini | BYOK por diseño |
| Abuso de la API por terceros | Rate limit + auth en la capa HTTP antes de producción | Pendiente (ver roadmap) |

**Nunca** hagas esto: `print(payload)`, guardar `api_key` en un `LogEntry`, devolver la key en
`GET /api/settings`, ni hacer `git commit` de `.env`.

---

## 5. Costos (estimados, USD por 1M tokens)

| Modelo | Entrada | Salida | Costo por mensaje típico (~2k in / ~600 out) |
|---|---|---|---|
| `gpt-4o-mini` | $0.15 | $0.60 | ≈ **$0.0007** (0.07 centavos) |
| `gpt-4o` | $2.50 | $10.00 | ≈ **$0.011** |
| `gemini-2.0-flash` | $0.10 | $0.40 | ≈ **$0.0004** |
| `gemini-2.0-pro` | $1.25 | $10.00 | ≈ **$0.0085** |
| `mock` (local) | $0 | $0 | **$0** |

Con `gpt-4o-mini`, ~1.400 mensajes ≈ $1. Con `gpt-4o`, ~90 mensajes ≈ $1.

> El contexto que se inyecta (`construir_contexto`) es compacto a propósito: eventos de hoy,
> tareas pendientes, gasto del mes y mantenimientos. No se manda el historial completo.

---

## 6. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `401 Incorrect API key` | Key inválida, con espacio al inicio/final, o de otra plataforma | Recorta la key, verifícala en el panel del proveedor |
| `429 Rate limit` | Límite de requests/tokens | Espera o cambia a `gpt-4o-mini` / `gemini-2.0-flash` |
| `404 model not found` | Nombre de modelo inexistente | Usa el autocompletado de `SettingsModal` o la lista oficial |
| `502` en el chat | Fallo del proveedor (red, quota, key) | El `detail` del error dice el motivo exacto |
| El agente responde en chino/inglés | Modelo con prompt débil o `extract_json` falló | Reforza la sección 6 del prompt; el `mock` nunca hace esto |
| Cambié la key y sigue la vieja | Estás usando la cifrada del servidor | Desmarca "recordar en el servidor" y borra, o `DELETE` + `PUT` |
| `tiene_api_key: false` pero no guarda | `APP_SECRET_KEY` vacía o cambiada | Revisa `.env` y reinicia el backend |

Verificar la config desde la terminal:

```powershell
curl.exe http://127.0.0.1:8000/api/settings
```

---

## 7. Checklist de producción

- [ ] `APP_SECRET_KEY` desde variable de entorno, nunca hardcodeada.
- [ ] HTTPS obligatorio (la key viaja en el body del POST).
- [ ] Autenticación de usuarios + rate limiting por usuario.
- [ ] `GET /api/settings` **nunca** devuelve la key (solo `tiene_api_key`).
- [ ] Logs sin cuerpos de request ni keys.
- [ ] Rotación de keys: el usuario puede borrarla y pegar otra sin reiniciar.
- [ ] Migrar a multiusuario: la key se cifra **por usuario**, no global.
- [ ] Considerar un proxy con quota por usuario para que nadie gaste tu key por error.
