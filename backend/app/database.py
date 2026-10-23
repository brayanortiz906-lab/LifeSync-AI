"""Database: asyncpg + SQLAlchemy 2.0 + RLS context."""
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine
from sqlalchemy.pool import NullPool
from sqlalchemy import event, text
from app.config import settings
from app.models import Base
import logging

logger = logging.getLogger(__name__)

# Database engine - handle both PostgreSQL and SQLite
if settings.DATABASE_URL.startswith("postgresql"):
    engine: AsyncEngine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        poolclass=NullPool,
        connect_args={"server_settings": {"application_name": "lifeagente-api", "timezone": "UTC"}}
    )
else:
    # SQLite (aiosqlite) - no server_settings
    engine: AsyncEngine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        poolclass=NullPool,
    )

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)

from contextvars import ContextVar
current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)

# RLS context via middleware (FastAPI middleware handles this better for async)
# Removed event listener - RLS is set via middleware in main.py

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