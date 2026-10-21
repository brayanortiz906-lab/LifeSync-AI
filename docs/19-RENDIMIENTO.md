# Rendimiento: que la app no se sienta lenta (v34)

> Medicado, no supuesto. Cada numero de esta pagina sale de medir el backend
> real (`Measure-Command` sobre `Invoke-RestMethod`) antes y despues del arreglo.

## 1. Que se sentía lento

La persona reporto que "el sistema va lento". Al medir, aparecio un culpable
claro: **abrir el modal «Conectar tu IA» tardaba 16 segundos**.

| Endpoint | Antes | Ahora |
|---|---:|---:|
| `GET /api/conexiones/locales` (detectar IA local) | **16 053 ms** | **3 ms** (con cache) · **741 ms** (forzada) |
| `GET /api/health` | 1 172 ms | 62 ms |
| `GET /api/cuentas/proveedores` | 305 ms | 118 ms |
| `GET /api/dashboard` | 15 ms | 13 ms |
| `GET /api/conexiones/catalogo` | 3 ms | 3 ms |

**Ganancia: 21 veces mas rapido** en el punto que la persona notaba.

## 2. La causa raiz

`detectar_motores_locales_sync()` (en `backend/app/connections.py`) buscaba una IA
local del equipo probando **8 puertos uno por uno**:

```
ollama 11434 · ollama 11435 · lmstudio 1234 · jan 1337
gpt4all 4891 · llamacpp 8080 · textgen 5000 · kobold 5001
```

Cada puerto usaba `httpx.Client(timeout=2.5)`. Los 7 puertos que no estaban
encendidos **quemaban el timeout completo**: 7 x 2,3 s = **~16 segundos** de
espera para confirmar algo que no existe.

Y ese endpoint se llamaba al abrir el modal de conexiones, al listar las
conexiones y al arrancar la API.

## 3. Los 5 arreglos

| # | Arreglo | Donde | Efecto |
|---|---|---|---|
| 1 | **Sondeo en paralelo**: los 8 puertos se preguntan a la vez con un hilo por puerto y un timeout corto (0,7 s) | `connections.py` (`_sondear_motor`, `ThreadPoolExecutor`) | 16 s -> 0,74 s |
| 2 | **Cache mas larga** de la deteccion (8 s -> 30 s) | `connections.py` (`_CACHE_TTL`) | la segunda consulta es instantanea |
| 3 | **Bootstrap de credenciales sin bloquear**: el primer intento dura 1,5 s (no 4 s) y si falla se reintenta en segundo plano | `ia_local.py` (`_descargar_bootstrap`, `_programar_reintento`) | el inicio de sesion no se atasca |
| 4 | **SQLite mas rapido**: `synchronous=NORMAL` + `busy_timeout=8000` (ya habia WAL) | `database.py` | escrituras instantaneas |
| 5 | **Menos trabajo en segundo plano**: el vigilante de "guardado con retardo" paso de 20 s a 45 s (el guardado real ya espera 45 s a que la persona pare) | `main.py` (`_tarea_guardado`) | menos consultas de sobra |

## 4. La interfaz explica la espera (no la esconde)

Cuando el servidor tarda mas de 3,5 s en responder, la app muestra un aviso:

> **Despertando el servidor…** la primera vez puede tardar un momento

En la nube el servicio puede estar dormido (el plan gratis de Render apaga la
maquina tras 15 minutos sin visitas) y la primera peticion tarda medio minuto.
Antes la pantalla se quedaba en blanco sin explicacion; ahora la persona sabe
que esta esperando y por que.

Implementado en `frontend/src/lib/api.ts` (`suscribirLento`) + `App.tsx`.

Ademas, cuando la IA vive **en el equipo** (Ollama en CPU), el chat avisa:

> Tu IA esta pensando en tu computador: la primera respuesta puede tardar 1 o 2
> minutos. No es un error.

## 5. Lo que NO se puede arreglar desde aqui

| Limite | Por que | Alternativa |
|---|---|---|
| El plan gratis de Render se duerme a los 15 min | Politica del plan (750 h/mes) | Plan Starter (siempre prendido) o avisar con el mensaje "Despertando el servidor" |
| Una IA local en CPU tarda 1-2,5 min por respuesta | El modelo corre en tu equipo, sin GPU | Usar un modelo pequeno (`qwen2.5:0.5b`, 400 MB) o una IA en la nube |
| La primera carga de la interfaz | Descarga el bundle de la web | El aviso de "Despertando el servidor" |

## 6. Los checks que vigilan que no vuelva a pasar

En `backend/smoke.py`, seccion **"RENDIMIENTO: QUE NO VAYA LENTO (v34)"**:

| Check | Limite | Resultado medido |
|---|---|---|
| `[VELOCIDAD] la deteccion de IA local responde rapido` | < 3 s | 0,01 s |
| `[VELOCIDAD] la deteccion completa (sin cache) tambien es rapida` | < 5 s | 0,73 s |
| `[VELOCIDAD] el tablero de la agenda responde rapido` | < 1,5 s | 0,02 s |

Si alguien vuelve a poner el sondeo en fila, el smoke test se cae solo.

## 7. Archivos de esta version

| Archivo | Que cambio |
|---|---|
| `backend/app/connections.py` | sondeo en paralelo, timeout 0,7 s, cache 30 s |
| `backend/app/ia_local.py` | bootstrap rapido (1,5 s) + reintento en segundo plano |
| `backend/app/database.py` | `synchronous=NORMAL`, `busy_timeout` |
| `backend/app/main.py` | vigilante de guardado cada 45 s |
| `frontend/src/lib/api.ts` | `suscribirLento` (aviso de servidor lento) |
| `frontend/src/App.tsx` | banner "Despertando el servidor" |
| `frontend/src/components/ChatBody.tsx` | aviso de IA local pensando |
| `backend/smoke.py` | 3 checks de rendimiento |
