
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://siywqiwbbczbiaogbxge.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpeXdxaXdiYmN6Ymlhb2dieGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzU4MDYsImV4cCI6MjA4NDAxMTgwNn0.zBMLAOVK3pZp9VnrxeYtG-txeD4IUHAdG_m2BP5Gue0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * EJECUTA ESTO EN EL "SQL EDITOR" DE SUPABASE PARA COMPATIBILIDAD:
 * 
 * -- 1. Añadir columna de password si no existe
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_plain TEXT;
 * 
 * -- 2. Crear usuario solicitado (usando el campo email como nombre de usuario)
 * INSERT INTO profiles (email, password_plain, full_name, role)
 * VALUES ('ilde', '8019', 'Ilde Admin', 'admin')
 * ON CONFLICT (email) DO NOTHING;
 * 
 * -- 3. Asegurar que las políticas RLS permitan lectura/escritura (o desactivarlas para pruebas)
 * ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
 */
