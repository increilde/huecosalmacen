
export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
  EXPEDITION = 'expedition',
  DISTRIBUTION = 'distribución',
  SUPERVISOR_DISTRI = 'supervisor_distri'
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string; // Nombre del rol
  prompt_machinery: boolean; // Si debe pedir maquinaria al entrar
  has_messaging_access?: boolean; // Si tiene acceso al sistema de mensajería
  avatar_url?: string; // URL de la foto de perfil
  created_at: string;
}

export interface Conversation {
  id: string;
  name?: string; // Solo para grupos
  is_group: boolean;
  created_at: string;
  last_message_at: string;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  user_full_name: string;
  user_email: string;
  user_avatar_url?: string;
  joined_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  image_url?: string; // URL de la imagen adjunta
  created_at: string;
  is_read: boolean;
}

export interface MessageStatus {
  id: string;
  message_id: string;
  user_id: string;
  is_read: boolean;
  read_at?: string;
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
  description?: string;
  allowed_roles: string[];
  assigned_user_emails?: string[];
  task_type: 'daily' | 'once' | 'free';
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
  zone?: string;
  created_at: string;
}

export interface Installer {
  id: string;
  label: string;
  zone?: string;
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

export interface MachineryMaintenance {
  id: string;
  machinery_id: string;
  type: 'averia' | 'reparacion' | 'revision';
  description: string;
  cost?: number;
  status: 'pending' | 'completed';
  reported_by: string;
  created_at: string;
  completed_at?: string;
  attachment_url?: string;
}

export interface CustomerPickup {
  id: string;
  order_number: string;
  status: 'waiting' | 'in_progress' | 'completed';
  operator_email?: string;
  operator_name?: string;
  created_at: string;
  accepted_at?: string;
  completed_at?: string;
}

export interface Delivery {
  id: string;
  delivery_date: string;
  truck_id: string;
  order_number: string;
  warehouse_origin: string;
  delivery_time: 'morning' | 'afternoon';
  postal_code: string;
  locality: string;
  merchandise_type: string;
  address?: string;
  comments?: string;
  created_by_name?: string;
  is_scheduled?: boolean;
  at_dock?: boolean;
  sequence?: number;
  created_at: string;
}

export interface DeliveryLog {
  id: string;
  delivery_id: string;
  user_name: string;
  action: string;
  details?: string;
  created_at: string;
}

export interface DailyTruckAssignment {
  id: string;
  truck_id: string;
  zone: string;
  assignment_date: string;
  created_at: string;
}

export interface Installation {
  id: string;
  installation_date: string;
  installer_id: string;
  order_number: string;
  warehouse_origin: string;
  installation_time?: 'morning' | 'afternoon';
  start_time?: string;
  end_time?: string;
  postal_code: string;
  locality: string;
  merchandise_type: string;
  address?: string;
  comments?: string;
  created_by_name?: string;
  is_scheduled?: boolean;
  at_dock?: boolean;
  sequence?: number;
  created_at: string;
}

export interface InstallationLog {
  id: string;
  installation_id: string;
  user_name: string;
  action: string;
  details?: string;
  created_at: string;
}

export interface DailyInstallerAssignment {
  id: string;
  installer_id: string;
  zone: string;
  assignment_date: string;
  created_at: string;
}

export interface InventoryReading {
  id: string;
  slot_code: string;
  operator_email: string;
  operator_name: string;
  status: 'pending' | 'completed';
  capacity_percent?: number;
  created_at: string;
  completed_at?: string;
  completed_by_name?: string;
}

export interface InventoryItem {
  id: string;
  reading_id: string;
  item_code: string;
  quantity: number;
  created_at: string;
}
