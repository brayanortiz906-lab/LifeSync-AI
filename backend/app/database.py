"""Database: asyncpg + SQLAlchemy 2.0 + RLS context."""
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine
from sqlalchemy.pool import NullPool
from sqlalchemy import event, text
from app.config import settings
from app.models import Base
import logging

logger = logging.getLogger(__name__)

engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    poolclass=NullPool,
    connect_args={"server_settings": {"application_name": "lifeagente-api", "timezone": "UTC"}}
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)

from contextvars import ContextVar
current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)

@event.listens_for(AsyncSessionLocal.sync_session_class, "before_flush")
def _set_rls_context(session, flush_context, instances):
    user_id = current_user_id.get()
    if user_id and session.bind:
        sync_conn = session.bind.sync_engine.connect()
        try: sync_conn.execute(text(f"SET LOCAL app.current_user_id = '{user_id}'"))
        finally: sync_conn.close()

async def init_db() -> None:
    if settings.ENVIRONMENT == "local":
        async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
        logger.info("DB inicializada")

async def close_db() -> None: await engine.dispose()

@asynccontextmanager
async def get_db_session(user_id: str | None = None):
    token = None
    if user_id: token = current_user_id.set(user_id)
    async with AsyncSessionLocal() as session:
        try:
            yield session; await session.commit()
        except Exception: await session.rollback(); raise
        finally:
            if token: current_user_id.reset(token)

from fastapi import Depends
from app.auth.dependencies import get_current_user_id

async def get_db(user_id: str = Depends(get_current_user_id)) -> AsyncSession:
    async with get_db_session(user_id) as session: yield session