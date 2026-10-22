# v44 — Dos versiones (web y local) + móvil (PWA y APK)

## 1. Las dos versiones de LifeAgente AI

El mismo programa se publica de **dos formas**, y cada una hace lo que le pides
a cada persona:

| | **La pagina web** (GitHub Pages + Render) | **La que se descarga** (`LifeAgente.exe`) |
|---|---|---|
| Donde vive | En un servidor, entras desde cualquier navegador | En tu computador, sin internet |
| Cuentas | **Si**: entras con Google, Outlook, GitHub o tu correo | **No hace falta cuenta** |
| Google Drive | **Si**: respaldos, calendario de Google, avisos por correo | **No**: todo queda en tu equipo |
| Donde se guardan tus datos | En el servidor, separados por persona, respaldados en **tu Drive** | En la base de datos de tu equipo (`%APPDATA%\LifeAgente\lifesync.db`) |
| IA | La que conectes (OpenAI, Gemini, Anthropic, OpenRouter, IA local...) | La IA **de tu computador** (Ollama, LM Studio...) o el motor de reglas integrado |
| Para quien | Quien quiere sus datos en la nube y en el celular | Quien no quiere cuentas ni que nada salga de su equipo |

**La regla que lo hace posible**: el backend sabe en que perfil esta y lo dice
en cada respuesta. La interfaz lee ese dato y se adapta:
- En perfil **web** se ven las tarjetas de cuentas, Drive, calendario y correo.
- En perfil **local** esas tarjetas **desaparecen** y en su lugar aparece
  «Version local: no necesitas crear cuenta», con la IA de tu computador y los
  organizadores preestablecidos.

## 2. Como se decide el perfil

| Donde | Como |
|---|---|
| El instalador `.exe` | Arranca el servidor con `LIFEAGENTE_PERFILO=local` (lo pone `desktop/launcher.py`) |
| Un servidor propio | Variable de entorno `LIFEAGENTE_PERFILO=local` |
| La web (Pages + Render) | No se pone nada: el perfil por defecto es `web` |

El backend lo publica en dos sitios:
- `GET /api/health` -> `"perfil": "local" | "web"`
- `GET /api/inicio` -> `"perfil": ...` (viaja con la carga inicial, sin pedir
  una peticion extra)

## 3. Que cambia en cada version (pantalla por pantalla)

| Pantalla | Web | Local |
|---|---|---|
| Bienvenida (primera vez) | Google / Outlook / GitHub + correo + modo local + plantillas | «Version local: no necesitas crear cuenta» + «Sin cuenta, en este equipo» + «Modo de prueba» + plantillas + pegar texto |
| Tu cuenta (Acceso) | Cuentas, permisos, Drive, respaldo | Solo explica que tus datos viven en este equipo |
| Permisos (pestaña) | Autorizar todo, Drive, calendario, correo, piloto automatico | «Tus datos en este equipo» + por que Drive es de la version web |
| Conectar IA | 5 secciones (cuenta, IA gratis, tu computador, con clave, demo) | 3 secciones (tu computador, con clave, demo) |

## 4. El movil (PWA)

La app ya se adaptaba al celular (v18: 3 lineas de resumen + menu desplegable
con tareas, dinero, contexto y cuenta). Con la v44 ademas **se puede instalar**
como una app de verdad:

| Pieza | Que es |
|---|---|
| `frontend/public/manifest.json` | Nombre, icono, color y los accesos directos (agenda, chat) |
| `frontend/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Los iconos (generados, sin dependencias) |
| `frontend/public/sw.js` | El service worker: guarda el esqueleto de la app en cache para que abra sin internet. **La API nunca se cachea** (un gasto viejo es peor que no tener) |
| `frontend/index.html` | Enlaza el manifiesto, el color del tema y el icono de Android |
| `frontend/src/components/BotonInstalar.tsx` | El boton de la barra superior: aparece cuando el navegador dice que la app se puede instalar |

**Como instalarla en Android** (3 pasos):
1. Abre la web de LifeAgente en Chrome.
2. Menú de los 3 puntitos -> **Instalar aplicacion** (o el boton de la flecha
   que aparece en la barra).
3. Listo: tienes el icono en el escritorio, abre a pantalla completa y
   funciona sin internet.

**Como instalarla en iPhone**: Safari -> Compartir -> **Anadir a pantalla de
inicio**.

## 5. El APK (paquete de Android)

Un `.apk` de verdad se construye con **Capacitor** (envuelve la web en una
app nativa de Android). El flujo esta listo:

```
frontend/  ->  npm run build  ->  npx cap add android  ->  npx cap sync
            ->  cd android && gradlew assembleDebug  ->  app-debug.apk
```

Se puede hacer a mano (con Android Studio) o en la nube con el workflow
`.github/workflows/build-apk.yml`, que compila el APK y lo publica como
artefacto de la release. En el `.zip` de la release tambien va la carpeta
`android/` con la configuracion de Capacitor lista para abrir con Android
Studio.

## 6. Verificacion

| Prueba | Resultado |
|---|---|
| `GET /api/health` con `LIFEAGENTE_PERFILO=local` | `"perfil":"local"` |
| `GET /api/inicio` | trae `perfil` |
| Bienvenida en perfil local | sin tarjetas de Google, con el aviso de version local |
| `/manifest.json`, `/sw.js`, iconos | 200 y servidos por la API |
| Smoke test | 164 casos |

## 7. Archivos

| Archivo | Para que |
|---|---|
| `backend/app/config.py` | `perfil` + `perfil_efectivo` + `es_local` |
| `backend/app/main.py` | `/api/health` dice el perfil |
| `backend/app/routers/inicio.py` | `/api/inicio` lleva el perfil |
| `desktop/launcher.py` | arranca con `LIFEAGENTE_PERFILO=local` |
| `frontend/src/store/useLifeAgente.ts` | guarda el perfil en el store |
| `frontend/src/components/Bienvenida.tsx` | pantalla de version local |
| `frontend/src/components/AccesoPanel.tsx` | sin cuentas ni Drive en local |
| `frontend/src/components/PermisosPanel.tsx` | panel local de datos |
| `frontend/src/components/ConexionesPanel.tsx` | 3 secciones en local |
| `frontend/src/components/BotonInstalar.tsx` | instalar en el celular |
| `frontend/public/manifest.json`, `sw.js`, iconos | la app instalable |
