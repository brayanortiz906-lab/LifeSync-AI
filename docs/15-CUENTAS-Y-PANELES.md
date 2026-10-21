# Cuentas que siempre funcionan y paneles con permiso

> Version 19 - LifeAgente AI
> Fecha: 2026-10-21
> Commit: `feat(cuentas): acceso con correo y contrasena, permisos de una vez y paneles con permiso`

---

## 1. El problema que se resolvio

Habia un mensaje que cerraba la puerta:

> *"Esta copia todavia no tiene el acceso con esa cuenta configurado. Lo activa una sola vez
> quien la instala (ayuda en 'Conectar IA > Configuracion avanzada'). Mientras tanto puedes
> entrar con tu correo o seguir en este equipo."*

Para una persona normal ese mensaje es un **callejon sin salida**: no puede entrar con Google
porque falta un ID de cliente de OAuth, y aunque puede entrar con correo, el flujo era largo
(correo -> codigo -> verificacion).

La regla que se aplico:

> **Todo flujo debe tener una via que SIEMPRE funcione, sin depender de que otro la configure.**

## 2. Las tres vias de entrada (todas disponibles a la vez)

| Via | Que necesita | Cuando funciona | Limite |
|---|---|---|---|
| **Correo + contrasena** | nada mas | **siempre**, con o sin SMTP | sin limites |
| **Codigo de un solo uso** | un servidor de correo (SMTP) | si hay SMTP configurado | sin limites |
| **Google / Outlook / GitHub** | un ID de cliente OAuth (lo activa quien instala) | si esta configurado | sin limites |
| **Sin cuenta (local)** | nada | siempre | en el navegador |

### Correo + contrasena (la via que nunca falla)

- `POST /api/cuentas/registro` con `{correo, nombre, password}`.
- La contrasena **nunca se guarda en claro**: PBKDF2-HMAC-SHA256, 120.000 iteraciones, sal de
  16 bytes por usuario, formato `pbkdf2$iteraciones$sal$hash`; la comparacion usa
  `secrets.compare_digest`.
- La cuenta se crea **pendiente de confirmar** y el sistema manda (o muestra) un codigo.
  Sin SMTP el codigo se devuelve en la respuesta y se ve en pantalla: util para probar y para
  deploying sin correo, sin dejar nunca una cuenta sin verificar.
- `POST /api/cuentas/entrar` con `{correo, password}` responde:
  - `404` si el correo no existe ("Todavia no hay una cuenta con ese correo"),
  - `401` si la contrasena no cuadra,
  - `403` si la cuenta existe pero **no esta verificada** ("Te reenviamos el codigo para que
    puedas entrar"),
  - `200` con el token de sesion si todo esta bien.
- El token vive 30 dias y acepta 6 intentos fallidos por sesion.

### Google sin callejones

- `GET /api/cuentas/google/disponible` responde `{ok, disponible, mensaje}` **sin lanzar
  errores**: la interfaz puede preguntar antes de ofrecer el boton.
- Si no esta disponible, la tarjeta de Google lo dice de forma amable:
  *"El acceso con Google todavia no esta activado en este servidor. Entra con tu correo:
  funciona igual de bien."* y el boton de correo queda highlighted.
- Si esta disponible, el boton hace el *device flow*: codigo grande -> "Abrir la pagina de
  autorizacion" -> "Listo, ya autorice". Sin pegar claves.

## 3. Pedir todos los permisos de una vez

La pantalla de cuenta incluye la tarjeta **"Pedir todos los permisos de una vez"** y la
pestana **Permisos** tiene el mismo boton. Un solo *device flow* pide los 4 scopes:

| Permiso | Scope | Para que sirve |
|---|---|---|
| Perfil | `openid email profile` | saber a quien pertenece cada dato |
| Google Drive | `https://www.googleapis.com/auth/drive.file` | respaldos automaticos |
| Google Calendar | `https://www.googleapis.com/auth/calendar.readonly` | traer tu agenda real |
| Correo (Gmail) | `https://www.googleapis.com/auth/gmail.send` | avisos de tareas y gastos |

- Se guarda el scope **real** que concedio Google (leido de `tokeninfo`), no el pedido.
- `access_token` y `refresh_token` quedan **cifrados con Fernet**; el token se renueva solo
  con `grant_type=refresh_token`.
- El piloto automatico (cada 30 min) hace el respaldo a Drive y la importacion del calendario
  sin que nadie toque nada.

## 4. Paneles: cada espacio con su propia puerta

Un **panel** es un espacio de trabajo ("Universidad", "Mi trabajo", "La casa"). Cada panel
tiene su contenido (bloques, tareas, gastos, mantenimiento) y **su lista de acceso**.

| Accion | Quien puede |
|---|---|
| Crear un panel | cualquiera con cuenta |
| Ver el contenido | el dueno y los miembros con permiso |
| Compartir (correo + nivel) | solo el dueno |
| Quitar el acceso a alguien | solo el dueno |
| Borrar el panel | solo el dueno (su contenido vuelve a "sin panel") |
| Cambiar el nivel (ver / editar) | solo el dueno |

- Endpoints: `GET/POST /api/paneles`, `PATCH/DELETE /api/paneles/{id}`,
  `GET /api/paneles/{id}/miembros`, `POST /api/paneles/{id}/compartir`,
  `DELETE /api/paneles/{id}/compartir/{usuario_id}`, `GET /api/paneles/{id}/datos`.
- Si alguien intenta ver un panel ajeno **sin permiso**, la API responde **403** con un mensaje
  claro, no un 500 ni una pantalla vacia.
- En la interfaz: pestana **Paneles** (crear, abrir, compartir, quitar acceso, borrar) y un
  selector de panel en la barra superior (opcion "Todo" + tus paneles + los compartidos
  marcados con "(compartido)").

### Como se aisla el dato

Cada fila (bloques, tareas, gastos, mantenimientos, mensajes) tiene `panel_id`. Los datos de
un panel se leen **con el contexto del dueno** (`cuentas.como_usuario(dueno)`), asi que un
miembro ve lo que se le compartio y nada mas. El filtro automatico por `usuario_id` de
SQLAlchemy se apoya en esa misma regla.

## 5. Verificacion

| Prueba | Resultado |
|---|---|
| Smoke test | 116 casos, todos en verde |
| Script manual de cuentas y paneles | 14/14 |
| `GET /api/cuentas/google/disponible` | responde sin error |
| Persona **sin** permiso sobre un panel ajeno | **403** |
| Persona **con** permiso | 200 y el panel aparece en su lista con rol "ver" |
| Registro con contrasena, contrasena incorrecta (401), sin verificar (403) | correcto |
| Build del frontend | sin errores de TypeScript |

## 6. Archivos

| Archivo | Que hace |
|---|---|
| `backend/app/paneles.py` | logica de paneles, miembros y niveles |
| `backend/app/routers/paneles.py` | API `/api/paneles` |
| `backend/app/cuentas.py` | hash de contrasena, registro, entrada, `como_usuario()` |
| `backend/app/routers/cuentas.py` | `/api/cuentas/registro`, `/entrar`, `/google/disponible` |
| `backend/app/permisos.py` | los 4 permisos, piloto automatico, Drive, Calendar |
| `backend/app/models.py` | `Panel`, `PermisoPanel`, columna `panel_id` en las tablas de datos |
| `frontend/src/components/PanelesPanel.tsx` | pestana Paneles de la interfaz |
| `frontend/src/components/AccesoPanel.tsx` | acceso con correo + contrasena y "Pedir todos los permisos" |

## 7. Nota de seguridad

El cambio es de **interfaz y de cuentas propias**: no se guardan contrasenas en claro, los
tokens van cifrados y el codigo de verificacion se exige antes de dejar entrar. Lo que sigue
pendiente **del lado del despliegue** es una sola cosa: el `GOOGLE_CLIENT_ID` (y los de
Outlook y GitHub) para que los botones de esas cuentas funcionen. Sin eso, la via de correo
con contrasena cubre el 100% del caso.
