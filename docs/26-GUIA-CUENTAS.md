# Activar Google, Outlook o GitHub para toda la gente (guia paso a paso)

> Version **1.5.0**. Todo esto esta **dentro de la app**: no hace falta buscar
> tutoriales ni saber de cuentas de desarrollador.

## 1. Que es esto y por que hace falta

Para que alguien entre con su cuenta de Google (y de esa cuenta salga el acceso
a **Drive**, al **calendario** y al **correo**), Google necesita saber que
aplicacion esta pidiendo el permiso. Para eso sirve el **identificador de
cliente** (client id): un identificador **publico** (no es tu contrasena, no es
un token privado, no se puede usar para entrar a tu cuenta).

Se pega **una sola vez** en el servidor y a partir de ahi **toda la gente** que
use LifeAgente puede entrar con su cuenta tocando un boton.

## 2. Donde se hace (3 pasos dentro de la app)

1. Abre **Conectar IA** (el boton de arriba a la derecha, o *Ajustes tecnicos*).
2. Despliega **"Ajustes tecnicos (solo si algo va mal)"** y busca el bloque
   **"Entrar con Google, Outlook o GitHub"**.
3. Pulsa **"Como se hace, paso a paso (sin tecnicismos)"**: ahi esta la guia de
   los tres proveedores. Copia el identificador, pegalo en el campo y pulsa
   **"Comprobar"**. Si dice que esta bien, pulsa **"Guardar y activarlo para todos"**.

## 3. La guia que hay dentro de la app

### Google (para Google, Drive, Calendar y correo)
1. Abre la consola de Google Cloud y elige un proyecto (o crea uno).
2. Pulsa **"Crear credenciales"** y luego **"ID de cliente OAuth"**.
3. En "Tipo de aplicacion" elige **"App de escritorio"** (es el que funciona sin URL de redireccion).
4. Ponle un nombre (por ejemplo "LifeAgente") y pulsa "Crear".
5. Copia el **ID de cliente**: una linea larga que termina en `.apps.googleusercontent.com`.
6. Pegalo en la app, pulsa "Comprobar" y guarda.

### GitHub
1. Abre `https://github.com/settings/developers`.
2. Pulsa **"New OAuth App"**.
3. Nombre: "LifeAgente". Las dos URL de redireccion: `http://localhost` (no se usan, pero GitHub las pide).
4. Copia el **Client ID** (el secret no hace falta) y pegalo en la app.

### Outlook / Hotmail
1. Entra en `https://portal.azure.com/` y busca **"App registrations"**.
2. **"New registration"** -> nombre "LifeAgente".
3. En "Supported account types" elige la opcion que incluye las cuentas personales.
4. Copia el **Application (client) ID** de la pagina de resumen y pegalo en la app.

## 4. El boton "Comprobar"

Antes de guardar, la app hace **la misma peticion que luego hara el flujo de
entrada** (pedir el codigo de autorizacion al proveedor). Por eso sabe si el
identificador sirve de verdad:

| Que pasa | Que te dice |
|---|---|
| El ID esta bien | "El identificador es correcto: ya puedes activarlo para todos." |
| Esta mal copiado o truncado | "Ese ID de cliente no existe. Copialo de nuevo desde el panel del proveedor..." |
| Es muy corto | "El identificador esta incompleto..." (los IDs son largos: unos 100 caracteres) |

## 5. Quien puede activarlo

| Situacion | Quien es "administrador" |
|---|---|
| Instalacion local (la que descargas) | el usuario local: en tu propio computador tu eres el dueno |
| Servidor web recien instalado | la **primera cuenta que se registra** nace administradora |
| Servidor ya configurado | quien este en `ADMIN_EMAILS` |

El registro publico **nunca** puede pedir el rol de administrador: si en el
cuerpo de la peticion mandas `rol: admin`, se ignora.

## 6. Que se activa con esto

| | |
|---|---|
| **Entrar con tu cuenta** | Google, Outlook y GitHub, con un clic |
| **Drive** | guardar y recuperar tus respaldos en tu Drive |
| **Calendar** | importar tu agenda de Google Calendar |
| **Correo** | el resumen diario y el codigo de verificacion |

## 7. Archivos

| Archivo | Que hace |
|---|---|
| `backend/app/routers/cuentas.py` | `POST /api/cuentas/servidor/clientes/probar` (comprueba el ID contra el proveedor) |
| `backend/app/cuentas.py` | `exigir_admin()`: en la instalacion local el usuario local es el administrador |
| `backend/app/connections.py` | `iniciar_autorizacion_cuenta()`: la peticion que valida el ID |
| `frontend/src/components/ConexionesPanel.tsx` | la guia, el boton "Comprobar" y los campos |
| `frontend/src/lib/api.ts` | `cuentas.probarClienteServidor()` |

## 8. Verificacion

- `POST /api/cuentas/servidor/clientes/probar` con un ID falso -> `ok: false` con el mensaje
  "Ese ID de cliente no existe. Copialo de nuevo desde el panel del proveedor y asegurate de guardarlo completo."
- ID de menos de 10 caracteres -> HTTP 400 con el mensaje de que esta incompleto.
- En el navegador: la guia se abre con los pasos de los tres proveedores y el boton
  "Comprobar" aparece al escribir un identificador.
- 167 comprobaciones automaticas en verde.
