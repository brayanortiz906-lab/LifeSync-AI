-- =============================================================================
-- LifeAgente AI v2.1.0 - Esquema Base de Datos Supabase
-- Ejecutar en Supabase SQL Editor (Bloque 1 de 4)
-- =============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TABLAS PRINCIPALES
-- =============================================================================

-- Tipos enum
CREATE TYPE event_type AS ENUM ('task', 'event', 'note', 'reminder');

-- -----------------------------------------------------------------------------
-- usuarios (perfil extendido - auth.users maneja auth)
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name varchar(100),
    avatar_url text,
    timezone varchar(50) DEFAULT 'UTC',
    locale varchar(10) DEFAULT 'es',
    default_ai_provider varchar(50),
    ai_api_keys jsonb DEFAULT '{}',
    email_notifications boolean DEFAULT true,
    daily_summary_time varchar(5),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- eventos (calendario)
-- -----------------------------------------------------------------------------
CREATE TABLE eventos (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo varchar(200) NOT NULL,
    descripcion text,
    tipo event_type DEFAULT 'event',
    inicio timestamptz NOT NULL,
    fin timestamptz,
    todo_dia boolean DEFAULT false,
    rrule text,
    google_event_id varchar(100),
    google_calendar_id varchar(100),
    sync_status varchar(20) DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX ix_eventos_usuario_inicio ON eventos(usuario_id, inicio);
CREATE INDEX ix_eventos_google_sync ON eventos(google_event_id, google_calendar_id);

-- -----------------------------------------------------------------------------
-- tareas
-- -----------------------------------------------------------------------------
CREATE TABLE tareas (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo varchar(200) NOT NULL,
    descripcion text,
    completada boolean DEFAULT false,
    prioridad integer DEFAULT 0,
    fecha_vencimiento timestamptz,
    fecha_recordatorio timestamptz,
    rrule text,
    orden integer DEFAULT 0,
    panel_id uuid REFERENCES paneles(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    completada_at timestamptz
);

CREATE INDEX ix_tareas_usuario_completada ON tareas(usuario_id, completada);
CREATE INDEX ix_tareas_usuario_vencimiento ON tareas(usuario_id, fecha_vencimiento);
CREATE INDEX ix_tareas_panel ON tareas(panel_id);

-- -----------------------------------------------------------------------------
-- paneles (Kanban/tableros)
-- -----------------------------------------------------------------------------
CREATE TABLE paneles (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre varchar(100) NOT NULL,
    descripcion text,
    color varchar(7) DEFAULT '#3B82F6',
    icono varchar(50),
    es_publico boolean DEFAULT false,
    codigo_compartido varchar(20) UNIQUE,
    creado_at timestamptz DEFAULT now(),
    actualizado_at timestamptz DEFAULT now()
);

CREATE INDEX ix_paneles_usuario ON paneles(usuario_id);
CREATE INDEX ix_paneles_codigo ON paneles(codigo_compartido);

-- -----------------------------------------------------------------------------
-- permisos_panel (compartir paneles)
-- -----------------------------------------------------------------------------
CREATE TABLE permisos_panel (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    panel_id uuid NOT NULL REFERENCES paneles(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    rol varchar(20) DEFAULT 'viewer',
    creado_at timestamptz DEFAULT now(),
    UNIQUE(panel_id, usuario_id)
);

-- -----------------------------------------------------------------------------
-- backups (registro de respaldos en Supabase Storage)
-- -----------------------------------------------------------------------------
CREATE TABLE backups (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre_archivo varchar(255) NOT NULL,
    ruta_storage varchar(500) NOT NULL,
    tamano_bytes integer NOT NULL,
    tipo varchar(20) NOT NULL,
    estado varchar(20) DEFAULT 'completed',
    metadatos jsonb DEFAULT '{}',
    creado_at timestamptz DEFAULT now()
);

CREATE INDEX ix_backups_usuario_creado ON backups(usuario_id, creado_at);

-- -----------------------------------------------------------------------------
-- chats (Gemini BYOK)
-- -----------------------------------------------------------------------------
CREATE TABLE chats (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo varchar(200),
    modelo varchar(50) DEFAULT 'gemini-1.5-flash',
    system_prompt text,
    creado_at timestamptz DEFAULT now(),
    actualizado_at timestamptz DEFAULT now()
);

CREATE INDEX ix_chats_usuario ON chats(usuario_id);

-- -----------------------------------------------------------------------------
-- mensajes_chat
-- -----------------------------------------------------------------------------
CREATE TABLE mensajes_chat (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    rol varchar(20) NOT NULL,
    contenido text NOT NULL,
    tokens_entrada integer,
    tokens_salida integer,
    modelo varchar(50),
    metadatos jsonb DEFAULT '{}',
    creado_at timestamptz DEFAULT now()
);

CREATE INDEX ix_mensajes_chat_creado ON mensajes_chat(chat_id, creado_at);

-- -----------------------------------------------------------------------------
-- alarmas (notificaciones nativas)
-- -----------------------------------------------------------------------------
CREATE TABLE alarmas (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo varchar(200) NOT NULL,
    fecha date NOT NULL,
    hora time NOT NULL,
    repetir varchar(20) DEFAULT 'ninguna',
    sonido varchar(50) DEFAULT 'default',
    activa boolean DEFAULT true,
    creada_en timestamptz DEFAULT now()
);

CREATE INDEX ix_alarmas_usuario_fecha ON alarmas(usuario_id, fecha, hora);

-- -----------------------------------------------------------------------------
-- conexiones_ia (proveedores BYOK guardados)
-- -----------------------------------------------------------------------------
CREATE TABLE conexiones_ia (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    proveedor varchar(50) NOT NULL,
    nombre varchar(100),
    modelo varchar(50),
    api_key_cifrada text,
    activa boolean DEFAULT false,
    creada_en timestamptz DEFAULT now(),
    actualizada_en timestamptz DEFAULT now(),
    UNIQUE(usuario_id, proveedor, nombre)
);

-- -----------------------------------------------------------------------------
-- descargas_modelos (registro de descargas IA local)
-- -----------------------------------------------------------------------------
CREATE TABLE descargas_modelos (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    modelo_id varchar(100) NOT NULL,
    nombre varchar(200),
    motor varchar(50),
    tamano_mb integer,
    estado varchar(20) DEFAULT 'completed',
    progreso jsonb DEFAULT '{}',
    creada_en timestamptz DEFAULT now(),
    completada_en timestamptz
);

CREATE INDEX ix_descargas_usuario ON descargas_modelos(usuario_id);

-- -----------------------------------------------------------------------------
-- auditoria_responsable (IA responsable)
-- -----------------------------------------------------------------------------
CREATE TABLE auditoria_responsable (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo varchar(50) NOT NULL,
    accion varchar(100),
    detalles jsonb DEFAULT '{}',
    ip_address inet,
    user_agent text,
    creada_en timestamptz DEFAULT now()
);

CREATE INDEX ix_auditoria_usuario ON auditoria_responsable(usuario_id, creada_en);

-- -----------------------------------------------------------------------------
-- cumplimiento_controles (IA responsable)
-- -----------------------------------------------------------------------------
CREATE TABLE cumplimiento_controles (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    control_id varchar(50) UNIQUE NOT NULL,
    nombre varchar(200) NOT NULL,
    descripcion text,
    categoria varchar(50),
    implementado boolean DEFAULT false,
    evidencia text,
    verificado_en timestamptz,
    creado_en timestamptz DEFAULT now()
);