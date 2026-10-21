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

## 1. Desplegar la API (Render, gratis) - 5 clics

1. Entra en **https://render.com** y crea una cuenta (o entra con GitHub).
2. En el menu **New > Blueprint**.
3. Conecta el repositorio **brayanortiz906-lab/LifeSync-AI**.
4. Render lee el `render.yaml` y propone un servicio llamado `lifesync-ai`.
   Pulsa **Apply**.
5. Cuando termine (2-4 minutos) tienes:
   - App completa: **https://lifesync-ai.onrender.com**
   - API: **https://lifesync-ai.onrender.com/api/health**

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

## 8. Lo que NO puede hacer el despliegue

- Publicar en tu cuenta de Render (eso lo haces tu, con tus clics).
- Enviar correos reales si no configuras SMTP (`SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASSWORD`, `SMTP_DESDE`): sin eso, el codigo de verificacion se
  muestra en pantalla (modo desarrollo).
- Conceder permisos de Google a nombre de otra persona: cada quien autoriza
  en su propio navegador, con su propia cuenta.
