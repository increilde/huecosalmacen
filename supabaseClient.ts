
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
 * ('admin', '["dashboard", "slots", "expedition", "supplies", "admin", "users"]'), 
 * ('operator', '["dashboard", "slots"]'), 
 * ('expedition', '["expedition"]'), 
 * ('viewer', '["slots"]')
 * ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;
 */
