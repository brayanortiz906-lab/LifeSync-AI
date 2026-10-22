# Avisos del celular, APK de Android y lo que queda pendiente

Este documento explica las tres cosas nuevas de la version **1.3.0** y
**la lista de pendientes por prioridad** (lo que falta para que todo
funcione de punta a punta).

---

## 1. Avisos y alarmas del celular

### Como funciona
1. Abres la app y entras en **"Avisos del celular"** (panel en la agenda).
2. Pulsas **"Activar avisos"**: el navegador pide permiso y, a partir de ahi,
   LifeAgente puede notarte.
3. En el calendario, al tocar un bloque, aparece la **campana**: con un
   clic programa el aviso **10 minutos antes**.
4. En el panel puedes elegir el aviso que prefieras:

| Cuando avisa | Para que sirve |
|---|---|
| Al empezar | recordatorio puntual |
| 10 min antes | ir cerrando lo que estabas haciendo |
| 30 min antes | margen para desplazarte |
| 1 hora antes | salir con tiempo |
| 1 dia antes | para dejar listo lo de manana |

### Donde se guardan
Las alarmas viven en **este navegador** (clave `lifesync.alarmas`), asi que:
- sobreviven a que cierres la app o el navegador;
- al volver a abrir, se **vuelven a armar** solas;
- se quitan con la papelera de cada aviso.

### En el celular y en el APK
| Donde corre | Como avisa |
|---|---|
| Pagina web / PWA en el celular | API de Notificaciones del navegador (el service worker la muestra) |
| APK de Android | alarma **nativa** del sistema (plugin `LocalNotifications` de Capacitor): suena aunque la app este cerrada |

---

## 2. El APK de Android (instalar y ya)

### Que hay que hacer
1. Descargas el `.apk` de la release.
2. Lo abres.
3. Android pregunta si permites instalar apps de este origen: aceptas.
4. Listo. **No hay que configurar nada**: la direccion de la API de la nube
   va horneada dentro del APK, asi que el app ya habla con el servidor.

### Como se construye (para el que lo mantiene)
El workflow `.github/workflows/build-apk.yml` lo compila en la nube:
- compila la interfaz (`npm run build`) con `VITE_API_URL` apuntando a la
  API de la nube;
- crea el proyecto de Android con Capacitor (`npx cap add android`);
- corrige el choque de clases de Kotlin (`kotlin-stdlib-jdk7`/`jdk8`);
- compila con Gradle (`assembleDebug`) y sube el `.apk` como artefacto;
- en una release con etiqueta, ademas lo publica junto al `.exe`.

### Detalle importante: los origenes CORS
El APK se abre con el origen `capacitor://localhost`, asi que la API tiene
que permitirlo. Por eso `ORIGENES_PROPIOS` (en `backend/app/config.py`) ya
incluye `capacitor://localhost`, `http://localhost` y `https://localhost`.

### Instalar sin store (PWA)
Si prefieres no instalar el `.apk`: en Chrome (celular) -> menu -> **"Anadir
a pantalla de inicio"**. Sale un icono como si fuera una app y tambien
funciona sin internet (con el service worker) para la parte de la interfaz.

---

## 3. Lo que queda pendiente, por prioridad

### P0 - Sin esto, la version web se queda a medias (son pasos de una vez)
| # | Pendiente | Como se resuelve | Quien lo hace |
|---|---|---|---|
| 1 | **ID de cliente OAuth de Google** (falta -> no funcionan Google, Drive, Calendar ni el correo) | Google Cloud -> Credenciales -> **ID de cliente OAuth de tipo "App de escritorio"** -> copiarlo -> pegarlo en `public/clientes-publicos.json` o en `GOOGLE_CLIENT_ID` de Render | Tu (1 clic) |
| 2 | **Clave de Brevo o Resend** (falta -> el codigo de verificacion no llega por correo) | app.brevo.com/settings/keys/api -> copiar la clave -> *Conectar IA -> Ajustes tecnicos -> Envio de correo* | Tu (1 clic) |
| 3 | `APP_ENTORNO=produccion` en Render | Render -> Environment -> valor -> Save & Deploy | Tu |
| 4 | `CRON_TOKEN` en Render (para la tarea diaria de respaldo y resumen) | Render -> Environment -> `CRON_TOKEN` (copia el valor de `C:\Users\Mugen\.lifesync\cron-token.txt`) | Tu |
| 5 | `VITE_API_URL` (o vacia) y `CORS_ORIGINS` con el origen de Pages en Render | Render -> Environment | Tu |
| 6 | **Revocar los 2 tokens de GitHub** que quedaron escritos en el chat | https://github.com/settings/personal-access-tokens y https://github.com/settings/tokens | Tu (seguridad) |

### P1 - Ya esta en el codigo, falta probarlo de punta a punta
| # | Pendiente | Nota |
|---|---|---|
| 7 | **Probar el APK en un Android real** | Aqui no hay un telefono ni un emulador: el APK se compila bien, pero la primera prueba real la tienes que hacer tu |
| 8 | **Probar las alarmas nativas del APK** | El plugin ya entra en la compilacion; falta ver que suena con la app cerrada |
| 9 | **Probar Drive de punta a punta** (subir y recuperar) | Depende del pendiente 1 |
| 10 | **Probar la version local en una maquina limpia** (instalar, descargar la IA de 400 MB, cerrar y volver a abrir) | Los datos deben seguir ahi |
| 11 | **Probar el codigo de verificacion real** | Depende del pendiente 2 |

### P2 - Limitaciones conocidas (no son errores)
| # | Pendiente | Por que pasa | Alternativa |
|---|---|---|---|
| 12 | La nube se duerme a los 15 min | es el plan gratis de Render | el banner "Despertando el servidor" avisa; con plan Starter ($7/mes) queda siempre prendida |
| 13 | El disco de la nube es efimero | Render reinicia el servicio | el almacen real es el Drive de cada persona |
| 14 | Los avisos suenan con la app abierta | el navegador limita las alarmas en segundo plano | en el APK usan la alarma nativa del sistema |
| 15 | El panel compartido no es "en vivo" | hoy cada quien guarda su copia | se puede anadir una sincronizacion en tiempo real |

### P3 - Para mas adelante
- Resumen del dia por correo con el motor de Resend (ya esta el motor, falta el formato final).
- Agenda de Google Calendar en los dos sentidos (hoy solo se importa).
- Registro de uso y mejora del modelo (hoy no se guarda lo que se le pregunta al agente).
- Evaluacion de sesgos y DPIA (documentado como "no cubierto" en `docs/05-RESPONSABILIDAD.md`).

---

## 4. Como se verifica

| Comprobacion | Como |
|---|---|
| Los avisos se activan | Panel "Avisos del celular" -> "Activar avisos" -> el navegador pide permiso |
| Una alarma se programa | Calendario -> tocar un bloque -> la campana |
| La alarma sobrevive | recargar la pagina -> el aviso sigue en la lista |
| El APK trae la direccion de la API | el boton "Conectar IA -> Direccion de la API" muestra la de la nube sin tocarla |
| El smoke test | `backend\\.venv\\Scripts\\python.exe backend\\smoke.py` |

## 5. Archivos

| Archivo | Para que |
|---|---|
| `frontend/src/lib/alarmas.ts` | motor de alarmas (web + plugin nativo) |
| `frontend/src/components/PanelAlarmas.tsx` | panel de avisos del celular |
| `frontend/src/components/CalendarPanel.tsx` | la campana en el detalle del bloque |
| `frontend/public/sw.js` | service worker (muestra las notificaciones) |
| `frontend/public/manifest.json` | datos de la PWA (icono, nombre, colores) |
| `.github/workflows/build-apk.yml` | construye el APK y lo publica |
| `backend/app/config.py` | `ORIGENES_PROPIOS` con los origenes del APK |
