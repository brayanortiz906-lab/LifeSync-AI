# Permisos, piloto automático y trabajo en la nube (v16)

> **Resumen en una frase:** la persona entra con su cuenta, concede los
> permisos una sola vez y a partir de ahí el sistema trabaja solo — con o sin
> app abierta, y sin que nadie tenga que descargar nada.

---

## 1. El problema que resuelve este módulo

Hasta la v15 LifeAgente era una app que se abría, se usaba y se cerraba. La
persona tenía que estar presente para que las cosas pasen. Con la v16 hay tres
modos de uso y todos conviven:

| Modo | Para quién | Dónde viven los datos | Quién trabaja |
|---|---|---|---|
| **Local** | quien no quiere cuentas | en su computador (SQLite) | su equipo, con la IA local que ya tenga |
| **Nube** | quien entra con su cuenta | en el servidor, aislados por `usuario_id` | el servidor |
| **Nube + permisos** | quien quiere que el agente actúe solo | en el servidor **y** en su Drive | el servidor, con los permisos que concedió |

La diferencia entre "nube" y "nube + permisos" es justo lo que pedía el
usuario: *«que el sistema coja del gmail o el correo todos los permisos y tú
autorices todo para que lo arregle automático»*.

---

## 2. Los 4 permisos (catálogo)

Están definidos en `backend/app/permisos.py` (`PERMISOS`). Cada uno explica,
en la propia interfaz, **para qué** se pide.

| id | Título | Scope OAuth | Qué habilita |
|---|---|---|---|
| `perfil` | Saber quién eres | `openid email profile` | Crear la cuenta y aislar tus datos |
| `drive` | Guardar tus respaldos en Google Drive | `https://www.googleapis.com/auth/drive.file` | Subir un JSON con toda tu vida a tu Drive |
| `calendario` | Leer tu agenda de Google Calendar | `https://www.googleapis.com/auth/calendar.readonly` | Importar tus eventos (solo lectura) |
| `correo` | Avisarte por correo | `https://www.googleapis.com/auth/gmail.send` | Escribirte cuando el agente reorganiza tu día |

`SCOPE_COMPLETO` es la unión de todos: al pulsar **«Autorizar todo»** se piden
los cuatro en el **mismo** clic (un solo `device_code`, un solo código, una
sola visita al navegador).

Notes de diseño:

- `drive.file` (no `drive`): la app solo ve los archivos que ella misma crea.
- `calendar.readonly`: la app **nunca** borra ni edita tu calendario de Google.
- `gmail.send` (no `gmail.read`): la app escribe, no lee tu correo.

---

## 3. Endpoints

Prefijo: `/api/permisos`. Todos exigen la sesión de la persona
(`Authorization: Bearer <token>`); los datos se aíslan por `usuario_id`.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/permisos` | Estado: qué permisos hay concedidos y cómo está el piloto |
| `POST` | `/api/permisos/autorizar` | Arranca el device flow pidiendo **todos** los scopes |
| `POST` | `/api/permisos/terminar` | Comprueba si ya autorizaste; guarda el token cifrado |
| `POST` | `/api/permisos/autopiloto` | Enciende/apaga el piloto y sus partes |
| `POST` | `/api/permisos/autopiloto/ejecutar` | Ejecuta ahora respaldo + importación |
| `POST` | `/api/permisos/respaldo` | Respaldo manual en Google Drive |
| `POST` | `/api/permisos/importar-calendario` | Importa los eventos de los próximos 30 días |

Respuesta de `GET /api/permisos` (ejemplo real):

```json
{
  "conectado": false,
  "proveedor": "google_cuenta",
  "correo": "",
  "permisos": [
    { "id": "drive", "titulo": "Guardar tus respaldos en Google Drive",
      "descripcion": "...", "por_que": "...", "scope": "...", "concedido": false }
  ],
  "autopiloto": {
    "activo": false, "respaldo_auto": true, "importar_calendario": true,
    "ultimo_respaldo": "", "proximo_respaldo": ""
  }
}
```

---

## 4. Cómo se guardan los permisos

- Tabla `permisos_cuenta` (una fila por persona, `usuario_id`).
- `access_token_cifrado` y `refresh_token_cifrado` se guardan con **Fernet**
  (`backend/app/security.py`), nunca en claro.
- `scope` guarda **lo que Google concedió de verdad** (se consulta
  `https://oauth2.googleapis.com/tokeninfo`), no lo que se pidió. Si el
  usuario quita un permiso en su cuenta de Google, la app lo refleja.
- `client_id` se guarda para poder renovar el token sin depender de variables
  de entorno.

### Renovación automática

`permisos.token_acceso(db)`:

1. Devuelve el `access_token` si sigue vivo (`tokeninfo` → `expires_in > 120`).
2. Si caducó y hay `refresh_token`, llama a `oauth2.googleapis.com/token` con
   `grant_type=refresh_token`, guarda el token nuevo cifrado y lo devuelve.
3. Si no hay red, **no** invalida el token (fallo de red ≠ permiso caducado).

Con esto el sistema puede trabajar en segundo plano sin molestar a nadie.

---

## 5. El piloto automático

`main.py` arranca una tarea en el `lifespan`:

```
cada 30 minutos -> para cada persona con piloto encendido:
    1. respaldo en Google Drive (snapshot JSON de agenda, tareas, gastos, mantenimiento)
    2. importacion de Google Calendar (proximos 30 dias, deduplicado por titulo + inicio)
```

Detalles importantes:

- La tarea fija el usuario en curso con `cuentas.establecer_usuario(uid)`
  (el filtro de aislamiento usa un `contextvar`: sin eso, el trabajo en
  segundo plano tocaría los datos de cualquiera).
- Cada persona se procesa en su propia transacción: un fallo de una no
  detiene a las demás.
- `proximo_respaldo` / `ultimo_respaldo` se guardan para mostrarlo en la
  interfaz.

La persona también puede ejecutarlo a mano: **«Ejecutar ahora»**.

---

## 6. Interfaz

`frontend/src/components/PermisosPanel.tsx` (pestaña **Permisos** del menú):

- Si no hay cuenta conectada → tarjeta **«Autorizar todo con un clic»** con
  el código grande, el link a la página de autorización y el botón
  **«Listo, ya autoricé»**.
- Si está conectada → los 4 permisos con su estado (`Concedido` / `Pendiente`),
  su descripción y su «por qué».
- Interruptores: piloto automático, respaldo en Drive, importar calendario.
- Botones: `Ejecutar ahora`, `Respaldar ahora`, `Importar mi calendario`.
- Aviso final: *«Para que no tengas que descargar nada»* (la misma pantalla
  sirve en la nube y en tu equipo).

---

## 7. Qué falta por parte de quien instala (una sola vez)

| Variable | Para qué |
|---|---|
| `GOOGLE_CLIENT_ID` | el botón «Continuar con Google» y «Autorizar todo» |
| `OUTLOOK_CLIENT_ID` | entrar con Outlook/Hotmail |
| `GITHUB_CLIENT_ID` | entrar con GitHub |

El **client id es público**: no es una contraseña. Con él configurado, la
persona que usa la app nunca ve nada técnico.

Para que el trabajo en la nube funcione, además, la API debe estar desplegada
(`render.yaml` está listo) y `VITE_API_URL` debe apuntar a ella. Ver
`docs/10-DESPLIEGUE.md`.

---

## 8. Verificación

`backend/smoke.py` (130 casos) incluye la sección **PERMISOS DE LA CUENTA**:

```
[OK  ] [PERMISOS] el estado de permisos responde -> n=4
[OK  ] [PERMISOS] cada permiso explica para que sirve -> permisos=['perfil', 'drive', 'calendario', 'correo']
[OK  ] [PERMISOS] se puede encender el autopilot -> activo=True
[OK  ] [PERMISOS] el autopilot explica que falta el permiso -> respaldo=Todavia no autorizaste el acceso a Google Drive.
[OK  ] [PERMISOS] sin configuracion avisa en palabras claras -> codigo=400
[OK  ] [CUENTA] cada persona tiene su propia politica (sin colision) -> puntaje=100.0
[OK  ] [CUENTA] los permisos son de cada persona -> conectado=False
```

Los dos últimos son **regresiones** de un bug real de la v11: `AppSettings` y
`PolicySettings` usaban el `usuario_id` como clave primaria, así que la
segunda persona que entraba se comía la fila de la primera
(`UNIQUE constraint failed: policy_settings.id`). Ahora la clave primaria la
asigna la base de datos y se busca por `usuario_id`.

---

## 9. Archivos

| Archivo | Rol |
|---|---|
| `backend/app/permisos.py` | Catálogo, guardado cifrado, renovación, respaldo, importación, piloto |
| `backend/app/routers/permisos.py` | Endpoints `/api/permisos/*` |
| `backend/app/models.py` | Modelo `PermisosCuenta` |
| `backend/app/main.py` | Tarea en segundo plano del piloto |
| `backend/app/connections.py` | `scope_extra` en el device flow (pedir todo de una vez) |
| `frontend/src/components/PermisosPanel.tsx` | La pantalla de permisos |
| `frontend/src/lib/api.ts` | Cliente `permisos` |
| `frontend/src/types.ts` | `Permiso`, `EstadoPermisos` |
