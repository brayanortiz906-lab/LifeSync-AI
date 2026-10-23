"""Router de backups (Supabase Storage)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from app.auth.dependencies import get_current_user_id
from app.database import get_db
from app.services.backup import backup_service
from app.models import Backup
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

router = APIRouter(prefix="/backups", tags=["backups"])

class BackupResponse(BaseModel):
    id: str
    nombre_archivo: str
    tamano_bytes: int
    tipo: str
    estado: str
    metadatos: dict
    creado_at: str
    download_url: Optional[str] = None

class BackupCreate(BaseModel):
    include_chats: bool = True

class RestoreRequest(BaseModel):
    backup_filename: str
    overwrite: bool = False

@router.post("", response_model=BackupResponse, status_code=status.HTTP_201_CREATED)
async def create_backup(
    data: BackupCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Crea backup completo y sube a Supabase Storage."""
    try:
        result = await backup_service.create_full_backup(user_id, data.include_chats)
        return BackupResponse(
            id=result["backup_id"],
            nombre_archivo=result["filename"],
            tamano_bytes=result["size"],
            tipo="full",
            estado="completed",
            metadatos=result["stats"],
            creado_at=datetime.utcnow().isoformat(),
            download_url=result.get("download_url")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando backup: {str(e)}")

@router.get("", response_model=List[BackupResponse])
async def list_backups(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0)
):
    """Lista backups del usuario (DB + Storage)."""
    # Obtener de BD
    result = await db.execute(
        select(Backup)
        .where(Backup.usuario_id == UUID(user_id))
        .order_by(Backup.creado_at.desc())
        .limit(limit)
        .offset(offset)
    )
    db_backups = result.scalars().all()
    
    # Obtener de Storage para URLs firmadas
    from app.services.storage import get_storage
    storage = get_storage()
    storage_backups = await storage.list_backups(user_id)
    
    # Combinar
    storage_map = {b["name"]: b for b in storage_backups}
    
    backups = []
    for b in db_backups:
        storage_info = storage_map.get(b.nombre_archivo, {})
        download_url = None
        if storage_info:
            download_url = await storage.create_signed_download_url(user_id, b.nombre_archivo)
        
        backups.append(BackupResponse(
            id=str(b.id),
            nombre_archivo=b.nombre_archivo,
            tamano_bytes=b.tamano_bytes,
            tipo=b.tipo,
            estado=b.estado,
            metadatos=b.metadatos,
            creado_at=b.creado_at.isoformat(),
            download_url=download_url
        ))
    
    # Añadir backups que están en Storage pero no en BD (limpieza manual)
    for name, info in storage_map.items():
        if not any(b.nombre_archivo == name for b in db_backups):
            download_url = await storage.create_signed_download_url(user_id, name)
            backups.append(BackupResponse(
                id=f"storage-{name}",
                nombre_archivo=name,
                tamano_bytes=info["size"],
                tipo="full",
                estado="completed",
                metadatos={},
                creado_at=info["created_at"],
                download_url=download_url
            ))
    
    return backups

@router.post("/restore")
async def restore_backup(
    data: RestoreRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Restaura backup desde Storage."""
    try:
        result = await backup_service.restore_backup(user_id, data.backup_filename, data.overwrite)
        return {"success": True, "stats": result["stats"]}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error restaurando: {str(e)}")

@router.get("/{backup_filename}/download")
async def download_backup(
    backup_filename: str,
    user_id: str = Depends(get_current_user_id)
):
    """Obtiene URL firmada para descargar backup."""
    from app.services.storage import get_storage
    storage = get_storage()
    url = await storage.create_signed_download_url(user_id, backup_filename)
    if not url:
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    return {"download_url": url, "expires_in": 3600}

@router.delete("/{backup_filename}", status_code=status.HTTP_200_OK)
async def delete_backup(
    backup_filename: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Elimina backup de Storage y BD."""
    from app.services.storage import get_storage
    storage = get_storage()
    
    # Eliminar de Storage
    await storage.delete_backup(user_id, backup_filename)
    
    # Eliminar de BD
    await db.execute(
        Backup.__table__.delete().where(
            Backup.usuario_id == UUID(user_id),
            Backup.nombre_archivo == backup_filename
        )
    )
    await db.commit()
    
    return {"deleted": True}

@router.post("/export")
async def export_data(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Exporta todos los datos como JSON (para migración)."""
    from app.services.backup import BackupService
    backup = BackupService()
    result = await backup.create_full_backup(user_id, include_chats=True)
    
    # Retornar JSON directamente en lugar de subir a Storage
    data = await backup.storage.download_backup(user_id, result["filename"])
    return data