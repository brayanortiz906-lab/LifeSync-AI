-- =============================================================================
-- LifeAgente AI v2.1.0 - Storage Bucket + Políticas
-- Ejecutar en Supabase SQL Editor (Bloque 3 de 4)
-- DESPUÉS de ejecutar 001_schema.sql y 002_rls.sql
-- =============================================================================

-- =============================================================================
-- CREAR BUCKET "backups" (EJECUTAR EN DASHBOARD PRIMERO)
-- =============================================================================
-- Ve a: Storage → New bucket
-- Name: backups
-- Public bucket: NO (Private)
-- File size limit: 50MB
-- Allowed MIME types: application/json, application/gzip, application/octet-stream

-- DESPUÉS de crear el bucket en Dashboard, ejecuta estas políticas:

-- =============================================================================
-- POLÍTICAS STORAGE PARA BUCKET "backups"
-- =============================================================================

-- Ver backups propios
CREATE POLICY "Users can view own backups" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'backups'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Subir backups propios
CREATE POLICY "Users can upload own backups" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'backups'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Actualizar backups propios
CREATE POLICY "Users can update own backups" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'backups'
    AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
    bucket_id = 'backups'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Eliminar backups propios
CREATE POLICY "Users can delete own backups" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'backups'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- =============================================================================
-- VERIFICAR BUCKET Y POLÍTICAS
-- =============================================================================
-- Ejecuta para verificar:
-- SELECT * FROM storage.buckets WHERE id = 'backups';
-- SELECT * FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';