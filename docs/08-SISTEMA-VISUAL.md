# Sistema visual y organizacion de la interfaz

> Version: v1.14 · Archivo principal: `frontend/src/index.css` + `frontend/src/components/ui.tsx`

Este documento explica las reglas que sigue LifeAgente AI para que **nada quede pegado, raro o desorganizado**, y como aplicarlas al añadir pantallas nuevas.

---

## 1. El problema que resuelve

En la version v8 el modal "Conectar tu IA" se veia **apretado y descuadrado**:

| Sintoma | Causa real | Correccion |
|---|---|---|
| El modal aparecia cortado por arriba (sin cabecera) | El `<header>` de la barra superior tiene `backdrop-blur`; `backdrop-filter` crea un *containing block* y el `position: fixed` del modal se anclaba a la barra | `createPortal(..., document.body)` en `Modal` |
| Bloques pegados, sin aire entre ellos | Cada pantalla usaba clases sueltas (`p-3`, `space-y-2`) | Sistema visual con utilidades y primitivos comunes |
| Titulos duplicados ("Conectar mi cuenta de Google (con mi cuenta de Google)") | El nombre del proveedor se pintaba dos veces (cabecera + titulo del bloque) | `nombreCorto` (nombre sin el parentesis) en un solo sitio |
| Dos botones "Volver" (uno arriba, otro abajo) | El bloque de acciones vivia dentro del cuerpo con scroll | Pie fijo del modal (`prop pie`) |
| Formularios estirados a todo el ancho | Inputs sin ancho maximo ni jerarquia | `Campo` (etiqueta + ayuda + control) y `ls-input` |

---

## 2. Utilidades CSS (`frontend/src/index.css`)

Son clases CSS puras (sin `@apply`) para que el sistema visual funcione con cualquier
utilidad de Tailwind v4 y con los temas por variables.

| Clase | Que hace |
|---|---|
| `.ls-card` | Tarjeta base: radio 1rem, borde `rgb(255 255 255 / 0.07)`, fondo `rgb(255 255 255 / 0.03)`, padding 1rem |
| `.ls-card-apretado` | Igual, pero con padding 0.75rem (listas densas) |
| `.ls-label` | Etiqueta de formulario: 10px, bold, mayusculas, tracking 0.09em, gris |
| `.ls-hint` | Texto de ayuda: 11px, interlineado 1.6, gris suave |
| `.ls-sep` | Separador: borde superior + `margin-top .25rem` + `padding-top .875rem` |
| `.ls-input` | Input: ancho completo, radio .75rem, borde 10%, fondo negro 30%, foco indigo |
| `.ls-paso` | Linea de paso numerado (flex, 11px, interlineado 1.65) |
| `.ls-paso-num` | Circulo numerado del paso (18px, fondo indigo 22%) |

## 3. Primitivos de interfaz (`frontend/src/components/ui.tsx`)

| Componente | Uso |
|---|---|
| `Modal` | Ventana flotante. Props nuevas: `descripcion` (subtitulo) y `pie` (acciones fijas, siempre visibles aunque el contenido scrollee). Se monta con `createPortal` en `document.body`. |
| `Panel` | Contenedor de bloque. Padding interior por defecto `p-4`; los paneles con listas largas lo anulan con `cuerpoClass`. |
| `Tarjeta` | Caja con `ls-card`. Prop `apretado` para densidad alta. |
| `Seccion` | Titulo + descripcion + contenido (`space-y-3`). |
| `Campo` | Etiqueta + texto de ayuda + control (`space-y-1.5`). |
| `Aviso` | Mensaje de estado con tono `info` / `ok` / `error` / `aviso`. |
| `Stat` | Indicador numerico: ahora con `px-4 py-3` (antes `px-3 py-2`). |
| `Boton` | Boton base: ahora `px-3.5 py-2` (antes `px-3 py-1.5`). |

## 4. Reglas de espaciado (aplicadas en toda la app)

| Nivel | Valor | Donde |
|---|---|---|
| Padding de pagina | `p-4` | `main` de cada vista (`App.tsx`) |
| Separacion entre columnas | `gap-4` | rejilla de la agenda |
| Padding de panel | `p-4` | cuerpo de `Panel` (por defecto) |
| Padding de bloque interno | `p-4 sm:p-5` | tarjetas del Centro de Conexiones |
| Separacion vertical interna | `space-y-3` / `space-y-3.5` | listas de tarjetas |
| Separacion menor | `space-y-2` | elementos de una misma tarjeta |
| Encabezado de panel | `px-5 py-3.5` | cabecera de `Panel` y `CalendarPanel` |
| Barra superior | `px-5 py-3.5` | `TopBar` |
| Barra de navegacion | `px-4 py-2.5` | pestanas de `App.tsx` |
| Boton | `px-3.5 py-2` | `Boton` |
| Chips | `px-2 py-0.5` | `Chip` |

**Regla de oro**: si dos bloques se tocan, el problema no es el color sino que falta
`gap` o `padding`. Antes de inventar un estilo, sube un nivel en esta tabla.

## 5. Anatomia de un modal (plantilla)

```tsx
<Modal
  abierto={abierto}
  onCerrar={cerrar}
  título="Conectar tu IA"
  descripción="Elige como conectarte. No necesitas saber que es una API key."
  pie={
    <>
      <Boton variante="secundario" onClick={volver}>Volver</Boton>
      <Boton onClick={confirmar}>Conectar y verificar</Boton>
    </>
  }
>
  {/* El cuerpo scrollea; el pie nunca desaparece */}
</Modal>
```

Reglas: (1) un solo lugar para el nombre del proveedor, (2) los pasos numerados usan
`ls-paso` / `ls-paso-num`, (3) los mensajes de estado usan `Aviso`, (4) las acciones
principales viven en el pie, (5) el titulo del bloque nunca repite el nombre de la
tarjeta que lo contiene.

## 6. Temas

Los 4 temas (`medianoche`, `oceano`, `bosque`, `atardecer`) reescriben variables CSS
`--color-indigo-*` y `--color-violet-*` (ver `docs/07-AJUSTES.md`). El sistema visual
no usa colores literales: por eso todos los bloques siguen el tema automaticamente y
cambiar de tema no rompe ningun espaciado ni ningun color.

## 7. Checklist para una pantalla nueva

- [ ] Usa `Panel`, `Tarjeta`, `Seccion`, `Campo` y `Aviso`; nada de `div` con clases sueltas.
- [ ] Padding de pagina `p-4` y separaciones `gap-4` / `space-y-3`.
- [ ] Los formularios usan `Campo` + `ls-input` (no inputs sueltos).
- [ ] Los modales usan `descripcion` y `pie`; nunca dos botones "Volver".
- [ ] El contenido largo scrollea dentro del panel, no empuja la pagina.
- [ ] Sin texto duplicado (titres, nombres de proveedor).
- [ ] Probado con los 4 temas y en pantalla angosta.

## 8. Verificacion

| Comprobacion | Como |
|---|---|
| El modal entra completo en pantalla | `browser.evaluate` -> `getBoundingClientRect()` del contenedor: `top >= 0` y `bottom <= innerHeight` |
| No hay titulo duplicado | Contar apariciones del nombre del proveedor en `innerText` |
| Padding y aire | `getComputedStyle(bloque).paddingTop` debe ser >= 12px |
| Build sin errores | `npm run build` en `frontend/` |
| Suite completa | `backend/.venv/Scripts/python.exe backend/smoke.py` (119 casos) |
| Sin caracteres CJK | Escaneo sobre `.py`, `.ts`, `.tsx`, `.md`, `.txt` |

## 9. Archivos

| Archivo | Papel |
|---|---|
| `frontend/src/index.css` | Utilidades `.ls-*` y temas por variables CSS |
| `frontend/src/components/ui.tsx` | `Modal` (portal + pie), `Panel`, `Tarjeta`, `Seccion`, `Campo`, `Aviso`, `Stat`, `Boton`, `Chip` |
| `frontend/src/components/ConexionesPanel.tsx` | Ejemplo de referencia: usa los primitivos en todas sus ramas |
| `frontend/src/App.tsx` | Rejillas y separaciones de cada vista |
| `frontend/src/components/CalendarPanel.tsx` | Encabezado, filtros, resumen y leyenda con el mismo sistema |
