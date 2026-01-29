
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://siywqiwbbczbiaogbxge.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpeXdxaXdiYmN6Ymlhb2dieGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzU4MDYsImV4cCI6MjA4NDAxMTgwNn0.zBMLAOVK3pZp9VnrxeYtG-txeD4IUHAdG_m2BP5Gue0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * --- EJECUTA ESTO EN EL "SQL EDITOR" DE SUPABASE PARA SOLUCIONAR EL ERROR ---
 * 
 * -- 1. Tabla de Logs de Expedición (Muelles)
 * CREATE TABLE IF NOT EXISTS expedition_logs (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   dock_id TEXT NOT NULL,
 *   side TEXT DEFAULT 'single', -- 'single', 'left', 'right'
 *   truck_id TEXT NOT NULL,
 *   operator_name TEXT,
 *   status TEXT DEFAULT 'loading',
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
 *   finished_at TIMESTAMP WITH TIME ZONE
 * );
 * 
 * -- 2. Tabla de Camioneros Habituales
 * CREATE TABLE IF NOT EXISTS truckers (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   full_name TEXT NOT NULL,
 *   truck_id TEXT,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
 * );
 * 
 * -- 3. Tabla de Notas Diarias
 * CREATE TABLE IF NOT EXISTS daily_notes (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   note_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
 *   content TEXT,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
 * );
 * 
 * -- 4. Tabla de Suministros (Stock Almacén)
 * CREATE TABLE IF NOT EXISTS warehouse_supplies (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   name TEXT NOT NULL,
 *   category TEXT DEFAULT 'VARIOS',
 *   quantity INTEGER DEFAULT 0,
 *   min_quantity INTEGER DEFAULT 5,
 *   unit TEXT DEFAULT 'unidades',
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
 * );
 * 
 * -- 5. Tabla de Logs de Suministros (Historial de restas/sumas)
 * CREATE TABLE IF NOT EXISTS warehouse_supply_logs (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   supply_id UUID REFERENCES warehouse_supplies(id) ON DELETE CASCADE,
 *   operator_name TEXT,
 *   change_amount INTEGER,
 *   comment TEXT,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
 * );
 * 
 * -- Desactivar RLS para pruebas rápidas
 * ALTER TABLE expedition_logs DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE truckers DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE daily_notes DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE warehouse_supplies DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE warehouse_supply_logs DISABLE ROW LEVEL SECURITY;
 */
