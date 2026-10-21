"""Motor SQLAlchemy 2.0 + SQLite (prototipo) / Postgres (producción)."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
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


def _migrar_sqlite() -> None:
    """Correcciones de esquema aplicables sobre bases ya creadas.

    La version 1 de `Task.tarea_id` apuntaba a `tasks.id` cuando en realidad
    guarda el id del evento de calendario (bloque de estudio). SQLite no altera
    constraints con ALTER TABLE, asi que se reconstruye la tabla.
    """
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
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
                    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    PRIMARY KEY (id),
                    FOREIGN KEY(tarea_id) REFERENCES events (id)
                )
                """
            )
            conn.exec_driver_sql(
                """
                INSERT INTO tasks (id, titulo, materia, fecha_entrega, estado, prioridad,
                                   minutos_estimados, resumen, material, preguntas,
                                   fuente, tarea_id, creado_en)
                SELECT id, titulo, materia, fecha_entrega, estado, prioridad,
                       minutos_estimados, resumen, material, preguntas,
                       fuente, tarea_id, creado_en
                FROM tasks_old
                """
            )
            conn.exec_driver_sql("DROP TABLE tasks_old")
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
