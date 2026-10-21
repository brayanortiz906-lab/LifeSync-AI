# Publicar LifeSync AI con datos reales (API en la nube + cuentas)

Objetivo: que cualquier persona abra el enlace y use LifeSync con **datos
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
