# Cuentas de usuario, datos aislados y respaldo (v11)

LifeAgente AI funciona de **dos maneras**, y el usuario elige:

| Modo | Que es | Donde viven los datos | Necesita internet |
|---|---|---|---|
| **Local** (por defecto) | usas la app en tu equipo, sin crear nada | en tu computador (`backend/lifesync.db`) | no hace falta |
| **Con cuenta** | entras con tu correo o con Google | en el servidor, separados de los de otras personas | si |

Con el modo local **nada se sube**: la base de datos esta en `.gitignore` y la
aplicacion funciona tal cual en tu maquina. Con cuenta, cada persona tiene su
propio espacio de datos y puede guardar un respaldo.

## 1. Entrar

### 1.1 Con Google (un clic)

1. En **Conectar IA > Ya tengo mi cuenta de IA > Google (con mi cuenta de
   Google)** se autoriza una vez en el navegador.
2. LifeAgente guarda el permiso **cifrado** en el servidor (nunca ves el token).
3. En **Acceder > Entrar con Google** se usa ese mismo permiso para abrir la
   sesion: la cuenta queda verificada y se conoce tu correo.

### 1.2 Con cualquier correo (Google, Hotmail, Yahoo...)

1. **Acceder > Entrar con mi correo** -> escribes tu correo.
2. El servidor genera un codigo de 6 digitos, lo envia por correo (SMTP) y lo
   guarda **hasheado** (nunca en claro).
3. Escribes el codigo -> la cuenta queda verificada y recibes un token de
   sesion que viaja en la cabecera `Authorization: Bearer <token>`.

El token se guarda en el navegador (`localStorage`) y dura 30 dias. Hay un
limite de **6 intentos** por codigo.

## 2. Aislamiento de datos

Todas las tablas de datos llevan la columna `usuario_id`:

`events`, `tasks`, `log_entries`, `maintenance_items`, `chat_messages`,
`ai_connections`, `audit_log`, `approval_requests`, `app_settings`,
`policy_settings`.

El aislamiento es **automatico**: un filtro de sesion de SQLAlchemy
(`do_orm_execute` en `backend/app/cuentas.py`) anade
`usuario_id = <persona de la peticion>` a todas las consultas, y un
`before_flush` asigna el `usuario_id` al crear filas. Ningun router tiene que
acordarse de filtrar, y no se puede colar una fuga por olvidar un `where`.

El usuario **local** es el id 1: por eso la app sigue funcionando sin cuenta.

## 3. Respaldo

| Como | Endpoint | Resultado |
|---|---|---|
| Descargar JSON | `GET /api/cuentas/respaldo` | archivo con eventos, tareas, gastos, mantenimiento, chat y conexiones (sin credenciales) |
| Guardar en tu Drive | `POST /api/cuentas/respaldo/drive` | sube el JSON a tu cuenta de Google Drive con el permiso ya conectado |
| Restaurar | `POST /api/cuentas/respaldo/restaurar` | devuelve los datos al espacio de la persona |

## 4. API

| Metodo | Ruta | Que hace |
|---|---|---|
| POST | `/api/cuentas/codigo` | pide un codigo de verificacion (`{correo, nombre}`) |
| POST | `/api/cuentas/verificar` | valida el codigo y devuelve `{token, usuario}` |
| POST | `/api/cuentas/google` | entra con un permiso de Google (`{access_token}`) |
| POST | `/api/cuentas/google/desde-conexion` | entra usando la conexion de Google ya guardada |
| GET | `/api/cuentas/yo` | dice quien es la persona (o que eres local) |
| POST | `/api/cuentas/salir` | cierra la sesion |
| GET | `/api/cuentas/respaldo` | descarga los datos en JSON |
| POST | `/api/cuentas/respaldo/drive` | guarda el respaldo en Google Drive |
| POST | `/api/cuentas/respaldo/drive/desde-conexion` | idem, con la conexion ya guardada |
| POST | `/api/cuentas/respaldo/restaurar` | restaura un respaldo |

## 5. Envio de correo (SMTP)

Sin configurar nada, el servidor funciona en **modo desarrollo**: el codigo se
devuelve en la respuesta y se imprime en la consola. Para enviarlo de verdad
hay que definir en `backend/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=la_clave_de_aplicacion
SMTP_DESDE=tu_correo@gmail.com
```

Con esas variables el codigo llega al correo de verdad y la respuesta ya no
incluye el codigo.

## 6. Archivos

| Archivo | Que aporta |
|---|---|
| `backend/app/cuentas.py` | modelos `Usuario` y `Sesion`, codigos, SMTP, sesiones, filtro de aislamiento, snapshot |
| `backend/app/routers/cuentas.py` | los 10 endpoints de acceso y respaldo |
| `backend/app/database.py` | anade `usuario_id` a las tablas existentes |
| `backend/app/models.py` | columna `usuario_id` en las 10 tablas de datos |
| `backend/app/main.py` | middleware que fija la persona de cada peticion |
| `frontend/src/components/AccesoPanel.tsx` | el modal de acceso (Google / correo / local) |
| `frontend/src/lib/api.ts` | token en `localStorage` + cabecera `Authorization` |
| `backend/smoke.py` | 9 comprobaciones automaticas de cuentas y aislamiento |

---

## Cuentas seguras (v32): el codigo nunca se guarda en claro, nadie se auto-nombra admin

### El codigo de verificacion

| Como se guarda | Detalle |
|---|---|
| **Hasheado (SHA-256)** | la base de datos solo guarda `codigo_hash`; si alguien se lleva la base, el codigo es inutil |
| **Comparacion en tiempo constante** | `secrets.compare_digest` (no filtra informacion por tiempos) |
| **Se borra al usarlo** | `codigo_hash = ""` y `codigo_expira = None` |
| **Expira** | a los 15 min (`MINUTOS_CODIGO`) |
| **Maximo de intentos** | 5 (`MAX_INTENTOS_CODIGO`); al superarlos **el codigo se invalida** y hay que pedir otro |
| **Freno de inundacion** | pedir dos codigos seguidos da **429** con los segundos que faltan (`SEGUNDOS_ENTRE_CODIGOS`, 60 s) |

### El modo "consola" (ver el codigo en pantalla) esta CERRADO en produccion

- Con `APP_ENTORNO=desarrollo` (por defecto) el codigo se devuelve en la respuesta y se imprime en la consola: comodo para desarrollo.
- Con `APP_ENTORNO=produccion` el codigo **nunca** sale por pantalla ni por el log. Si no hay SMTP configurado, la API responde "no pudimos enviar el correo" y **no** suelta el codigo por ningun lado.

### Envio real por correo

Con estas variables de entorno el codigo llega al buzon de la persona (texto + HTML con el mismo diseno del sistema):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-correo@gmail.com
SMTP_PASSWORD=clave-de-aplicacion-de-google
SMTP_DESDE=tu-correo@gmail.com
```

El correo dice de que es el codigo, que vale 15 minutos y que **si no fuiste tu, lo ignores**. En Gmail se necesita una *clave de aplicacion* (no la contrasena normal). En Render (plan gratis) el puerto 25/465/587 esta bloqueado: por ahi se usa la API de Gmail (`gmail.send`), que el proyecto ya tiene integrada.

### Roles: nadie se vuelve admin solo

| Pathway | Resultado |
|---|---|
| Registro con correo o contrasena | el rol **se ignora**: toda cuenta nace como `usuario` |
| Enviar `rol: "admin"` en el registro | se descarta (comprobado por el smoke test) |
| Correo en `ADMIN_EMAILS` | esa cuenta **nace** como `admin` (la unica via) |
| Cuenta bloqueada | `bloqueado = true` -> no puede entrar ni usar la seccion de administracion |

La seccion de administracion (`GET /api/cuentas/admin/usuarios` y `PATCH /api/cuentas/admin/usuarios/{id}`) exige `usuario_admin` y **todo cambio queda auditado** en `audit_log` (actor, tipo, reversible). La lista **nunca** devuelve codigos ni contrasenas.
