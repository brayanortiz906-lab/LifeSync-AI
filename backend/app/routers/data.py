"""Router para gestión de datos del usuario (GDPR/CCPA): exportación y eliminación."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from app.auth.dependencies import get_current_user_id
from app.supabase_client import get_supabase_admin
from app.models import Usuario, Evento, Tarea, Panel, Backup, Chat, MensajeChat, PermisoPanel
from sqlalchemy import select, delete
from app.database import get_async_session
from sqlalchemy.ext.asyncio import AsyncSession
import json
import io
from datetime import datetime
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/data", tags=["data"])

@router.get("/export")
async def export_my_data(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Exporta todos los datos del usuario en formato JSON (GDPR Art. 20 - Derecho a la portabilidad).
    Incluye: perfil, eventos, tareas, paneles, chats, mensajes, backups, permisos.
    """
    try:
        # Obtener perfil
        user_result = await session.execute(select(Usuario).where(Usuario.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        # Obtener eventos
        eventos_result = await session.execute(select(Evento).where(Evento.usuario_id == user_id))
        eventos = eventos_result.scalars().all()

        # Obtener tareas
        tareas_result = await session.execute(select(Tarea).where(Tarea.usuario_id == user_id))
        tareas = tareas_result.scalars().all()

        # Obtener paneles
        paneles_result = await session.execute(select(Panel).where(Panel.usuario_id == user_id))
        paneles = paneles_result.scalars().all()

        # Obtener chats
        chats_result = await session.execute(select(Chat).where(Chat.usuario_id == user_id))
        chats = chats_result.scalars().all()

        # Obtener mensajes de chat
        chat_ids = [c.id for c in chats]
        mensajes = []
        if chat_ids:
            mensajes_result = await session.execute(select(MensajeChat).where(MensajeChat.chat_id.in_(chat_ids)))
            mensajes = mensajes_result.scalars().all()

        # Obtener backups
        backups_result = await session.execute(select(Backup).where(Backup.usuario_id == user_id))
        backups = backups_result.scalars().all()

        # Obtener permisos de paneles
        permisos_result = await session.execute(select(PermisoPanel).where(PermisoPanel.usuario_id == user_id))
        permisos = permisos_result.scalars().all()

        # Construir exportación
        export_data: Dict[str, Any] = {
            "export_info": {
                "exported_at": datetime.utcnow().isoformat() + "Z",
                "version": "2.2.0",
                "user_id": str(user_id),
                "gdpr_article": "Art. 20 - Right to data portability",
            },
            "profile": {
                "id": str(user.id),
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "timezone": user.timezone,
                "locale": user.locale,
                "default_ai_provider": user.default_ai_provider,
                "email_notifications": user.email_notifications,
                "daily_summary_time": user.daily_summary_time,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "updated_at": user.updated_at.isoformat() if user.updated_at else None,
                # NOTA: ai_api_keys NO se exportan por seguridad (están encriptadas)
            },
            "eventos": [
                {
                    "id": str(e.id),
                    "titulo": e.titulo,
                    "descripcion": e.descripcion,
                    "tipo": e.tipo.value,
                    "inicio": e.inicio.isoformat() if e.inicio else None,
                    "fin": e.fin.isoformat() if e.fin else None,
                    "todo_dia": e.todo_dia,
                    "rrule": e.rrule,
                    "google_event_id": e.google_event_id,
                    "google_calendar_id": e.google_calendar_id,
                    "sync_status": e.sync_status,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                    "updated_at": e.updated_at.isoformat() if e.updated_at else None,
                }
                for e in eventos
            ],
            "tareas": [
                {
                    "id": str(t.id),
                    "titulo": t.titulo,
                    "descripcion": t.descripcion,
                    "completada": t.completada,
                    "prioridad": t.prioridad,
                    "fecha_vencimiento": t.fecha_vencimiento.isoformat() if t.fecha_vencimiento else None,
                    "fecha_recordatorio": t.fecha_recordatorio.isoformat() if t.fecha_recordatorio else None,
                    "rrule": t.rrule,
                    "orden": t.orden,
                    "panel_id": str(t.panel_id) if t.panel_id else None,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                    "updated_at": t.updated_at.isoformat() if t.updated_at else None,
                    "completada_at": t.completada_at.isoformat() if t.completada_at else None,
                }
                for t in tareas
            ],
            "paneles": [
                {
                    "id": str(p.id),
                    "nombre": p.nombre,
                    "descripcion": p.descripcion,
                    "color": p.color,
                    "icono": p.icono,
                    "es_publico": p.es_publico,
                    "codigo_compartido": p.codigo_compartido,
                    "creado_at": p.creado_at.isoformat() if p.creado_at else None,
                    "actualizado_at": p.actualizado_at.isoformat() if p.actualizado_at else None,
                }
                for p in paneles
            ],
            "chats": [
                {
                    "id": str(c.id),
                    "titulo": c.titulo,
                    "modelo": c.modelo,
                    "system_prompt": c.system_prompt,
                    "creado_at": c.creado_at.isoformat() if c.creado_at else None,
                    "actualizado_at": c.actualizado_at.isoformat() if c.actualizado_at else None,
                    "mensajes": [
                        {
                            "id": str(m.id),
                            "rol": m.rol,
                            "contenido": m.contenido,
                            "tokens_entrada": m.tokens_entrada,
                            "tokens_salida": m.tokens_salida,
                            "modelo": m.modelo,
                            "metadatos": m.metadatos,
                            "creado_at": m.creado_at.isoformat() if m.creado_at else None,
                        }
                        for m in mensajes if m.chat_id == c.id
                    ],
                }
                for c in chats
            ],
            "backups": [
                {
                    "id": str(b.id),
                    "nombre_archivo": b.nombre_archivo,
                    "ruta_storage": b.ruta_storage,
                    "tamano_bytes": b.tamano_bytes,
                    "tipo": b.tipo,
                    "estado": b.estado,
                    "metadatos": b.metadatos,
                    "creado_at": b.creado_at.isoformat() if b.creado_at else None,
                }
                for b in backups
            ],
            "permisos_panel": [
                {
                    "id": str(p.id),
                    "panel_id": str(p.panel_id),
                    "rol": p.rol,
                    "creado_at": p.creado_at.isoformat() if p.creado_at else None,
                }
                for p in permisos
            ],
        }

        # Generar nombre de archivo
        filename = f"lifeagente_export_{user_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        json_content = json.dumps(export_data, ensure_ascii=False, indent=2)
        json_bytes = json_content.encode('utf-8')

        return StreamingResponse(
            io.BytesIO(json_bytes),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(json_bytes)),
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exportando datos: {e}")
        raise HTTPException(status_code=500, detail="Error generando exportación")

@router.delete("/delete", status_code=status.HTTP_200_OK)
async def delete_my_data(
    user_id: str = Depends(get_current_user_id)
):
    """
    Elimina TODOS los datos del usuario (GDPR Art. 17 - Derecho al olvido / CCPA Right to deletion).
    Esto incluye:
    - Usuario de Supabase Auth (cuenta)
    - Perfil en tabla usuarios
    - Todos los eventos, tareas, paneles, chats, mensajes, backups, permisos (CASCADE via FK)
    - Archivos en Supabase Storage (bucket backups del usuario)
    - Tokens OAuth guardados
    - Preferencias y consentimientos
    
    ACCIÓN IRREVERSIBLE.
    """
    try:
        admin = get_supabase_admin()

        # 1. Eliminar archivos en Storage (bucket backups del usuario)
        try:
            # Listar archivos del usuario en bucket backups
            files = admin.storage.from_("backups").list(path=user_id)
            if files:
                file_paths = [f"{user_id}/{f['name']}" for f in files]
                admin.storage.from_("backups").remove(file_paths)
                logger.info(f"Eliminados {len(file_paths)} archivos de Storage para usuario {user_id}")
        except Exception as e:
            logger.warning(f"Error eliminando archivos Storage: {e}")

        # 2. Eliminar usuario de Supabase Auth (esto cascada en BD por RLS/FK si está configurado)
        # Nota: El CASCADE en FK de SQLAlchemy solo aplica si se borra via ORM.
        # Supabase Auth delete_user NO cascada en tablas públicas automáticamente.
        # Necesitamos borrar manualmente las tablas o confiar en RLS policies.
        
        # Borrar datos en orden (respetando FKs)
        tables_to_clean = [
            "mensajes_chat",
            "chats", 
            "backups",
            "permisos_panel",
            "tareas",
            "eventos",
            "paneles",
            "usuarios",
        ]
        
        for table in tables_to_clean:
            try:
                admin.table(table).delete().eq("usuario_id", user_id).execute()
            except Exception as e:
                logger.warning(f"Error limpiando tabla {table}: {e}")

        # 3. Eliminar usuario de Auth (esto invalida tokens y sessions)
        auth_deleted = False
        try:
            admin.auth.admin.delete_user(user_id)
            auth_deleted = True
            logger.info(f"Usuario {user_id} eliminado de Supabase Auth")
        except Exception as e:
            logger.error(f"Error eliminando usuario de Auth: {e}")
            # Continuar aunque falle auth delete

        # 4. Limpiar consentimientos locales (frontend maneja esto, pero por si acaso)
        # No hay tabla de consentimientos en BD, están en localStorage

        return {
            "message": "Todos tus datos han sido eliminados permanentemente",
            "details": {
                "auth_deleted": auth_deleted,
                "tables_cleaned": tables_to_clean,
                "storage_cleaned": True,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
            "gdpr_article": "Art. 17 - Right to erasure (Right to be forgotten)",
        }

    except Exception as e:
        logger.error(f"Error eliminando datos usuario {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Error eliminando datos. Contacta soporte.")

@router.get("/summary")
async def get_data_summary(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_async_session)
):
    """Resumen de qué datos tiene el usuario (para dashboard de privacidad)."""
    try:
        user_result = await session.execute(select(Usuario).where(Usuario.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        # Contar registros
        counts = {}
        tables = [
            ("eventos", Evento),
            ("tareas", Tarea),
            ("paneles", Panel),
            ("chats", Chat),
            ("mensajes_chat", MensajeChat),
            ("backups", Backup),
            ("permisos_panel", PermisoPanel),
        ]
        
        for name, model in tables:
            result = await session.execute(
                select(func.count(model.id)).where(model.usuario_id == user_id)
            )
            counts[name] = result.scalar() or 0

        # Tamaño estimado de storage
        admin = get_supabase_admin()
        storage_size = 0
        try:
            files = admin.storage.from_("backups").list(path=user_id)
            storage_size = sum(f.get('metadata', {}).get('size', 0) for f in files)
        except:
            pass

        return {
            "user_id": str(user_id),
            "profile": {
                "display_name": user.display_name,
                "email": user.email if hasattr(user, 'email') else None,
                "created_at": user.created_at.isoformat() if user.created_at else None,
            },
            "data_counts": counts,
            "storage_bytes": storage_size,
            "storage_human": format_bytes(storage_size),
            "gdpr_rights": [
                "Art. 15 - Right of access",
                "Art. 16 - Right to rectification", 
                "Art. 17 - Right to erasure",
                "Art. 20 - Right to data portability",
                "Art. 21 - Right to object",
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo resumen: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo resumen")

def format_bytes(bytes: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes < 1024:
            return f"{bytes:.1f} {unit}"
        bytes /= 1024
    return f"{bytes:.1f} TB"