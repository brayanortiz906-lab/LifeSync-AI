# 20. Correo, rendimiento y el correo como almacen

> v36 · "no me envio el codigo al correo", "va muy lento" y "usa Google, Hotmail o GitHub para crear la cuenta y guardar tu informacion".

---

## 1. El problema del codigo que no llegaba

### Lo que pasaba

La persona pedia el codigo de verificacion y **no llegaba nada**. El motivo era una combinacion de tres cosas:

| # | Causa | Que se veía |
|---|---|---|
| 1 | El servidor (Render) **no tiene SMTP configurado** | `enviar_codigo()` caia en modo `"ninguno"`: no mandaba correo, no imprimia el codigo (en produccion) |
| 2 | Con `APP_ENTORNO=produccion` el modo consola esta **cerrado a proposito** (v32) | el codigo no se devolvia en la respuesta |
| 3 | **La interfaz mentia**: decia siempre *"Te enviamos el codigo a tu correo"* | la persona esperaba un correo que nunca iba a llegar |

El punto 3 es el mas grave: no era solo que el correo no llegara, es que la app **prometia** algo que no estaba haciendo.

### La solucion (v36)

1. **Mensajes honestos**: el servidor responde con un `modo` y un texto que corresponde:
   | Modo | Que significa | Que ve la persona |
   |---|---|---|
   | `smtp` | se mando de verdad | *"Te enviamos el codigo a tu correo"* |
   | `consola` | no hay SMTP, pero es desarrollo | el codigo en pantalla |
   | `ninguno` | no hay forma de enviarlo | *"No pudimos enviarte el correo… entra con Google, Outlook o GitHub (un clic, sin codigo) o sigue en este equipo"* |
2. **Correo configurable desde la app**: `ConfiguracionServidor` (tabla nueva) guarda host, puerto, usuario, remitente y **la clave cifrada** con Fernet. Lo configura el administrador **una vez** desde *Conectar IA > Ajustes tecnicos > Envio de correo*.
3. **Una cuenta con contrasena no queda atrapada**: si la persona creo su cuenta con contrasena, puede entrar y trabajar aunque el correo siga sin confirmar (la contrasena ya demuestra que es ella). Sin contrasena, sigue haciendo falta el codigo.
4. **Google / Outlook / GitHub crean la cuenta**: con un clic se autoriza en el navegador, la cuenta queda **verificada al instante** y se entra. Sin código, sin SMTP.

---

## 2. El rendimiento: de 12 viajes a 1

### La medicion (en la nube, Render)

La app abria con **12 peticiones** al servidor:

```
dashboard · eventos · tareas · registros · mantenimiento · paneles
ajustes · politica · resumen_auditoria · cumplimiento · permisos · aprobaciones
```

Con ~200 ms por viaje (y la primera peticion tras el reposo de Render tardaba ~10 s) eso se notaba mucho.

### El arreglo: un solo endpoint

`GET /api/inicio` devuelve **todo** en una sola peticion:

| Antes | Ahora |
|---|---|
| 12 peticiones, 3 042 ms en serie / 9 774 ms en paralelo | **1 peticion, 198 ms** (medido en local) |
| Tras un mensaje del agente se refrescaban 5 endpoints | se refresca **solo** `aprobaciones?estado=pendiente` |

El endpoint es `backend/app/routers/inicio.py` y el store (`frontend/src/store/useLifeAgente.ts`) consume `api.inicio()` + `api.historial()`.

### Los otros arreglos de rendimiento (v34 + v36)

| Arreglo | Detalle |
|---|---|
| Deteccion de IA local **en paralelo** | 8 puertos sondeados a la vez con timeout de 0,7 s: **16 s → 0,7 s** |
| Bootstrap de credenciales | timeout 1,5 s y reintento en segundo plano: el login no se atasca |
| SQLite | `synchronous=NORMAL` + `busy_timeout=8000` |
| Tareas de fondo | el vigilante de guardado pasa de 20 s a 45 s |
| **La interfaz explica la espera** | banner *"Despertando el servidor…"* si una peticion pasa de 3,5 s, y en el chat *"Tu IA esta pensando en tu computador… no es un error"* |

---

## 3. El correo como almacen

Hasta ahora habia dos almacenes: el **Drive** de cada persona y el **disco del servidor** (efimero en Render). Se anade el tercero, que es el que **ya tienes**: tu buzon de correo.

| Pieza | Como funciona |
|---|---|
| `POST /api/permisos/respaldo/correo` | Arma el snapshot JSON completo (`cuentas.snapshot()`) y lo manda **como adjunto** por la API de Gmail (`multipart/mixed` + base64). |
| Boton **"Guardar una copia en tu correo"** | En *Permisos > Piloto automatico*. Un clic y el archivo `lifeagente-respaldo.json` llega a tu bandeja. |
| Permiso necesario | `gmail.send` (el mismo que usa el resumen diario). Si falta, el boton lo dice claro. |

Ventajas: no depende de Drive, no depende del disco del servidor, y el archivo queda en un sitio que la persona ya sabe usar (bajar adjuntos, guardarlos, reenviarlos).

---

## 4. Resumen de la v36

| Que se hizo | Donde |
|---|---|
| La UI deja de mentir sobre el correo | `backend/app/routers/cuentas.py` (`_mensaje_envio`) + `frontend/src/components/AccesoPanel.tsx` |
| Servidor de correo configurable desde la app | `backend/app/models.py` (`ConfiguracionServidor`), `backend/app/cuentas.py` (`configuracion_smtp`), `GET/PUT /api/cuentas/smtp`, `POST /api/cuentas/smtp/probar` |
| Con contrasena se entra sin confirmar el correo | `backend/app/cuentas.py` (`exigir_cuenta_verificada`, `entrar_con_password` -> `ok_sin_confirmar`) |
| Google / Outlook / GitHub crean la cuenta verificada | `backend/app/cuentas.py` (`entrar_con_cuenta`) + pantalla de bienvenida |
| 12 peticiones -> 1 | `backend/app/routers/inicio.py` + `frontend/src/store/useLifeAgente.ts` |
| Respaldo al buzon de correo | `backend/app/permisos.py` (`respaldar_por_correo`) + `PermisosPanel.tsx` |

---

## 5. Verificacion

| Check | Que comprueba |
|---|---|
| `[VELOCIDAD] /api/inicio trae todo en una sola peticion` | que el endpoint nuevo devuelve las 9 piezas |
| `[CORREO] el codigo no promete un correo que no se manda` | que el texto corresponde al modo real |
| `[CORREO] si no se puede enviar, avisa y ofrece otras formas de entrar` | que el mensaje nombra Google/Outlook/GitHub y el modo local |
| `[CORREO] con contrasena se entra aunque el correo no este confirmado` | que la cuenta no queda atrapada |
| `[CORREO] el estado del servidor de correo nunca muestra la clave` | que la clave no sale por la API |
| `[CORREO] el respaldo por correo existe y responde` | que el endpoint nuevo no es un 404 ni un 500 |

---

## 6. Lo que sigue necesitando el administrador

| Que | Donde | Para que |
|---|---|---|
| Servidor SMTP + clave de aplicacion | *Conectar IA > Ajustes tecnicos > Envio de correo* (o `SMTP_*` en Render) | que el codigo de verificacion llegue al correo |
| ID de cliente OAuth de escritorio | Google Cloud / `GOOGLE_CLIENT_ID` | que "Continuar con Google" funcione en un clic y con Drive/Calendar |
| `APP_ENTORNO=produccion` | Render | cierra el modo consola (el codigo no sale por pantalla) |

## Revision del log del servidor (v37)

Un log de produccion enseña los problemas que nadie ve desde la interfaz.
Estos son los que aparecian y como quedaron:

| En el log | Que era | Arreglo |
|---|---|---|
| `[correo] codigo de acceso para shadow...@gmail.com: 185875` | **El codigo de acceso se escribia en el log del servidor.** Quien pudiera leer el log entraba a la cuenta. | El codigo **nunca** se escribe en el log (solo se avisa de que se genero). Sigue estando en la respuesta de la API en modo desarrollo. |
| `GET /api/ajustes 404 Not Found` | Las interfaces viejas guardadas en el navegador piden `/api/ajustes`; ese endpoint no existe (el bueno es `/api/settings`). | Se creo el **alias `/api/ajustes`** -> una pestana vieja sigue funcionando en vez de romperse. |
| 11 peticiones followed de `/api/dashboard`, `/api/events`... | El navegador estaba usando el **bundle viejo** (cache del navegador) que hace 11 viajes HTTP. | Con la v36 la app hace **1 viaje** (`/api/inicio`). Para tomar la version nueva: **recarga sin cache** (Ctrl+Shift+R). |
| `POST /api/cuentas/google/desde-conexion 400` | Correcto: no hay ninguna cuenta de Google conectada todavia. | Con `GOOGLE_CLIENT_ID` configurado funciona. |
| `POST /api/conexiones/verificar 200` | Correcto: ya no da 500 (arreglo de la v35). | Sin cambios. |
| `Deploying...` / `Shutting down` / `Your service is live` | Es el **despliegue normal de Render**: levanta la instancia nueva, pasa el chequeo de salud y reemplaza la vieja. | Sin cambios (no es un error). |

### La lista de pendientes, dentro de la app

`GET /api/diagnostico` y el bloque *Estado del servidor* (en *Conectar IA >
Ajustes tecnicos*) dicen, con informacion real del servidor, que falta:

1. **Modo produccion** (`APP_ENTORNO=produccion`).
2. **Correo SMTP** (para que el codigo de verificacion llegue).
3. **Acceso con Google** (opcional: hay otras vias de entrada).
4. **CORS** con el origen de la web de GitHub Pages.
5. **Direccion de la API** en la web publicada.

Cada uno con su estado (`listo` / `pendiente` / `opcional`) y **como se
arregla**. Asi nadie tiene que adivinar.
