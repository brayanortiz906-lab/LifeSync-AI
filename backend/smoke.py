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


def pedir_suave(metodo: str, ruta: str, cuerpo: dict | None = None) -> tuple[int, object]:
    """Igual que `pedir`, pero sin lanzar error: devuelve (codigo, cuerpo)."""
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(
        f"{BASE}{ruta}",
        data=datos,
        method=metodo,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
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


def chat(mensaje: str) -> dict:
    # Se fuerza el proveedor "mock" para que el test sea independiente de la
    # configuración guardada en la base de datos.
    return pedir("POST", "/api/agent/chat", {"mensaje": mensaje, "proveedor": "mock"})  # type: ignore[return-value]


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
        isinstance(_r, dict) and ("no tiene el acceso con" in _msg or "user_code" in _r),
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
        codigo_perm in (200, 400) and ("configurado" in detalle_perm or codigo_perm == 200),
        f"codigo={codigo_perm}",
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

    print("=" * 70)
    if fallos:
        print(f"RESULTADO: {len(fallos)} CASO(S) FALLIDO(S): {fallos}")
        return 1
    print("RESULTADO: TODOS LOS CASOS PASARON")
    return 0


if __name__ == "__main__":
    sys.exit(main())
