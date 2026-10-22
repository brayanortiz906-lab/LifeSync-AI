# Registro de cambios de LifeAgente AI

Todas las versiones se publican en la pagina de **Releases** de GitHub:
<https://github.com/brayanortiz906-lab/LifeSync-AI/releases>

La version vive en un solo sitio: el archivo **`VERSION`** de la raiz del repositorio.
La app, el instalador `.exe` y las Releases de GitHub muestran la misma.

---

## v1.5.0 - La guia de las cuentas DENTRO de la app (y un boton que comprueba el identificador)

### Que quedaba: "no me deja entrar con Google / Hotmail / GitHub"

- **Guia paso a paso dentro de la app** (en *Conectar IA > Ajustes tecnicos > Entrar con Google, Outlook o GitHub*): los 6 pasos exactos de cada proveedor, con el enlace a su consola y que copiar. Sin tecnicismos.
- **Boton "Comprobar"**: antes de guardar, la app pregunta al propio proveedor si el identificador sirve. Si esta mal copiado, lo dice claro ("Ese ID de cliente no existe...") y no se guarda nada.
- En una **instalacion local** (la que se descarga), el usuario local es el dueno de la maquina y puede activar las cuentas sin buscar un administrador.
- Las tarjetas de Google / Outlook / GitHub ya se ven tambien en la **pantalla de bienvenida** de la version local.

### Lo demas

- El Drive tiene siempre salida: si no esta autorizado, "Descargar y subir a Drive" (abre el uploader de Google) o "Activar el acceso a Google".
- La vista del celular empieza por "Tu dia de un vistazo" y el panel "IA de tu movil" recomienda el modelo segun la RAM y los nucleos del aparato.
- 167 comprobaciones automaticas (2 nuevas: la activacion responde y un identificador falso se rechaza con mensaje claro).

## v1.4.0 - Entrar con Google, Outlook o GitHub (para toda la gente) + IA del movil

### Las cuentas de verdad, activables desde la app

- Nuevo bloque **"Entrar con Google, Outlook o GitHub"** en *Conectar IA > Ajustes tecnicos*: tres campos, enlace directo a la consola de cada proveedor y un boton **"Guardar y activarlo para todos"**.
- Los identificadores son **publicos** (no son secretos) y se guardan en la configuracion del servidor: valen para toda la gente que use el sistema.
- **La primera cuenta de una instalacion nueva nace administradora**, asi el dueno puede activarlo sin tocar variables de entorno.
- El mensaje de error ya no culpa al usuario: "Lo activa el dueno de la app en un solo paso... No te frena: entra con tu correo y tu contrasena, o sigue usando LifeAgente aqui".
- Las tarjetas de Google / Outlook / GitHub **tambien** se ven en la version local.

### Drive siempre tiene salida

- Si Drive no esta autorizado, el panel de cuenta **no muestra un error seco**: ofrece **"Descargar y subir a Drive"** (descarga el respaldo y abre el uploader de Google: dos toques) y **"Activar el acceso a Google"**.

### IA para el celular, segun sus recursos

- Nuevo panel **"IA de tu movil"**: detecta la RAM y los nucleos y **recomienda siempre un modelo primero**.
  - menos de 3 GB -> `qwen2.5:0.5b` (400 MB, solo texto, el que mejor gasta la bateria)
  - 3 a 6 GB -> `llama3.2:1b` (1,3 MB -> 1,3 GB, equilibrio)
  - 6 GB o mas -> `gemma3:1b` (815 MB, la mas capaz que cabe)
- Barra de progreso real de la descarga, aviso honesto del **permiso de notificaciones** y la nota: solo IAs que corren en tu propio aparato (no gastan datos, no dependen de internet).

### El movil, mas amigable

- La vista del celular empieza por **"Tu dia de un vistazo"** (las 3 lineas) y luego calendario, IA del movil, cosas de local y avisos.

### Limpieza y arreglos

- Se borraron de tu base de datos **550 cuentas de prueba** y **80 paneles de prueba** que habian dejado los tests automaticos.
- El test automatico **ahora se limpia solo** lo que crea (y borra las tareas antes que los eventos, porque la llave foranea impedia limpiarlos).
- Arreglo del import de `Usuario` (vive en `cuentas.py`, no en `models.py`) y del bloque del administrador nuevo (500 al arrancar).
- Se corrigieron caracteres mal escritos y se paso de 162 a 165 verificaciones automaticas.

## v1.3.0 - Avisos del celular, APK de Android y lista de pendientes

- **Avisos y alarmas del celular**: nueva pestana "Avisos del celular" para encender las
  notificaciones, ver y quitar las alarmas; la campana en cada bloque del calendario
  programa el aviso (al empezar, 10 min, 30 min, 1 hora o 1 dia antes). Las alarmas se
  guardan en el navegador y se vuelven a armar al abrir la app. En el APK usan la alarma
  nativa de Android (plugin LocalNotifications de Capacitor).
- **APK de Android**: el workflow "APK de Android" compila la app para Android con la
  direccion de la API ya dentro, asi que **se instala y ya funciona** (sin configurar
  nada). La API acepta el origen del APK (`capacitor://localhost`).
- **Se acabo la basura de las pruebas**: el smoke test borra solo lo que crea (233 tareas,
  27 eventos y 7 gastos de prueba que se habian acumulado en tu base) y ya no rompe
  la limpieza por la llave foranea.
- **Pendientes por prioridad**: documentados en `docs/25-AVISOS-Y-APK.md`.

---

## v1.2.0 — Dos versiones (web y local) y la app en el celular

| Que | Como |
|---|---|
| **Dos versiones bien separadas** | La pagina web es la de las cuentas y las conexiones (Google, Drive, calendario, correo). La que se descarga (`.exe`) es la version LOCAL: sin cuenta, con la base de datos en tu equipo y la IA de tu computador | 
| **La version local no pide cuenta** | El backend dice en que perfil esta (`/api/health` -> `perfil`) y la interfaz se adapta: en local desaparecen las tarjetas de cuentas y Drive |
| **La app en el celular** | Es una PWA: se instala desde el navegador (icono en el escritorio, pantalla completa) y abre sin internet |
| **Boton de instalar** | Aparece en la barra superior cuando el navegador dice que se puede instalar |
| **Mas modelos y agentes** | 28 proveedores de IA, 11 servicios gratis con tu cuenta y 12 sistemas de IA con interfaz detectados en tu computador |

### Como se publica una version nueva
1. Cambia el archivo `VERSION` (por ejemplo `1.2.0`).
2. `publicar.ps1 -Mensaje "..."` (pruebas + commit + push + espera al CI).
3. `git tag v1.2.0` y `git push upstream v1.2.0`.
4. El workflow compila el `.exe`, arma el zip del sistema y publica la release.

## v1.1.1 — «El instalador arrancaba de verdad» (actual)

### El arreglo
El `.exe` **no arrancaba** y mostraba este error:

```
AttributeError: 'NoneType' object has no attribute 'isatty'
ValueError: Unable to configure formatter 'default'
```

**Por que pasaba**: una app de Windows abierta en modo ventana (sin consola) deja
`sys.stdout` y `sys.stderr` en `None`. Uvicorn, al preparar el log, hace
`sys.stdout.isatty()` y ahi se caia.

**Como se arreglo** (`desktop/launcher.py`): antes de arrancar el servidor se
comprueba que la salida existe; si no, se manda a la nada en vez de reventar.
Ademas el servidor ahora escribe su log en `%APPDATA%\LifeAgente\servidor.log`,
asi la ventana del lanzador puede mostrarte que paso si algo falla.

**Verificado**: se reprodujo el fallo exacto (servidor caido) y se comprobo el
arranque correcto (`/api/health` -> 200 con la version 1.1.1) con la salida nula.

### Como se publica una version nueva
1. Cambiar el archivo **`VERSION`** de la raiz (por ejemplo `1.1.1`).
2. `publicar.ps1 -Mensaje "..."` (pruebas + commit + push + espera al CI).
3. `git tag v1.1.1` y `git push upstream v1.1.1`.
4. El workflow **«Instalador de Windows»** compila el `.exe`, arma el zip del
   sistema completo y publica la release en GitHub.

---

## v1.1.0 — «Todo en un clic, y que no vaya lento»

### Instalar y usar
| Qué | Cómo |
|---|---|
| **Instalador para Windows** | `LifeAgente.exe`: un solo archivo. Trae la API, la interfaz y crea la base de datos. Al cerrar, guarda y apaga. |
| **La web en la nube** | https://brayanortiz906-lab.github.io/LifeSync-AI/ |
| **La app y la API juntas** | https://lifesync-ai-qs5t.onrender.com |

### Entrar es un solo boton
- Antes habia dos pestañas («Ya tengo cuenta» / «Crear cuenta»). Ahora hay **un boton**: *Entrar o crear mi cuenta*.
- El sistema decide: si la cuenta existe entras, si no la crea, y si el correo todavia no esta confirmado te pide el codigo de 6 digitos.
- **Una contrasena incorrecta nunca crea una cuenta nueva** (responde 401).
- El codigo **no se vuelve a generar** si el que te enviaron sigue vigente.

### El codigo de verificacion ahora si llega
- La app **dejo de prometer un correo que no se mandaba**: dice la verdad en los 3 casos (enviado / te lo mostramos aqui / este servidor no envia correos).
- **Correo configurable desde la app**: *Conectar IA > Ajustes tecnicos > Envio de correo* (host, puerto, usuario, clave, remitente) + boton de *Mandar un correo de prueba*.
- Con **contrasena** puedes usar la app aunque el correo no este confirmado (la contrasena ya demuestra que eres tu).
- El **codigo nunca se escribe en el log** del servidor (antes si: cualquiera que leyera el log entraba a tu cuenta).

### Conectar **cualquier** IA, en 4 secciones claras
`Conectar IA` quedo reorganizado (de la mas facil a la mas manual):
1. **Entra con tu cuenta** — Google, Outlook/Hotmail o GitHub (un clic, sin claves).
2. **Usa la IA de tu computador** — detecta sola Ollama, LM Studio, Jan, llama.cpp, LocalAI, GPT4All, Kobold y Claude local, y **se conecta sin que hagas nada**.
3. **Conecta una IA con clave** — OpenAI, Anthropic, Gemini, OpenRouter (468 modelos de 67 familias).
4. **Solo quiero ver como funciona** — el asistente demo, sin cuentas ni claves.
- Abajo: *Tus conexiones* y *Ajustes tecnicos* (plegados, solo si algo va mal).

### IA super ligera descargable
4 modelos para usar la app **sin internet y sin claves**:
| Modelo | Peso |
|---|---|
| `qwen2.5:0.5b` | 400 MB (recomendado) |
| `gemma3:1b` | 815 MB |
| `llama3.2:1b` | 1,3 GB |
| `phi3.5:mini` | 2,2 GB |

Se descargan desde la app (con barra de progreso) o desde el instalador (boton *Descargar IA ligera*).

### Lo de local, tambien en la pagina normal
- Nueva tarjeta **«Cosas de local»** en *Mi agenda*: el estado de tu IA, las 5 plantillas y una caja para **pegar la informacion que tengas en otro chat**.
- El calendario vacio te ofrece las plantillas (estudiante, oficina, emprendedor, moto, semana simple).

### Velocidad: de 12 peticiones a 1
| | Antes | Ahora |
|---|---|---|
| Peticiones al abrir la app | 12 | **1** (`/api/inicio`) |
| Detectar tu IA local | **16 s** | **0,7 s** (en paralelo) |
| Cargar la web (medido) | 9,7 s | **0,5 s** |

- La deteccion de motores locales sondea **todos los puertos a la vez** (antes uno por uno).
- Cuando el servidor de la nube esta dormido, la app lo dice: *«Despertando el servidor…»*.
- Cuando la IA de tu computador esta pensando, la app avisa: *«puede tardar 1 o 2 minutos. No es un error»*.

### El correo tambien sirve de almacen
- Boton **«Guardar una copia en tu correo»**: manda el respaldo completo (agenda, tareas, gastos, mantenimiento, paneles) **adjunto a un correo** (por la API de Gmail).
- Respaldo automatico en **Google Drive** cada 12 h + recuperacion al entrar con tu cuenta.
- Resumen de la manana por correo (agenda del dia siguiente, tareas pendientes, gastos de ayer).

### Cuentas seguras
- El codigo de verificacion se guarda **hasheado** (SHA-256), expira en 15 min y tiene 5 intentos.
- **Nadie puede crear una cuenta de administrador**: el rol sale de `ADMIN_EMAILS` del despliegue, nunca del formulario.
- Seccion de administracion (`/api/cuentas/admin/usuarios`) para dar de alta o bloquear cuentas, **con auditoria**.
- Freno de abuso: 60 s entre codigos (429) y tope de intentos que invalida el codigo.

### Paneles con puerta
- Crea **paneles** (agenda, estudio, dinero, casa, personal) y compártelos **por correo** con nivel *solo ver* o *editar*.
- Quien no tiene permiso recibe **403**. Se puede quitar el acceso en cualquier momento.

### Diagnostico: la lista de pendientes dentro de la app
`GET /api/diagnostico` y *Conectar IA > Ajustes tecnicos > Estado del servidor* dicen que falta
(por ejemplo: *modo produccion*, *correo SMTP*, *acceso con Google*) y **como se arregla** cada cosa.

### Interfaz
- Sistema visual global: nada queda pegado, los modales tienen pie fijo, los formularios tienen jerarquia.
- Responsive: 3 columnas en pantallas grandes, menu desplegable en movil, un solo scroll.
- 4 temas (Medianoche, Oceania, Bosque, Atardecer) y formas de ordenar tareas, gastos y eventos.
- Chat flotante **arrastrable** por toda la pantalla.

---

## v1.0.0 — Primera version publica

- App base: agenda, tareas academicas, bitacora de gastos y mantenimiento.
- Chat flotante con un agente que registra lo que le dices en palabras simples.
- Calendar por franjas (Manana / Tarde / Noche) con avisos de cruce.
- Sistema de IA responsable: auditoria, aprobaciones humanas, redaccion de datos personales y 8 controles de cumplimiento (ISO/IEC 42001, EU AI Act, Ley 1581, GDPR).
- Publicacion en GitHub: CI, GitHub Pages, Codespaces, Docker y Render.
- Primer instalador para Windows (`LifeAgente.exe`) y el archivo con el codigo fuente.

---

## Como se numeran las versiones

- **Mayor** (1.1.0): cambios que cambian el uso (un boton, una pantalla nueva, un sistema nuevo).
- **Menor** (1.0.1): improvements y arreglos.
- **Parche** (1.0.2): arreglos sin tocar nada de lo que la persona ve.

Cada version publicada tiene su etiqueta (`v1.1.0`) y su pagina en **Releases**, con el `.exe`
de Windows y el codigo fuente. Para instalar: entra a *Releases*, descarga `LifeAgente.exe`,
doble clic y a trabajar.
