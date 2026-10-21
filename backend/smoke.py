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
    return pedir("POST", "/api/agent/chat", {"mensaje": mensaje})  # type: ignore[return-value]


def check(nombre: str, condicion: bool, detalle: str = "") -> None:
    marca = "OK  " if condicion else "FALLA"
    print(f"[{marca}] {nombre}{(' -> ' + detalle) if detalle else ''}")
    if not condicion:
        fallos.append(nombre)


def main() -> int:
    print("=" * 70)
    print("LIFESYNC AI — VERIFICACION END-TO-END")
    print("=" * 70)

    salud = pedir("GET", "/api/health")
    check("backend vivo", bool(salud and salud.get("ok")), f"proveedor={salud.get('proveedor_por_defecto')}")

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
