
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://siywqiwbbczbiaogbxge.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpeXdxaXdiYmN6Ymlhb2dieGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzU4MDYsImV4cCI6MjA4NDAxMTgwNn0.zBMLAOVK3pZp9VnrxeYtG-txeD4IUHAdG_m2BP5Gue0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * --- EJECUTA ESTO EN EL "SQL EDITOR" DE SUPABASE (Copia y pega todo el bloque) ---
 * 
 * -- 1. Columnas base
 * ALTER TABLE roles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]';
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prompt_machinery BOOLEAN DEFAULT FALSE;
 * ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS sequence INTEGER DEFAULT 0;
 * 
 * -- 2. Restricciones seguras (Solo se crean si no existen)
 * DO $$
 * BEGIN
 *     -- Unicidad del email para poder usarlo como FK
 *     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_unique') THEN
 *         ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
 *     END IF;
 * 
 *     -- Relación de task_logs con profiles
 *     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_logs_operator_email_fkey') THEN
 *         ALTER TABLE task_logs 
 *         ADD CONSTRAINT task_logs_operator_email_fkey 
 *         FOREIGN KEY (operator_email) REFERENCES profiles(email)
 *         ON UPDATE CASCADE;
 *     END IF;
 * END
 * $$;
 * 
 * -- 3. Población inicial de roles
 * INSERT INTO roles (name, permissions) VALUES 
 * ('admin', '["dashboard", "slots", "expedition", "supplies", "admin", "users", "deliveries"]'), 
 * ('operator', '["dashboard", "slots"]'), 
 * ('expedition', '["expedition"]'), 
 * ('viewer', '["slots"]'),
 * ('distribución', '["dashboard", "deliveries"]'),
 * ('carretillero', '["dashboard", "slots"]')
 * ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;
 * 
 * -- 4. Tabla de Mantenimiento de Maquinaria
 * CREATE TABLE IF NOT EXISTS machinery_maintenance (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     machinery_id UUID REFERENCES machinery(id) ON DELETE CASCADE,
 *     type TEXT CHECK (type IN ('averia', 'reparacion', 'revision')),
 *     description TEXT NOT NULL,
 *     cost NUMERIC DEFAULT 0,
 *     status TEXT CHECK (status IN ('pending', 'completed')) DEFAULT 'pending',
 *     reported_by TEXT,
 *     created_at TIMESTAMPTZ DEFAULT now(),
 *     completed_at TIMESTAMPTZ
 * );
 * 
 * -- 5. Tablas para el Mapa Vivo Real
 * CREATE TABLE IF NOT EXISTS warehouse_maps (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     plant TEXT NOT NULL UNIQUE,
 *     image_url TEXT NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT now()
 * );
 * 
 * CREATE TABLE IF NOT EXISTS warehouse_street_coords (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     map_id UUID REFERENCES warehouse_maps(id) ON DELETE CASCADE,
 *     street_id TEXT NOT NULL,
 *     x_percent NUMERIC NOT NULL,
 *     y_percent NUMERIC NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT now(),
 *     UNIQUE(map_id, street_id)
 * );
 * 
 * -- 6. Actualización de Tareas (Nuevos campos)
 * ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
 * ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT CHECK (task_type IN ('daily', 'once')) DEFAULT 'once';
 * ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_user_emails TEXT[] DEFAULT '{}';
 * 
 * -- 7. Tabla de Retira Cliente (Distribución)
 * CREATE TABLE IF NOT EXISTS customer_pickups (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     order_number TEXT NOT NULL,
 *     status TEXT CHECK (status IN ('waiting', 'in_progress', 'completed')) DEFAULT 'waiting',
 *     operator_email TEXT REFERENCES profiles(email) ON UPDATE CASCADE,
 *     operator_name TEXT,
 *     created_at TIMESTAMPTZ DEFAULT now(),
 *     accepted_at TIMESTAMPTZ,
 *     completed_at TIMESTAMPTZ
 * );
 * 
 * -- 8. Habilitar Realtime (CRÍTICO para notificaciones automáticas)
 * ALTER PUBLICATION supabase_realtime ADD TABLE customer_pickups;
 * 
 * -- 9. Tabla de Repartos (Distribución)
 * ALTER TABLE truckers ADD COLUMN IF NOT EXISTS zone TEXT;
 * ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS at_dock BOOLEAN DEFAULT FALSE;
 * ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS address TEXT;
 * ALTER TABLE deliveries ALTER COLUMN postal_code DROP NOT NULL;
 * 
 * CREATE TABLE IF NOT EXISTS deliveries (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     truck_id UUID REFERENCES truckers(id) ON DELETE CASCADE,
 *     order_number TEXT NOT NULL,
 *     warehouse_origin TEXT NOT NULL,
 *     delivery_time TEXT CHECK (delivery_time IN ('morning', 'afternoon')),
 *     postal_code TEXT,
 *     locality TEXT,
 *     address TEXT,
 *     merchandise_type TEXT,
 *     comments TEXT,
 *     delivery_date DATE NOT NULL,
 *     created_by_name TEXT,
 *     is_scheduled BOOLEAN DEFAULT FALSE,
 *     at_dock BOOLEAN DEFAULT FALSE,
 *     sequence INTEGER DEFAULT 0,
 *     created_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * -- 10. Histórico de Repartos
 * CREATE TABLE IF NOT EXISTS delivery_logs (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE,
 *     user_name TEXT NOT NULL,
 *     action TEXT NOT NULL,
 *     details TEXT,
 *     created_at TIMESTAMPTZ DEFAULT now()
 * );
 * 
 * -- 11. Mensajería Interna
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_messaging_access BOOLEAN DEFAULT FALSE;
 * 
 * CREATE TABLE IF NOT EXISTS conversations (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     name TEXT, -- Solo para grupos
 *     is_group BOOLEAN DEFAULT FALSE,
 *     last_message_at TIMESTAMPTZ DEFAULT now(),
 *     created_at TIMESTAMPTZ DEFAULT now()
 * );
 * 
 * CREATE TABLE IF NOT EXISTS conversation_members (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
 *     user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
 *     user_full_name TEXT,
 *     user_email TEXT,
 *     joined_at TIMESTAMPTZ DEFAULT now(),
 *     UNIQUE(conversation_id, user_id)
 * );
 * 
 * CREATE TABLE IF NOT EXISTS messages (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
 *     sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
 *     sender_name TEXT,
 *     content TEXT, -- Ahora puede ser nulo si hay imagen
 *     image_url TEXT, -- URL de la imagen adjunta (base64 o storage)
 *     is_read BOOLEAN DEFAULT FALSE,
 *     created_at TIMESTAMPTZ DEFAULT now()
 * );
 * 
 * -- Habilitar Realtime para Mensajería
 * ALTER PUBLICATION supabase_realtime ADD TABLE messages;
 * ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
 */
