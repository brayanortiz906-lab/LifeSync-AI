# Respaldo, verificación y almacenamiento en la nube (v20)

> LifeAgente AI · documento de referencia · 21 de octubre de 2026

Este documento explica tres cosas que se unieron en la v20:

1. **Por qué aparecía un error 500** y cómo se eliminó.
2. **El código de verificación por correo**: nadie puede crear una cuenta "de verdad" sin confirmar que su correo es suyo, y una cuenta sin confirmar **no puede guardar contenido**.
3. **Google Drive como almacén real**: tu contenido no vive solo en un servidor que se puede reiniciar; vive en tu Drive, y al entrar de nuevo en LifeAgente se recupera todo.

---

## 1. El error 500: causa raíz y arreglo

### Qué pasaba

Al restaurar un respaldo (o al recargar el contenido de otra cuenta) el servidor devolvía:

```
TypeError: SQLite DateTime type only accepts Python datetime and date objects as input.
[SQL: INSERT INTO events (titulo, categoria, inicio, fin, ...) VALUES (?, ?, ...)]
[parameters: [{'inicio': '2026-10-23T18:00:00', 'fin': '2026-10-23T19:30:00', ...}]]
```

### Por qué

El respaldo (snapshot) guarda las fechas **como texto ISO** (`"2026-10-23T18:00:00"`), porque es un JSON portable. Al restaurarlo, ese texto se pasaba tal cual a la columna `DateTime` de SQLite, que **solo acepta objetos `datetime`**. Además, la tarea de estudio apuntaba a un evento que todavía no existía (clave foránea rota) y el panel no se recreaba.

### Qué se hizo (`backend/app/cuentas.py` → `restaurar_snapshot`)

| Antes | Ahora |
|---|---|
| Las fechas ISO se insertaban como texto → **500** | `_convertir_fechas()` convierte cada campo `DateTime`/`Date` a `datetime`/`date` reales |
| La tarea apuntaba a un evento inexistente → **500** | Se restauran **primero los eventos** y se memoriza el id nuevo; la tarea se reapunta (`mapa_eventos`) |
| No seCreation los paneles | Se recrean los paneles con su nombre y se mapea `panel_id` |
| Se duplicaba todo | Se deduplica (evento por título+inicio, tarea por título+entrega, gasto por descripción+fecha, mantenimiento por tarea+fecha) |
| Un fallo abortaba todo | Si algo no se puede restaurar, se cuenta en `omitidos` y se sigue |
| — | El endpoint acepta el snapshot **tal cual** o envuelto en `{"datos": ...}` |

### Red de seguridad añadida

| Pieza | Para qué |
|---|---|
| `@app.exception_handler(Exception)` en `backend/app/main.py` | Ningún error vuelve a verse como un 500 pelado: devuelve un mensaje claro y registra la traza |
| `GET /api/diagnostico` | Autodiagnóstico: qué tablas hay, cuántas columnas tiene cada una, si falta alguna y si hay SMTP / Google configurado |
| `_migrar_sqlite()` dentro de `try/except` | Si la migración de una base vieja falla, la app **arranca igual** (antes el lifespan abortaba y toda la API quedaba caída) |
| Reconstrucción de `tasks` con lista de columnas real | La copia usa la intersección de las columnas que la tabla vieja tiene de verdad |

---

## 2. El código de verificación: solo las cuentas de verdad guardan contenido

### El flujo

1. La persona elige **«Entrar con mi correo y mi contraseña»** y se registra.
2. LifeAgente genera un **código de 6 dígitos** (válido 15 minutos, 6 intentos máximo) y lo manda por correo.
3. Si el servidor **no tiene SMTP configurado**, el código se muestra en pantalla (modo desarrollo) y se avisa con claridad.
4. Con el código correcto, la cuenta queda **verificada** y se abre sesión (token de 30 días).
5. Mientras la cuenta **no esté verificada**, no puede pasar: `403` con el mensaje
   *«Todavía no confirmaste tu correo, así que todavía no puedes guardar contenido.»*

### Endpoints

| Endpoint | Qué hace |
|---|---|
| `POST /api/cuentas/codigo` | Crea la cuenta y manda el código |
| `POST /api/cuentas/reenviar-codigo` | Manda otro código (se perdió o expiró) |
| `POST /api/cuentas/verificar` | Comprueba el código y abre sesión |
| `POST /api/cuentas/registro` | Alta con correo + contraseña (manda el código) |
| `POST /api/cuentas/entrar` | Entra con correo + contraseña |

### Dónde se aplica el candado

La dependencia `usuario_verificado` (`backend/app/cuentas.py`) protege **todas las operaciones de escritura**: crear/editar/borrar eventos, tareas, gastos y mantenimiento, chatear con el agente, importar material y crear o compartir paneles. El **usuario local** (el que usa la app en su equipo sin registrarse) nunca queda bloqueado: es su propio computador.

### Cómo enviar el código de verdad (una sola vez, quien instala)

En Render (o en el `.env`):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-cuenta@gmail.com
SMTP_PASSWORD=una-clave-de-aplicacion
SMTP_DESDE=tu-cuenta@gmail.com
```

> En Gmail hace falta una **contraseña de aplicación** (Cuenta de Google → Seguridad → Contraseñas de aplicación), no la contraseña normal.

---

## 3. Google Drive como almacén real

La idea: **el servidor es temporal, tu Drive es permanente**. Si el servidor se reinicia (los planes gratuitos se reinician), el contenido sigue ahí y se recupera al entrar.

### El ciclo completo

```
LifeAgente (navegador)
   │  1. "Autorizar todo"  ->  Drive + Calendar + correo
   ▼
Servidor (guarda el token cifrado)
   │  2. respaldo automático (cada 12 h)  ──────────►  Google Drive
   │  3. al entrar: si el servidor está vacío ◄──── Google Drive
   └─────────────────────────────────────────────────
```

### Endpoints

| Endpoint | Qué hace |
|---|---|
| `POST /api/permisos/autorizar` | Pide los 4 permisos de una vez (device flow) |
| `POST /api/permisos/terminar` | Guarda token + refresh token cifrados y enciende el piloto |
| `POST /api/permisos/respaldo` | Sube el snapshot a Drive (nombre con fecha: `lifeagente-respaldo-AAAAMM-DD-HHMM.json`) |
| `POST /api/permisos/importar-calendario` | Trae tus eventos de Google Calendar |
| `POST /api/cuentas/restaurar/drive` | Descarga el último respaldo de Drive y lo restaura en tu cuenta |
| `POST /api/cuentas/sincronizar` | **Al entrar**: si el servidor está vacío, recupera de Drive |
| `GET /api/diagnostico` | El estado del sistema en un vistazo |

### Qué entra en el respaldo

`version: 2` del snapshot: `eventos`, `tareas`, `registros` (gastos), `mantenimiento`, `chat`, `paneles`, `permisos_panel`, `ajustes`, `politica` y `conexiones` (sin las credenciales: esas van cifradas aparte).

### Qué ve la persona

- En la pestaña **Permisos**: el estado de cada permiso, el **piloto automático** (encendido, respaldo en Drive, importar calendario), la fecha del último respaldo y de cuándo es el próximo, y los botones **«Respaldar ahora»**, **«Importar mi calendario»** y **«Recuperar de Drive»**.
- Al entrar con su cuenta, LifeAgente llama a `sincronizar()`: si el servidor está vacío, recupera de Drive y muestra el aviso verde *"Recuperamos tu contenido de Google Drive."*

---

## 4. Verificación automática

`backend/smoke.py` → **167  casos** (104 de antes + 7 nuevos):

```
[OK] [CUENTA] la cuenta se verifica con el codigo y da token
[OK] [CUENTA] se puede reenviar el codigo de verificacion
[OK] [API] el autodiagnostico responde y no ve problemas
[OK] [RESPALDO] el respaldo incluye agenda, tareas y gastos -> eventos=3 tareas=1
[OK] [RESPALDO] restaurar el respaldo NO da error 500
[OK] [RESPALDO] el contenido vuelve en la cuenta nueva -> restaurados={'eventos': 3, 'tareas': 1, 'registros': 1, ...}
[OK] [RESPALDO] al entrar de nuevo se ve todo el contenido -> cod=200 eventos=3
```

---

## 5. Tabla de archivos

| Archivo | Qué aporta |
|---|---|
| `backend/app/cuentas.py` | `restaurar_snapshot`, `_convertir_fechas`, `exigir_cuenta_verificada`, `usuario_verificado`, `snapshot` v2 |
| `backend/app/routers/cuentas.py` | `/reenviar-codigo`, `/restaurar/drive`, `/sincronizar`, restaurar tolerante, mensaje de Google unificado |
| `backend/app/permisos.py` | `listar_respaldos_drive`, `restaurar_drive`, respaldo con nombre de fecha |
| `backend/app/main.py` | manejador global de errores, `GET /api/diagnostico`, migración que no tumba el arranque |
| `backend/app/database.py` | reconstrucción de `tasks` con las columnas reales |
| `frontend/src/store/useLifeAgente.ts` | `sincronizarCuenta()`, `mensajeSesion` |
| `frontend/src/components/AccesoPanel.tsx` | «¿No te llegó el código? Pide otro» |
| `frontend/src/components/PermisosPanel.tsx` | «Recuperar de Drive» |
| `frontend/src/App.tsx` | al entrar: sincronizar + cargar todo |
| `frontend/src/lib/api.ts` | `cuentas.reenviarCodigo`, `cuentas.restaurarDrive`, `cuentas.sincronizar` |

---

## 6. v21 - Guardado con retardo, restauracion que fusiona y tarea diaria

### 6.1 El problema del respaldo por reloj

Respaldar cada 12 horas tiene dos fallos:

1. Si el servidor se reinicia justo despues de un respaldo, se pierde hasta 12 h
   de trabajo.
2. Si se respalda mientras la persona esta escribiendo, el Drive guarda un
   estado a medio escribir.

### 6.2 La solucion: marcar, esperar y guardar

| Pieza | Donde | Que hace |
|---|---|---|
| `cambios_pendientes` / `ultimo_cambio` | `permisos_cuenta` | marcan que la cuenta cambio |
| listener `after_flush` | `backend/app/database.py` (`_registrar_escucha_cambios`) | cualquier escritura de Event, Task, LogEntry, Maintenance o Panel pone `session.info["cambios_contenido"] = True` |
| `marcar_cambios(db)` | `backend/app/permisos.py` | tras el commit, la cuenta queda «con cambios pendientes» |
| `pendiente_de_respaldo(db)` | `backend/app/permisos.py` | True si pasaron **45 s** (`SEGUNDOS_ESPERA`) sin cambios |
| `_tarea_guardado()` | `backend/app/main.py` | cada **20 s** revisa que cuentas tienen cambios pendientes y respalda las que ya pararon de escribir |
| `POST /api/permisos/guardar` | `backend/app/routers/permisos.py` | guardar en el acto, sin esperar |
| `POST /api/permisos/correo/resumen` | idem | mandar el resumen diario ahora |

La interfaz (`PermisosPanel.tsx`) muestra el estado en un Stat mas:
**«Todo guardado»**, **«Guarda en 14s»** o **«Guardando…»**, y se refresca
cada 15 s.

> **Bug real encontrado**: el listener se escribio al principio con la firma
> `(session, _flush_context, _instances)`, pero SQLAlchemy 2.1 llama `after_flush`
> con 2 argumentos -> `TypeError` en **cada escritura** (500). La firma
> correcta es `def _marcar_cambios(session, *args)`.

### 6.3 La restauracion ahora fusiona (no solo si el servidor esta vacio)

`POST /api/cuentas/sincronizar` (al entrar con tu cuenta):

| Situacion | Que hace |
|---|---|
| El Drive es mas nuevo que el servidor | restaura **solo lo que falta** (dedupe por titulo + fecha) y no duplica nada |
| El servidor es mas nuevo que el Drive | no toca nada: «Tu contenido de aqui es mas nuevo que el respaldo de Drive» |
| No hay respaldo en Drive | avisa, no rompe nada |

`restaurar_snapshot()` deduplica por evento (titulo + inicio), tarea (titulo +
entrega), gasto (descripcion + fecha) y mantenimiento (tarea + fecha), de modo
que volver a cargar el mismo Drive muchas veces nunca duplica filas.

### 6.4 La tarea diaria (GitHub Actions, gratis en repos publicos)

`.github/workflows/daily.yml`:

| Campo | Valor | Donde se configura |
|---|---|---|
| Programacion | `cron "0 11 * * *"` (06:00 en Colombia) | en el archivo |
| Objetivo | `POST $API_URL/api/permisos/ejecutar-todos` | variable `API_URL` del repo |
| Autorizacion | cabecera `X-Cron-Token` | secreto `CRON_TOKEN` |
| Sin `API_URL` o sin `CRON_TOKEN` | el workflow avisa con `::notice::` y no rompe | - |

`POST /api/permisos/ejecutar-todos` responde **403** si `CRON_TOKEN` no esta
configurado o no coincide, asi que nadie mas puede disparar la tarea.

Que hace la tarea, para cada cuenta con el piloto encendido:

1. Si hay cambios pendientes (**o** se vencio el respaldo de 12 h) sube un
   respaldo nuevo a Drive y limpia la marca.
2. Si el piloto tiene **resumen diario** activo, manda un correo con la agenda
   de manana, las tareas pendientes y los gastos de ayer (API de Gmail
   `users/me/messages/send`, mensaje RFC822 en base64url).
3. Si no tocaba, responde «No tocaba: tus datos ya estan guardados de hace poco»
   (por eso el smoke es idempotente y se puede correr dos veces seguidas).

### 6.5 Verificacion

Los 5 checks nuevos del smoke (99 -> **104**):

```
[OK] [GUARDADO] el estado avisa si hay cambios por guardar
[OK] [GUARDADO] al cambiar algo se marca pendiente
[OK] [GUARDADO] el guardado espera a que la persona pare
[OK] [GUARDADO] la tarea diaria esta protegida -> cod=403
[OK] [GUARDADO] al entrar se revisa Drive y se rellena lo que falte
```

| Archivo | Que aporta |
|---|---|
| `backend/app/database.py` | `_registrar_escucha_cambios`, listener `after_flush` con `*args`, migracion de las 3 columnas nuevas |
| `backend/app/permisos.py` | `marcar_cambios`, `pendiente_de_respaldo`, `guardar_si_toca`, `enviar_resumen_diario`, `ejecutar_autopiloto_para_todos` |
| `backend/app/main.py` | `_tarea_guardado` (cada 20 s) en el lifespan |
| `backend/app/routers/permisos.py` | `/guardar`, `/correo/resumen`, `/ejecutar-todos` (con `X-Cron-Token`) |
| `backend/app/routers/cuentas.py` | `/sincronizar` que fusiona |
| `backend/app/config.py` | `cron_token` (env `CRON_TOKEN`) |
| `frontend/src/components/PermisosPanel.tsx` | Stat «Estado del guardado», interruptor «Resumen de manana por correo», botones «Guardar ahora» y «Mandar el resumen ahora» |
| `.github/workflows/daily.yml` | tarea diaria gratis en repos publicos |
