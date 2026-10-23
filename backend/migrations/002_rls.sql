-- =============================================================================
-- LifeAgente AI v2.1.0 - Row Level Security (RLS) Policies
-- Ejecutar en Supabase SQL Editor (Bloque 2 de 4)
-- DESPUÉS de ejecutar 001_schema.sql
-- =============================================================================

-- =============================================================================
-- FUNCIÓN HELPER PARA RLS
-- =============================================================================
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION current_user_id() TO authenticated;

-- =============================================================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- =============================================================================
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE paneles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos_panel ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE conexiones_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE descargas_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_responsable ENABLE ROW LEVEL SECURITY;
ALTER TABLE cumplimiento_controles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- POLÍTICAS: usuarios (solo su propia fila)
-- =============================================================================
CREATE POLICY usuarios_own ON usuarios
FOR ALL TO authenticated
USING (id = current_user_id())
WITH CHECK (id = current_user_id());

-- =============================================================================
-- POLÍTICAS: eventos
-- =============================================================================
CREATE POLICY eventos_usuario ON eventos
FOR ALL TO authenticated
USING (usuario_id = current_user_id())
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: tareas
-- =============================================================================
CREATE POLICY tareas_usuario ON tareas
FOR ALL TO authenticated
USING (usuario_id = current_user_id())
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: paneles (owner + shared + public)
-- =============================================================================
CREATE POLICY paneles_access ON paneles
FOR ALL TO authenticated
USING (
    usuario_id = current_user_id()
    OR es_publico = true
    OR id IN (SELECT panel_id FROM permisos_panel WHERE usuario_id = current_user_id())
)
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: permisos_panel
-- =============================================================================
CREATE POLICY permisos_panel_access ON permisos_panel
FOR ALL TO authenticated
USING (
    usuario_id = current_user_id()
    OR panel_id IN (SELECT id FROM paneles WHERE usuario_id = current_user_id())
)
WITH CHECK (
    panel_id IN (SELECT id FROM paneles WHERE usuario_id = current_user_id())
);

-- =============================================================================
-- POLÍTICAS: backups
-- =============================================================================
CREATE POLICY backups_usuario ON backups
FOR ALL TO authenticated
USING (usuario_id = current_user_id())
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: chats
-- =============================================================================
CREATE POLICY chats_usuario ON chats
FOR ALL TO authenticated
USING (usuario_id = current_user_id())
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: mensajes_chat
-- =============================================================================
CREATE POLICY mensajes_chat_usuario ON mensajes_chat
FOR ALL TO authenticated
USING (usuario_id = current_user_id())
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: alarmas
-- =============================================================================
CREATE POLICY alarmas_usuario ON alarmas
FOR ALL TO authenticated
USING (usuario_id = current_user_id())
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: conexiones_ia
-- =============================================================================
CREATE POLICY conexiones_ia_usuario ON conexiones_ia
FOR ALL TO authenticated
USING (usuario_id = current_user_id())
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: descargas_modelos
-- =============================================================================
CREATE POLICY descargas_modelos_usuario ON descargas_modelos
FOR ALL TO authenticated
USING (usuario_id = current_user_id())
WITH CHECK (usuario_id = current_user_id());

-- =============================================================================
-- POLÍTICAS: auditoria_responsable (solo lectura para usuario, admin escribe)
-- =============================================================================
CREATE POLICY auditoria_usuario_read ON auditoria_responsable
FOR SELECT TO authenticated
USING (usuario_id = current_user_id());

-- Admin policy (service role bypassa RLS automáticamente)

-- =============================================================================
-- POLÍTICAS: cumplimiento_controles (lectura pública para usuarios autenticados)
-- =============================================================================
CREATE POLICY cumplimiento_read ON cumplimiento_controles
FOR SELECT TO authenticated
USING (true);

-- =============================================================================
-- GRANTS PARA FUNCIÓN HELPER
-- =============================================================================
GRANT EXECUTE ON FUNCTION current_user_id() TO authenticated;

-- =============================================================================
-- VERIFICAR POLÍTICAS CREADAS
-- =============================================================================
-- Ejecuta esto para verificar:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;