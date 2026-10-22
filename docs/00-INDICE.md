# 📚 Índice de documentación — LifeAgente AI

Todos los documentos del sistema, en el orden recomendado para leerlos.
Si buscas **cómo usarlo**: empieza por [`MANUAL-LOCAL.md`](../MANUAL-LOCAL.md)
(raíz) o [`LEEME.txt`](../LEEME.txt).

## Ruta rápida por lo que quieres hacer

| Quiero… | Documento |
|---|---|
| **Usarlo en mi computador** | [`MANUAL-LOCAL.md`](../MANUAL-LOCAL.md) · [`17-INSTALADOR-LOCAL.md`](17-INSTALADOR-LOCAL.md) |
| **Descargar la última versión (el `.exe`)** | [`CHANGELOG.md`](../CHANGELOG.md) · [Releases en GitHub](https://github.com/brayanortiz906-lab/LifeSync-AI/releases/latest) |
| **Entender cómo está hecho** | [`01-ARQUITECTURA.md`](01-ARQUITECTURA.md) |
| **Cambiar el comportamiento del agente** | [`02-SYSTEM-PROMPT.md`](02-SYSTEM-PROMPT.md) |
| **Conectar una IA (Claude, GPT, Gemini, una local…)** | [`06-CONE-XIONES.md`](06-CONE-XIONES.md) · [`03-INTEGRACION-API-KEY.md`](03-INTEGRACION-API-KEY.md) |
| **Entrar con Google sin configurar nada** | [`18-IA-LIGERA-Y-ACCESO.md`](18-IA-LIGERA-Y-ACCESO.md) |
| **Bajar una IA ligera para usar la app local** | [`18-IA-LIGERA-Y-ACCESO.md`](18-IA-LIGERA-Y-ACCESO.md) |
| **Que la app no se sienta lenta** | [`19-RENDIMIENTO.md`](19-RENDIMIENTO.md) |
| **Entender la parte de "IA responsable"** | [`05-RESPONSABILIDAD.md`](05-RESPONSABILIDAD.md) |
| **Personalizar (tema, orden, bienvenida)** | [`07-AJUSTES.md`](07-AJUSTES.md) |
| **Maquillar la interfaz** | [`08-SISTEMA-VISUAL.md`](08-SISTEMA-VISUAL.md) |
| **Cuentas de usuario y aislamiento** | [`09-CUENTAS.md`](09-CUENTAS.md) · [`15-CUENTAS-Y-PANELES.md`](15-CUENTAS-Y-PANELES.md) |
| **Publicarlo en la nube** | [`10-DESPLIEGUE.md`](10-DESPLIEGUE.md) |
| **Decidir cómo autenticar** | [`11-AUTENTICACION.md`](11-AUTENTICACION.md) |
| **Permisos, Drive, piloto automático** | [`12-PERMISOS-Y-NUBE.md`](12-PERMISOS-Y-NUBE.md) |
| **Que funcione sin IA ni servidor** | [`13-MOTOR-LOCAL.md`](13-MOTOR-LOCAL.md) |
| **Hacerlo adaptable a celular** | [`14-RESPONSIVE.md`](14-RESPONSIVE.md) |
| **Respaldos y el error 500** | [`16-RESPALDO-Y-NUBE.md`](16-RESPALDO-Y-NUBE.md) |

## Los documentos, uno a uno

| # | Documento | De qué va (una frase) |
|---|---|---|
| 01 | [Arquitectura](01-ARQUITECTURA.md) | Capas, decisiones de diseño, diagrama, modelo de datos y por qué el LLM no escribe en la base de datos. |
| 02 | [System Prompt](02-SYSTEM-PROMPT.md) | El contrato JSON del agente: taxonomía, 14 tipos de acción, multi-intención, cascadas y reglas de gobierno. |
| 03 | [Integración de API Key](03-INTEGRACION-API-KEY.md) | Cómo pegar tu propia clave de IA paso a paso, y qué pasa con la seguridad. |
| 05 | [Responsabilidad](05-RESPONSABILIDAD.md) | Auditoría, aprobaciones humanas, umbrales, PII y los 8 controles de cumplimiento (ISO 42001, EU AI Act, Ley 1581, GDPR, OECD, NIST). |
| 06 | [Conexiones](06-CONE-XIONES.md) | Catálogo de IAs, los 4 caminos para conectarlas (cuenta, clave, IA local, demo) y el camino «Continuar con Google». |
| 07 | [Ajustes](07-AJUSTES.md) | Temas, órdenes de ordenar, formulario de bienvenida y chat móvil arrastrable. |
| 08 | [Sistema visual](08-SISTEMA-VISUAL.md) | Espaciado, tarjetas, modales y las reglas para que nada quede pegado ni raro. |
| 09 | [Cuentas](09-CUENTAS.md) | Registro, código de verificación, sesiones, aislamiento de datos y respaldo. |
| 10 | [Despliegue](10-DESPLIEGUE.md) | Publicar en Render + GitHub Pages, variables de entorno, SMTP, Google y la tarea diaria. |
| 11 | [Autenticación](11-AUTENTICACION.md) | Firebase, Supabase, Clerk: comparativa con sus límites de plan gratis y la recomendación. |
| 12 | [Permisos y nube](12-PERMISOS-Y-NUBE.md) | Los 4 permisos, el piloto automático, el respaldo en Drive y la importación de Calendar. |
| 13 | [Motor local](13-MOTOR-LOCAL.md) | El motor de reglas del navegador, las 5 plantillas y el modo de prueba limitado. |
| 14 | [Responsive](14-RESPONSIVE.md) | 3 columnas en pantallas grandes, menú desplegable en celular, 3 líneas de resumen y un solo scroll. |
| 15 | [Cuentas y paneles](15-CUENTAS-Y-PANELES.md) | Acceso sin callejones, correo + contraseña, y paneles con permiso de ver/editar. |
| 16 | [Respaldo y nube](16-RESPALDO-Y-NUBE.md) | El error 500 explicado, el código de verificación, Drive como almacén real y la red de seguridad. |
| 17 | [Instalador local](17-INSTALADOR-LOCAL.md) | El `.exe` de Windows: qué lleva dentro, dónde viven los datos y cómo se compila. |
| 18 | [IA ligera y acceso](18-IA-LIGERA-Y-ACCESO.md) | Por qué las credenciales son públicas (acceso con un clic) y cómo bajar una IA de 400 MB para usar la app local. |
| 19 | [Rendimiento](19-RENDIMIENTO.md) | Por qué la app no se siente lenta: las mediciones antes/después y los 5 arreglos. |
| 20 | [Correo que sí llega, una sola petición y el correo como almacén](20-CORREO-Y-RENDIMIENTO.md) | El código de verificación por SMTP, la app abre en 1 viaje y el correo como almacén. |
| 21 | [Revisi
| 23 | IA gratis con tu cuenta y sistemas con interfaz | [Ver](docs/23-IA-GRATIS-Y-AGENTES.md) |
| 22 | [Correo con una clave y conexion con cualquier agente](22-CORREO-Y-AGENTES.md) | Brevo/Resend para el codigo, 18 motores de IA detectados y conexion manual por URL. |ón del log del servidor](20-CORREO-Y-RENDIMIENTO.md) | Los 3 bugs del log de Render y la lista de pendientes del despliegue. |

## Documentos fuera de `docs/`

| Archivo | De qué va |
|---|---|
| [`README.md`](../README.md) | Resumen del proyecto, cómo arrancarlo y los enlaces a todo lo demás. |
| [`MANUAL-LOCAL.md`](../MANUAL-LOCAL.md) | **El manual del sistema**: 5 formas de correrlo, dónde están los datos y qué hace cada archivo. |
| [`LEEME.txt`](../LEEME.txt) | Arranque rápido en texto plano, para quien no usa Markdown. |
| [`CHANGELOG.md`](../CHANGELOG.md) | **El historial de versiones**: qué hay en cada una y cómo se publica una nueva. |
| [`VERSION`](../VERSION) | El número de versión del sistema, en un solo archivo (lo leen la API, la web y el `.exe`). |
| [`LICENSE`](../LICENSE) | Licencia MIT. |
| 24 | Dos versiones (web y local) y la app en el celular | [Ver](24-VERSIONES-Y-MOVIL.md) |
