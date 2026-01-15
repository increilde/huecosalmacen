
export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer'
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
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
