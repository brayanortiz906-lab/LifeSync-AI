"""Verificación end-to-end de LifeSync AI contra el backend en marcha.

Uso (con el backend corriendo en http://127.0.0.1:8000):
    .\\.venv\\Scripts\\python.exe smoke.py

Cada caso afirma sobre la respuesta del agente y sobre el estado real de la
base de datos. Devuelve código de salida != 0 si algún caso falla.
"""
from __future__ import annotations

import io
import json
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BASE = "http://127.0.0.1:8000"
fallos: list[str] = []


def pedir(metodo: str, ruta: str, cuerpo: dict | None = None) -> object:
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
            return json.loads(crudo.decode("utf-8")) if crudo else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{metodo} {ruta} -> {exc.code}: {exc.read().decode('utf-8')}") from exc


def chat(mensaje: str) -> dict:
    # Se fuerza el proveedor "mock" para que el test sea independiente de la
    # configuracion guardada en la base de datos.
    return pedir("POST", "/api/agent/chat", {"mensaje": mensaje, "proveedor": "mock"})  # type: ignore[return-value]


def check(nombre: str, condicion: bool, detalle: str = "") -> None:
    marca = "OK  " if condicion else "FALLA"
    print(f"[{marca}] {nombre}{(' -> ' + detalle) if detalle else ''}")
    if not condicion:
        fallos.append(nombre)


def limpiar() -> None:
    """Deja la base en un estado conocido para que el test sea repetible.

    Borra las "citas" creadas por corridas anteriores (mismo titulo que genera
    el agente), de modo que el caso CALENDARIO comprueba si realmente crea.
    """
    eventos = pedir("GET", "/api/events")
    for e in eventos or []:  # type: ignore[union-attr]
        titulo = str(e.get("titulo") or "").lower()  # type: ignore[union-attr]
        if titulo.startswith("cita"):
            pedir("DELETE", f"/api/events/{e['id']}")  # type: ignore[index]


def main() -> int:
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

    # Replica la misma peticion: no debe duplicar el evento.
    r2 = chat("Tengo una cita hoy a las 3 PM")
    eventos = pedir("GET", "/api/events")
    citas = [e for e in eventos if e["titulo"].lower().startswith("cita")]  # type: ignore[index]
    check("anti-duplicado: 1 sola cita tras 2 pedidos identicos", len(citas) == 1, f"encontradas={len(citas)}")
    check(
        "anti-duplicado: la 2a peticion actualiza en vez de crear",
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
    check("[BITACORA_GASTO] categoria = combustible", ok_cat)

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
    check("[MULTI] detecta 2 categorias", len(cats) >= 2, f"categorias={cats}")
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
    r = chat("Pagué el cambio de aceite de la moto por 120 mil")
    ag = r["agente"]
    tipos = {a["tipo"] for a in ag["acciones"]}
    check("[CASCADA] gasto de mantenimiento actualiza el mantenimiento", "registrar_mantenimiento" in tipos, f"tipos={sorted(tipos)}")

    # ------------------------------------------------------------------ DASHBOARD
    dash = pedir("GET", "/api/dashboard")
    check("dashboard responde", isinstance(dash, dict) and "eventos_hoy" in dash, f"claves={list(dash.keys()) if isinstance(dash, dict) else '-'}")  # type: ignore[union-attr]

    print("=" * 70)
    if fallos:
        print(f"RESULTADO: {len(fallos)} CASO(S) FALLIDO(S): {fallos}")
        return 1
    print("RESULTADO: TODOS LOS CASOS PASARON")
    return 0


if __name__ == "__main__":
    sys.exit(main())
