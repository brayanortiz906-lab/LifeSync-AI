# Política de seguridad — LifeAgente AI

## Qué hace este proyecto con tus datos

LifeAgente AI guarda información **muy personal**: tu agenda, tus tareas de
estudio, tus gastos y tus mantenimientos. Por eso la seguridad no es un
detalle: está en el diseño.

| Qué | Cómo lo tratamos |
|---|---|
| **Claves de IA** que pegas | se cifran con **Fernet (AES)** antes de tocar la base de datos; **nunca** se devuelven por la API |
| **Tokens de sesión** | 30 días, 6 intentos por cuenta |
| **Contraseñas** | PBKDF2-HMAC-SHA256, 120 000 iteraciones, sal de 16 bytes, comparación con `compare_digest` |
| **Datos personales** (cédula, teléfono, correo, tarjetas) | el agente los **redacta** antes de mandarlos al modelo si la política lo activa |
| **Auditoría** | cada acción del agente queda registrada: actor, motivo, confianza, riesgo y si fue reversible |
| **Acciones delicadas** (borrar, gastos altos, baja confianza) | requieren **aprobación humana** |
| **Aislamiento** | cada persona ve solo lo suyo (`usuario_id` en todas las tablas) |
| **Respaldo** | en tu **Google Drive**, con cifrado y a nombre de cada usuario |

## Qué **no** debes hacer aquí

- **No pegues tokens de GitHub, claves de IA ni contraseñas en los chat, issues
  o commits.** Si lo hiciste, revócalo: https://github.com/settings/personal-access-tokens
- **No subas tu archivo `.env`** (está en `.gitignore`). El `.env.example` solo
  tiene valores de ejemplo.
- **No subas la base de datos** (`*.db`): está en `.gitignore` y contiene datos
  personales tuyos y de quienes usen la app.

## Cómo reportar un problema

Si encuentras una vulnerabilidad, **no abras un issue público**. Escríbelo
directamente al mantenedor del repositorio (owner del repo) describiendo:

1. Qué falla y cómo se reproduce.
2. Qué datos quedan expuestos (si aplica).
3. La versión (commit o etiqueta) y el entorno (instalador `.exe`, Render,
   GitHub Pages o desarrollo local).

Se responde en la mayor brevedad posible y se avisa a quien pueda verse
afectado antes de publicar el arreglo.

## Divulgación responsable

- Se da tiempo para corregir antes de publicar detalles.
- Se reconoce el reporte en el historial de commits cuando así se pide.
- No se testing de forma destructiva sobre datos de terceros: usa tu propia
  cuenta o el modo local.

## Contacto

- Repositorio: https://github.com/brayanortiz906-lab/LifeSync-AI
- Alcance del sistema de gobernanza: [`docs/05-RESPONSABILIDAD.md`](docs/05-RESPONSABILIDAD.md)
- Cuentas y aislamiento: [`docs/09-CUENTAS.md`](docs/09-CUENTAS.md) ·
  [`docs/15-CUENTAS-Y-PANELES.md`](docs/15-CUENTAS-Y-PANELES.md)
