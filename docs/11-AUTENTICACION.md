# Acceso en un clic: como entra la gente sin saber nada de tecnica

## 1. El problema

El acceso con Google necesita un **ID de cliente OAuth**. Si ese ID se le pide
a cada persona que usa la app, la mitad se rinde en el primer paso: "crea un
proyecto en la consola de Google Cloud", "APIs y servicios > Credenciales",
"copia el ID"... Eso no lo hace un usuario normal, lo hace **una sola vez
quien instala LifeSync en su servidor**.

## 2. Como queda ahora

| Persona | Que hace | Cuanto le toma |
|---|---|---|
| **Quien usa LifeSync** | abre la app, pulsa **Acceder > Continuar con Google**, autoriza en su navegador y entra | 2 clics, 10 segundos |
| **Quien instala LifeSync** (una vez) | pega su ID de cliente OAuth en la configuracion del despliegue | 1 minuto, una vez |

- El **ID de cliente vive en el despliegue** (`GOOGLE_CLIENT_ID` en las
  variables de entorno de Render), nunca se le pide a quien usa la app.
- El flujo de la interfaz (`frontend/src/components/AccesoPanel.tsx`) es:
  **Continuar con Google** → se muestra un codigo de 6 caracteres y un link →
  el usuario autoriza en su navegador → pulsa **"Listo, ya autorice"** → entra.
  Es el mismo mecanismo que usan las apps de escritorio.
- Si la copia desplegada todavia no tiene el ID configurado, la app lo dice
  en claro y ofrece las otras dos vias: **entrar con tu correo** (codigo de 6
  digitos) o **seguir en este equipo** (modo local).
- El wizard de "Conectar IA" que explica la consola de Google Cloud queda
  reetiquetado como **"Configuracion avanzada (una sola vez)"**, con un boton
  "Volver (no necesito esto)". El usuario normal nunca lo ve.

## 3. Si prefieres un servicio ya hecho (sin Google Cloud)

Si no quieres ni crear el ID de cliente, existen servicios de autenticacion
alojada. El paso tecnico (crear el proyecto y pegar 2-3 claves publicas) lo
hace **una sola vez quien despliega**; el usuario final solo hace clic.

| Servicio | Google | Correo con codigo | Plan gratis | Lo que hay que configurar |
|---|---|---|---|---|
| **Firebase Authentication** (Google) | si, boton oficial | si (email link), pero el plan Spark solo envia **5 correos/dia** | social sign-in **sin limite**; con Identity Platform, **3.000 usuarios/dia** | proyecto Firebase -> Authentication -> Sign-in method -> Google -> copiar 3 claves publicas |
| **Supabase Auth** | si | si (OTP); el correo integrado manda **2 correos/hora** -> hace falta SMTP propio | **50.000 usuarios/mes**, API ilimitada, 500 MB de BD | proyecto -> Authentication -> Providers -> Google -> `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| **Clerk / Auth0 / WorkOS** | si | si | de pago tras la prueba | cuenta y dominio, mas configuracion |

**Recomendacion para LifeSync**: mantener el sistema propio que ya existe
(`backend/app/cuentas.py`: codigo de verificacion, token de sesion, aislamiento
por `usuario_id`, respaldo) y usar el ID de cliente de OAuth del despliegue.
Es gratis, no depende de terceros y no obliga a migrar el modelo de datos. Si
mas adelante el proyecto crece, migrar a Firebase o Supabase Auth es cambiar
quien verifica el token, no reescribir la app.

## 4. Resumen

> El paso tecnico es de **quien instala**, una vez. El usuario final solo
> pone su cuenta y entra. Asi se hace en todas las apps serioas, y es
> exactamente lo que LifeSync ya hace.
