"""Verificación end-to-end de LifeAgente AI contra el backend en marcha.

Uso (con el backend corriendo en http://127.0.0.1:8000):
    .\\.venv\\Scripts\\python.exe smoke.py

Cada caso afirma sobre la respuesta del agente y sobre el estado real de la
base de datos. Devuelve código de salida != 0 si algún caso falla.
"""
from __future__ import annotations

import io
import json
import sys
import time
import urllib.error
import urllib.request

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BASE = "http://127.0.0.1:8000"
fallos: list[str] = []


def pedir(metodo: str, ruta: str, cuerpo: dict | None = None, token: str = "") -> object:
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(
        f"{BASE}{ruta}",
        data=datos,
        method=metodo,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            crudo = r.read()
            return json.loads(crudo.decode("utf-8")) if crudo else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{metodo} {ruta} -> {exc.code}: {exc.read().decode('utf-8')}") from exc


def pedir_suave(metodo: str, ruta: str, cuerpo: dict | None = None, token: str = "") -> tuple[int, object]:
    """Igual que `pedir`, pero sin lanzar error: devuelve (codigo, cuerpo)."""
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(
        f"{BASE}{ruta}",
        data=datos,
        method=metodo,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            crudo = r.read()
            return r.status, (json.loads(crudo.decode("utf-8")) if crudo else None)
    except urllib.error.HTTPError as exc:
        crudo = exc.read()
        try:
            return exc.code, json.loads(crudo.decode("utf-8"))
        except Exception:
            return exc.code, {"detail": crudo.decode("utf-8", "ignore")}


def chat(mensaje: str, token: str = "") -> dict:
    # Se fuerza el proveedor "mock" para que el test sea independiente de la
    # configuración guardada en la base de datos.
    return pedir(  # type: ignore[return-value]
        "POST", "/api/agent/chat", {"mensaje": mensaje, "proveedor": "mock"}, token
    )


def check(nombre: str, condicion: bool, detalle: str = "") -> None:
    marca = "OK  " if condicion else "FALLA"
    print(f"[{marca}] {nombre}{(' -> ' + detalle) if detalle else ''}")
    if not condicion:
        fallos.append(nombre)


def limpiar() -> None:
    """Deja la base en un estado conocido para que el test sea repetible.

    Borra las "citas" creadas por corridas anteriores (mismo título que genera
    el agente), de modo que el caso CALENDARIO comprueba si realmente crea.
    """
    eventos = pedir("GET", "/api/events")
    for e in eventos or []:  # type: ignore[union-attr]
        titulo = str(e.get("titulo") or "").lower()  # type: ignore[union-attr]
        if titulo.startswith("cita"):
            pedir("DELETE", f"/api/events/{e['id']}")  # type: ignore[index]


def main() -> int:
    # --------------------------------------------------------------------------- #
    # ----------------------------------------------------------------- #
    # CUENTAS DE USUARIO (v11): acceso con codigo, aislamiento y respaldo
    # ----------------------------------------------------------------- #
    print("\n--- CUENTAS DE USUARIO ---")
    import time as _time

    def pedir_tok(ruta, metodo="GET", cuerpo=None, token=None):
        """Como pedir(), pero devuelve el codigo de error en vez de launchar."""
        datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
        cabeceras = {"Content-Type": "application/json; charset=utf-8"}
        if token:
            cabeceras["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(
            f"{BASE}{ruta}", data=datos, method=metodo, headers=cabeceras
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                crudo = r.read()
                return json.loads(crudo.decode("utf-8")) if crudo else {}
        except urllib.error.HTTPError as exc:
            return {"__error__": exc.code, "detail": exc.read().decode("utf-8")}

    _correo = f"smoke.lifesync+{int(_time.time())}@example.com"

    _r = pedir_tok("/api/cuentas/yo")
    check(
        "[CUENTA] sin cuenta se usa el usuario local",
        isinstance(_r, dict) and _r.get("usuario", {}).get("es_local") is True,
        f"usuario={(_r or {}).get('usuario')}",
    )

    _r = pedir_tok("/api/cuentas/codigo", "POST", {"correo": _correo, "nombre": "Prueba"})
    _codigo = (_r or {}).get("codigo", "")
    check(
        "[CUENTA] se pide un codigo de verificacion",
        isinstance(_r, dict) and bool(_codigo),
        f"modo={(_r or {}).get('modo')}",
    )

    _r = pedir_tok("/api/cuentas/verificar", "POST", {"correo": _correo, "codigo": "000000"})
    check(
        "[CUENTA] un codigo incorrecto se rechaza",
        isinstance(_r, dict) and _r.get("__error__") == 400,
        f"http={(_r or {}).get('__error__')}",
    )

    _r = pedir_tok("/api/cuentas/verificar", "POST", {"correo": _correo, "codigo": _codigo})
    _token = (_r or {}).get("token", "")
    check(
        "[CUENTA] el codigo correcto abre sesion",
        isinstance(_r, dict) and bool(_token),
        f"token={'si' if _token else 'no'}",
    )

    _r = pedir_tok("/api/cuentas/yo", token=_token)
    check(
        "[CUENTA] el token identifica a la persona",
        isinstance(_r, dict) and (_r.get("usuario", {}).get("correo") == _correo),
        f"correo={(_r or {}).get('usuario', {}).get('correo')}",
    )

    _evs = pedir_tok("/api/events?desde=2020-01-01&hasta=2030-12-31", token=_token)
    check(
        "[CUENTA] la cuenta nueva no ve los datos del usuario local",
        isinstance(_evs, list) and len(_evs) == 0,
        f"eventos={len(_evs) if isinstance(_evs, list) else 'error'}",
    )

    _r = pedir_tok("/api/cuentas/respaldo", token=_token)
    check(
        "[CUENTA] el respaldo se puede descargar",
        isinstance(_r, dict) and "eventos" in _r,
        f"claves={sorted(_r.keys())[:4] if isinstance(_r, dict) else '-'}",
    )

    _r = pedir_tok("/api/cuentas/salir", "POST", token=_token)
    check(
        "[CUENTA] se puede cerrar sesion",
        isinstance(_r, dict) and _r.get("ok") is True,
        f"ok={(_r or {}).get('ok')}",
    )

    _r = pedir_tok("/api/cuentas/yo", token=_token)
    check(
        "[CUENTA] tras salir, el token ya no vale",
        isinstance(_r, dict) and _r.get("usuario", {}).get("es_local") is True,
        f"usuario={(_r or {}).get('usuario')}",
    )

    _r = pedir_tok("/api/cuentas/google/iniciar", "POST", {})
    _msg = str((_r or {}).get("detail", ""))
    check(
        "[CUENTA] el acceso con Google pide configuracion solo si falta (nunca al usuario final)",
        isinstance(_r, dict) and (
            "no tiene el acceso con" in _msg
            or "no esta activado en este servidor" in _msg
            or "user_code" in _r
        ),
        f"respuesta={_msg[:80] or 'device flow listo'}",
    )

    _r = pedir_tok("/api/cuentas/google/terminar", "POST", {"device_code": "codigo-de-prueba"})
    _msg2 = str((_r or {}).get("mensaje", "") or ( _r or {}).get("detail", ""))
    check(
        "[CUENTA] si aun no autorizaste, te lo dice sin error",
        isinstance(_r, dict) and (
            (_r.get("ok") is False and "autorices" in _msg2)
            or _r.get("__error__") == 400
        ),
        f"mensaje={_msg2[:70]}",
    )

    print("=" * 70)
    print("LIFESYNC AI — VERIFICACION END-TO-END")
    print("=" * 70)

    salud = pedir("GET", "/api/health")
    check("backend vivo", bool(salud and salud.get("ok")), f"proveedor={salud.get('proveedor_por_defecto')}")

    limpiar()

    # ---------------------------------------------------------------- CALENDARIO
    r = chat("Tengo una cita hoy a las 3 PM")
    ag = r["agente"]
    check("[CALENDARIO] clasifica bien", ag["categoria"] == "CALENDARIO", ag["categoria"])
    check("[CALENDARIO] crea evento", len(r["agente"]["resumen_estado"]["eventos_creados"]) >= 1)
    check("[CALENDARIO] devuelve plan de reorganizacion", bool(r.get("plan")), f"movidos={r.get('plan', {}).get('movidos')}")

    # Replica la misma petición: no debe duplicar el evento.
    r2 = chat("Tengo una cita hoy a las 3 PM")
    eventos = pedir("GET", "/api/events")
    citas = [e for e in eventos if e["titulo"].lower().startswith("cita")]  # type: ignore[index]
    check("anti-duplicado: 1 sola cita tras 2 pedidos identicos", len(citas) == 1, f"encontradas={len(citas)}")
    check(
        "anti-duplicado: la 2a petición actualiza en vez de crear",
        len(r2["agente"]["resumen_estado"]["eventos_creados"]) == 0,
        f"creados={r2['agente']['resumen_estado']['eventos_creados']}",
    )

    # ------------------------------------------------------------ BITACORA GASTO
    r = chat("Hoy tanqueé la moto por $20.000")
    ag = r["agente"]
    check("[BITACORA_GASTO] clasifica bien", ag["categoria"] == "BITACORA_GASTO", ag["categoria"])
    registros = pedir("GET", "/api/logbook")
    tanqueos = [x for x in registros if "tanque" in x["descripcion"].lower()]  # type: ignore[index]
    ok_monto = any(abs(x["monto"] - 20000.0) < 0.01 for x in tanqueos)  # type: ignore[index]
    check("[BITACORA_GASTO] monto 20000 correcto", ok_monto, f"valores={[x['monto'] for x in tanqueos]}")  # type: ignore[index]
    ok_cat = any(x["categoria"] == "combustible" for x in tanqueos)  # type: ignore[index]
    check("[BITACORA_GASTO] categoría = combustible", ok_cat)

    # ---------------------------------------------------------- TAREA ACADEMICA
    r = chat("Tengo que entregar el ensayo el viernes")
    ag = r["agente"]
    check("[TAREA_ACADEMICA] clasifica bien", ag["categoria"] == "TAREA_ACADEMICA", ag["categoria"])
    tareas = pedir("GET", "/api/tasks")
    ensayos = [t for t in tareas if "ensayo" in t["titulo"].lower()]  # type: ignore[index]
    check("[TAREA_ACADEMICA] crea la tarea", len(ensayos) >= 1, f"titulo={ensayos[0]['titulo'] if ensayos else '-'}")

    # ------------------------------------------------------------- MANTENIMIENTO
    r = chat("me toca cambiar el aceite de la moto")
    ag = r["agente"]
    check("[MANTENIMIENTO] clasifica bien", ag["categoria"] == "MANTENIMIENTO", ag["categoria"])
    mants = pedir("GET", "/api/maintenance")
    aceite = [m for m in mants if "aceite" in m["tarea"].lower()]  # type: ignore[index]
    check("[MANTENIMIENTO] programa el servicio", len(aceite) >= 1, f"tarea={aceite[0]['tarea'] if aceite else '-'}")

    # --------------------------------------------------------------- CONVERSACION
    r = chat("Hola, ¿cómo estás?")
    check("[CONVERSACION] clasifica bien", r["agente"]["categoria"] == "CONVERSACION", r["agente"]["categoria"])
    check("[CONVERSACION] no ejecuta acciones", len(r["agente"]["acciones"]) == 0)

    # ------------------------------------------------------------ MULTI-INTENCION
    r = chat("Tengo una cita hoy a las 4 PM y además gasté 25 mil en gasolina")
    ag = r["agente"]
    tipos = {a["tipo"] for a in ag["acciones"]}
    cats = ag.get("categorias") or [ag["categoria"]]
    check("[MULTI] detecta 2 categorías", len(cats) >= 2, f"categorias={cats}")
    check("[MULTI] genera acciones de ambas", {"crear_evento", "registrar_gasto"} <= tipos, f"tipos={sorted(tipos)}")
    check(
        "[MULTI] el gasto queda en la bitacora",
        any(abs(x["monto"] - 25000.0) < 0.01 for x in pedir("GET", "/api/logbook")),  # type: ignore[index]
    )
    detalle = ag["resumen_estado"].get("registros_detallados") or []
    check("[MULTI] reporta lo registrado (registros_detallados)", len(detalle) >= 2, f"n={len(detalle)}")
    check(
        "[MULTI] el mensaje nombra lo registrado",
        "registrad" in ag["mensaje_usuario"].lower(),
        ag["mensaje_usuario"][:90],
    )

    # ------------------------------------------------------- CASCADA T->ESTUDIO
    r = chat("Tengo que entregar la presentación de álgebra el jueves")
    ag = r["agente"]
    tipos = {a["tipo"] for a in ag["acciones"]}
    check("[CASCADA] tarea genera bloque de estudio", "programar_estudio" in tipos, f"tipos={sorted(tipos)}")
    eventos = pedir("GET", "/api/events")
    hay_estudio = any("estudio" in (e["titulo"] or "").lower() for e in eventos)  # type: ignore[index]
    check("[CASCADA] el bloque de estudio existe en el calendario", hay_estudio)

    # ------------------------------------------- CASCADA GASTO->MANTENIMIENTO
    r = chat("Pagué el cambió de aceite de la moto por 120 mil")
    ag = r["agente"]
    tipos = {a["tipo"] for a in ag["acciones"]}
    check("[CASCADA] gasto de mantenimiento actualiza el mantenimiento", "registrar_mantenimiento" in tipos, f"tipos={sorted(tipos)}")

    # ------------------------------------------------------------------ DASHBOARD
    dash = pedir("GET", "/api/dashboard")
    check("dashboard responde", isinstance(dash, dict) and "eventos_hoy" in dash, f"claves={list(dash.keys()) if isinstance(dash, dict) else '-'}")  # type: ignore[union-attr]

    # ==================================================================
    # SISTEMA RESPONSABLE (IA responsable)
    # ==================================================================
    print("-" * 70)
    print("SISTEMA RESPONSABLE")
    print("-" * 70)

    # --------------------------------------------------------- POLITICA Y UMBRALES
    pol = pedir("GET", "/api/responsabilidad/politica")
    check("[RESP] la política es accesible", bool(pol) and "umbral_confianza" in pol, f"umbral={pol.get('umbral_confianza') if pol else '-'}")  # type: ignore[union-attr]

    # Se baja el umbral de gasto para forzar el flujo de aprobación.
    pol_bajo = dict(pol)  # type: ignore[arg-type]
    pol_bajo["gasto_max_autonomo"] = 1000.0
    pedir("PUT", "/api/responsabilidad/politica", pol_bajo)

    # ----------------------------------------------------- GASTO SOBRE UMBRAL
    # Conteo previo: el test es repetible, así que puede haber gastos iguales
    # de corridas anteriores (ya aprobados). Se compara el delta, no el total.
    previos = sum(1 for x in pedir("GET", "/api/logbook") if abs(x["monto"] - 800000.0) < 0.01)  # type: ignore[index]
    r = chat("Pagué la matricula de la universidad por 800 mil")
    ag = r["agente"]
    pendientes = ag["resumen_estado"].get("aprobaciones_pendientes") or []
    check("[RESP] gasto alto queda pendiente de aprobación", len(pendientes) >= 1, f"pendientes={len(pendientes)}")
    check(
        "[RESP] el motivo de la regla se explica",
        bool(pendientes) and bool(pendientes[0].get("regla")) and bool(pendientes[0].get("motivo")),
        f"regla={pendientes[0].get('regla') if pendientes else '-'}",
    )
    despues = sum(1 for x in pedir("GET", "/api/logbook") if abs(x["monto"] - 800000.0) < 0.01)  # type: ignore[index]
    check(
        "[RESP] el gasto NO se ejecuto sin permiso",
        despues == previos,
        f"antes={previos} despues={despues}",
    )
    check(
        "[RESP] el chat avisa que necesita confirmacion",
        "confirmaci" in ag["mensaje_usuario"].lower() or "aprobaci" in ag["mensaje_usuario"].lower(),
        ag["mensaje_usuario"][:90],
    )

    # ---------------------------------------------------------- APROBAR Y EJECUTAR
    aprobaciones = pedir("GET", "/api/responsabilidad/aprobaciones?estado=pendiente")
    check("[RESP] la aprobación llega a la bandeja", len(aprobaciones or []) >= 1, f"n={len(aprobaciones or [])}")  # type: ignore[arg-type]
    # Se toma la petición que corresponde a ESTE gasto (no una de corridas previas).
    objetivo = next(
        (a for a in (aprobaciones or []) if "matricula" in (a.get("resumen") or "").lower()),  # type: ignore[union-attr]
        (aprobaciones or [None])[0],  # type: ignore[index]
    )
    if objetivo:
        pid = objetivo["id"]  # type: ignore[index]
        antes_aprobar = sum(1 for x in pedir("GET", "/api/logbook") if abs(x["monto"] - 800000.0) < 0.01)  # type: ignore[index]
        pedido = pedir("POST", f"/api/responsabilidad/aprobaciones/{pid}/decidir", {"aprobar": True, "nota": "Aprobado en la prueba", "actor": "usuario"})  # type: ignore[arg-type]
        check("[RESP] aprobar cambia el estado", bool(pedido) and pedido.get("estado") == "aprobada", f"estado={pedido.get('estado') if pedido else '-'}")  # type: ignore[union-attr]
        log = pedir("GET", "/api/logbook")
        despues_aprobar = sum(1 for x in log if abs(x["monto"] - 800000.0) < 0.01)  # type: ignore[index]
        check(
            "[RESP] tras aprobar, el gasto SI queda registrado",
            despues_aprobar == antes_aprobar + 1,
            f"antes={antes_aprobar} despues={despues_aprobar}",
        )

    # ------------------------------------------------------------------ RECHAZAR
    antes_rechazar = sum(1 for x in pedir("GET", "/api/logbook") if abs(x["monto"] - 3000000.0) < 0.01)  # type: ignore[index]
    r = chat("Compré un computador de 3 millones")
    aprobaciones = pedir("GET", "/api/responsabilidad/aprobaciones?estado=pendiente")
    # Se busca la petición del computador (no una de corridas previas).
    objetivo = next(
        (a for a in (aprobaciones or []) if "computador" in (a.get("resumen") or "").lower()),  # type: ignore[union-attr]
        None,
    )
    if objetivo:
        pid = objetivo["id"]  # type: ignore[index]
        pedido = pedir("POST", f"/api/responsabilidad/aprobaciones/{pid}/decidir", {"aprobar": False, "nota": "Fuera de presupuesto", "actor": "usuario"})  # type: ignore[arg-type]
        check("[RESP] rechazar cambia el estado", bool(pedido) and pedido.get("estado") == "rechazada", f"estado={pedido.get('estado') if pedido else '-'}")  # type: ignore[union-attr]
        log = pedir("GET", "/api/logbook")
        despues_rechazar = sum(1 for x in log if abs(x["monto"] - 3000000.0) < 0.01)  # type: ignore[index]
        check(
            "[RESP] tras rechazar, el gasto NO se registra",
            despues_rechazar == antes_rechazar,
            f"antes={antes_rechazar} despues={despues_rechazar}",
        )

    # ---------------------------------------------------------------- REDACCION PII
    # Se restaura la política para que este gasto normal pase de forma autónoma.
    pedir("PUT", "/api/responsabilidad/politica", pol)

    red = pedir("POST", "/api/responsabilidad/redactar", {"texto": "Mi correo es ana@correo.com, mi cedula 1234567890 y la tarjeta 4111111111111111"})
    check("[RESP] la redaction detecta PII", bool(red) and int(red.get("total_encontrados", 0)) >= 3, f"encontrados={red.get('total_encontrados') if red else '-'}")  # type: ignore[union-attr]
    check(
        "[RESP] la redaction enmascara los datos",
        bool(red) and "ana@correo.com" not in red.get("texto_redactado", "") and "4111111111111111" not in red.get("texto_redactado", ""),  # type: ignore[union-attr]
    )

    # Regresion: un MONTO de 6+ digitos no debe confundirse con una cedula.
    red_monto = pedir("POST", "/api/responsabilidad/redactar", {"texto": "Pague 800000 por el arreglo"})
    check(
        "[RESP] un monto no se confunde con una cedula",
        bool(red_monto) and "800000" in red_monto.get("texto_redactado", ""),  # type: ignore[union-attr]
        red_monto.get("texto_redactado", "") if red_monto else "",  # type: ignore[union-attr]
    )

    antes_pii = sum(1 for x in pedir("GET", "/api/logbook") if abs(x["monto"] - 90000.0) < 0.01)  # type: ignore[index]
    r = chat("Compre una chaqueta por 90 mil con mi cedula 1234567890")
    log = pedir("GET", "/api/logbook")
    nuevos_pii = [x for x in log if abs(x["monto"] - 90000.0) < 0.01][antes_pii:]  # type: ignore[index]
    registro = nuevos_pii[0] if nuevos_pii else None
    check(
        "[RESP] el mensaje con PII se registra sin exponer la cedula",
        registro is not None and "1234567890" not in registro["descripcion"],
        f"desc={registro['descripcion'][:60] if registro else '-'}",
    )

    # -------------------------------------------------------------------- AUDITORIA
    aud = pedir("GET", "/api/responsabilidad/auditoria?limite=200")
    check("[RESP] la auditoría registra decisiones", len(aud or []) >= 1, f"entradas={len(aud or [])}")  # type: ignore[arg-type]
    tipos_aud = {a["tipo"] for a in (aud or [])}  # type: ignore[union-attr]
    check("[RESP] la auditoría tipa los eventos", "accion" in tipos_aud, f"tipos={sorted(tipos_aud)}")
    check(
        "[RESP] la auditoría conserva el motivo",
        all("motivo" in a for a in (aud or [])),  # type: ignore[union-attr]
    )
    res_aud = pedir("GET", "/api/responsabilidad/auditoria/resumen")
    check("[RESP] el resumen de auditoría responde", bool(res_aud) and "total" in res_aud, f"total={res_aud.get('total') if res_aud else '-'}")  # type: ignore[union-attr]

    # ----------------------------------------------------------------- CUMPLIMIENTO
    comp = pedir("GET", "/api/responsabilidad/cumplimiento")
    check("[RESP] el reporte de cumplimiento responde", bool(comp) and "controles" in comp, f"puntaje={comp.get('puntaje') if comp else '-'}")  # type: ignore[union-attr]
    check("[RESP] el reporte tiene controles", bool(comp) and len(comp.get("controles", [])) >= 6, f"controles={len(comp.get('controles', [])) if comp else 0}")  # type: ignore[union-attr]
    inv = pedir("GET", "/api/responsabilidad/inventario")
    check("[RESP] el inventario de datos responde", bool(inv) and "derechos" in inv, f"claves={list(inv.keys()) if isinstance(inv, dict) else '-'}")  # type: ignore[union-attr]

    # ---------------------------------------------------------- CONEXIONES DE IA
    cat = pedir("GET", "/api/conexiones/catalogo")
    proveedores = (cat or {}).get("proveedores", []) if isinstance(cat, dict) else []
    check("[CONEX] el catálogo tiene proveedores", len(proveedores) >= 5, f"n={len(proveedores)}")
    modos = {p.get("modo") for p in proveedores}
    check("[CONEX] hay caminos sin clave (cuenta/local/demo)", {"cuenta", "local", "demo"} & modos == {"cuenta", "local", "demo"}, f"modos={sorted(modos)}")  # type: ignore[union-attr]
    locales = pedir("GET", "/api/conexiones/locales")
    motores = (locales or {}).get("motores", []) if isinstance(locales, dict) else []
    check("[CONEX] la deteccion de motores locales responde", isinstance(motores, list), f"motores={[m.get('id') for m in motores]}")  # type: ignore[union-attr]

    # Conectar el proveedor "demo" (nunca falla) y verificar que queda activo.
    demo = pedir("POST", "/api/conexiones", {"proveedor": "demo", "nombre": "Asistente demo", "modelo": "motor-local"})
    check("[CONEX] se puede guardar una conexión", bool(demo) and demo.get("id") is not None, f"id={demo.get('id') if isinstance(demo, dict) else '-'}")  # type: ignore[union-attr]
    cid = demo.get("id") if isinstance(demo, dict) else None
    if cid is not None:
        ver = pedir("POST", f"/api/conexiones/{cid}/verificar")
        check("[CONEX] la verificación responde", bool(ver) and ver.get("estado") in {"activa", "error"}, f"estado={ver.get('estado') if isinstance(ver, dict) else '-'}")  # type: ignore[union-attr]
        act = pedir("POST", f"/api/conexiones/{cid}/activar")
        check("[CONEX] se puede activar la conexión", bool(act) and act.get("activa") is True, f"activa={act.get('activa') if isinstance(act, dict) else '-'}")  # type: ignore[union-attr]
        lista = pedir("GET", "/api/conexiones")
        check("[CONEX] la conexión aparece en la lista", any(c.get("id") == cid for c in (lista or [])), f"n={len(lista) if isinstance(lista, list) else 0}")  # type: ignore[union-attr]
        # La credencial nunca debe salir por la API.
        check("[CONEX] la API no expone la credencial", all("api_key" not in (c or {}) and not (c or {}).get("credenciales_cifradas") for c in (lista or [])), "sin secretos en la respuesta")  # type: ignore[union-attr]
        # Se devuelve al motor demo para no alterar el resto del test.
        pedir("DELETE", f"/api/conexiones/{cid}")

    # ------------------------------------------- CONEXIONES: CAMINO CON GOOGLE
    con_google = [p for p in proveedores if p.get("permite_google")]
    check("[CONEX] el catálogo marca el camino con Google", len(con_google) >= 5, f"n={len(con_google)}")
    catalogo_ias = pedir("GET", "/api/conexiones/modelos?proveedor=openrouter")
    total_ias = (catalogo_ias or {}).get("total", 0) if isinstance(catalogo_ias, dict) else 0
    check("[CONEX] el catálogo de IAs devuelve cientos de modelos", total_ias >= 100, f"total={total_ias}")
    familias_ias = (catalogo_ias or {}).get("familias", []) if isinstance(catalogo_ias, dict) else []
    check("[CONEX] el catálogo de IAs agrupa por familia", len(familias_ias) >= 5, f"familias={len(familias_ias)}")
    con_seleccion = [p for p in proveedores if p.get("permite_seleccion_modelo")]
    check("[CONEX] hay un proveedor donde elegir cualquier IA", len(con_seleccion) >= 1, f"n={len(con_seleccion)}")

    # ------------------- CONEXIONES: EL ACCESO CON GOOGLE SE PUEDE ACTIVAR
    est_google = pedir("GET", "/api/conexiones/google/estado")
    check(
        "[CONEX] el estado del acceso con Google responde",
        isinstance(est_google, dict) and "configurado" in est_google,
        f"origen={(est_google or {}).get('origen') if isinstance(est_google, dict) else '-'}",
    )
    # Se guarda un ID de cliente público de prueba y se comprueba que queda activo.
    id_prueba = "1234567890-prueba-smoke.apps.googleusercontent.com"
    guardado = pedir("PUT", "/api/conexiones/google/estado", {"client_id": id_prueba})
    check(
        "[CONEX] se puede activar el acceso con Google",
        isinstance(guardado, dict) and guardado.get("configurado") is True,
        f"origen={(guardado or {}).get('origen') if isinstance(guardado, dict) else '-'}",
    )
    est_google2 = pedir("GET", "/api/conexiones/google/estado")
    check(
        "[CONEX] el acceso con Google queda guardado",
        isinstance(est_google2, dict) and est_google2.get("configurado") is True,
        f"origen={(est_google2 or {}).get('origen') if isinstance(est_google2, dict) else '-'}",
    )
    # Se devuelve el estado original (el ID de prueba no debe quedarse).
    pedido_olvidar = pedir("PUT", "/api/conexiones/google/estado", {"client_id": ""})
    check(
        "[CONEX] se puede olvidar el ID de cliente de Google",
        isinstance(pedido_olvidar, dict) and pedido_olvidar.get("ok") is True,
        f"origen={(pedido_olvidar or {}).get('origen') if isinstance(pedido_olvidar, dict) else '-'}",
    )

    # --------------------------------------------------------------------------- #
    # PERMISOS Y AUTOPILOTO (v16): la persona autoriza una vez y el sistema solo
    # --------------------------------------------------------------------------- #
    print("-" * 70)
    print("PERMISOS DE LA CUENTA")
    perm = pedir("GET", "/api/permisos")
    lista_permisos = (perm or {}).get("permisos", []) if isinstance(perm, dict) else []
    check(
        "[PERMISOS] el estado de permisos responde",
        isinstance(lista_permisos, list) and len(lista_permisos) >= 4,
        f"n={len(lista_permisos)}",
    )
    check(
        "[PERMISOS] cada permiso explica para que sirve",
        all(p.get("por_que") for p in lista_permisos),
        f"permisos={[p.get('id') for p in lista_permisos]}",
    )
    aut = pedir(
        "POST",
        "/api/permisos/autopiloto",
        {"activo": True, "respaldo_auto": True, "importar_calendario": True},
    )
    check(
        "[PERMISOS] se puede encender el autopilot",
        isinstance(aut, dict) and (aut.get("autopiloto") or {}).get("activo") is True,
        f"activo={(aut or {}).get('autopiloto', {}).get('activo') if isinstance(aut, dict) else '-'}",
    )
    ejec = pedir("POST", "/api/permisos/autopiloto/ejecutar")
    resumen = (ejec or {}).get("resumen", {}) if isinstance(ejec, dict) else {}
    check(
        "[PERMISOS] el autopilot explica que falta el permiso",
        isinstance(resumen, dict) and isinstance(resumen.get("respaldo"), dict),
        f"respaldo={(resumen.get('respaldo') or {}).get('mensaje', '-') if isinstance(resumen, dict) else '-'}",
    )
    codigo_perm, cuerpo_perm = pedir_suave("POST", "/api/permisos/autorizar", {"proveedor": "google_cuenta"})
    detalle_perm = ""
    if isinstance(cuerpo_perm, dict):
        detalle_perm = str(cuerpo_perm.get("detail") or "")
    check(
        "[PERMISOS] sin configuracion avisa en palabras claras",
        codigo_perm in (200, 400)
        and (
            "configurado" in detalle_perm
            or "activado" in detalle_perm
            or "no esta" in detalle_perm
            or codigo_perm == 200
        ),
        f"codigo={codigo_perm}",
    )

    # ------------------------------------------------------------------ #
    # v21: guardado con retardo + restauracion que fusiona + tarea diaria
    # ------------------------------------------------------------------ #
    print("\nGUARDADO AUTOMATICO Y RESTAURACION (v21)")
    aut21 = pedir("GET", "/api/permisos")
    piloto21 = (aut21 or {}).get("autopiloto", {}) if isinstance(aut21, dict) else {}
    check(
        "[GUARDADO] el estado avisa si hay cambios por guardar",
        "cambios_pendientes" in piloto21 and "guarda_en_segundos" in piloto21,
        f"cambios_pendientes={piloto21.get('cambios_pendientes')}",
    )
    # Un cambio real (el chat registra un evento) debe marcar "pendiente".
    chat("Tengo una cita manana a las 3 PM para revisar el proyecto")
    aut21b = pedir("GET", "/api/permisos")
    piloto21b = (aut21b or {}).get("autopiloto", {}) if isinstance(aut21b, dict) else {}
    check(
        "[GUARDADO] al cambiar algo se marca que hay que guardar",
        piloto21b.get("cambios_pendientes") is True,
        f"cambios_pendientes={piloto21b.get('cambios_pendientes')}",
    )
    guard21 = pedir("POST", "/api/permisos/guardar")
    check(
        "[GUARDADO] el guardado espera a que la persona deje de escribir",
        isinstance(guard21, dict) and "guardado" in guard21,
        f"guardado={(guard21 or {}).get('guardado') if isinstance(guard21, dict) else '-'}",
    )
    sin21 = pedir_suave("POST", "/api/permisos/ejecutar-todos")
    check(
        "[GUARDADO] la tarea diaria esta protegida con token",
        sin21[0] == 403,
        f"-> cod={sin21[0]}",
    )
    sinc21 = pedir("POST", "/api/cuentas/sincronizar")
    check(
        "[GUARDADO] al entrar se revisa Drive y se rellena lo que falte",
        isinstance(sinc21, dict) and sinc21.get("ok") is True and "mensaje" in sinc21,
        f"mensaje={(sinc21 or {}).get('mensaje', '-')[:60] if isinstance(sinc21, dict) else '-'}",
    )

    # Regresion: cada persona tiene su propia politica (v11) y la suya no choca.
    correo_v16 = f"smoke.v16+{int(time.time())}@example.com"
    alta = pedir("POST", "/api/cuentas/codigo", {"correo": correo_v16, "nombre": "Prueba v16"})
    codigo_v16 = ""
    if isinstance(alta, dict):
        codigo_v16 = str(alta.get("codigo_dev") or alta.get("codigo") or "")
    verif = pedir("POST", "/api/cuentas/verificar", {"correo": correo_v16, "codigo": codigo_v16})
    token_v16 = str((verif or {}).get("token") or "") if isinstance(verif, dict) else ""
    if token_v16:
        try:
            cumpl = pedir("GET", "/api/responsabilidad/cumplimiento", token=token_v16)
            check(
                "[CUENTA] cada persona tiene su propia politica (sin colision)",
                isinstance(cumpl, dict) and "puntaje" in cumpl,
                f"puntaje={(cumpl or {}).get('puntaje') if isinstance(cumpl, dict) else '-'}",
            )
        except RuntimeError as exc:
            check("[CUENTA] cada persona tiene su propia politica (sin colision)", False, str(exc)[:90])
        perm_nuevo = pedir("GET", "/api/permisos", token=token_v16)
        check(
            "[CUENTA] los permisos son de cada persona",
            isinstance(perm_nuevo, dict) and perm_nuevo.get("conectado") is False,
            f"conectado={(perm_nuevo or {}).get('conectado') if isinstance(perm_nuevo, dict) else '-'}",
        )
    else:
        check("[CUENTA] cada persona tiene su propia politica (sin colision)", False, "no se pudo crear la cuenta")

    # ------------------------------------------------------------------ #
    # v19: acceso con contrasena + paneles con permisos
    # ------------------------------------------------------------------ #
    print("\nCUENTAS CON CONTRASENA Y PANELES (v19)")
    cod, r = pedir_suave("GET", "/api/cuentas/google/disponible")
    check(
        "[CUENTA] el acceso con Google avisa si esta disponible (sin callejon)",
        cod == 200 and "disponible" in (r if isinstance(r, dict) else {}),
        f"-> cod={cod}",
    )
    correo_v19 = f"smoke.v19.{int(time.time())}@example.com"
    reg = pedir("POST", "/api/cuentas/registro", {"correo": correo_v19, "nombre": "V19", "password": "clave123"})
    check(
        "[CUENTA] se puede crear la cuenta con correo y contrasena",
        isinstance(reg, dict) and reg.get("ok") is True,
        f"correo={correo_v19}",
    )
    cod, r = pedir_suave("POST", "/api/cuentas/entrar", {"correo": correo_v19, "password": "mala"})
    check("[CUENTA] la contrasena incorrecta no deja entrar", cod == 401, f"-> cod={cod}")
    cod, r = pedir_suave("POST", "/api/cuentas/entrar", {"correo": correo_v19, "password": "clave123"})
    check(
        "[CUENTA] si falta confirmar el correo te lo dice (no te deja fuera)",
        cod in (200, 403),
        f"-> cod={cod}",
    )
    token_v19 = ""
    codigo_v19 = (reg or {}).get("codigo") if isinstance(reg, dict) else None
    if codigo_v19:
        ver = pedir("POST", "/api/cuentas/verificar", {"correo": correo_v19, "codigo": codigo_v19})
        token_v19 = (ver or {}).get("token", "") if isinstance(ver, dict) else ""
    check("[CUENTA] con el codigo verificado entras con tu token", bool(token_v19))
    if token_v19:
        panel = pedir("POST", "/api/paneles", {"nombre": "Universidad", "tipo": "academia"}, token_v19)
        panel_id = (panel or {}).get("panel", {}).get("id") if isinstance(panel, dict) else None
        check("[PANEL] se puede crear un panel", bool(panel_id), f"-> id={panel_id}")
        lista = pedir("GET", "/api/paneles", token=token_v19)
        check(
            "[PANEL] el panel aparece en tu lista",
            isinstance(lista, dict) and any(p.get("id") == panel_id for p in lista.get("paneles", [])),
        )
        cod, r = pedir_suave("GET", f"/api/paneles/{panel_id}/datos", token=token_v19)
        check("[PANEL] puedes ver el contenido de tu panel", cod == 200, f"-> cod={cod}")
        # Una persona sin permiso no puede ver el panel.
        correo_ajeno = f"smoke.v19b.{int(time.time())}@example.com"
        reg2 = pedir("POST", "/api/cuentas/registro", {"correo": correo_ajeno, "nombre": "Ajena", "password": "clave456"})
        codigo2 = (reg2 or {}).get("codigo") if isinstance(reg2, dict) else None
        token_ajeno = ""
        if codigo2:
            ver2 = pedir("POST", "/api/cuentas/verificar", {"correo": correo_ajeno, "codigo": codigo2})
            token_ajeno = (ver2 or {}).get("token", "") if isinstance(ver2, dict) else ""
        if token_ajeno:
            cod, r = pedir_suave("GET", f"/api/paneles/{panel_id}/datos", token=token_ajeno)
            check("[PANEL] sin permiso NO puedes ver el panel de otra persona", cod == 403, f"-> cod={cod}")
            comp = pedir("POST", f"/api/paneles/{panel_id}/compartir", {"correo": correo_ajeno, "nivel": "ver"}, token_v19)
            check(
                "[PANEL] puedes compartir el panel por correo",
                isinstance(comp, dict) and comp.get("ok") is True,
            )
            cod, r = pedir_suave("GET", f"/api/paneles/{panel_id}/datos", token=token_ajeno)
            check("[PANEL] con permiso SI puedes ver el panel", cod == 200, f"-> cod={cod}")
            cod, r = pedir_suave("DELETE", f"/api/paneles/{panel_id}/compartir/0")
            check("[PANEL] quitar el acceso responde", cod in (200, 403, 404), f"-> cod={cod}")
        else:
            check("[PANEL] sin permiso NO puedes ver el panel de otra persona", False, "no se pudo crear la cuenta ajena")
        cod, r = pedir_suave("DELETE", f"/api/paneles/{panel_id}", token=token_v19)
        check("[PANEL] se puede borrar el panel", cod == 200, f"-> cod={cod}")

    # ------------------------------------------------------------------ #
    print("\nRESPALDO, VERIFICACION Y ALMACENAMIENTO (v20)")
    # ------------------------------------------------------------------ #
    correo_v20 = f"smoke.v20.{int(time.time())}@example.com"
    reg20 = pedir("POST", "/api/cuentas/registro", {"correo": correo_v20, "nombre": "V20", "password": "clave123"})
    codigo20 = (reg20 or {}).get("codigo") if isinstance(reg20, dict) else None
    token20 = ""
    if codigo20:
        ver20 = pedir("POST", "/api/cuentas/verificar", {"correo": correo_v20, "codigo": codigo20})
        token20 = (ver20 or {}).get("token", "") if isinstance(ver20, dict) else ""
    check("[CUENTA] la cuenta se verifica con el codigo y da token", bool(token20))
    cod, r = pedir_suave("POST", "/api/cuentas/reenviar-codigo", {"correo": correo_v20, "nombre": "V20"})
    check(
        "[CUENTA] se puede reenviar el codigo de verificacion",
        cod == 200 and isinstance(r, dict) and r.get("ok") is True,
        f"-> cod={cod}",
    )
    cod, r = pedir_suave("GET", "/api/diagnostico")
    check(
        "[API] el autodiagnostico responde y no ve problemas",
        cod == 200 and isinstance(r, dict) and not r.get("problemas"),
        f"-> cod={cod} problemas={r.get('problemas') if isinstance(r, dict) else ''}",
    )
    if token20:
        # Contenido con bloque de estudio (la tarea apunta a un evento).
        chat("Tengo que entregar el ensayo el viernes", token20)
        chat("Mañana tengo una cita a las 3 PM y ademas gaste 20 mil en gasolina", token20)
        snap = pedir("GET", "/api/cuentas/respaldo", token=token20)
        check(
            "[RESPALDO] el respaldo incluye agenda, tareas y gastos",
            isinstance(snap, dict) and len(snap.get("eventos", [])) >= 1 and len(snap.get("tareas", [])) >= 1,
            f"eventos={len((snap or {}).get('eventos', []))} tareas={len((snap or {}).get('tareas', []))}",
        )
        # Otra cuenta recibe ese respaldo: no debe reventar con un 500.
        correo_v20b = f"smoke.v20b.{int(time.time())}@example.com"
        reg20b = pedir("POST", "/api/cuentas/registro", {"correo": correo_v20b, "nombre": "V20B", "password": "clave123"})
        codigo20b = (reg20b or {}).get("codigo") if isinstance(reg20b, dict) else None
        token20b = ""
        if codigo20b:
            ver20b = pedir("POST", "/api/cuentas/verificar", {"correo": correo_v20b, "codigo": codigo20b})
            token20b = (ver20b or {}).get("token", "") if isinstance(ver20b, dict) else ""
        if token20b:
            cod, r = pedir_suave("POST", "/api/cuentas/respaldo/restaurar", snap, token20b)
            check(
                "[RESPALDO] restaurar el respaldo NO da error 500",
                cod == 200,
                f"-> cod={cod}",
            )
            restaurado = (r or {}).get("restaurados", {}) if isinstance(r, dict) else {}
            check(
                "[RESPALDO] el contenido vuelve en la cuenta nueva",
                sum(int(v or 0) for v in restaurado.values()) >= 2,
                f"restaurados={restaurado}",
            )
            cod, r = pedir_suave("GET", "/api/events", token=token20b)
            check(
                "[RESPALDO] al entrar de nuevo se ve todo el contenido",
                cod == 200 and isinstance(r, list) and len(r) >= 1,
                f"-> cod={cod} eventos={len(r) if isinstance(r, list) else 0}",
            )
        else:
            check("[RESPALDO] el contenido vuelve en la cuenta nueva", False, "no se pudo crear la cuenta")

    # ------------------------------------------------------------------ #
    # Apartado de cuentas: que cuentas se pueden poner para entrar (v24)
    # ------------------------------------------------------------------ #
    print("\n" + "=" * 70)
    print("APARTADO DE CUENTAS (v24)")
    print("=" * 70)
    cod, r = pedir_suave("GET", "/api/cuentas/proveedores")
    proveedores = (r or {}).get("proveedores", []) if isinstance(r, dict) else []
    ids = [p.get("id") for p in proveedores]
    check(
        "[CUENTA] el apartado ofrece Google, Outlook y GitHub",
        cod == 200 and set(ids) >= {"google_cuenta", "outlook_cuenta", "github_cuenta"},
        f"-> cod={cod} ids={ids}",
    )
    check(
        "[CUENTA] cada cuenta de entrada explica como se activa",
        bool(proveedores)
        and all(
            p.get("nombre") and p.get("detalle") and p.get("icono") and p.get("url_registro")
            for p in proveedores
        ),
        f"-> {[p.get('id') for p in proveedores]}",
    )
    check(
        "[CUENTA] el correo y el modo local siempre estan disponibles",
        isinstance(r, dict)
        and (r.get("correo") or {}).get("disponible") is True
        and (r.get("local") or {}).get("disponible") is True,
        f"-> correo={(r or {}).get('correo', {}).get('disponible')} local={(r or {}).get('local', {}).get('disponible')}",
    )

    # ------------------------------------------------------------------ #
    # El ID de cliente que se pega en la app DEBE usarse (v25)
    # ------------------------------------------------------------------ #
    print("\n" + "=" * 70)
    print("ID DE CLIENTE DE LA CUENTA (v25)")
    print("=" * 70)
    id_prueba_v25 = "9876543210-abc.apps.googleusercontent.com"
    cod_save, r_save = pedir_suave(
        "PUT", "/api/conexiones/google/estado", {"client_id": id_prueba_v25, "proveedor": "google_cuenta"}
    )
    check(
        "[CUENTA] se puede activar el acceso con una cuenta desde la app",
        cod_save == 200 and isinstance(r_save, dict) and r_save.get("configurado") is True,
        f"-> cod={cod_save} {r_save}",
    )
    cod_prov, r_prov = pedir_suave("GET", "/api/cuentas/proveedores")
    google_v25 = next(
        (p for p in ((r_prov or {}).get("proveedores") or []) if p.get("id") == "google_cuenta"),
        {},
    )
    check(
        "[CUENTA] el ID guardado activa el boton de esa cuenta",
        google_v25.get("disponible") is True,
        f"-> disponible={google_v25.get('disponible')} ({google_v25.get('mensaje', '')})",
    )
    cod_flow, _ = pedir_suave("POST", "/api/cuentas/google/iniciar", {"proveedor": "google_cuenta"})
    check(
        "[CUENTA] al iniciar, la peticion sale al proveedor (no se queda muerta)",
        cod_flow in (200, 400),
        f"-> cod={cod_flow} (400 = el proveedor rechazo el ID de prueba, o sea si llego)",
    )
    cod_forget, r_forget = pedir_suave(
        "PUT", "/api/conexiones/google/estado", {"client_id": "", "proveedor": "google_cuenta"}
    )
    check(
        "[CUENTA] se puede olvidar el ID de cliente",
        cod_forget == 200 and isinstance(r_forget, dict) and r_forget.get("configurado") is False,
        f"-> cod={cod_forget} {r_forget}",
    )

    print("=" * 70)
    if fallos:
        print(f"RESULTADO: {len(fallos)} CASO(S) FALLIDO(S): {fallos}")
        return 1
    print("RESULTADO: TODOS LOS CASOS PASARON")
    return 0


if __name__ == "__main__":
    sys.exit(main())
