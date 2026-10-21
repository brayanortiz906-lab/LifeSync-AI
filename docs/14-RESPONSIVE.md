# 14 · Diseño responsivo (la app se adapta, no se rompe)

> Como LifeAgente AI se comporta segun el tamaño de la pantalla: tres columnas en las pantallas grandes, un menu desplegable en los telefonos y **un solo scroll** en todas partes (nada de scrolls anidados que roben el gesto).

## 1. El problema que se estaba viendo

| Sintoma | Causa real |
|---|---|
| En pantallas grandes sobraba espacio a la derecha y el calendario se veía enorme | La agenda era una rejilla fija de 2 columnas (`1fr + 360px`) sin limite de ancho |
| En el telefono "no se podia mover" |Habia **tres areas con scroll** encimadas: la pagina, la columna derecha y el interior del calendario. El gesto se consumia en la de arriba |
| En el telefono no habia forma de conectar una IA ni de entrar a la cuenta | Toda la barra de acciones estaba oculta con `hidden md:flex` |
| Al cambiar de tamano, el contenido se cortaba | Alturas fijas (`min-h-[520px]`) y `overflow-hidden` en la carcasa |

## 2. Las reglas nuevas

### 2.1 Una sola zona con scroll

```
.ls-shell   -> height: 100dvh; overflow: hidden      (la carcasa nunca scrollea)
.ls-scroll  -> overflow-y: auto; overscroll-behavior: contain
```

- La carcasa ocupa la altura real de la pantalla (`dvh` = respeta la barra del navegador movil).
- En movil, el calendario **crece con su contenido** (`flex-none overflow-visible`) y la pagina hace un unico scroll.
- En escritorio, cada columna scrollea por su cuenta y el cuerpo de la pagina no se mueve nunca.
- `overscroll-behavior: contain` evita el efecto "el scroll se pasa al padre" al llegar al final.

### 2.2 La rejilla de la agenda (`.ls-agenda`)

| Pantalla | Columnas | Reparto |
|---|---|---|
| Movil (< 1024 px) | 1 | El calendario completo; el resto en el menu |
| Escritorio (>= 1024 px) | 2 | Agenda (ocupa las dos filas) · tareas y contexto arriba, dinero abajo |
| Pantalla grande (>= 1280 px) | 3 | Agenda · tareas y contexto · dinero |
| Muy grande (>= 1920 px) | 3 anchas | Agenda · 420 px · 460 px |

El ancho total se limita a `1900px` y se centra: en un monitor 4K el contenido no se estira de mas.

## 3. El menu de los telefonos

`frontend/src/components/MenuMovil.tsx`: una hoja que sube desde abajo (maximo 90 % del alto) con:

1. **Las tres lineas de resumen**, siempre visibles arriba:
   - `Hoy: 8 bloques · 5 h 30 min ocupadas`
   - `51 tareas pendientes · próxima: Resolver ejercicios 1–20 del capítulo 4 · 2026-10-21`
   - `$ 30.134.000 del mes · 5 mantenimientos`
2. **Cuatro pestanas**: Tareas · Dinero · Contexto · Cuenta.
3. La seccion activa con su propio scroll.
4. Cierre con `Escape`, con el ✕ o tocando el fondo; el fondo no se desplaza mientras esta abierta.

En la agenda (movil) hay un boton **«Ver todo lo demás (tareas, dinero, ajustes)»** que abre la hoja, y en la barra superior un icono de menu (☰) con lo mismo.

## 4. La barra superior en cada tamaño

| | Movil / tablet (< 1024 px) | Escritorio (>= 1024 px) |
|---|---|---|
| Marca y fecha | siempre | siempre |
| Indicadores (bloques, gasto, tareas) | dentro de las 3 lineas | visibles en la barra |
| Chat, Conectar IA, Cuenta, Menu | iconos | botones con texto |
| Navegacion de pestanas | con scroll horizontal (nunca se corta) | igual |

## 5. Piezas nuevas

| Archivo | Para que sirve |
|---|---|
| `frontend/src/lib/useMediaQuery.ts` | `useMediaQuery()` + los cortes `ESCRITORIO` (1024 px) y `PANTALLA_GRANDE` (1280 px) |
| `frontend/src/components/ResumenMovil.tsx` | Las tres lineas de resumen (`useResumen()` + `lineasResumen()`) |
| `frontend/src/components/MenuMovil.tsx` | La hoja desplegable con lo que no cabe |
| `frontend/src/index.css` | `.ls-shell`, `.ls-scroll`, `.ls-hoja`, `.ls-hoja-entra`, `.ls-agenda` y sus 4 cortes |

## 6. Cambios en los archivos que ya existian

| Archivo | Cambio |
|---|---|
| `App.tsx` | Carcasa `ls-shell`; agenda con `esEscritorio` (rejilla de 3 columnas) o columna simple + resumen; vistas de responsabilidad/permisos/ajustes centradas con ancho maximo; menu movil montado |
| `TopBar.tsx` | Fila de iconos para movil/tablet; los indicadores completos solo en escritorio; menu (☰) |
| `CalendarPanel.tsx` | En movil el panel crece con su contenido (sin scroll interno); en escritorio `flex-1` y scroll propio |
| `index.css` | Utilidades de la seccion 2 |

## 7. Como verificarlo

1. `npm run build` (sin errores de TypeScript).
2. En el navegador, redimensiona la ventana:
   - **< 1024 px**: una columna, las tres lineas, el boton «Ver todo lo demás» y el menu ☰.
   - **>= 1024 px**: dos columnas; **>= 1280 px**: tres columnas.
3. Comprueba que **no hay scroll horizontal** (`document.body.scrollWidth === document.body.clientWidth`).
4. En el telefono, arrastra la pagina: debe moverse suelta, sin que el scroll se quede atrapado dentro de un panel.

## 8. Reglas para las pantallas que se agreguen

- Nunca pongas dos areas con scroll encimadas: la carcasa no scrollea, y cada panel decide si scrollea o crece.
- Usa `min-h-0` en los hijos de un contenedor flex con altura limitada.
- Todo lo que no quepa en movil tiene que estar en el menu movil o en las tres lineas.
- Prueba siempre a 360 px (telefono pequeno), 927 px (tablet) y 1920 px (monitor grande).
