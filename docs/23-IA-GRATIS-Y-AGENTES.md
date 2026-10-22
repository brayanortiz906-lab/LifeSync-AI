# 23. IA gratis con tu cuenta y sistemas con interfaz (v43)

## 1. El problema

"Quiero usar LifeAgente pero no quiero instalar nada, no quiero pagar y no
se que es una API key". Y el segundo problema: "ya tengo Claude Code, OpenCode
y otros agentes en el computador, que LifeAgente los use".

La v43 responde a las dos con dos piezas nuevas dentro del **Centro de
Conexiones**:

| Pieza | Para que |
|---|---|
| **IA gratis con tu cuenta** (seccion 2) | 11 servicios donde solo necesitas tu cuenta (o directamente nada) |
| **Sistemas de IA que ya tienes** (seccion 3) | Detecta los agentes y editores con IA de tu computador y dice como conectarlos |

## 2. La tabla de IA gratis

Todas las direcciones se comprobaron contra los servidores reales (un 401
significa "existe, pero pide clave"; un 200 sin clave significa "no hace falta
cuenta").

| Servicio | Plan gratis | Donde esta la clave | Direccion de la API | Estilo |
|---|---|---|---|---|
| Pollinations AI | Gratis, sin registro | Ninguna | https://text.pollinations.ai/openai | OpenAI |
| OpenCode Zen (y Go) | Creditos al entrar | Consola de OpenCode | https://opencode.ai/zen/v1 | OpenAI |
| Google AI Studio | Gratis con tu cuenta de Google | Get API key | https://generativelanguage.googleapis.com | Gemini |
| GitHub Models | Gratis con tu cuenta de GitHub | Personal access token | https://models.github.ai/inference | OpenAI |
| OpenRouter | 20 modelos :free al dia, sin tarjeta | OpenRouter > Keys | https://openrouter.ai/api/v1 | OpenAI |
| Groq | Gratis con cuenta de correo | Groq Console > API Keys | https://api.groq.com/openai/v1 | OpenAI |
| Cerebras | Gratis con cuenta | Cerebras Cloud > API Keys | https://api.cerebras.ai/v1 | OpenAI |
| Mistral | Gratis con cuenta | Mistral Console > API Keys | https://api.mistral.ai/v1 | OpenAI |
| Together AI | Creditos de regalo | Together > API Keys | https://api.together.xyz/v1 | OpenAI |
| NVIDIA NIM | Creditos de regalo | build.nvidia.com | https://integrate.api.nvidia.com/v1 | OpenAI |
| Hugging Face | Creditos de regalo | Access Tokens | https://router.huggingface.co/v1 | OpenAI |

> **OpenCode Go** es la suscripcion de modelos de agentes de OpenCode y usa la
> **misma clave** que Zen (segun la documentacion de OpenCode: "the same API
> key works for both OpenCode Go and OpenCode Zen").

### Como se conecta uno (5 pasos, sin jerga)

1. Abre **Conectar IA** (arriba a la derecha) y baja a **2 · IA gratis con tu cuenta**.
2. Pulsa **Conectar** en el servicio que te interesa.
3. LifeAgente te dice **donde copiar la clave** y te abre el sitio en una pestana.
4. Pegas la clave (o ninguna, si el servicio no la necesita) y pulsas **Guardar y conectar**.
5. LifeAgente la guarda cifrada, la verifica y la deja como motor activo.

## 3. Sistemas con interfaz y de linea de comandos

LifeAgente revisa el PATH de tu computador y te dice que hay:

| Programa | Que es | Como se conecta |
|---|---|---|
| OpenCode | Agente de programacion | `opencode serve` y LifeAgente lo usa como motor |
| Claude Code | Agente de Anthropic | Tu cuenta de Claude o una clave de Anthropic |
| Codex CLI | Agente de OpenAI | Tu cuenta de ChatGPT o una clave de OpenAI |
| Gemini CLI | Agente de Google | Tu cuenta de Google |
| GitHub Copilot CLI | Asistente de codigo | Tu cuenta de GitHub |
| Aider | Agente que edita archivos | La IA de tu computador o una clave |
| Cline / Roo Code | Agentes dentro de VS Code | Se conectan desde su propio panel |
| Cursor / Windsurf | Editores con IA | Desde su propia cuenta |
| Continue | Asistente para VS Code | Su servidor local en http://localhost:3000 |
| Servidores MCP | El idioma comun de las herramientas | Anade LifeAgente como servidor MCP |

En el caso real de esta maquina: **OpenCode 1.19.0** esta instalado en
`C:\ProgramData\chocolatey\bin\opencode.exe` y la app lo muestra con su
version y un boton **Conectar** que apunta a su servidor local.

## 4. Como se detecta

`backend/app/ia_gratis.py`:
- `SERVICIOS_GRATIS`: el catalogo de la seccion 2 (11 servicios).
- `AGENTES_CONOCIDOS`: los 12 programas de agentes y editores con IA.
- `detectar_agentes_instalados()`: `shutil.which()` para cada binario y
  `--version` con 4 s de tiempo maximo (nunca se queda colgado).

## 5. Endpoints

| Endpoint | Que devuelve |
|---|---|
| `GET /api/conexiones/ia-gratis` | El catalogo de IA gratis, con `conectado` en los que ya estan |
| `GET /api/conexiones/agentes` | Los 12 agentes, con `instalado`, `version`, `ruta` y `servidor` |

## 6. Verificacion

Siete comprobaciones automaticas nuevas (el total del smoke esta en **157**):

```
[GRATIS] hay un catalogo de IA gratis para conectar
[GRATIS] cada servicio dice donde pegar la clave y tiene direccion
[GRATIS] hay al menos un servicio que no necesita cuenta ni clave
[GRATIS] el OpenCode Zen y Google AI Studio estan en la lista
[AGENTES] se detectan los sistemas de IA con interfaz
[AGENTES] se sabe cuales estan instalados y como conectarlos
[AGENTES] Claude Code y OpenCode estan en la lista
```

## 7. Archivos

| Archivo | Que aporta |
|---|---|
| `backend/app/ia_gratis.py` | Catalogo de IA gratis + deteccion de agentes |
| `backend/app/routers/conexiones.py` | Los 2 endpoints nuevos |
| `backend/app/providers.py` | El estilo "gemini" con direccion propia (Google AI Studio) |
| `frontend/src/components/ConexionesPanel.tsx` | Seccion 2 (IA gratis) y bloque de agentes en la 3 |
| `frontend/src/types.ts` | `ServicioIaGratis` y `AgenteLocal` |
| `frontend/src/lib/api.ts` | `iaGratis()` y `agentesLocales()` |
| `backend/smoke.py` | Los 7 checks nuevos |
