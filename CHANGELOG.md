# Registro de cambios de LifeAgente AI

Todas las versiones se publican en la pagina de **Releases** de GitHub:
<https://github.com/brayanortiz906-lab/LifeSync-AI/releases>

La version vive en un solo sitio: el archivo **`VERSION`** de la raiz del repositorio.
La app, el instalador `.exe` y las Releases de GitHub muestran la misma.

---

## v1.1.0 — «Todo en un clic, y que no vaya lento» (actual)

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
