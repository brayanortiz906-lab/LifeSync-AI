-- =============================================================================
-- LifeAgente AI v2.1.0 - Triggers, Functions & Helpers
-- Ejecutar en Supabase SQL Editor (Bloque 4 de 4)
-- DESPUÉS de ejecutar 001_schema.sql, 002_rls.sql, 003_storage.sql
-- =============================================================================

-- =============================================================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Aplicar a tablas con updated_at
CREATE TRIGGER update_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_eventos_updated_at
    BEFORE UPDATE ON eventos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tareas_updated_at
    BEFORE UPDATE ON tareas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_paneles_updated_at
    BEFORE UPDATE ON paneles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at
    BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conexiones_ia_updated_at
    BEFORE UPDATE ON conexiones_ia
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- TRIGGER: Crear perfil automáticamente al registrarse (auth.users)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.usuarios (id, display_name, avatar_url)
    VALUES (new.id, new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'avatar_url');
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- FUNCIÓN: Limpiar backups antiguos (mantener últimos N por usuario)
-- =============================================================================
CREATE OR REPLACE FUNCTION clean_old_backups(p_keep_count integer DEFAULT 10)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT usuario_id, id
        FROM backups
        WHERE usuario_id IN (SELECT usuario_id FROM backups GROUP BY usuario_id HAVING count(*) > p_keep_count)
        ORDER BY usuario_id, creado_at DESC
    LOOP
        DELETE FROM backups WHERE id = r.id AND usuario_id = r.usuario_id
        AND id NOT IN (
            SELECT id FROM backups
            WHERE usuario_id = r.usuario_id
            ORDER BY creado_at DESC
            LIMIT p_keep_count
        );
    END LOOP;
END;
$$;

-- =============================================================================
-- FUNCIÓN: Estadísticas de usuario para dashboard
-- =============================================================================
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    stats jsonb;
BEGIN
    SELECT jsonb_build_object(
        'eventos', (SELECT count(*) FROM eventos WHERE usuario_id = p_user_id),
        'tareas', (SELECT count(*) FROM tareas WHERE usuario_id = p_user_id),
        'tareas_completadas', (SELECT count(*) FROM tareas WHERE usuario_id = p_user_id AND completada = true),
        'tareas_pendientes', (SELECT count(*) FROM tareas WHERE usuario_id = p_user_id AND completada = false),
        'paneles', (SELECT count(*) FROM paneles WHERE usuario_id = p_user_id),
        'chats', (SELECT count(*) FROM chats WHERE usuario_id = p_user_id),
        'mensajes', (SELECT count(*) FROM mensajes_chat WHERE usuario_id = p_user_id),
        'alarmas_activas', (SELECT count(*) FROM alarmas WHERE usuario_id = p_user_id AND activa = true),
        'backups', (SELECT count(*) FROM backups WHERE usuario_id = p_user_id),
        'conexiones_ia', (SELECT count(*) FROM conexiones_ia WHERE usuario_id = p_user_id AND activa = true)
    ) INTO stats;
    RETURN stats;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_stats(uuid) TO authenticated;

-- =============================================================================
-- FUNCIÓN: Búsqueda full-text simple en eventos/tareas/notas
-- =============================================================================
CREATE OR REPLACE FUNCTION search_user_content(p_user_id uuid, p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE(
    tipo text,
    id uuid,
    titulo text,
    contenido text,
    fecha timestamptz
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 'evento'::text, id, titulo, descripcion, inicio
    FROM eventos
    WHERE usuario_id = p_user_id
    AND (titulo ILIKE '%' || p_query || '%' OR descripcion ILIKE '%' || p_query || '%')
    
    UNION ALL
    
    SELECT 'tarea'::text, id, titulo, descripcion, fecha_vencimiento
    FROM tareas
    WHERE usuario_id = p_user_id
    AND (titulo ILIKE '%' || p_query || '%' OR descripcion ILIKE '%' || p_query || '%')
    
    UNION ALL
    
    SELECT 'chat'::text, id, titulo, system_prompt, creado_at
    FROM chats
    WHERE usuario_id = p_user_id
    AND (titulo ILIKE '%' || p_query || '%' OR system_prompt ILIKE '%' || p_query || '%')
    
    ORDER BY fecha DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_user_content(uuid, text, integer) TO authenticated;

-- =============================================================================
-- ÍNDICES ADICIONALES PARA RENDIMIENTO
-- =============================================================================
-- Índices compuestos para queries comunes
CREATE INDEX IF NOT EXISTS ix_eventos_usuario_tipo_inicio ON eventos(usuario_id, tipo, inicio);
CREATE INDEX IF NOT EXISTS ix_tareas_usuario_panel_completada ON tareas(usuario_id, panel_id, completada);
CREATE INDEX IF NOT EXISTS ix_chats_usuario_actualizado ON chats(usuario_id, actualizado_at DESC);
CREATE INDEX IF NOT EXISTS ix_mensajes_chat_chat_rol ON mensajes_chat(chat_id, rol);
CREATE INDEX IF NOT EXISTS ix_alarmas_usuario_activa_fecha ON alarmas(usuario_id, activa, fecha, hora);
CREATE INDEX IF NOT EXISTS ix_conexiones_usuario_activa ON conexiones_ia(usuario_id, activa);
CREATE INDEX IF NOT EXISTS ix_auditoria_tipo_fecha ON auditoria_responsable(tipo, creada_en DESC);

-- =============================================================================
-- COMENTARIOS EN TABLAS (para documentación)
-- =============================================================================
COMMENT ON TABLE usuarios IS 'Perfil extendido del usuario (auth.users maneja autenticación)';
COMMENT ON TABLE eventos IS 'Eventos de calendario con soporte RRULE y Google Calendar sync';
COMMENT ON TABLE tareas IS 'Tareas con prioridad, vencimiento, recordatorios y paneles Kanban';
COMMENT ON TABLE paneles IS 'Tableros Kanban/agrupación con permisos de compartir';
COMMENT ON TABLE permisos_panel IS 'Permisos por panel: viewer/editor/admin';
COMMENT ON TABLE backups IS 'Registro de backups en Supabase Storage (gzip + JSON)';
COMMENT ON TABLE chats IS 'Conversaciones con Gemini BYOK';
COMMENT ON TABLE mensajes_chat IS 'Mensajes de chat con tokens y metadatos';
COMMENT ON TABLE alarmas IS 'Alarmas nativas con repetición y sonidos';
COMMENT ON TABLE conexiones_ia IS 'Proveedores IA BYOK guardados (clave cifrada Fernet)';
COMMENT ON TABLE descargas_modelos IS 'Registro de descargas de modelos IA local';
COMMENT ON TABLE auditoria_responsable IS 'Log de auditoría para IA responsable';
COMMENT ON TABLE cumplimiento_controles IS 'Controles de cumplimiento (GDPR, etc.)';

-- =============================================================================
-- DATOS INICIALES: Controles de cumplimiento básicos
-- =============================================================================
INSERT INTO cumplimiento_controles (control_id, nombre, descripcion, categoria) VALUES
('CTRL-001', 'Cifrado en tránsito', 'Todas las comunicaciones usan TLS 1.2+', 'Seguridad'),
('CTRL-002', 'Cifrado en reposo', 'Datos sensibles cifrados con AES-256 (Fernet)', 'Seguridad'),
('CTRL-003', 'Control de acceso', 'RLS en todas las tablas + JWT Supabase', 'Seguridad'),
('CTRL-004', 'Auditoría', 'Log de todas las acciones sensibles', 'Seguridad'),
('CTRL-005', 'Minimización de datos', 'Solo se recopilan datos necesarios', 'Privacidad'),
('CTRL-006', 'Derecho al olvido', 'Endpoint DELETE /accounts/me elimina todo', 'Privacidad'),
('CTRL-007', 'Portabilidad', 'Exportación completa JSON (endpoint /backups/export)', 'Privacidad'),
('CTRL-008', 'BYOK (Bring Your Own Key)', 'Usuario trae su propia API key, cifrada en servidor', 'IA Responsable'),
('CTRL-009', 'Redacción PII', 'Detección y enmascaramiento automático de datos personales', 'IA Responsable'),
('CTRL-010', 'Umbrales de aprobación', 'Gastos altos requieren confirmación explícita', 'IA Responsable')
ON CONFLICT (control_id) DO NOTHING;

-- =============================================================================
-- VERIFICACIÓN FINAL
-- =============================================================================
-- Ejecuta para verificar todo:
-- \dt public.*
-- \df public.*
-- SELECT * FROM pg_policies WHERE schemaname = 'public';
-- SELECT * FROM information_schema.triggers WHERE trigger_schema = 'public';
-- SELECT * FROM cumplimiento_controles;