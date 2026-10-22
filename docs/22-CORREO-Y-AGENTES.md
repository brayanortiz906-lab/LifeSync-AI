# 22. Correo con una sola clave y conexion con cualquier IA o agente

> v39 (correo Brevo/Resend) y v40 (18 motores detectados + conexion manual por URL).

## 1. El codigo de verificacion que si llega

### El problema
El codigo de 6 digitos se guardaba **hasheado** (SHA-256), no en claro, y eso esta bien.
El problema era otro: para mandarlo por correo habia que configurar un servidor SMTP
completo (host, puerto, usuario, clave de aplicacion, remitente). En la nube (Render)
eso son 5 variables y un paso extra, y si no estaba, la persona se quedaba
**esperando un correo que nadie mandaba**.

### Los 3 caminos que hay ahora

| Camino | Que necesitas | Plan gratis | Dificultad |
|---|---|---|---|
| **Brevo** | 1 clave de API | **300 correos/dia** | 1 minuto |
| **Resend** | 1 clave de API | **3.000 correos/mes** | 1 minuto |
| SMTP (clasico) | host, puerto, usuario, clave de aplicacion | depende del correo | 10 minutos |

Los dos primeros mandan el correo por su API (HTTPS), asi que **no dependen de puertos
abiertos**: el plan gratis de Render bloquea el 25/465/587, por eso el camino de la clave
es el recomendado.

### Como se configura (3 pasos, en la app)
1. Entra como administrador y abre **Conectar IA > Ajustes tecnicos > Envio de correo**.
2. Elige **Brevo** o **Resend**, pega la clave y escribe el remitente
   (por ejemplo `LifeAgente <tucorreo@tudominio.com>`).
3. Pulsa **Mandar un correo de prueba**. Si llega, listo: el codigo de verificacion
   sale de verdad.

### Donde se saca cada clave
| Proveedor | Donde | Lo que copias |
|---|---|---|
| Brevo | https://app.brevo.com/settings/keys/api | la clave `xkeysib-...` |
| Resend | https://resend.com/api-keys | la clave `re_...` |
| Remitente | Brevo: *Transactional > Email > Send test email* y verificar el dominio. Resend: https://resend.com/domains | el correo verificado |

La clave se guarda **cifrada** (Fernet) y la API nunca la devuelve: el endpoint de estado
solo dice si hay algo configurado y de donde viene.

### Si el envío falla
`correo.enviar_correo()` prueba el proveedor elegido y, si falla, **prueba otro que este
listo**. Si ninguno funciona: en desarrollo te lo muestra en pantalla (modo *consola*);
en **produccion** nunca se suelta el codigo (se queda sin confirmar) y la app te ofrece
entrar con Google, Outlook o GitHub.

## 2. Todos los sistemas de IA y de agentes de tu computador

### Se detectan 18, todos a la vez
La busqueda se hace **en paralelo** (un hilo por puerto) asi que tarda **~20 ms** en vez
de los 16 s que tardaba antes en fila.

| Puerto | Sistema | Puerto | Sistema |
|---|---|---|---|
| 11434 / 11435 | Ollama | 4000 | LiteLLM (puente de IAs) |
| 1234 | LM Studio | 3000 | Open WebUI |
| 1337 | Jan | 3001 | AnythingLLM |
| 4891 | GPT4All | 3002 | Flowise (flujos de agentes) |
| 8080 / 8081 | llama.cpp / LocalAI | 5002 | Dify (agentes y apps) |
| 5000 | text-generation-webui | 7777 | Otro servidor compatible con OpenAI |
| 5001 | KoboldCpp | 9090 | TabbyAPI |
| 8000 | vLLM | 1338 | Msty |
| 1338 | (proxy de Claude: `ANTHROPIC_BASE_URL`) | | |

### Conectar uno a mano con su URL
Si tu sistema vive en otro puerto, o es un agente tuyo, **pides la direccion a mano**:

1. En **Conectar IA > 2. Usa la IA de tu computador**, abajo: *¿Tienes otro sistema de IA
   o de agentes? Conéctalo con su URL*.
2. Pega la direccion (`http://127.0.0.1:4000`) y, si la pide, la clave.
3. Pulsa **Probar esta direccion**: LifeAgente **averigua solo como hablarle**:
   | Lo que responde | Como se habla |
   |---|---|
   | `/api/tags` responde | es **Ollama** (formato propio) |
   | `/v1/models` responde | es **compatible con OpenAI** (GPT, Claude, Gemini, LiteLLM, vLLM...) |
   | responde con `x-api-key` | es **compatible con Anthropic** |
4. Ves los modelos que tiene y pulsas **Guardar conexion**: ya queda activa.

Tambien puedes pegar la URL desde la **pagina normal**, en la tarjeta **Cosas de local**
(agenda), sin abrir el modal de conexiones.

### El proveedor "personalizado"
En el catalogo hay una entrada nueva: **🔌 Mi sistema (URL propia)**. Cuando esta activa,
el agente usa el estilo detectado (`ollama`, `openai` o `anthropic`) para hablarle.

## 3. Lo que quedo hecho en esta version

| Pieza | Que hace |
|---|---|
| `backend/app/correo.py` | 3 proveedores de correo + reintento automatico entre ellos + traduccion de errores al espanol |
| `GET/PUT /api/cuentas/correo` | ver y guardar el proveedor de correo (solo administradores) |
| `POST /api/cuentas/correo/probar` | manda un correo de prueba |
| 9 proveedores nuevos en el catalogo | vLLM, TabbyAPI, LiteLLM, Open WebUI, AnythingLLM, Flowise, Dify, AIChat, Msty |
| `POST /api/conexiones/probar-url` | autodeteccion de estilo y modelos de una URL a mano |
| `detectar_estilo_y_modelos()` | prueba Ollama, OpenAI y Anthropic y dice cual es |
| Tarjeta en la agenda | conectar por URL sin salir de la vista principal |

## 4. Verificacion (5 comprobaciones nuevas)

| Comprobacion | Resultado |
|---|---|
| El catalogo trae el proveedor de conexion manual | `personalizado` presente (28 proveedores) |
| Se detectan muchos sistemas de IA y de agentes | 18 motores locales |
| Una direccion que no responde se explica sin fallar | 200 con `ok: false` y mensaje claro |
| LifeAgente averigua solo como hablarle a tu IA local | `ok: true`, estilo `ollama`, 6 modelos |
| El estado del correo solo lo ve un administrador | 403 sin permisos |

Smoke test completo: **162 casos, todos en verde**.

## 5. Archivos

| Archivo | Para que |
|---|---|
| `backend/app/correo.py` | los 3 proveedores de correo |
| `backend/app/connections.py` | 18 motores + `detectar_estilo_y_modelos` + proveedor `personalizado` |
| `backend/app/routers/cuentas.py` | endpoints de correo |
| `backend/app/routers/conexiones.py` | `POST /conexiones/probar-url` |
| `frontend/src/components/ConexionesPanel.tsx` | tarjeta de conexion por URL |
| `frontend/src/components/PanelLocal.tsx` | conexion por URL desde la agenda |
| `frontend/src/lib/api.ts` | `api.probarUrl()` |
