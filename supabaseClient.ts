
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
 * -- Desactivar RLS para pruebas rápidas
 * ALTER TABLE expedition_logs DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE truckers DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE daily_notes DISABLE ROW LEVEL SECURITY;
 */
