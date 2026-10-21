# Acceso en un clic + IA super ligera — LifeAgente AI

Este documento responde a dos preguntas que todo el mundo se hace la primera
vez:

1. **«¿Por qué me pide un identificador de cliente si solo quiero entrar con
   mi cuenta de Google?»**
2. **«¿Puedo usar LifeAgente en mi computador sin pagar ni tener claves de
   IA?»**

Las dos respuestas son: **sí**, y ya están implementadas.

---

## 1. Las credenciales son públicas: la app las obtiene sola

### Qué es realmente ese "ID de cliente"

En OAuth, el **identificador de cliente** (*client id*, el que termina en
`....apps.googleusercontent.com`) **no es un secreto**. Es como el nombre de
dominio de una app: va escrito en el código y en las peticiones que hace al
servidor de Google. Cualquiera puede leerlo.

Lo que **sí** es secreto es el *client secret*, y **esta app no lo usa**:
usa el flujo de **Device Authorization** (el de los códigos de TV y de
GitHub), donde el usuario autoriza en el navegador y la app recibe un token
que se guarda **cifrado** en su base de datos.

Por eso el identificador puede ir **incrustado en la app** y repartido por
HTTP: no abre ninguna puerta.

### De dónde lo saca LifeAgente (4 fuentes, en este orden)

| # | Fuente | Quién la llena | Cuándo se usa |
|---|---|---|---|
| 1 | Variable de entorno (`GOOGLE_CLIENT_ID`) | quien despliega (Render, Docker) | producción |
| 2 | `ConexionIA` cifrada | la persona que conectó su cuenta | su propia cuenta |
| 3 | `AppSettings` | la persona que lo pegó en *Conectar IA → Configuración avanzada* | si lo pegó a mano |
| 4 | **Bootstrap público** (`public/clientes-publicos.json`) | el repositorio, una sola vez | **por defecto** |

La 4ª es la nueva: la app descarga un archivo JSON público desde GitHub (con
caché de 1 hora) y, si dentro hay un identificador, **lo usa sin preguntar
nada**.

```
public/clientes-publicos.json
{
  "_comentario": "Identificadores de cliente PUBLICOS (no son secretos).",
  "google_cuenta": "",
  "outlook_cuenta": "",
  "github_cuenta": ""
}
```

### El flujo completo de quien usa la app

```
Persona                    LifeAgente                      Google
   |                           |                              |
   |  pulsa "Continuar con     |                              |
   |  Google"                  |                              |
   |-------------------------->|  busca el client id          |
   |                           |  (env > app > bootstrap)     |
   |                           |---- POST /device/code ------>|
   |                           |<--- user_code: "ABCD-EFGH" -|
   |  ve el codigo grande      |                              |
   |<--------------------------|                              |
   |  abre el navegador y autoriza  ------------------------->|
   |                           |<--- access_token + refresh --|
   |                           |  lo guarda CIFRADO           |
   |  "Listo, ya autorice"     |                              |
   |-------------------------->|  crea la cuenta verificada   |
```

**La persona nunca pega un identificador, ni una clave, ni un token.**

### Qué falta para que funcione en tu instalación

Una sola vez, y es **público**:

1. En la consola de Google Cloud → *Credenciales* → *Crear credenciales* →
   **ID de cliente OAuth** de tipo **«App de escritorio»**.
2. Copiar el identificador (el que termina en `.apps.googleusercontent.com`).
3. Pegarlo en **una** de estas dos partes:
   - `public/clientes-publicos.json` del repositorio (y hacer push), o
   - la variable de entorno `GOOGLE_CLIENT_ID` de tu despliegue.

A partir de ahí, **cualquier persona que abra la app puede entrar con su
Google con un clic**, y además quedan activos **Google Drive** (respaldo),
**Google Calendar** (importar agenda) y el **resumen por correo**.

---

## 2. La IA super ligera: 400 MB y funciona

Si no quieres claves, cuentas ni conexión a internet, LifeAgente puede
**bajarse una IA pequeña a tu computador** y usarla. Sin costo y sin que
nadie vea tus datos.

### Los modelos que ofrece la app

| Modelo | Tamaño | Para qué | Nota |
|---|---|---|---|
| **`qwen2.5:0.5b`** | **400 MB** | el que recomienda la app | rápido incluso en un portátil modesto |
| `gemma3:1b` | 815 MB | un poco más listo | buen equilibrio |
| `llama3.2:1b` | 1,3 GB | mejor con instrucciones largas | |
| `phi3.5:mini` | 2,2 GB | el más capaz de la lista | |

### Dos caminos para bajarla

| Desde | Cómo |
|---|---|
| **La app** | *Conectar IA* → si no hay motor, aparece la tarjeta **«Descarga una IA ligera»** con el catálogo, la barra de progreso y el log de la descarga. Al terminar, botón «Buscar la IA descargada» y te conectas. |
| **El instalador `.exe`** | botón **«Descargar IA ligera»** en la ventana del instalador: instala Ollama si falta (`winget`) y baja `qwen2.5:0.5b` con la salida en el registro. |

### Cómo funciona por dentro

1. La app comprueba si hay un motor local (`Ollama`, `LM Studio`, `Jan`,
   `llama.cpp`…) consultando sus puertos.
2. Si no hay ninguno, **ofrece descargarlo**: el backend lanza
   `ollama pull <modelo>` en segundo plano, lee el progreso real de Ollama y
   lo expone en la interfaz (`/api/conexiones/descargas`).
3. Al terminar, la detección automática de la v12 la encuentra y la conecta
   sola: ya puedes chatear **sin claves**.

---

## 3. Los tres modos de funcionamiento (resumen)

| Modo | Dónde se guarda | Requiere | Para quién |
|---|---|---|---|
| **Modo de prueba** | nada (memoria) | nada | ver cómo funciona en 30 segundos |
| **Modo local** | el navegador (`localStorage`) | nada | uso personal, sin cuentas |
| **Con cuenta** (Google/Outlook/GitHub/correo) | el servidor, aislado por `usuario_id` + Drive | un clic | uso serio, con respaldo y piloto automático |

---

## 4. La API de esta parte

| Endpoint | Qué hace |
|---|---|
| `GET /api/conexiones/clientes-publicos?forzar=1` | devuelve el JSON de bootstrap y si hay algún proveedor configurado |
| `GET /api/conexiones/modelos-ligeros` | catálogo de modelos, motor recomendado y si hay motor instalado |
| `POST /api/conexiones/descargar-modelo` | arranca la descarga en segundo plano (`{"modelo": "qwen2.5:0.5b"}`) |
| `GET /api/conexiones/descargas` | estado de las descargas (progreso, log, errores) |
| `GET /api/cuentas/proveedores` | qué cuentas se pueden usar y si están disponibles |

---

## 5. Verificación

| Prueba | Resultado |
|---|---|
| Los 4 endpoints nuevos responden | ✅ |
| El catálogo tiene los 4 modelos con su tamaño | ✅ |
| Un modelo inexistente se rechaza con 400 | ✅ |
| **Descarga real de `qwen2.5:0.5b`** | ✅ `estado=listo`, 100 %, log real de Ollama |
| El motor detectado pasa de 5 a 6 modelos | ✅ |
| Smoke test | ✅ **116 casos** |

---

## 6. Archivos

| Archivo | Para qué |
|---|---|
| `backend/app/ia_local.py` | bootstrap de credenciales públicas, catálogo de modelos y descargas en segundo plano |
| `backend/app/cuentas.py` | `client_id_de()` con las 4 fuentes |
| `backend/app/routers/conexiones.py` | los 4 endpoints de esta parte |
| `public/clientes-publicos.json` | el archivo público con los identificadores (vacío hasta que los pegues) |
| `frontend/src/components/BloqueIaLigera.tsx` | la tarjeta de descarga con progreso |
| `desktop/launcher.py` | el botón «Descargar IA ligera» del instalador |
