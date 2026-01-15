
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://siywqiwbbczbiaogbxge.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpeXdxaXdiYmN6Ymlhb2dieGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzU4MDYsImV4cCI6MjA4NDAxMTgwNn0.zBMLAOVK3pZp9VnrxeYtG-txeD4IUHAdG_m2BP5Gue0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * IMPORTANTE: EJECUTA ESTO EN EL "SQL EDITOR" DE TU DASHBOARD DE SUPABASE
 * 
 * -- 1. Actualizar Tabla de Huecos con nuevos campos
 * ALTER TABLE warehouse_slots ADD COLUMN IF NOT EXISTS is_scanned_once BOOLEAN DEFAULT FALSE;
 * ALTER TABLE warehouse_slots ADD COLUMN IF NOT EXISTS size TEXT DEFAULT 'Standard';
 * 
 * -- Tabla Base si no existe
 * CREATE TABLE IF NOT EXISTS warehouse_slots (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   code TEXT UNIQUE NOT NULL,
 *   status TEXT DEFAULT 'empty',
 *   item_name TEXT,
 *   quantity INTEGER DEFAULT 0,
 *   is_scanned_once BOOLEAN DEFAULT FALSE,
 *   size TEXT DEFAULT 'Standard',
 *   last_updated TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * -- 2. Tabla de Usuarios/Perfiles
 * CREATE TABLE IF NOT EXISTS profiles (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   email TEXT UNIQUE NOT NULL,
 *   full_name TEXT,
 *   role TEXT DEFAULT 'operator',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * -- 3. Tabla de Trazabilidad (Logs de Movimientos)
 * CREATE TABLE IF NOT EXISTS movement_logs (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   operator_name TEXT NOT NULL,
 *   operator_email TEXT,
 *   cart_id TEXT,
 *   slot_code TEXT NOT NULL,
 *   new_status TEXT NOT NULL,
 *   new_quantity INTEGER,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 */
