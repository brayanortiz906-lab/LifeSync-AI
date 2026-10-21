# 06 · Centro de Conexiones (IA sin jerga)

> Cómo conectar LifeSync con **cualquier inteligencia artificial** — con tu cuenta, con una clave, o con la IA que ya tienes instalada en tu computador — sin obligar a nadie a entender qué es un *token* o una *API key*.

---

## 1. El problema que resuelve

La mayoría de las apps de IA asumen que el usuario sabe lo que es una API key: una cadena de 51 caracteres que empieza por `sk-`, que se pega en un campo y que cuesta dinero. Para el 90 % de las personas eso es una barrera, no una opción.

LifeSync abre con un **Centro de Conexiones** que ofrece cuatro caminos, en lenguaje llano, y **nunca obliga** a pasar por la clave:

| # | Camino | Qué necesitas | Costo | Para quién |
|---|---|---|---|---|
| 1 | **Ya tengo mi cuenta de IA** | Iniciar sesión con tu cuenta (OpenAI, Google, Anthropic, OpenRouter) | El de tu plan | Quien ya paga un servicio |
| 2 | **Usar la IA de mi computador** | Nada: LifeSync detecta el motor solo | Gratis, sin internet | Quien no quiere gastar ni enviar datos |
| 3 | **Tengo una clave de API** | Una clave (te explicamos cómo obtenerla, con el link a la consola) | Depende del uso | Quien ya usa IA programando |
| 4 | **Solo quiero ver cómo funciona** | Nada | Gratis | Quien está explorando por primera vez |

El catálogo completo vive en `backend/app/connections.py` (`CATALOGO`) y se expone en `GET /api/conexiones/catálogo`.

---

## 2. Proveedores soportados

| id | Nombre | Modo | Gratis | Requiere pago | Notas |
|---|---|---|---|---|---|
| `openai` | OpenAI (ChatGPT) | `api_key` | no | sí | GPT-4o, GPT-4o-mini |
| `anthropic` | Anthropic (Claude) | `api_key` | no | sí | Claude Sonnet 4.5 |
| `gemini` | Google (Gemini) | `api_key` | **sí** (tier gratuito) | no | Gemini 2.0 Flash |
| `openrouter` | OpenRouter (cualquier IA) | `api_key` | no | sí | **Sign in with Google** + 468 modelos de 67 familias |
| `ollama` | IA en tu computador (Ollama) | `local` | **sí** | no | `127.0.0.1:11434`, detecta los modelos instalados |
| `lmstudio` | IA en tu computador (LM Studio) | `local` | **sí** | no | `127.0.0.1:1234/v1` (API compatible con OpenAI) |
| `demo` | Asistente demo (integrado) | `demo` | **sí** | no | Motor por reglas, funciona sin internet |
| `google_cuenta` | Google con mi cuenta | `cuenta` | **sí** (tier gratuito) | no | OAuth Device Flow → Gemini |
| `chatgpt_cuenta` | ChatGPT con mi cuenta | `cuenta` | no | sí | OAuth Device Flow → OpenAI |
| `claude_cuenta` | Claude con mi suscripción | `cuenta` | no | sí | OAuth Device Flow → Anthropic |

Los alias `chatgpt`, `claude`, `google` y `mock` se normalizan automáticamente a estos ids (`connections.normalizar_proveedor`).
Los alias `cuenta`, `googlecuenta`, `chatgptcuenta` y `claudecuenta` llevan al modo cuenta.

### 2.1 El camino «Continuar con Google» (una sola entrada para cualquier IA)

Es la respuesta a la pregunta «¿con qué IA quiero trabajar?». En lugar de elegir
proveedor antes de iniciar sesión, la persona **entra una vez con su cuenta de
Google** y **después elige el modelo** dentro de LifeSync.

```
┌──────────────────────────────────────────────────────────────┐
│  [ G ]  Continuar con Google                                 │
│  Entra con la misma cuenta de Google que usas para el correo. │
│  Después eliges con qué IA quieres trabajar: Gemini, GPT,     │
│  Claude, Llama, DeepSeek y más de 300 modelos.                │
│  Tu contraseña nunca pasa por LifeSync.                       │
└──────────────────────────────────────────────────────────────┘
```

| Pieza | Dónde | Qué hace |
|---|---|---|
| Tarjeta «Continuar con Google» | `ConexionesPanel.tsx` | Botón grande al inicio del modal; lleva al detalle de `google_cuenta` |
| Elección de IA tras autorizar | `ConexionesPanel.tsx` (paso `elegir`) | Grid con **todos** los proveedores del catálogo; cada uno abre su propio camino |
| Autorización | `POST /api/conexiones/cuenta/iniciar` | OAuth 2.0 Device Flow: código corto + link a `accounts.google.com/device` |
| Token de Google → Gemini | `agent.procesar_mensaje` | Las conexiones tipo `cuenta` aportan su `access_token` como credencial (`ya29.…` → cabecera `Authorization: Bearer`) |
| Catálogo de IAs | `GET /api/conexiones/modelos?proveedor=openrouter` | **468 modelos en 67 familias**, con buscador y filtro por familia |

Dos matices importantes y honestos:

1. **El token de Google da acceso directo a Gemini**, no a GPT ni a Claude. Para
   esos, la tarjeta de Google lleva a su propio camino de cuenta (`chatgpt_cuenta`,
   `claude_cuenta`) o al camino de clave.
2. **OpenRouter es el puente de «cualquier IA»**: su pantalla de acceso tiene
   *Sign in with Google*, y con esa cuenta se eligen **468 modelos** (GPT, Claude,
   Gemini, Llama, DeepSeek, Mistral…) desde el buscador de LifeSync. Por eso
   `openrouter` es el único proveedor con `permite_seleccion_modelo=True`.

Los dos flags nuevos del catálogo (`ProveedorCatalogo`):

| Flag | Significado | Proveedores |
|---|---|---|
| `permite_google` | Se puede entrar con Google y usar este proveedor | openai, anthropic, gemini, openrouter, google_cuenta, chatgpt_cuenta, claude_cuenta |
| `permite_seleccion_modelo` | La persona elige el modelo (cualquier IA) | openrouter |

**Conexión en un clic (opcional para quien despliega).** Si el despliegue define
`GOOGLE_CLIENT_ID` (ver `backend/.env.example`), el campo «ID de cliente» del
detalle de Google queda vacío y la persona solo pulsa «Autorizar en el navegador».
Sin esa variable, LifeSync pide el ID de cliente de Google Cloud y explica en
lenguaje llano que **es un identificador público, no una contraseña**.

### 2.2 El asistente «Entrar con Google» (tres caminos, sin callejón sin salida)

Si LifeSync todavía no tiene un ID de cliente de Google, el botón **«Entrar con
Google» no muere en un error rojo**: abre un asistente con **tres caminos
reales**, y el que elija la persona funciona siempre.

```
┌─ Entrar con Google ────────────────────────────────────────────┐
│ Camino 1 · Activar el acceso con Google (1 minuto, queda guardado)
│   1. Abre la consola de Google Cloud                          │
│   2. Crea un proyecto                                          │
│   3. APIs y servicios > Credenciales > Crear credenciales      │
│   4. ID de cliente OAuth > App de escritorio > copiar el ID    │
│   [ ID de cliente .............................. ] [Guardar]    │
│ Camino 2 · Entrar con Google en OpenRouter (sin crear nada)     │
│ Camino 3 · Usar la IA de tu computador (gratis, sin cuentas)    │
└─────────────────────────────────────────────────────────────────┘
```

| Camino | Qué hace | Resultado |
|---|---|---|
| **1. Activar el acceso con Google** | Pega el ID de cliente público de Google Cloud y pulsa «Guardar y entrar con Google» | Queda **guardado en la app** (`AppSettings.google_client_id`): la próxima vez es un solo clic |
| **2. Entrar con Google en OpenRouter** | Abre `openrouter.ai`, inicia sesión con *Sign in with Google*, crea una clave y la pega | Acceso a **468 IAs** (GPT, Claude, Gemini, Llama, DeepSeek…) |
| **3. Usar la IA de tu computador** | Detecta Ollama / LM Studio ya instalados y conecta | Gratis, offline, sin cuentas |

Piezas técnicas:

| Pieza | Dónde | Qué hace |
|---|---|---|
| Vista `wizard` | `ConexionesPanel.tsx` (`paso === 'wizard'`) | Los tres caminos, con pasos numerados (`ls-paso`) y aviso de privacidad |
| Estado del acceso | `GET /api/conexiones/google/estado` | `{configurado, origen: "app" \| "servidor" \| "nada", pista}` |
| Guardar el ID | `PUT /api/conexiones/google/estado` | Guarda (≥10 caracteres) u **olvida** (enviando `client_id` vacío) el ID |
| Reutilización | `POST /api/conexiones/cuenta/iniciar` | Si no llega `client_id`, usa el guardado → **entrada en un clic** |
| Almacén | `AppSettings.google_client_id` | Identificador **público** de OAuth (no es un secreto); columna añadida por migración |

> El ID de cliente de Google es un identificador **público** (va en el código
> de cualquier app). Aun así, LifeSync lo guarda cifrado con el resto de
> credenciales y hay un botón para olvidarlo.

---

## 3. El camino local: IA en tu computador (sin claves, sin internet)

Es la vía recomendada para quien no quiere pagar ni mandar su vida a un servidor ajeno.

### 3.1 Detección automática

`connections.detectar_motores_locales_sync()` interroga, con un timeout corto (2,5 s):

- `http://127.0.0.1:11434/api/tags` → **Ollama** (lee `models[].name`)
- `http://127.0.0.1:1234/v1/models` → **LM Studio** (lee `data[].id`)

El resultado se cachea 8 segundos (`_CACHE_MOTORES`) para no interrogar los motores en cada listado de conexiones.

Si el motor está corriendo, el Centro de Conexiones muestra un botón **«Conectar»** con los modelos reales que tienes instalados. Si no, muestra instrucciones paso a paso y un campo opcional para la URL.

### 3.2 Requisitos del modelo local

Los modelos locales tienen memoria y velocidad limitadas. LifeSync lo contempla:

| Problema | Mitigación en el código |
|---|---|
| El System Prompt completo (~7k tokens) no cabe en la ventana por defecto (4k–8k) | `_call_ollama` pide `options.num_ctx = 16384` |
| Aun así se corta la conexión | Se reintenta con `_recortar_prompt()` (6 000 chars) y `num_ctx = 8192` |
| La IA local tarda mucho | Timeout de 300 s y un mensaje claro, no un 500 |
| El modelo no devuelve el JSON del contrato | `agent._respeta_contrato()` cae al clasificador por reglas: el mensaje **se registra igual** |

Esta última fila es la más importante: **nunca se pierde lo que el usuario escribió**. Si el modelo local responde con texto libre, el motor por reglas (`providers.respuesta_reglas`) interpreta la frase y registra lo que corresponde.

### 3.3 Recomendación de modelos

| Modelo | Uso |
|---|---|
| `qwen2.5:7b` / `qwen2.5:14b` | Uso general, responde bien en español |
| `gemma4:26b` | Tareas más complejas (requiere ~16 GB de RAM) |
| `llama3.1:8b` | Alternativa ligera y muy veloz |
| `qwen2.5-coder` | Tareas de código |

---

## 4. El camino de la cuenta (modo `cuenta`)

El objetivo es que **nadie tenga que saber qué es un token**. Hay dos sub-modos:

### 4.1 OAuth 2.0 Device Authorization (implementado de verdad)

Es el flujo estándar para "inicia sesión con tu cuenta": LifeSync te da un **código corto**, abres el sitio del proveedor en tu navegador, pegas el código, y la autorización vuelve sola a la app. **Nunca ves ni escribes tu contraseña.**

| Paso | Qué hace el usuario | Qué hace el backend |
|---|---|---|
| 1 | Pega el **ID de cliente** de la app que creó en la consola del proveedor (no es un token: es un identificador público) | — |
| 2 | Pulsa **«Autorizar en el navegador»** | `POST /api/conexiones/cuenta/iniciar` → `device/code` → devuelve `user_code`, `verification_uri` y `intervalo` |
| 3 | Abre el enlace, pega el código, acepta | — |
| 4 | Vuelve a la app y pulsa **«Ya autoricé»** | `POST /api/conexiones/cuenta/terminar` → hace *poll* a `token` hasta obtener `access_token` (+ `refresh_token` y el correo del usuario) |

Los tres proveedores con modo `cuenta` son `google_cuenta`, `chatgpt_cuenta` y `claude_cuenta`. Cada uno trae en su ficha el **enlace directo a la consola** donde se crea el ID de cliente y unos pasos numerados en lenguaje llano.

Los errores del proveedor se traducen antes de mostrarse (`_ERRORES_OAUTH`): si el ID está mal, la app dice *"Ese ID de cliente no existe. Cópialo de nuevo desde el panel del proveedor…"*, no `invalid_client: The OAuth client was not found`.

### 4.2 Credencial pegada a mano (modo `api_key`)

Para quien ya tiene una clave, o prefiere no crear una aplicación: pega la clave en el campo con botón de ojo. LifeSync la cifra (Fernet), la verifica con una llamada real al proveedor y te dice en español si funcionó.

### 4.3 Limitación honesta

Cada proveedor decide qué integraciones de terceros permite. En la práctica, `google_cuenta` funciona con una app que tú crees (Device Flow está habilitado por defecto); para OpenAI y Anthropic puede que el proveedor no permita el Device Flow a clientes externos, y entonces el camino real es la clave de API. **Por eso el catálogo ofrece siempre las dos vías y el sistema nunca te deja bloqueado.**

---

## 5. Seguridad de las credenciales

| Punto | Implementación |
|---|---|
| Cifrado en reposo | `security.cifrar` / `descifrar` (Fernet), clave derivada de `APP_SECRET_KEY` |
| Nunca se expone al cliente | `_a_out()` devuelve `tiene_credencial: bool`, **jamás** la clave |
| Solo un proveedor activo a la vez | `ConexionIA.activa` + sincronización con `AppSettings` |
| Alternar es trivial | `POST /api/conexiones/{id}/activar` y `DELETE /api/conexiones/{id}` |
| Al desconectar, se limpia | `AppSettings.api_key_cifrada = None` y `proveedor = "mock"` |

---

## 6. API del Centro de Conexiones

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/conexiones/catalogo` | Catálogo con los 10 proveedores (modo, costo, instrucciones, modelos) |
| `GET` | `/api/conexiones/locales` | Motores locales detectados y sus modelos reales |
| `GET` | `/api/conexiones` | Conexiones guardadas (sin credenciales) |
| `POST` | `/api/conexiones` | Crea o actualiza una conexión (cifra la credencial, la activa) |
| `POST` | `/api/conexiones/verificar` | Verifica al vuelo sin guardar (ideal para el botón «Probar») |
| `POST` | `/api/conexiones/{id}/verificar` | Verifica y guarda el estado (`activa` / `error`) |
| `POST` | `/api/conexiones/{id}/activar` | Marca la conexión como activa |
| `POST` | `/api/conexiones/cuenta/iniciar` | OAuth Device Flow: devuelve `user_code` + `verification_uri` |
| `POST` | `/api/conexiones/cuenta/terminar` | OAuth Device Flow: hace poll y guarda la conexión de cuenta |
| `GET` | `/api/conexiones/modelos?proveedor=openrouter` | Catálogo de IAs para el buscador: `{proveedor, modelos:[{id,nombre,familia,gratis,contexto}], total, familias}` |
| `GET` | `/api/conexiones/google/estado` | `{configurado, origen, pista}`: si el acceso con Google ya quedó configurado |
| `PUT` | `/api/conexiones/google/estado` | Guarda (`client_id` de ≥10 chars) u **olvida** (enviando `client_id` vacío) el ID de cliente de Google |
| `DELETE` | `/api/conexiones/{id}` | Desconecta y vuelve al asistente demo |

Verificación de credenciales por proveedor (`connections.verificar_credenciales`):

| Proveedor | Llamada de verificación |
|---|---|
| `openai`, `openrouter` | `GET {base}/models` con `Authorization: Bearer` |
| `gemini` | `POST {base}/v1beta/models/{model}:generateContent?key=…` |
| `anthropic` | `POST https://api.anthropic.com/v1/messages` (`x-api-key` + `anthropic-versión: 2023-06-01`) |
| `ollama`, `lmstudio` | Detección del servidor + listado de modelos |
| `google_cuenta`, `chatgpt_cuenta`, `claude_cuenta` | Token de cuenta (OAuth Device Flow) → misma llamada que su proveedor |
| `demo` | Siempre correcto |

---

## 7. Cómo se usa el proveedor elegido

`agent.procesar_mensaje` resuelve la conexión en este orden:

1. Si el request trae `proveedor` (el frontend lo manda), se busca una conexión guardada con ese id.
2. Si no hay, se usa la conexión **activa**.
3. Se recupera la credencial cifrada, la `base_url` y el modelo.
4. Si no hay credencial y el proveedor no es local, se cae al motor demo con un aviso explícito.
5. `providers.complete(...)` recibe `base_url` y despacha al adaptador correcto.

Adaptadores en `backend/app/providers.py`:

| Función | Proveedores |
|---|---|
| `_call_openai` | `openai` |
| `_call_openai_compatible` | `openrouter`, `lmstudio` |
| `_call_gemini` | `gemini` |
| `_call_anthropic` | `anthropic` |
| `_call_ollama` | `ollama` |
| `_mock_response` | `demo` (motor por reglas multi-intención) |

---

## 8. Receta rápida: conectar Ollama

```powershell
# 1. Instala Ollama (https://ollama.com) y abre la app.
ollama pull qwen2.5:7b

# 2. En LifeSync: "Conectar IA" -> "Usar la IA de mi computador" -> "Conectar"
#    (LifeSync detecta el servidor y lista tus modelos).

# 3. Listo. El chat ya usa tu modelo local, sin clave y sin internet.
```

---

## 9. Referencias

- `backend/app/connections.py` — catálogo, detección local y verificación.
- `backend/app/routers/conexiones.py` — endpoints del Centro de Conexiones.
- `backend/app/providers.py` — adaptadores por proveedor.
- `frontend/src/components/ConexionesPanel.tsx` — interfaz del wizard.
