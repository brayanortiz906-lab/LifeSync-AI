# El motor local: LifeAgente funciona sin IA, sin claves y sin servidor

> Que la app sirva aunque no haya ninguna IA conectada: eso es lo que hace el
> **motor local de reglas**.

## 1. El problema

LifeAgente nacio con una IA detras (OpenAI, Gemini, Anthropic, OpenRouter,
Ollama...). Pero hay tres situaciones en las que la IA **no esta**:

1. La persona abre la app publicada en **GitHub Pages** y todavia no hay API
   desplegada (la interfaz daba `Error 404`).
2. La persona quiere **probar** la app sin crear cuenta ni pagar nada.
3. La persona no tiene clave de IA y no quiere saber de claves.

Con el motor local, LifeAgente **entiende igual** las frases, porque no
depende de un modelo: reconoce **palabras clave, fechas, horas y montos**.

## 2. Como funciona

`frontend/src/lib/motorLocal.ts` es un motor de reglas puro (sin red, sin
servidor) que devuelve los mismos datos que devolveria el agente:

| Pieza | Que reconoce |
|---|---|
| `detectarFecha` | hoy, manana, pasado manana, ayer, lunes... domingo |
| `detectarHora` | "a las 3", "3 PM", "a las 9:30 am" |
| `detectarMonto` | "$20.000", "20 mil", "3 millones", "por 35 mil" (exige contexto de dinero) |
| `detectarCategoriaGasto` | combustible, alimentacion, transporte, servicios, educacion, salud, ocio, mantenimiento |
| `detectarCategoriaEvento` | trabajo, clase, estudio, descanso, salud, social, mantenimiento, personal |
| `detectarActivo` | moto, carro, computador, bicicleta, celular, hogar |
| `fragmentar` | separa una frase en varias intenciones (`;`, `. `, `, `, `y`, "ademas", "tambien", "luego", "despues", "pero", "entonces") |
| `limpiarTitulo` | quita adverbios, verbos, horas, fechas y montos del titulo ("Tengo una cita a las 3 PM" -> "Cita") |

Ejemplo real verificado:

```
"Mañana tengo una cita a las 3 PM y además gasté 25 mil en gasolina"
-> Listo: Agende "Cita" (2026-10-22 15:00); Registre 25.000 en combustible.
   Categorias: Calendario + Bitácora · 2 intenciones
```

## 3. Los tres modos

| Modo | Donde viven los datos | Limite | Cuando se usa |
|---|---|---|---|
| **Modo de prueba** | solo en memoria | 6 bloques, 4 tareas y 6 gastos | probar sin cuenta; al recargar desaparece |
| **Modo local** | `localStorage` del navegador | ninguno | la app en GitHub Pages sin API, o quien no quiere cuenta |
| **Con cuenta** | servidor, aislada por `usuario_id` | ninguno | datos permanentes + IA + piloto automatico |

El **modo local** se activa solo: si la API responde `404`/`405` (o no hay red),
la app lo detecta, cambia de modo y sigue funcionando. En pantalla aparece el
aviso *"Modo local · LifeAgente funciona con su motor de reglas y guarda todo en
este navegador"*.

## 4. Organizadores preestablecidos (plantillas)

`frontend/src/lib/plantillas.ts` trae 5 plantillas con agenda, tareas, gastos y
mantenimiento de ejemplo:

| Plantilla | Para quien |
|---|---|
| Estudiante | clases, parciales y gastos de la universidad |
| Trabajo de oficina | jornada laboral, reuniones y gastos |
| Emprendedor | clientes, ventas y gastos del negocio |
| Moto y mantenimiento | transporte propio y mantenimiento |
| Semana simple | lo minimo para ver la agenda |

Se cargan con un clic desde la pantalla de bienvenida. En el modo de prueba se
recortan a los limites de la demo.

## 5. Pegar informacion de otro chat

En la misma pantalla hay un cuadro para **pegar texto** (por ejemplo el
historial de un chat con otro asistente). El motor local lo descompone y
registra cada cosa: *"Mañana tengo una reunión de proyecto a las 9 AM, el
viernes entrego el informe y me toca revisar los frenos de la moto. Pagué el
almuerzo por 25 mil."* -> 1 bloque, 1 tarea, 1 mantenimiento y 1 gasto.

## 6. Archivos

| Archivo | Que hace |
|---|---|
| `frontend/src/lib/motorLocal.ts` | el motor de reglas (fechas, horas, montos, palabras clave) |
| `frontend/src/lib/plantillas.ts` | los 5 organizadores preestablecidos |
| `frontend/src/store/useLifeSync.ts` | modos local/prueba, limites, `importarTexto`, `cargarPlantilla` |
| `frontend/src/components/Bienvenida.tsx` | plantillas + caja de pegar texto |
| `frontend/src/App.tsx` | banner de modo local y paso automatico cuando la API no responde |
