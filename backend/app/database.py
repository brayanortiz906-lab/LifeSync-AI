"""Motor SQLAlchemy 2.0 + SQLite (prototipo) / Postgres (producción)."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from fastapi import Request
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    future=True,
)

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):  # pragma: no cover
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def _asegurar_columnas(conn, tabla: str, columnas: dict[str, str]) -> None:
    """Agrega a una tabla las columnas que falten.

    SQLite permite agregar columnas con `ALTER TABLE ... ADD COLUMN` y la
    operación es idempotente si primero se revisa `PRAGMA table_info`. Así una
    base creada por una versión anterior sigue funcionando sin recrearla.

    Si la tabla todavia no existe (base de datos recien creada, todavia sin
    `create_all`), no se hace nada: las columnas vendran ya definidas en el
    modelo. Sin esta comprobacion, la app no arrancaba en una base nueva.
    """
    existe = conn.exec_driver_sql(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{tabla}'"
    ).fetchone()
    if not existe:
        return
    existentes = {
        str(f[1]) for f in conn.exec_driver_sql(f"PRAGMA table_info({tabla})").fetchall()
    }
    for nombre, definicion in columnas.items():
        if nombre not in existentes:
            conn.exec_driver_sql(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {definicion}")


def _migrar_sqlite() -> None:
    """Correcciones de esquema aplicables sobre bases ya creadas.

    La versión 1 de `Task.tarea_id` apuntaba a `tasks.id` cuando en realidad
    guarda el id del evento de calendario (bloque de estudio). SQLite no altera
    constraints con ALTER TABLE, así que se reconstruye la tabla.
    """
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        # Preferencias de la persona (v8): tema, ordenes y onboarding.
        _asegurar_columnas(
            conn,
            "app_settings",
            {
                "nombre_usuario": "VARCHAR(60) DEFAULT ''",
                "tema": "VARCHAR(24) DEFAULT 'medianoche'",
                "orden_tareas": "VARCHAR(24) DEFAULT 'fecha'",
                "orden_gastos": "VARCHAR(24) DEFAULT 'fecha'",
                "orden_eventos": "VARCHAR(24) DEFAULT 'hora'",
                "etiquetas": "TEXT DEFAULT ''",
                "onboarding_completo": "BOOLEAN DEFAULT 0",
                "google_client_id": "VARCHAR(200) DEFAULT ''",
            },
        )
        # Multiusuario (v11): cada tabla de datos recibe la columna de dueño.
        for _tabla in (
            "events", "tasks", "log_entries", "maintenance_items", "chat_messages",
            "ai_connections", "audit_log", "approval_requests",
            "app_settings", "policy_settings",
        ):
            _asegurar_columnas(conn, _tabla, {"usuario_id": "INTEGER DEFAULT 1"})
        # Paneles (v19): cada dato pertenece a un panel (NULL = panel personal).
        for _tabla in (
            "events", "tasks", "log_entries", "maintenance_items", "chat_messages",
        ):
            _asegurar_columnas(conn, _tabla, {"panel_id": "INTEGER DEFAULT NULL"})
        # Cuentas (v19): hash de la contrasena para entrar sin codigo.
        _asegurar_columnas(
            conn, "usuarios", {"password_hash": "VARCHAR(200) DEFAULT ''"}
        )

        filas = conn.exec_driver_sql("PRAGMA foreign_key_list(tasks)").fetchall()
        if not filas:
            return
        # (id, seq, table, from, to, on_update, on_delete, match)
        if any(f[2] == "tasks" for f in filas):
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
            conn.exec_driver_sql("ALTER TABLE tasks RENAME TO tasks_old")
            conn.exec_driver_sql(
                """
                CREATE TABLE tasks (
                    id INTEGER NOT NULL,
                    titulo VARCHAR(220) NOT NULL,
                    materia VARCHAR(120),
                    fecha_entrega DATE,
                    estado VARCHAR(24) NOT NULL,
                    prioridad VARCHAR(16) NOT NULL,
                    minutos_estimados INTEGER NOT NULL,
                    resumen TEXT,
                    material TEXT,
                    preguntas TEXT,
                    fuente VARCHAR(32) NOT NULL,
                    tarea_id INTEGER,
                    panel_id INTEGER,
                    usuario_id INTEGER DEFAULT 1,
                    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    PRIMARY KEY (id),
                    FOREIGN KEY(tarea_id) REFERENCES events (id)
                )
                """
            )
            # La lista de columnas se arma con las que REALMENTE tiene la tabla
            # vieja: si le faltan columnas nuevas, no se rompe la copia.
            columnas_nuevas = [
                "id", "titulo", "materia", "fecha_entrega", "estado", "prioridad",
                "minutos_estimados", "resumen", "material", "preguntas",
                "fuente", "tarea_id", "panel_id", "usuario_id", "creado_en",
            ]
            info = conn.exec_driver_sql("PRAGMA table_info(tasks_old)").fetchall()
            existentes = {fila[1] for fila in info}
            columnas = [c for c in columnas_nuevas if c in existentes]
            if not columnas:
                conn.exec_driver_sql("DROP TABLE tasks_old")
                conn.exec_driver_sql("PRAGMA foreign_keys=ON")
                return
            lista = ", ".join(columnas)
            conn.exec_driver_sql(
                f"INSERT INTO tasks ({lista}) SELECT {lista} FROM tasks_old"
            )
            conn.exec_driver_sql("DROP TABLE tasks_old")
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")


class Base(DeclarativeBase):
    pass


def get_db(request: Request) -> Generator[Session, None, None]:
    """Sesión por request.

    IMPORTANTE: los routers la usan con `Depends(get_db, scope="function")`.
    Con el scope por defecto ("request") FastAPI cierra la dependencia DESPUES
    de enviar la respuesta, así que el `commit` ocurre tarde y un GET
    inmediato posterior todavia no ve los datos. Con scope="function" el
    commit se confirma antes de responder y la lectura siguiente es consistente.
    """
    db = SessionLocal()
    try:
        # Persona de la peticion (v11): sin token, se usa el usuario local.
        from .cuentas import fijar_usuario_de_peticion

        fijar_usuario_de_peticion(db, request.headers.get("authorization", ""))
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
