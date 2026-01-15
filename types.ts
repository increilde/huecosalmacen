
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
  code: string; // e.g., A-01-02
  status: 'empty' | 'occupied' | 'reserved';
  item_name?: string;
  quantity?: number;
  last_updated: string;
}
