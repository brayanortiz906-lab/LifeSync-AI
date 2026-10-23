"""Supabase Storage service for backups."""
from supabase import create_client, Client
from app.config import settings
from datetime import datetime
from typing import BinaryIO, Optional, List, Dict, Any
import io
import json
import gzip
import logging

logger = logging.getLogger(__name__)

class SupabaseStorage:
    def __init__(self):
        self.client: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
        self.bucket = "backups"
    
    async def upload_backup(
        self,
        user_id: str,
        data: dict,
        filename: str = None,
        compress: bool = True
    ) -> dict:
        """Sube backup a Supabase Storage."""
        if filename is None:
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = f"backup_{timestamp}.json"
        
        storage_path = f"{user_id}/{filename}"
        
        json_data = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
        if compress:
            content = gzip.compress(json_data)
            storage_path += ".gz"
        else:
            content = json_data
        
        try:
            resp = self.client.storage.from_(self.bucket).upload(
                path=storage_path,
                file=content,
                file_options={
                    "content-type": "application/gzip" if compress else "application/json",
                    "upsert": "true"
                }
            )
            
            if hasattr(resp, 'error') and resp.error:
                raise Exception(resp.error.message)
            
            signed_url = self.client.storage.from_(self.bucket).create_signed_url(
                storage_path, 3600
            )
            
            return {
                "path": storage_path,
                "size": len(content),
                "compressed": compress,
                "signed_url": signed_url.get("signedURL") if signed_url.get("signedURL") else None,
                "created_at": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Error subiendo backup: {e}")
            raise

    async def download_backup(self, user_id: str, filename: str) -> dict:
        """Descarga y descomprime backup."""
        storage_path = f"{user_id}/{filename}"
        if not storage_path.endswith(".gz"):
            storage_path += ".gz"
        
        try:
            content = self.client.storage.from_(self.bucket).download(storage_path)
            if not content:
                raise FileNotFoundError("Backup no encontrado")
            
            decompressed = gzip.decompress(content)
            data = json.loads(decompressed.decode('utf-8'))
            return data
        except Exception as e:
            logger.error(f"Error descargando backup: {e}")
            raise

    async def list_backups(self, user_id: str) -> List[dict]:
        """Lista backups del usuario."""
        try:
            resp = self.client.storage.from_(self.bucket).list(
                path=user_id,
                options={"sortBy": {"column": "name", "order": "desc"}}
            )
            
            backups = []
            for item in resp:
                if item["name"].endswith(".json.gz") or item["name"].endswith(".json"):
                    backups.append({
                        "name": item["name"],
                        "size": item["metadata"].get("size", 0),
                        "created_at": item["created_at"],
                        "updated_at": item["updated_at"],
                    })
            return backups
        except Exception as e:
            logger.error(f"Error listando backups: {e}")
            return []

    async def delete_backup(self, user_id: str, filename: str) -> bool:
        """Elimina backup."""
        storage_path = f"{user_id}/{filename}"
        try:
            self.client.storage.from_(self.bucket).remove([storage_path])
            return True
        except Exception as e:
            logger.error(f"Error eliminando backup: {e}")
            return False

    async def create_signed_download_url(self, user_id: str, filename: str, expires_in: int = 3600) -> str:
        """Crea URL firmada para descarga directa."""
        storage_path = f"{user_id}/{filename}"
        resp = self.client.storage.from_(self.bucket).create_signed_url(storage_path, expires_in)
        return resp.get("signedURL", "")

_storage: SupabaseStorage | None = None

def get_storage() -> SupabaseStorage:
    global _storage
    if _storage is None:
        _storage = SupabaseStorage()
    return _storage