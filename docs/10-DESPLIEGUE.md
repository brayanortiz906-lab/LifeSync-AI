# Publicar LifeAgente AI con datos reales (API en la nube + cuentas)

Objetivo: que cualquier persona abra el enlace y use LifeAgente con **datos
reales**, entrando **con su cuenta** (correo verificado o Google), y que sus
datos no se mezclen con los de los demas.

## 0. Que hay ya listo

| Pieza | Estado |
|---|---|
| `Dockerfile` | multi-stage: compila la interfaz y la mete en la imagen del backend |
| `render.yaml` | blueprint de Render (un clic) con API + interfaz en un solo servicio |
| `backend/app/cuentas.py` | cuentas con codigo de verificacion, token y aislamiento por persona |
| `backend/app/database.py` | `usuario_id` en todas las tablas + migracion |
| `frontend/src/components/AccesoPanel.tsx` | modal de acceso (Google / correo / local) |
| `.github/workflows/deploy-pages.yml` | publica la interfaz en la rama `gh-pages` |

## 0-bis. Estado real del despliegue (verificado)

| Pieza | Estado |
|---|---|
| Servicio de Render | **https://lifesync-ai-qs5t.onrender.com** (Live) |
| API | `.../api/health` responde `{"ok":true,"app":"LifeAgente AI",...}` |
| Interfaz | la misma URL sirve la SPA (interfaz + API en un dominio) |
| GitHub Pages | **https://brayanortiz906-lab.github.io/LifeSync-AI/** |
| Variable del repo | `VITE_API_URL=https://lifesync-ai-qs5t.onrender.com/api` |
| Cuentas | registro + codigo de verificacion + token, todo funcionando en la nube |

### Tres sorpresas que costaron tiempo (guardadas para que no se repitan)

| Sorpresa | Que pasó | Como se arregla |
|---|---|---|
| **El nombre `lifesync-ai` ya estaba ocupado** | `lifesync-ai.onrender.com` es **otro proyecto de otra persona** (por eso Render le puso el sufijo `-qs5t` a nuestro) | el `render.yaml` ya usa `name: lifeagente-ai` (un nombre libre) |
| **CORS** | el navegador bloquea la llamada de Pages a la API de Render: el preflight responde **400** y sin `access-control-allow-origin` | en Render → *Environment* → `CORS_ORIGINS` debe incluir `https://brayanortiz906-lab.github.io` (separado por comas) |
| **`HEAD /` daba 405** | el chequeo de salud de Render pide `HEAD`, y la ruta de la SPA solo aceptaba `GET` | `main.py` ahora responde `HEAD` en `/` y en `/api/health` |

### Comprobacion rapida (sin mirar logs)

```bash
curl https://<tu-servicio>.onrender.com/api/health
curl https://<tu-servicio>.onrender.com/api/diagnostico
```

`/api/diagnostico` dice que tablas hay, si falta alguna, si hay SMTP, si Google
esta configurado y cuantos usuarios hay. Si `problemas` esta vacio, el esquema
de la base esta bien.

## 1. Desplegar la API (Render, gratis) - 5 clics

1. Entra en **https://render.com** y crea una cuenta (o entra con GitHub).
2. En el menu **New > Blueprint**.
3. Conecta el repositorio **brayanortiz906-lab/LifeSync-AI**.
4. Render lee el `render.yaml` y propone un servicio llamado `lifeagente-ai`.
   Pulsa **Apply**. (Si el nombre ya esta ocupado, Render le anade un sufijo:
   el servicio quedara en `https://lifeagente-ai-xxxx.onrender.com`).
5. Cuando termine (2-4 minutos) tienes:
   - App completa: **https://<tu-servicio>.onrender.com**
   - API: **https://<tu-servicio>.onrender.com/api/health**

> El servicio gratuito se duerme tras unos minutos sin uso: la primera carga
> tardara un poco. Los datos viven en el contenedor, asi que se reinician si
> Render reconstruye el servicio (para persistir, cambia el plan a `starter`
> y descomenta el bloque `disk` de `render.yaml`).

## 2. Conectar la pagina de GitHub Pages con esa API

La pagina de Pages ya esta publicada en
**https://brayanortiz906-lab.github.io/LifeSync-AI/**. Para que use la API de
la nube hay que fijar la variable `VITE_API_URL` y volver a compilar:

```powershell
gh variable set VITE_API_URL --body "https://lifesync-ai.onrender.com/api" --repo brayanortiz906-lab/LifeSync-AI
gh workflow run deploy-pages.yml --repo brayanortiz906-lab/LifeSync-AI
```

Tambien puedes hacerlo desde la pagina: **Settings > Secrets and variables >
Actions > Variables > New variable** -> `VITE_API_URL` = la URL de la API ->
luego *Actions > Publicar la interfaz > Run workflow*.

Sin esta variable la pagina sigue funcionando en **modo local** (datos en el
navegador) y, si abres la app en tu computador, puedes poner
`http://127.0.0.1:8000/api` en *Conectar IA > Direccion de la API*.

## 3. Correo de verdad para el codigo de verificacion

Sin configurar SMTP, el servidor funciona en **modo desarrollo**: el codigo de
6 digitos se devuelve en la respuesta y la interfaz lo muestra ("usa el codigo
XXXXXX"). Es util para probar, pero para un uso real conviene enviarlo:

En el panel de Render -> *Environment* -> anade:

| Variable | Valor |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` (o el de tu proveedor) |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | tu correo |
| `SMTP_PASSWORD` | la **clave de aplicacion** (en Gmail: seguridad -> claves de aplicacion) |
| `SMTP_DESDE` | tu correo |

Guarda y Render reinicia el servicio. A partir de ahi el codigo llega al buzon
de la persona y **no** se muestra en pantalla.

## 3-bis. La via que SIEMPRE funciona: correo + contrasena

**No necesitas configurar SMTP ni Google para que la gente pueda entrar.**
LifeAgente tiene su propia via de acceso, siempre disponible:

| Via | Que necesita del despliegue |
|---|---|
| **Correo + contrasena** | **nada** (la contrasena se guarda cifrada con PBKDF2 y la cuenta se confirma con un codigo) |
| Codigo de un solo uso | SMTP (seccion 3) |
| Google / Outlook / GitHub | `GOOGLE_CLIENT_ID` / `OUTLOOK_CLIENT_ID` / `GITHUB_CLIENT_ID` (seccion 4) |

La contrasena se guarda con PBKDF2-HMAC-SHA256 (120.000 iteraciones, sal de 16
bytes por usuario) y **nunca** se muestra ni se envia a ningun sitio. La cuenta se
crea *pendiente de confirmar*: sin SMTP el codigo se ve en pantalla (modo
desarrollo), con SMTP llega al buzon. En los dos casos **nadie queda dentro sin
confirmar**.

Si prefieres no operar SMTP, puedes dejar el despliegue tal cual y usar
`correo + contrasena`: el unico requisito es que Render tenga `APP_SECRET_KEY`
(ya lo genera el blueprint) para poder cifrar credenciales y tokens.
Detalle: `docs/15-CUENTAS-Y-PANELES.md`.

### El codigo de verificacion por correo (para que llegue de verdad)

Sin SMTP, el codigo se muestra en pantalla. Para que **llegue al buzon** de la
persona, configura estas variables en el servicio:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-cuenta@gmail.com
SMTP_PASSWORD=una-clave-de-aplicacion
SMTP_DESDE=tu-cuenta@gmail.com
```

En Gmail necesitas una **contrasena de aplicacion**, no la contrasena normal.
Con esto, una cuenta sin confirmar **no puede guardar contenido** (la API
responde 403 con un mensaje claro).

### Comprobar el despliegue sin mirar logs

```
GET https://tu-api/api/diagnostico
```

Dice que tablas hay, si falta alguna, y si el SMTP y Google estan
configurados. Detalle: `docs/16-RESPALDO-Y-NUBE.md`.

## 4. "Entrar con Google" en la nube

1. En https://console.cloud.google.com/apis/credentials crea un **ID de
   cliente OAuth de tipo aplicacion de escritorio**.
2. Copia el ID de cliente y ponlo en Render como `GOOGLE_CLIENT_ID`.
3. En la app: *Conectar IA > Ya tengo mi cuenta de IA > Google*.

El permiso se guarda cifrado en el servidor y la persona entra con un clic.

## 5. Comprobar que cada quien ve lo suyo

1. Abre la app en una ventanaAnonima (o en otro navegador) y crea la cuenta
   con tu correo: recibes un codigo, lo escribes y entras.
2. Agenda algo: "Mañana tengo una cita a las 10 AM".
3. Abre la app en otro navegador, crea otra cuenta y comprueba que **no**
   aparece esa cita.

## 6. Respaldo

Desde *Acceder* cada persona puede descargar su respaldo en JSON o guardarlo
en su **Google Drive** (si conecto su cuenta de Google).

## 7. Que el sistema trabaje solo (permisos y piloto automatico)

Con el mismo `GOOGLE_CLIENT_ID` de la seccion 4, la persona concede **todos**
los permisos de una vez desde la pestana **Permisos**:

| Permiso | Que hace |
|---|---|
| `drive.file` | respaldo automatico de su vida en su Drive |
| `calendar.readonly` | importa su Google Calendar al agente |
| `gmail.send` | le avisa por correo cuando el agente organiza su dia |

Con el **piloto automatico** encendido, el servidor del Render hace el trabajo
cada 30 minutos aunque nadie tenga la app abierta. Detalle completo en
`docs/12-PERMISOS-Y-NUBE.md`.

## 7-bis. El guardado con retardo y la tarea diaria

El respaldo **no** dispara mientras escribes: el servidor marca que cambiaste
algo y espera **45 segundos** a que pares. Asi Drive nunca guarda un estado a
medio escribir y no se crean respaldos repetidos.

| Pieza | Donde se configura |
|---|---|
| `SEGUNDOS_ESPERA = 45` | `backend/app/permisos.py` (se puede cambiar) |
| Cada cuanto revisa | `backend/app/main.py` (`_tarea_guardado`, 20 s) |
| `CRON_TOKEN` (secreto) | Render o el entorno: es el candado de la tarea diaria |
| `API_URL` (variable del repo) | GitHub -> Settings -> Secrets and variables -> Actions -> Variables |

La **tarea diaria** es un workflow de GitHub Actions (`.github/workflows/daily.yml`),
gratis en repos publicos. A las **06:00 (hora Colombia)** despierta la API,
respalda las cuentas que toca y manda el resumen del dia siguiente por correo:

```bash
# en Render (Environment) o en el entorno de la API
CRON_TOKEN=una-clave-larga-y-aleatoria

# en GitHub (variable del repositorio)
gh variable set API_URL --body "https://lifesync-ai.onrender.com" --repo brayanortiz906-lab/LifeSync-AI

# y el secreto
gh secret set CRON_TOKEN --body "la-misma-clave" --repo brayanortiz906-lab/LifeSync-AI
```

La llamada va protegida por la cabecera `X-Cron-Token`: si el token no esta
configurado o no coincide, el endpoint responde **403** y nadie mas puede
disparar la tarea.

> **Ten en cuenta**: en el plan gratis de Render el servicio **se duerme a los
> 15 minutos** y su disco es **efimero** (el SQLite se borra al reiniciar).
> Por eso el Drive es el almacen real y la tarea diaria existe justamente para
> despertar el servicio. Si necesitas que este siempre prendido, el plan
> Starter (512 MB) cuesta USD 7 al mes.

## 8. Lo que NO puede hacer el despliegue

- Publicar en tu cuenta de Render (eso lo haces tu, con tus clics).
- Enviar correos reales si no configuras SMTP (`SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASSWORD`, `SMTP_DESDE`): sin eso, el codigo de verificacion se
  muestra en pantalla (modo desarrollo).
- Conceder permisos de Google a nombre de otra persona: cada quien autoriza
  en su propio navegador, con su propia cuenta.

---

## 9. La trampa de `VITE_API_URL` (esto rompió la app y ya no puede romperla)

### Qué pasó

En el panel de Render se creó la variable `VITE_API_URL` con el botón
**"Generate"**, que genera un texto aleatorio de 32 caracteres (por ejemplo
`70de074d95436f5883ea20d08ac5c8cf`). Como el `Dockerfile` declara
`ARG VITE_API_URL`, Render **hornea ese valor dentro del bundle** de la
interfaz. La app entonces construía URLs así:

```
https://lifesync-ai-qs5t.onrender.com/70de074d95436f5883ea20d08ac5c8cf/api/...
```

Esas rutas no existen, así que:

| Petición | Respuesta | Lo que veía la persona |
|---|---|---|
| `GET /.../dashboard` | 200 con el **HTML** de la página (catch-all de la SPA) | datos vacíos |
| `POST /.../cuentas/registro` | **405 Method Not Allowed** | "Method Not Allowed" |

### Cómo se diagnostica

Descarga el bundle que se está sirviendo y busca el valor compilado:

```powershell
(Invoke-WebRequest "https://<tu-servicio>/" -UseBasicParsing).Content |
  Select-String -Pattern 'assets/index-[A-Za-z0-9_-]+\.js'
# descarga ese .js y busca la URL
Invoke-WebRequest "https://<tu-servicio>/assets/index-XXXX.js" -UseBasicParsing |
  Select-String -Pattern 'onrender.com'
```

Si aparece un hex raro en vez de la URL, esa es la causa.

### Cómo se corrige (en el panel de Render)

1. Render → tu servicio → **Environment**.
2. Borra `VITE_API_URL` (lo más simple: Render sirve la API y la interfaz en
   el mismo dominio, así que la ruta relativa `/api` funciona sola)
   **o** ponle la URL completa: `https://<nombre>.onrender.com/api`
3. **Redeploy** (el valor se hornea en el build: no basta con reiniciar).

> Ojo: el botón "Generate" de Render sirve para **claves secretas**, no para
> URLs. Si pulsas "Generate" en una variable que debe ser una dirección, se
> rompe la interfaz.

### El código ya es inmune

`frontend/src/lib/api.ts` valida la dirección antes de usarla (`esUrlUsable`):
si no es una URL real (http, https o ruta que empiece por `/`) la **ignora**,
avisa en la consola del navegador y cae a la ruta relativa. Si apunta a un sitio
estático (`github.io`) también la ignora, porque ahí no hay API.

---

## 9-bis. Cuentas seguras en el despliegue

| Variable | Para que | Valor recomendado |
|---|---|---|
| `APP_ENTORNO` | `produccion` **cierra el modo consola**: el codigo de verificacion nunca sale por pantalla ni por el log | `produccion` |
| `ADMIN_EMAILS` | correos que nacen con rol de administrador (los demas, `usuario`) | tu correo, separado por comas |
| `MINUTOS_CODIGO` | vida del codigo de verificacion | `15` |
| `MAX_INTENTOS_CODIGO` | intentos antes de invalidar el codigo | `5` |
| `SEGUNDOS_ENTRE_CODIGOS` | freno anti-inundacion (429) | `60` |
| `SMTP_HOST` / `SMTP_PORT` | servidor de correo (Gmail: `smtp.gmail.com` / `587`) | ver abajo |
| `SMTP_USER` / `SMTP_PASSWORD` | credenciales (en Gmail: **clave de aplicacion**) | — |
| `SMTP_DESDE` | remitente del correo | tu correo |

Sin SMTP el sistema sigue funcionando (la persona entra con contrasena o con Google), pero **el codigo no se puede enviar**. En el plan gratis de Render el puerto 587 esta bloqueado: ahi se usa la API de Gmail, que el proyecto ya usa para el resumen diario.

Comprobacion rapida de que el despliegue quedo bien:

```powershell
Invoke-RestMethod https://lifesync-ai-qs5t.onrender.com/api/health
# debe responder {"ok":true,...}
```

Y en `Render -> Environment`, anade `APP_ENTORNO=produccion` **antes** de abrir la web al publico: asi el codigo de verificacion deja de mostrarse en pantalla.
