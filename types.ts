
export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
  EXPEDITION = 'expedition'
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string; // Nombre del rol
  prompt_machinery: boolean; // Si debe pedir maquinaria al entrar
  created_at: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[]; // Lista de IDs de secciones permitidas
  created_at: string;
}

export interface Task {
  id: string;
  name: string;
  allowed_roles: string[];
  is_timed: boolean;
  created_at: string;
}

export interface Machinery {
  id: string;
  type: 'carretilla' | 'pda';
  identifier: string;
  created_at: string;
}

export interface Trucker {
  id: string;
  label: string;
  created_at: string;
}

export interface DailyNote {
  id: string;
  note_date: string;
  content: string;
  updated_at: string;
}

export interface WarehouseSlot {
  id: string;
  code: string;
  status: 'empty' | 'occupied' | 'reserved';
  item_name?: string;
  quantity?: number;
  is_scanned_once: boolean;
  size: string;
  last_updated: string;
}

export interface ExpeditionLog {
  id: string;
  dock_id: string;
  side: 'left' | 'right' | 'single';
  truck_id: string;
  status: 'loading' | 'completed';
  operator_name: string;
  created_at: string;
  finished_at?: string;
}

export interface WarehouseSupply {
  id: string;
  name: string;
  category: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  updated_at: string;
}

export interface WarehouseSupplyLog {
  id: string;
  supply_id: string;
  operator_name: string;
  change_amount: number;
  comment: string;
  created_at: string;
}
