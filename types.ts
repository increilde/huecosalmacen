
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
  role: UserRole;
  created_at: string;
}

export interface Trucker {
  id: string;
  label: string; // Ejemplo: "115 MXO21"
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
  truck_id: string; // Usaremos este campo para el identificador combinado (ej: 115 MXO21)
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
