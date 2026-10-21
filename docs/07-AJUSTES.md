# Ajustes, temas y cómo organizar lo que ves

LifeAgente no te obliga a conocer la app antes de usarla. La primera vez que abres el
programa aparece un **formulario de bienvenida** de 3 pasos, y a partir de ahí todo lo
que defines sobre cómo quieres trabajar vive en la pestaña **«Ajustes»**.

Este documento explica qué se guarda, dónde, y cómo extenderlo.

---

## 1. El formulario de bienvenida (la primera vez)

Al abrir la aplicación, si todavía no completaste la bienvenida, LifeAgente muestra un
asistente a pantalla completa con 3 pasos:

| Paso | Qué pregunta | Para qué sirve |
|---|---|---|
| **1. Sobre ti** | Tu nombre | Saluda por tu nombre y etiqueta tus cosas |
| **2. Tu ritmo** | Moneda, hora de inicio y fin de tu jornada | Define el rango en el que el agente agenda y how much spends |
| **3. Tu estilo** | Tema de color y "conectar mi IA" | Deja la interfaz a tu gusto y te ofrece conectar Gemini/ChatGPT/Ollama |

- Navegación: **Atrás** / **Continuar** / **Empezar** (el último botón guarda y cierra).
- Se guarda `onboarding_completo = true` en `app_settings`: **no vuelve a aparecer**.
- Si la persona lo cierra sin terminar, se vuelve a mostrar la próxima vez.
- La interfaz se puede saltar con el interruptor interno `bienvenidaSaltada`.

---

## 2. La pestaña «Ajustes»

`frontend/src/components/AjustesPanel.tsx` — cuatro bloques, todos guardados en el
servidor (no solo en el navegador), para que la configuración viaje contigo.

### 2.1 Sobre ti

| Campo | Tipo | Dónde se usa |
|---|---|---|
| `nombre_usuario` | texto (60) | Saludo del agente, encabezado |
| `moneda` | texto (3) | Formato de todos los montos (`Intl es-CO`) |
| `inicio_jornada` / `fin_jornada` | `HH:MM` | Ventana en la que el planificador agenda los bloques de estudio y trabajo |

### 2.2 Tema de la app

Cuatro temas, aplicados al instante sobre `document.documentElement` con el atributo
`data-tema`:

| Tema | `data-tema` | Sensación | Ideal para |
|---|---|---|---|
| **Medianoche** | `medianoche` | Negro azulado, violeta | De noche, foco en los datos |
| **Océano** | `oceano` | Cian y turquesa | Luz de día, lectura larga |
| **Bosque** | `bosque` | Verde lima y esmeralda | Calmado, trabajo académico |
| **Atardecer** | `atardecer` | Naranja y fucsia | Contraste alto, respuesta rápida |

**Cómo funciona (Tailwind v4):** las utilidades de color de Tailwind compilan a
`var(--color-indigo-300)`, etc. Los temas no redefinen clases, redefinen **variables
CSS**. Por eso el cambio es instantáneo y sin recargar.

```css
/* frontend/src/index.css */
[data-tema='oceano'] {
  --color-indigo-200: oklch(0.92 0.08 210);
  --color-indigo-600: oklch(0.52 0.17 215);
  /* ... el resto de la escala */
}
```

> Detalle técnico: las reglas del tema están **fuera de `@layer`**, porque en Tailwind
> v4 el CSS sin capa gana a las utilidades de las capas. Si las metieras en `@layer
> components`, el tema no se vería.

### 2.3 Cómo organizar lo que ves

Tres selectores independientes, uno por bloque de la interfaz:

| Bloque | Campo | Opciones | Significado |
|---|---|---|---|
| **Tareas académicas** | `orden_tareas` | `fecha` · `prioridad` · `tiempo` · `materia` | Fecha = entrega más próxima; prioridad = alta/media/baja; tiempo = minutos estimados; materia = agrupadas por asignatura |
| **Bitácora y gastos** | `orden_gastos` | `fecha` · `monto` · `categoria` | Fecha = más reciente primero; monto = de mayor a menor; categoría = agrupado |
| **Agenda** | `orden_eventos` | `hora` · `categoria` · `duracion` | Hora = cronológico; categoría = agrupado por tipo; duración = los bloques más largos primero |

En la **agenda** hay además dos filtros rápidos:

- **Filtro por categoría**: chips con las categorías presentes en el día + «Todas».
- **«Solo fijos»**: muestra únicamente los compromisos **inamovibles** (los que el
  agente nunca mueve).

### 2.4 Tus temas y etiquetas

Campo libre `etiquetas` (lista de texto). Sirve para clasificar a tu manera:
*Universidad*, *Trabajo*, *Casa*… Se guardan como JSON en `app_settings.etiquetas` y
están disponibles para filtros y agrupadores futuros.

### 2.5 Asistente de IA

Atajo al **Centro de Conexiones** (ver [06-CONE-XIONES.md](06-CONE-XIONES.md)):
Google, ChatGPT, Claude, OpenRouter, Ollama, LM Studio o el asistente demo.

---

## 3. El chat flotante y móvil

`frontend/src/components/ChatFlotante.tsx`.

| Estado | En escritorio | En celular (`< 640 px`) |
|---|---|---|
| **Cerrado** | Burbuja arrastrable (gradiente indigo→violeta, 56×56 px) | Igual, pero fija en la esquina para que sea alcanzable con el pulgar |
| **Abierto** | Panel de 420 px anclado a la burbuja, con botón «Ampliar» | Panel a **pantalla completa** (`fixed inset-0`) |
| **Arrastrando** | La burbuja sigue el puntero y se dibuja un asa `GripVertical` | Idéntico (mismo código de punteros) |

- **Posición recordada**: se guarda en `localStorage['lifesync.chatPos']`; si no hay
  valor previo, aparece abajo a la derecha.
- **Se recorta a la ventana**: el arrastre siempre queda dentro del viewport.
- **Clic vs. arrastre**: si moviste más de unos píxeles, el clic final se ignora
  (para no abrir el chat al soltar).
- **Atajos**: `Ctrl+K` / `Cmd+K` alterna el chat, `Escape` lo cierra.

---

## 4. API: qué se guarda y dónde

Todo lo de Ajustes vive en `app_settings` (tabla singleton, `id = 1`).

| Endpoint | Método | Qué hace |
|---|---|---|
| `/api/settings` | `GET` | Devuelve los ajustes actuales (incluye `etiquetas` ya parseada) |
| `/api/settings` | `PUT` | Guarda nombre, moneda, jornada, tema, órdenes, etiquetas y `onboarding_completo` |

Campos nuevos (con migración automática en `backend/app/database.py`):

```python
nombre_usuario, tema, orden_tareas, orden_gastos, orden_eventos,
etiquetas (JSON), onboarding_completo
```

La migración usa `_asegurar_columnas()` (ALTER TABLE idempotente) y se ejecuta en el
`lifespan` de FastAPI **antes** de `create_all`, de modo que una base de datos
antigua se actualiza sola al arrancar.

---

## 5. Cómo extenderlo

### Añadir un tema nuevo

1. En `frontend/src/index.css`, añade el bloque `[data-tema='nuevo']` con las variables
   `--color-indigo-*` y `--color-violet-*` (fuera de `@layer`).
2. En `frontend/src/types.ts`, añade el id al tipo `TemaId`.
3. En `frontend/src/components/AjustesPanel.tsx`, añade la tarjeta con su muestra.

### Añadir un criterio de orden

1. Amplía el tipo en `frontend/src/types.ts` (`OrdenTareas` / `OrdenGastos` /
   `OrdenEventos`).
2. En el panel correspondiente, añade la opción al `<select>`.
3. En el `useMemo` que ordena, añade la rama nueva. El valor se persiste solo: se
   escribe en `ajustes.orden_*` y el backend lo guarda.

### Nada de esto rompe la app

Los ajustes son **aditivos**: si el backend es viejo y no conoce un campo, la
interfaz lo ignora; si la base de datos es vieja, la migración la actualiza al
arrancar.

---

## 6. Archivos implicados

| Archivo | Rol |
|---|---|
| `frontend/src/components/AjustesPanel.tsx` | Ajustes + asistente de bienvenida |
| `frontend/src/components/ChatFlotante.tsx` | Burbuja arrastrable y panel del chat |
| `frontend/src/index.css` | Temas por variables CSS |
| `frontend/src/store/useLifeAgente.ts` | Estado `ajustes` + `aplicarTema()` |
| `frontend/src/types.ts` | `TemaId`, `OrdenTareas`, `OrdenGastos`, `OrdenEventos` |
| `backend/app/models.py` | Campos nuevos en `AppSettings` |
| `backend/app/database.py` | `_asegurar_columnas()` (migración idempotente) |
| `backend/app/routers/agent.py` | `GET`/`PUT /api/settings` |
| `backend/smoke.py` | 63 verificaciones end-to-end |
