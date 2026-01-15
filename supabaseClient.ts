
import { createClient } from '@supabase/supabase-js';

// Credenciales proporcionadas por el usuario
const supabaseUrl = 'https://siywqiwbbczbiaogbxge.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpeXdxaXdiYmN6Ymlhb2dieGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzU4MDYsImV4cCI6MjA4NDAxMTgwNn0.zBMLAOVK3pZp9VnrxeYtG-txeD4IUHAdG_m2BP5Gue0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * SQL PARA CONFIGURACIÓN EN EL DASHBOARD DE SUPABASE (SQL EDITOR):
 * 
 * -- 1. Crear el tipo enumerado para roles
 * CREATE TYPE user_role AS ENUM ('admin', 'operator', 'viewer');
 * 
 * -- 2. Crear la tabla de perfiles que extiende auth.users
 * CREATE TABLE profiles (
 *   id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
 *   email TEXT UNIQUE NOT NULL,
 *   full_name TEXT,
 *   role user_role DEFAULT 'viewer',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * -- 3. Crear la tabla de huecos del almacén
 * CREATE TABLE warehouse_slots (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   code TEXT UNIQUE NOT NULL, -- Ej: A-01-01
 *   status TEXT CHECK (status IN ('empty', 'occupied', 'reserved')) DEFAULT 'empty',
 *   item_name TEXT,
 *   quantity INTEGER DEFAULT 0,
 *   last_updated TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * -- 4. Habilitar RLS (Row Level Security)
 * ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE warehouse_slots ENABLE ROW LEVEL SECURITY;
 * 
 * -- 5. Políticas básicas
 * CREATE POLICY "Perfiles visibles por todos los autenticados" 
 * ON profiles FOR SELECT TO authenticated USING (true);
 * 
 * CREATE POLICY "Huecos visibles por todos los autenticados" 
 * ON warehouse_slots FOR SELECT TO authenticated USING (true);
 */
