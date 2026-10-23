"""Backup service using Supabase Storage."""
from app.services.storage import get_storage
from app.database import get_db_session
from app.models import Usuario, Evento, Tarea, Panel, PermisoPanel, Backup, Chat, MensajeChat
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from typing import Optional
import logging
import uuid

logger = logging.getLogger(__name__)

class BackupService:
    def __init__(self):
        self.storage = get_storage()
    
    async def create_full_backup(self, user_id: str, include_chats: bool = True) -> dict:
        """Crea backup completo del usuario."""
        async with get_db_session(user_id) as session:
            user = await session.get(Usuario, uuid.UUID(user_id), options=[
                selectinload(Usuario.eventos),
                selectinload(Usuario.tareas),
                selectinload(Usuario.paneles).selectinload(Panel.tareas),
                selectinload(Usuario.paneles).selectinload(Panel.permisos),
                selectinload(Usuario.backups),
            ])
            if include_chats:
                await session.refresh(user, ["chats"])
                for chat in user.chats:
                    await session.refresh(chat, ["mensajes"])
            
            if not user:
                raise ValueError("Usuario no encontrado")
            
            data = {
                "version": "2.0",
                "exported_at": datetime.utcnow().isoformat(),
                "user_id": str(user.id),
                "profile": {
                    "display_name": user.display_name,
                    "avatar_url": user.avatar_url,
                    "timezone": user.timezone,
                    "locale": user.locale,
                    "default_ai_provider": user.default_ai_provider,
                    "email_notifications": user.email_notifications,
                    "daily_summary_time": user.daily_summary_time,
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
                    for e in user.eventos
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
                    for t in user.tareas
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
                        "tareas": [str(t.id) for t in p.tareas],
                        "permisos": [
                            {
                                "usuario_id": str(perm.usuario_id),
                                "rol": perm.rol
                            }
                            for perm in p.permisos
                        ]
                    }
                    for p in user.paneles
                ],
            }
            
            if include_chats:
                data["chats"] = [
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
                            for m in c.mensajes
                        ]
                    }
                    for c in user.chats
                ]
            
            filename = f"full_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
            upload_result = await self.storage.upload_backup(user_id, data, filename)
            
            backup_record = Backup(
                usuario_id=user.id,
                nombre_archivo=filename,
                ruta_storage=upload_result["path"],
                tamano_bytes=upload_result["size"],
                tipo="full",
                estado="completed",
                metadatos={
                    "eventos_count": len(data["eventos"]),
                    "tareas_count": len(data["tareas"]),
                    "paneles_count": len(data["paneles"]),
                    "chats_count": len(data.get("chats", [])),
                    "compressed": upload_result["compressed"],
                }
            )
            session.add(backup_record)
            await session.commit()
            
            return {
                "backup_id": str(backup_record.id),
                "filename": filename,
                "size": upload_result["size"],
                "download_url": upload_result["signed_url"],
                "stats": backup_record.metadatos
            }
    
    async def restore_backup(self, user_id: str, backup_filename: str, overwrite: bool = False) -> dict:
        """Restaura backup desde Storage."""
        data = await self.storage.download_backup(user_id, backup_filename)
        
        async with get_db_session(user_id) as session:
            user = await session.get(Usuario, uuid.UUID(user_id))
            if not user:
                raise ValueError("Usuario no encontrado")
            
            if overwrite:
                await session.execute(
                    Evento.__table__.delete().where(Evento.usuario_id == user.id)
                )
                await session.execute(
                    Tarea.__table__.delete().where(Tarea.usuario_id == user.id)
                )
                await session.execute(
                    Panel.__table__.delete().where(Panel.usuario_id == user.id)
                )
                await session.execute(
                    Chat.__table__.delete().where(Chat.usuario_id == user.id)
                )
                await session.flush()
            
            # Restaurar eventos
            for e_data in data.get("eventos", []):
                evento = Evento(
                    id=uuid.UUID(e_data["id"]),
                    usuario_id=user.id,
                    titulo=e_data["titulo"],
                    descripcion=e_data.get("descripcion"),
                    tipo=e_data["tipo"],
                    inicio=datetime.fromisoformat(e_data["inicio"]) if e_data.get("inicio") else None,
                    fin=datetime.fromisoformat(e_data["fin"]) if e_data.get("fin") else None,
                    todo_dia=e_data.get("todo_dia", False),
                    rrule=e_data.get("rrule"),
                    google_event_id=e_data.get("google_event_id"),
                    google_calendar_id=e_data.get("google_calendar_id"),
                    sync_status=e_data.get("sync_status", "pending"),
                )
                session.add(evento)
            
            # Restaurar paneles primero (FK en tareas)
            panel_map = {}
            for p_data in data.get("paneles", []):
                panel = Panel(
                    id=uuid.UUID(p_data["id"]),
                    usuario_id=user.id,
                    nombre=p_data["nombre"],
                    descripcion=p_data.get("descripcion"),
                    color=p_data.get("color", "#3B82F6"),
                    icono=p_data.get("icono"),
                    es_publico=p_data.get("es_publico", False),
                    codigo_compartido=p_data.get("codigo_compartido"),
                )
                session.add(panel)
                panel_map[p_data["id"]] = panel
            
            await session.flush()
            
            # Restaurar tareas
            for t_data in data.get("tareas", []):
                tarea = Tarea(
                    id=uuid.UUID(t_data["id"]),
                    usuario_id=user.id,
                    titulo=t_data["titulo"],
                    descripcion=t_data.get("descripcion"),
                    completada=t_data.get("completada", False),
                    prioridad=t_data.get("prioridad", 0),
                    fecha_vencimiento=datetime.fromisoformat(t_data["fecha_vencimiento"]) if t_data.get("fecha_vencimiento") else None,
                    fecha_recordatorio=datetime.fromisoformat(t_data["fecha_recordatorio"]) if t_data.get("fecha_recordatorio") else None,
                    rrule=t_data.get("rrule"),
                    orden=t_data.get("orden", 0),
                    panel_id=uuid.UUID(t_data["panel_id"]) if t_data.get("panel_id") else None,
                )
                session.add(tarea)
            
            # Restaurar permisos de panel
            for p_data in data.get("paneles", []):
                panel = panel_map.get(p_data["id"])
                if panel:
                    for perm_data in p_data.get("permisos", []):
                        permiso = PermisoPanel(
                            panel_id=panel.id,
                            usuario_id=uuid.UUID(perm_data["usuario_id"]),
                            rol=perm_data["rol"]
                        )
                        session.add(permiso)
            
            # Restaurar chats
            if "chats" in data:
                for c_data in data["chats"]:
                    chat = Chat(
                        id=uuid.UUID(c_data["id"]),
                        usuario_id=user.id,
                        titulo=c_data.get("titulo"),
                        modelo=c_data.get("modelo", "gemini-1.5-flash"),
                        system_prompt=c_data.get("system_prompt"),
                    )
                    session.add(chat)
                    await session.flush()
                    
                    for m_data in c_data.get("mensajes", []):
                        mensaje = MensajeChat(
                            id=uuid.UUID(m_data["id"]),
                            chat_id=chat.id,
                            usuario_id=user.id,
                            rol=m_data["rol"],
                            contenido=m_data["contenido"],
                            tokens_entrada=m_data.get("tokens_entrada"),
                            tokens_salida=m_data.get("tokens_salida"),
                            modelo=m_data.get("modelo"),
                            metadatos=m_data.get("metadatos", {}),
                        )
                        session.add(mensaje)
            
            await session.commit()
            
            return {
                "restored": True,
                "stats": {
                    "eventos": len(data.get("eventos", [])),
                    "tareas": len(data.get("tareas", [])),
                    "paneles": len(data.get("paneles", [])),
                    "chats": len(data.get("chats", [])),
                }
            }

backup_service = BackupService()