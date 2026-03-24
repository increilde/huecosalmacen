
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, Delivery, Trucker, DeliveryLog, DailyTruckAssignment, UserRole } from '../types';
import { 
  DndContext, 
  DragOverlay, 
  closestCenter, 
  pointerWithin,
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  useDroppable
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Truck, MapPin, Plus, History, Search, Filter, ChevronDown, ChevronRight, Save, X, Trash2, GripVertical, Printer, Navigation, Edit2, Package } from 'lucide-react';
import RouteMap from './RouteMap';
import ConfirmationModal from './ConfirmationModal';

interface DeliveriesPanelProps {
  user: UserProfile;
}

const POSTAL_CODES: Record<string, string | string[]> = {
  '28001': 'Madrid', '08001': 'Barcelona', '41001': 'Sevilla', '46001': 'Valencia',
  '29001': 'Málaga', '30001': 'Murcia', '07001': 'Palma de Mallorca', '35001': 'Las Palmas',
  '48001': 'Bilbao', '03001': 'Alicante', '50001': 'Zaragoza', '47001': 'Valladolid',
  '33001': 'Oviedo', '15001': 'A Coruña', '36001': 'Pontevedra', '39001': 'Santander',
  '31001': 'Pamplona', '20001': 'San Sebastián', '01001': 'Vitoria', '26001': 'Logroño',
  '18001': 'Granada', '18210': 'Peligros', '18230': 'Atarfe', '18200': 'Maracena',
  '18100': 'Armilla', '18140': 'La Zubia', '18151': 'Ogíjares', '18194': 'Churriana de la Vega',
  '18110': ['GABIA GRANDE', 'GABIA CHICA', 'HÍJAR'],
  '18015': ['Granada', 'Albolote'], // Ejemplo de CP con múltiples localidades
  '18600': 'Motril', '18613': 'Motril (Puerto)', '18690': 'Almuñécar',
  '18700': 'Vélez de Benaudalla', '18800': 'Baza', '18500': 'Guadix', '04001': 'Almería',
  '23001': 'Jaén', '14001': 'Córdoba', '11001': 'Cádiz', '21001': 'Huelva',
  '29002': 'Málaga (Centro)', '29620': 'Torremolinos', '29640': 'Fuengirola', '29600': 'Marbella',
  '29700': 'Vélez-Málaga', '29200': 'Antequera', '41002': 'Sevilla (Centro)', '41500': 'Alcalá de Guadaíra',
  '41700': 'Dos Hermanas', '41020': 'Sevilla (Este)', '04700': 'El Ejido', '04740': 'Roquetas de Mar'
};

const WAREHOUSES = [
  { id: '2', label: '2 MOTRIL' },
  { id: '3', label: '3 CENTRAL' },
  { id: '5', label: '5 JUNCARIL' },
  { id: '6', label: '6 ALMERIA' },
  { id: '8', label: '8 ALBAN' },
  { id: '9', label: '9 ANTEQUERA' },
  { id: '73', label: '73' }
];

const ZONES = ['GRANADA', 'COSTA 1', 'COSTA 2', 'ANTEQUERA', 'ALMERÍA'];

const getNextWorkingDay = (date: Date = new Date()) => {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) { // Skip Sunday
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
};

const getPrevWorkingDay = (date: string) => {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0) { // Skip Sunday
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
};

const getNextWorkingDayFromStr = (date: string) => {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) { // Skip Sunday
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
};

const SortableTruckItem: React.FC<{ truck: Trucker }> = ({ truck }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: truck.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center gap-1 text-center cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors ${isDragging ? 'z-50 ring-2 ring-indigo-500' : ''}`}
    >
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        <GripVertical className="w-3 h-3 text-slate-300 shrink-0" />
        <Truck className="w-3 h-3 text-indigo-500 shrink-0" />
      </div>
      <span className="text-[10px] font-bold text-slate-700 leading-tight break-words w-full">{truck.label}</span>
    </div>
  );
};

const SortableAgendaDeliveryItem: React.FC<{ 
  delivery: Delivery;
  onEdit: (d: Delivery) => void;
  onToggleScheduled: (d: Delivery, s: boolean) => void;
  onToggleAtDock: (d: Delivery) => void;
  onShowLogs: (d: Delivery) => void;
  showHistoryId: string | null;
  deliveryLogs: DeliveryLog[];
  onCloseHistory: () => void;
}> = ({ delivery, onEdit, onToggleScheduled, onToggleAtDock, onShowLogs, showHistoryId, deliveryLogs, onCloseHistory }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: delivery.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col w-full"
    >
      <div
        className={`p-2 px-6 rounded-xl border transition-all group flex items-center justify-between gap-3 ${
          delivery.at_dock
            ? 'bg-blue-500 border-blue-600 text-white shadow-lg shadow-blue-100'
            : delivery.is_scheduled 
              ? 'bg-emerald-200 border-emerald-300' 
              : 'bg-slate-50 border-slate-100 hover:border-indigo-200'
        } ${isDragging ? 'z-50 ring-2 ring-indigo-500' : ''}`}
      >
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-black/5 rounded transition-colors shrink-0">
          <GripVertical className={`w-4 h-4 ${delivery.at_dock ? 'text-white' : 'text-indigo-500'}`} />
        </div>

        <div className="flex items-center gap-8 flex-1">
          <div className="w-28 shrink-0">
            <p className={`text-base font-black tracking-tighter ${delivery.at_dock ? 'text-white' : 'text-slate-800'}`}>{delivery.order_number}</p>
            <p className={`text-[11px] font-black uppercase tracking-widest ${delivery.at_dock ? 'text-blue-100' : 'text-indigo-600'}`}>
              {WAREHOUSES.find(w => w.id === delivery.warehouse_origin)?.label || delivery.warehouse_origin}
            </p>
          </div>

          <div className={`h-12 w-px shrink-0 ${delivery.at_dock ? 'bg-white/20' : 'bg-slate-200'}`} />

          <div className="flex-1 flex flex-col justify-center gap-2 py-1">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-1">
              <div className="flex items-center gap-2 min-w-[180px]">
                <span className="text-lg">📍</span>
                <div className="flex flex-col">
                  <p className={`text-[12px] font-bold uppercase leading-tight ${delivery.at_dock ? 'text-white' : 'text-slate-700'}`}>
                    {delivery.postal_code} - {delivery.locality}
                  </p>
                  {delivery.address && (
                    <p className={`text-[10px] font-medium uppercase leading-tight mt-0.5 ${delivery.at_dock ? 'text-blue-100' : 'text-slate-500'}`}>
                      {delivery.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-[150px]">
                <span className="text-lg">📦</span>
                <p className={`text-[12px] font-bold uppercase leading-tight break-words ${delivery.at_dock ? 'text-white' : 'text-slate-700'}`}>
                  {delivery.merchandise_type}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              {delivery.created_by_name && (
                <p className={`text-[8px] font-black uppercase tracking-widest ${delivery.at_dock ? 'text-blue-100' : 'text-slate-400'}`}>Por: {delivery.created_by_name}</p>
              )}
            </div>
          </div>

          <div className={`h-12 w-px shrink-0 ${delivery.at_dock ? 'bg-white/20' : 'bg-slate-200'}`} />

          <div className="w-24 shrink-0 flex flex-col items-center">
            <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
              delivery.at_dock 
                ? 'bg-white/20 text-white' 
                : delivery.delivery_time === 'morning' 
                  ? 'bg-amber-50 text-amber-600 border border-amber-100' 
                  : 'bg-blue-50 text-blue-600 border border-blue-100'
            }`}>
              {delivery.delivery_time === 'morning' ? 'MAÑANA' : 'TARDE'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 no-print" onPointerDown={(e) => e.stopPropagation()}>
          <button 
            onClick={() => onToggleAtDock(delivery)}
            className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${
              delivery.at_dock 
                ? 'bg-white text-blue-600 shadow-lg' 
                : 'bg-white text-slate-400 hover:bg-blue-50 hover:text-blue-600 border border-slate-100'
            }`}
          >
            {delivery.at_dock ? 'EN MUELLE' : 'PASAR A MUELLE'}
          </button>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => onEdit(delivery)}
              className={`p-2 rounded-xl transition-colors ${delivery.at_dock ? 'hover:bg-white/10 text-white/60 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-indigo-600'}`}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onShowLogs(delivery)}
              className={`p-2 rounded-xl transition-colors ${delivery.at_dock ? 'hover:bg-white/10 text-white/60 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-indigo-600'}`}
            >
              <History className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onToggleScheduled(delivery, false)}
              className={`p-2 rounded-xl transition-colors ${delivery.at_dock ? 'hover:bg-white/10 text-white/60 hover:text-white' : 'hover:bg-rose-50 text-slate-400 hover:text-rose-600'}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showHistoryId === delivery.id && (
        <div className="mx-6 mb-4 mt-2 bg-white rounded-2xl border border-slate-100 shadow-inner p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
            <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Histórico de Movimientos</h5>
            <button onClick={(e) => { e.stopPropagation(); onCloseHistory(); }} className="text-slate-300 hover:text-slate-500 text-xs">✕</button>
          </div>
          <div className="space-y-3">
            {deliveryLogs.length === 0 ? (
              <p className="text-[9px] text-slate-400 italic text-center py-2">No hay registros para este reparto</p>
            ) : deliveryLogs.map(log => (
              <div key={log.id} className="flex items-start gap-3 text-[9px]">
                <div className="w-20 shrink-0 text-slate-400 font-medium">
                  {new Date(log.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="shrink-0">
                  <span className={`px-2 py-0.5 rounded-md font-black uppercase tracking-tighter ${
                    log.action === 'CREACIÓN' ? 'bg-emerald-100 text-emerald-700' :
                    log.action === 'EDICIÓN' ? 'bg-blue-100 text-blue-700' :
                    log.action === 'AGENDADO' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {log.action}
                  </span>
                </div>
                <div className="flex-1">
                  <span className="font-bold text-slate-700">{log.user_name}:</span>
                  <span className="ml-2 text-slate-500">{log.details || 'Sin detalles adicionales'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SortableDeliveryItem: React.FC<{ 
  delivery: Delivery;
  onEdit: (d: Delivery) => void;
  onToggleScheduled: (d: Delivery, s: boolean) => void;
  onShowLogs: (d: Delivery) => void;
  showHistoryId: string | null;
  deliveryLogs: DeliveryLog[];
  onCloseHistory: () => void;
}> = ({ delivery, onEdit, onToggleScheduled, onShowLogs, showHistoryId, deliveryLogs, onCloseHistory }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: delivery.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col w-full"
    >
      <div className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all group relative flex items-center gap-3 ${isDragging ? 'z-50 ring-2 ring-indigo-500' : ''}`}>
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-50 rounded transition-colors shrink-0">
          <GripVertical className="w-4 h-4 text-indigo-500" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  #{delivery.order_number}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  delivery.delivery_time === 'morning' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                }`}>
                  {delivery.delivery_time === 'morning' ? 'MAÑANA' : 'TARDE'}
                </span>
              </div>
              <h4 className="text-[11px] font-bold text-slate-800 truncate uppercase">{delivery.client_name || 'SIN NOMBRE'}</h4>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onEdit(delivery)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button 
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onShowLogs(delivery)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
              >
                <History className="w-3 h-3" />
              </button>
              <button 
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onToggleScheduled(delivery, false)}
                className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500">
              <MapPin className="w-3 h-3 shrink-0 text-slate-300" />
              <span className="text-[10px] font-medium truncate uppercase">{delivery.locality || 'SIN LOCALIDAD'}</span>
            </div>
            {delivery.merchandise_type && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <Package className="w-3 h-3 shrink-0 text-slate-300" />
                <span className="text-[9px] font-medium truncate uppercase">{delivery.merchandise_type}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showHistoryId === delivery.id && (
        <div className="mt-2 bg-white rounded-xl border border-slate-100 shadow-inner p-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2 border-b border-slate-50 pb-1">
            <h5 className="text-[9px] font-black text-slate-800 uppercase tracking-widest">Histórico</h5>
            <button onClick={(e) => { e.stopPropagation(); onCloseHistory(); }} className="text-slate-300 hover:text-slate-500 text-[10px]">✕</button>
          </div>
          <div className="space-y-2">
            {deliveryLogs.length === 0 ? (
              <p className="text-[8px] text-slate-400 italic text-center py-1">Sin registros</p>
            ) : deliveryLogs.map(log => (
              <div key={log.id} className="flex flex-col gap-0.5 text-[8px]">
                <div className="flex justify-between text-slate-400">
                  <span>{new Date(log.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="font-black">{log.action}</span>
                </div>
                <div className="text-slate-600">
                  <span className="font-bold">{log.user_name}:</span> {log.details}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ZoneColumn: React.FC<{ 
  zone: string; 
  assignments: DailyTruckAssignment[]; 
  trucks: Trucker[];
  onRemove: (id: string) => void;
  deliveries: Delivery[];
  onEdit: (d: Delivery) => void;
  onToggleScheduled: (d: Delivery, s: boolean) => void;
  onShowLogs: (d: Delivery) => void;
  showHistoryId: string | null;
  deliveryLogs: DeliveryLog[];
  onCloseHistory: () => void;
}> = ({ zone, assignments, trucks, onRemove, deliveries, onEdit, onToggleScheduled, onShowLogs, showHistoryId, deliveryLogs, onCloseHistory }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: zone,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col h-full min-h-[300px] rounded-3xl p-4 transition-all ${isOver ? 'bg-indigo-50 border-2 border-indigo-200 ring-4 ring-indigo-50' : 'bg-slate-50 border-2 border-transparent'}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{zone}</h3>
        <span className="bg-white px-2 py-0.5 rounded-full text-[9px] font-black text-slate-400 border border-slate-200">
          {assignments.length}
        </span>
      </div>
      
      <div className="flex-1 space-y-4">
        {assignments.map(assignment => {
          const truck = trucks.find(t => t.id === assignment.truck_id);
          const truckDeliveries = deliveries.filter(d => d.truck_id === assignment.truck_id);
          
          return (
            <TruckDroppable key={assignment.id} truckId={assignment.truck_id!}>
              <div className="bg-white/50 rounded-2xl border border-slate-200/50 p-3 space-y-3 relative group">
                <button
                  onClick={() => onRemove(assignment.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-red-600 hover:border-red-200 shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="Eliminar camión de la agenda"
                >
                  <Trash2 className="w-3 h-3" />
                </button>

                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tight leading-none mb-0.5">
                        {truck?.label || 'CAMIÓN'}
                      </h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {truckDeliveries.length} REPARTOS
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <SortableContext items={truckDeliveries.map(d => d.id)} strategy={verticalListSortingStrategy}>
                    {truckDeliveries.map(delivery => (
                      <SortableDeliveryItem
                        key={delivery.id}
                        delivery={delivery}
                        onEdit={onEdit}
                        onToggleScheduled={onToggleScheduled}
                        onShowLogs={onShowLogs}
                        showHistoryId={showHistoryId}
                        deliveryLogs={deliveryLogs}
                        onCloseHistory={onCloseHistory}
                      />
                    ))}
                  </SortableContext>
                  
                  {truckDeliveries.length === 0 && (
                    <div className="py-4 border-2 border-dashed border-slate-100 rounded-xl flex flex-center justify-center">
                      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Sin repartos</p>
                    </div>
                  )}
                </div>
              </div>
            </TruckDroppable>
          );
        })}
      </div>
    </div>
  );
};

const TruckDroppable: React.FC<{ truckId: string; children: React.ReactNode }> = ({ truckId, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `truck-${truckId}`,
  });

  return (
    <div ref={setNodeRef} className={`rounded-2xl transition-all ${isOver ? 'ring-2 ring-indigo-400 ring-offset-2 bg-indigo-50/50' : ''}`}>
      {children}
    </div>
  );
};

const DeliveriesPanel: React.FC<DeliveriesPanelProps> = ({ user }) => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [trucks, setTrucks] = useState<Trucker[]>([]);
  const [selectedDate, setSelectedDate] = useState(getNextWorkingDay());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [view, setView] = useState<'agenda' | 'create' | 'daily_trucks'>('agenda');
  const [dailyAssignments, setDailyAssignments] = useState<DailyTruckAssignment[]>([]);
  const [agendaAssignments, setAgendaAssignments] = useState<DailyTruckAssignment[]>([]);
  const [assignmentDate, setAssignmentDate] = useState(getNextWorkingDay());
  const [activeTruckId, setActiveTruckId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeZone, setActiveZone] = useState<string>('TODOS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistoryId, setShowHistoryId] = useState<string | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [routeTruckId, setRouteTruckId] = useState<string | null>(null);
  const [pendingZoneTruckId, setPendingZoneTruckId] = useState<string | null>(null);
  const [pendingDeliveryId, setPendingDeliveryId] = useState<string | null>(null);
  const [isCreatingAfterZone, setIsCreatingAfterZone] = useState(false);
  const [expandedTrucks, setExpandedTrucks] = useState<Set<string>>(new Set());
  
  const [newDelivery, setNewDelivery] = useState<Partial<Delivery>>({
    warehouse_origin: '3',
    delivery_time: 'morning',
    merchandise_type: ''
  });
  const [postalCodeLocality, setPostalCodeLocality] = useState('');
  const [postalCodePlaces, setPostalCodePlaces] = useState<string[]>([]);
  const [isSearchingLocality, setIsSearchingLocality] = useState(false);

  useEffect(() => {
    fetchTrucks();
    fetchDeliveries(selectedDate);
    fetchAgendaAssignments(selectedDate);
    if (view === 'daily_trucks') {
      fetchDailyAssignments(assignmentDate);
    }
  }, [selectedDate, assignmentDate, view]);

  // Sync assignmentDate with selectedDate
  useEffect(() => {
    setAssignmentDate(selectedDate);
  }, [selectedDate]);

  // Sync selectedDate with assignmentDate (optional, but keeps them perfectly in sync)
  useEffect(() => {
    setSelectedDate(assignmentDate);
  }, [assignmentDate]);

  useEffect(() => {
    const cleanupEmptyAssignments = async () => {
      // Solo limpiar si estamos en la vista de agenda y no estamos cargando
      if (view !== 'agenda' || loading || !agendaAssignments.length) return;
      
      const emptyAssignments = agendaAssignments.filter(a => 
        !deliveries.some(d => d.truck_id === a.truck_id)
      );

      if (emptyAssignments.length > 0) {
        for (const assignment of emptyAssignments) {
          await supabase
            .from('daily_truck_assignments')
            .delete()
            .eq('id', assignment.id);
        }
        fetchAgendaAssignments(selectedDate);
      }
    };

    cleanupEmptyAssignments();
  }, [deliveries, agendaAssignments, selectedDate, loading, view]);

  const fetchAgendaAssignments = async (date: string) => {
    try {
      const { data, error } = await supabase
        .from('daily_truck_assignments')
        .select('*')
        .eq('assignment_date', date);
      
      if (error) throw error;
      setAgendaAssignments(data || []);
    } catch (err) {
      console.error("Error fetching agenda assignments:", err);
    }
  };

  const fetchDailyAssignments = async (date: string) => {
    try {
      const { data, error } = await supabase
        .from('daily_truck_assignments')
        .select('*')
        .eq('assignment_date', date);
      
      if (error) throw error;
      setDailyAssignments(data || []);
    } catch (err) {
      console.error("Error fetching daily assignments:", err);
    }
  };

  const handleSaveAssignment = async (truckId: string, zone: string) => {
    try {
      const { error } = await supabase
        .from('daily_truck_assignments')
        .upsert({ 
          truck_id: truckId, 
          zone, 
          assignment_date: assignmentDate 
        }, { onConflict: 'truck_id,assignment_date' });
      
      if (error) throw error;
      fetchDailyAssignments(assignmentDate);
      // También refrescar agendaAssignments si la fecha coincide
      if (assignmentDate === selectedDate) {
        fetchAgendaAssignments(selectedDate);
      }
    } catch (err) {
      console.error("Error saving assignment:", err);
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('daily_truck_assignments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      fetchDailyAssignments(assignmentDate);
      if (assignmentDate === selectedDate) {
        fetchAgendaAssignments(selectedDate);
      }
    } catch (err) {
      console.error("Error removing assignment:", err);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    confirm(
      '¿Eliminar camión?',
      '¿Estás seguro de que deseas eliminar este camión de la agenda? Los repartos asignados a este camión volverán a estar sin camión asignado.',
      () => handleRemoveAssignment(id)
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortDeliveries = (list: Delivery[]) => {
    return [...list].sort((a, b) => {
      // Prioridad absoluta a la secuencia manual
      if (a.sequence !== null && a.sequence !== undefined && b.sequence !== null && b.sequence !== undefined) {
        if (a.sequence !== b.sequence) return a.sequence - b.sequence;
      }
      
      if (a.sequence !== null && a.sequence !== undefined) return -1;
      if (b.sequence !== null && b.sequence !== undefined) return 1;

      // Fallback a franja horaria si no hay secuencia
      if (a.delivery_time === 'morning' && b.delivery_time === 'afternoon') return -1;
      if (a.delivery_time === 'afternoon' && b.delivery_time === 'morning') return 1;
      
      // Por defecto por fecha de creación
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = active.id as string;
    
    if (trucks.some(t => t.id === activeId)) {
      setActiveTruckId(activeId);
    } else {
      setActiveId(activeId);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Solo nos interesa si estamos moviendo un reparto
    const activeDelivery = deliveries.find(d => d.id === activeId);
    if (!activeDelivery) return;

    // Caso A: Sobre otro reparto
    const overDelivery = deliveries.find(d => d.id === overId);
    if (overDelivery) {
      if (activeDelivery.truck_id !== overDelivery.truck_id) {
        setDeliveries(prev => prev.map(d => 
          d.id === activeId ? { ...d, truck_id: overDelivery.truck_id } : d
        ));
      }
    }
    
    // Caso B: Sobre un contenedor de camión (droppable) o sobre el propio camión
    else if (overId.startsWith('truck-') || trucks.some(t => t.id === overId)) {
      const targetTruckId = overId.startsWith('truck-') ? overId.replace('truck-', '') : overId;
      if (activeDelivery.truck_id !== targetTruckId) {
        setDeliveries(prev => prev.map(d => 
          d.id === activeId ? { ...d, truck_id: targetTruckId } : d
        ));
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTruckId(null);
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Caso 1: Arrastrar camión a una zona
    if (ZONES.includes(overId) && trucks.some(t => t.id === activeId)) {
      await handleSaveAssignment(activeId, overId);
      return;
    }

    // Caso 2: Arrastrar reparto para reordenar (dentro del mismo camión o entre camiones)
    const activeDelivery = deliveries.find(d => d.id === activeId);
    if (activeDelivery) {
      const overDelivery = deliveries.find(d => d.id === overId);
      const targetTruckId = overDelivery ? overDelivery.truck_id : (overId.startsWith('truck-') ? overId.replace('truck-', '') : (trucks.some(t => t.id === overId) ? overId : null));
      
      if (targetTruckId) {
        // Obtenemos los repartos del camión destino, ORDENADOS tal cual se ven
        const truckDeliveries = sortDeliveries(deliveries.filter(d => d.truck_id === targetTruckId));
        
        const oldIndex = truckDeliveries.findIndex(d => d.id === activeId);
        let newIndex = overDelivery ? truckDeliveries.findIndex(d => d.id === overId) : truckDeliveries.length;

        if (oldIndex !== -1) {
          // Reordenar dentro del mismo camión (o ya movido por handleDragOver)
          if (oldIndex !== newIndex || activeDelivery.truck_id !== targetTruckId) {
            const newOrdered = arrayMove(truckDeliveries, oldIndex, newIndex);
            
            const otherDeliveries = deliveries.filter(d => d.truck_id !== targetTruckId);
            setDeliveries([...otherDeliveries, ...newOrdered]);
            
            // Actualizar truck_id en DB por si acaso cambió
            await supabase.from('deliveries').update({ truck_id: targetTruckId }).eq('id', activeId);
            
            await handleMaintainRoute(newOrdered, true);
          }
        } else {
          // Mover a otro camión (si handleDragOver no lo hizo)
          const newOrdered = [...truckDeliveries];
          const newItem = { ...activeDelivery, truck_id: targetTruckId };
          newOrdered.splice(newIndex, 0, newItem);
          
          const otherDeliveries = deliveries.filter(d => d.truck_id !== targetTruckId && d.id !== activeId);
          setDeliveries([...otherDeliveries, ...newOrdered]);
          
          await supabase.from('deliveries').update({ 
            truck_id: targetTruckId
          }).eq('id', activeId);
          
          await handleMaintainRoute(newOrdered, true);
        }
      }
    }
  };

  const fetchTrucks = async () => {
    try {
      const { data, error } = await supabase.from('truckers').select('*').order('full_name');
      if (error) throw error;
      
      let sortedTrucks = data?.map((t: any) => ({ 
        id: t.id, 
        label: t.full_name, 
        zone: t.zone,
        created_at: t.created_at 
      })) || [];
      
      // Ordenar: PENDIENTE primero, luego por número de menor a mayor
      sortedTrucks.sort((a, b) => {
        const aLabel = a.label.toUpperCase();
        const bLabel = b.label.toUpperCase();
        const aPendiente = aLabel.startsWith('PENDIENTE');
        const bPendiente = bLabel.startsWith('PENDIENTE');
        
        if (aPendiente && !bPendiente) return -1;
        if (!aPendiente && bPendiente) return 1;
        
        // Extraer números para ordenar numéricamente
        const aNum = parseInt(aLabel.replace(/\D/g, '')) || 0;
        const bNum = parseInt(bLabel.replace(/\D/g, '')) || 0;
        
        if (aNum !== bNum) return aNum - bNum;
        
        // Si no hay números o son iguales, alfabético
        return aLabel.localeCompare(bLabel);
      });
      
      setTrucks(sortedTrucks);
    } catch (err) {
      console.error("Error fetching trucks:", err);
    }
  };

  const handleUpdateTruckZone = async (truckId: string, zone: string) => {
    try {
      const { error } = await supabase
        .from('truckers')
        .update({ zone })
        .eq('id', truckId);
      
      if (error) throw error;
      
      setTrucks(prev => prev.map(t => t.id === truckId ? { ...t, zone } : t));
    } catch (err) {
      console.error("Error updating truck zone:", err);
    }
  };

  const handleAssignZoneAndSchedule = async (zone: string) => {
    if (!pendingZoneTruckId) return;
    
    try {
      // 1. Asignar zona al camión (esto actualiza el valor por defecto)
      await handleUpdateTruckZone(pendingZoneTruckId, zone);
      
      // 2. Si venimos del formulario de creación
      if (isCreatingAfterZone) {
        await handleCreateDelivery();
        setIsCreatingAfterZone(false);
      } 
      // 3. Si venimos del botón "Agendar" de la agenda
      else if (pendingDeliveryId) {
        const delivery = deliveries.find(d => d.id === pendingDeliveryId);
        if (delivery) {
          await toggleScheduled(delivery, true);
        }
      }
      // 4. Caso general: venimos de hacer clic en la zona en el header
      // Actualizamos también la asignación diaria para el día seleccionado
      else {
        await supabase
          .from('daily_truck_assignments')
          .upsert({ 
            truck_id: pendingZoneTruckId, 
            zone, 
            assignment_date: selectedDate 
          }, { onConflict: 'truck_id,assignment_date' });
        
        fetchAgendaAssignments(selectedDate);
      }
      
      setShowZoneModal(false);
      setPendingZoneTruckId(null);
      setPendingDeliveryId(null);
    } catch (err) {
      console.error("Error in handleAssignZoneAndSchedule:", err);
    }
  };

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModalConfig({ title, message, onConfirm });
    setShowConfirmModal(true);
  };

  const fetchDeliveries = async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('delivery_date', date)
        .order('sequence', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setDeliveries(data || []);
    } catch (err) {
      console.error("Error fetching deliveries:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (deliveryId: string) => {
    try {
      const { data, error } = await supabase
        .from('delivery_logs')
        .select('*')
        .eq('delivery_id', deliveryId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setDeliveryLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const addLog = async (deliveryId: string, action: string, details?: string) => {
    try {
      await supabase.from('delivery_logs').insert([{
        delivery_id: deliveryId,
        user_name: user.full_name,
        action,
        details
      }]);
    } catch (err) {
      console.error("Error adding log:", err);
    }
  };

  const toggleTruckExpand = (truckId: string) => {
    setExpandedTrucks(prev => {
      const next = new Set(prev);
      if (next.has(truckId)) next.delete(truckId);
      else next.add(truckId);
      return next;
    });
  };

  const handleCalculateRoute = (truckId: string) => {
    setRouteTruckId(truckId);
    setShowRouteMap(true);
  };

  const handleMaintainRoute = async (orderedDeliveries: Delivery[], skipLocalUpdate: boolean = false) => {
    if (orderedDeliveries.length === 0) return;
    
    if (!skipLocalUpdate) {
      setLoading(true);
    }
    
    try {
      // Actualizar cada reparto con su nueva secuencia de forma individual
      // Usamos Promise.all para que las actualizaciones se ejecuten en paralelo
      const updatePromises = orderedDeliveries.map((d, i) => 
        supabase
          .from('deliveries')
          .update({ sequence: i + 1 })
          .eq('id', d.id)
      );

      const results = await Promise.all(updatePromises);
      
      // Verificar si alguna actualización falló
      const firstError = results.find(r => r.error)?.error;
      if (firstError) throw firstError;

      if (!skipLocalUpdate) {
        setMessage({ type: 'success', text: 'Orden de ruta guardado correctamente' });
        fetchDeliveries(selectedDate);
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err: any) {
      console.error("Error updating sequence:", err);
      const errorMsg = err.message || 'Error desconocido';
      setMessage({ 
        type: 'error', 
        text: `Error al guardar el orden: ${errorMsg}. Asegúrate de que la columna 'sequence' existe en la tabla 'deliveries'.` 
      });
      if (skipLocalUpdate) {
        fetchDeliveries(selectedDate); // Re-fetch en caso de error para restaurar estado
      }
    } finally {
      if (!skipLocalUpdate) {
        setLoading(false);
      }
    }
  };

  const handleCreateDelivery = async () => {
    if (!newDelivery.truck_id || !newDelivery.order_number) {
      setMessage({ type: 'error', text: 'Faltan campos obligatorios (Camión y Pedido)' });
      return;
    }

    // Si el camión no tiene zona y no estamos ya en el proceso post-modal, mostrar modal
    const truck = trucks.find(t => t.id === newDelivery.truck_id);
    const hasNoZone = !truck?.zone || truck.zone.trim() === '' || truck.zone === 'SIN ZONA';
    
    if (truck && hasNoZone && !isCreatingAfterZone) {
      setPendingZoneTruckId(newDelivery.truck_id);
      setIsCreatingAfterZone(true);
      setShowZoneModal(true);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...newDelivery,
        delivery_date: selectedDate,
        locality: postalCodeLocality,
        created_by_name: user.full_name
      };

      if (editingId) {
        const { error } = await supabase
          .from('deliveries')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        await addLog(editingId, 'EDICIÓN', `Pedido: ${payload.order_number}, CP: ${payload.postal_code}`);
        setMessage({ type: 'success', text: 'Reparto actualizado correctamente' });
      } else {
        const { data, error } = await supabase.from('deliveries').insert([payload]).select();
        if (error) throw error;
        if (data && data[0]) {
          await addLog(data[0].id, 'CREACIÓN', `Pedido inicial: ${payload.order_number}`);
        }
        setMessage({ type: 'success', text: 'Reparto creado correctamente' });
      }

      setNewDelivery({
        warehouse_origin: '3',
        delivery_time: 'morning',
        merchandise_type: '',
        address: ''
      });
      setPostalCodeLocality('');
      setPostalCodePlaces([]);
      setEditingId(null);
      fetchDeliveries(selectedDate);
      setView('agenda');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (delivery: Delivery) => {
    setNewDelivery({
      truck_id: delivery.truck_id,
      order_number: delivery.order_number,
      warehouse_origin: delivery.warehouse_origin,
      delivery_time: delivery.delivery_time,
      postal_code: delivery.postal_code,
      address: delivery.address,
      merchandise_type: delivery.merchandise_type,
      comments: delivery.comments,
      is_scheduled: delivery.is_scheduled
    });
    setPostalCodeLocality(delivery.locality || '');
    
    // Si tiene CP, intentar cargar las opciones de localidad para el desplegable
    if (delivery.postal_code && delivery.postal_code.length === 5) {
      const localValue = POSTAL_CODES[delivery.postal_code];
      if (localValue) {
        const places = Array.isArray(localValue) ? localValue : [localValue];
        setPostalCodePlaces(places);
      }
    } else {
      setPostalCodePlaces([]);
    }

    setEditingId(delivery.id);
    setView('create');
  };

  const toggleScheduled = async (delivery: Delivery, forceValue?: boolean) => {
    try {
      const newStatus = forceValue !== undefined ? forceValue : !delivery.is_scheduled;
      
      // Si estamos agendando y el camión no tiene zona (o es SIN ZONA), pedirla
      if (newStatus && !delivery.is_scheduled && forceValue === undefined) {
        const truck = trucks.find(t => t.id === delivery.truck_id);
        const hasNoZone = !truck?.zone || truck.zone.trim() === '' || truck.zone === 'SIN ZONA';
        
        if (truck && hasNoZone) {
          setPendingZoneTruckId(delivery.truck_id);
          setPendingDeliveryId(delivery.id);
          setShowZoneModal(true);
          return;
        }
      }

      const { error } = await supabase
        .from('deliveries')
        .update({ is_scheduled: newStatus, at_dock: false })
        .eq('id', delivery.id);
      
      if (error) {
        console.error("Supabase error toggling scheduled:", error);
        setMessage({ type: 'error', text: 'Error al actualizar el estado del pedido' });
        return;
      }
      
      await addLog(delivery.id, newStatus ? 'AGENDADO' : 'DESAGENDADO');
      
      setDeliveries(prev => prev.map(d => 
        d.id === delivery.id ? { ...d, is_scheduled: newStatus, at_dock: false } : d
      ));
    } catch (err) {
      console.error("Error toggling scheduled status:", err);
      setMessage({ type: 'error', text: 'Error de conexión al agendar' });
    }
  };

  const toggleAtDock = async (delivery: Delivery) => {
    try {
      const newStatus = !delivery.at_dock;
      const { error } = await supabase
        .from('deliveries')
        .update({ at_dock: newStatus })
        .eq('id', delivery.id);
      
      if (error) throw error;
      
      await addLog(delivery.id, newStatus ? 'PASADO A MUELLE' : 'QUITADO DE MUELLE');
      
      setDeliveries(prev => prev.map(d => 
        d.id === delivery.id ? { ...d, at_dock: newStatus } : d
      ));
    } catch (err) {
      console.error("Error toggling dock status:", err);
    }
  };

  const handleDeleteDelivery = async (id: string) => {
    confirm(
      '¿Eliminar reparto?',
      '¿Estás seguro de que deseas eliminar este reparto permanentemente?',
      async () => {
        setLoading(true);
        try {
          const { error } = await supabase
            .from('deliveries')
            .delete()
            .eq('id', id);
          
          if (error) throw error;
          
          setDeliveries(prev => prev.filter(d => d.id !== id));
          setMessage({ type: 'success', text: 'Reparto eliminado correctamente' });
          setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
          setMessage({ type: 'error', text: err.message });
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handlePostalCodeChange = async (code: string) => {
    setNewDelivery(prev => ({ ...prev, postal_code: code }));
    setPostalCodePlaces([]);
    
    if (code.length === 5) {
      setIsSearchingLocality(true);
      try {
        // Usamos la API de Zippopotam para España
        const response = await window.fetch(`https://api.zippopotam.us/es/${code}`);
        if (response.ok) {
          const data = await response.json();
          if (data.places && data.places.length > 0) {
            const places = data.places.map((p: any) => p['place name'].toUpperCase());
            // Eliminar duplicados si los hay
            const uniquePlaces = Array.from(new Set(places)) as string[];
            setPostalCodePlaces(uniquePlaces);
            
            if (uniquePlaces.length === 1) {
              setPostalCodeLocality(uniquePlaces[0]);
            } else {
              setPostalCodeLocality(''); // Dejar que el usuario elija del desplegable
            }
          }
        } else {
          // Fallback a la lista local si la API falla o no encuentra el CP
          const localValue = POSTAL_CODES[code];
          if (localValue) {
            const places = Array.isArray(localValue) ? localValue : [localValue];
            setPostalCodePlaces(places);
            if (places.length === 1) {
              setPostalCodeLocality(places[0]);
            } else {
              setPostalCodeLocality('');
            }
          } else {
            setPostalCodeLocality('');
          }
        }
      } catch (err) {
        console.error("Error buscando localidad:", err);
        const localValue = POSTAL_CODES[code];
        if (localValue) {
          const places = Array.isArray(localValue) ? localValue : [localValue];
          setPostalCodePlaces(places);
          if (places.length === 1) {
            setPostalCodeLocality(places[0]);
          } else {
            setPostalCodeLocality('');
          }
        } else {
          setPostalCodeLocality('');
        }
      } finally {
        setIsSearchingLocality(false);
      }
    } else {
      setPostalCodeLocality('');
      setPostalCodePlaces([]);
    }
  };

  const activeTrucksForDay = trucks.filter(truck => 
    deliveries.some(d => d.truck_id === truck.id) ||
    agendaAssignments.some(a => a.truck_id === truck.id)
  );

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="p-2 md:p-4 w-full animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6 max-w-[1800px] mx-auto no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Agenda de Repartos</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Distribución y Logística</p>
          
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4 bg-white/50 p-4 rounded-2xl border border-slate-100 shadow-sm no-print">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visualizando Agenda para el día:</span>
              <span className="text-[12px] font-black text-slate-700">{new Date(selectedDate).toLocaleDateString('es-ES')}</span>
            </div>
            <div className="h-4 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Camiones Totales:</span>
              <span className="text-[12px] font-black text-slate-700">{activeTrucksForDay.length}</span>
            </div>
            <div className="h-4 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pedidos Totales:</span>
              <span className="text-[12px] font-black text-indigo-600">{deliveries.length}</span>
            </div>
            <div className="h-4 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pedidos en Muelle:</span>
              <span className="text-[12px] font-black text-blue-600">{deliveries.filter(d => d.at_dock).length}</span>
            </div>

            <div className="w-full h-px bg-slate-100 my-1" />
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Camiones por Zona:</span>
              {['SIN ZONA', ...ZONES].map(zone => {
                const count = activeTrucksForDay.filter(t => {
                  const dailyAssignment = agendaAssignments.find(a => a.truck_id === t.id);
                  const tZone = dailyAssignment ? dailyAssignment.zone : (t.zone || 'SIN ZONA');
                  return tZone === zone;
                }).length;
                if (count === 0) return null;
                return (
                  <div key={zone} className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{zone}:</span>
                    <span className="text-[11px] font-black text-slate-800">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Buscar:</span>
            <input 
              type="text" 
              placeholder="Camión..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-24 md:w-32"
            />
          </div>
          <div className="flex items-center gap-3 bg-white px-5 py-2 rounded-2xl border-2 border-slate-200 shadow-md hover:border-indigo-300 transition-all no-print">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Fecha Agenda:</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setSelectedDate(getPrevWorkingDay(selectedDate))}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-indigo-600"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="flex flex-col items-center min-w-[120px]">
                <span className="text-[12px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' })}
                </span>
                <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-base font-black text-slate-800 outline-none cursor-pointer leading-none text-center"
                />
              </div>
              <button 
                onClick={() => setSelectedDate(getNextWorkingDayFromStr(selectedDate))}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-indigo-600"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          {(user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR_DISTRI) && (
            <button 
              onClick={() => setView(view === 'daily_trucks' ? 'agenda' : 'daily_trucks')}
              className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center gap-2 ${view === 'daily_trucks' ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-white text-emerald-600 border-2 border-emerald-100 shadow-slate-100 hover:border-emerald-300'}`}
            >
              <Truck className="w-4 h-4" />
              {view === 'daily_trucks' ? 'Ver Agenda' : 'Camiones del Día'}
            </button>
          )}
          <button 
            onClick={() => window.print()}
            className="bg-slate-800 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-100 active:scale-95 transition-all hover:bg-slate-900 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimir Día
          </button>
          <button 
            onClick={() => setView(view === 'agenda' ? 'create' : 'agenda')}
            className="bg-indigo-600 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 active:scale-95 transition-all hover:bg-indigo-700"
          >
            {view === 'agenda' ? 'Nuevo' : 'Ver Agenda'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl mb-8 text-[11px] font-semibold text-center animate-fade-in uppercase tracking-widest ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.text}
        </div>
      )}

      {view === 'daily_trucks' ? (
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Previsión de Camiones</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Asigna camioneros a zonas para el día seleccionado</p>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 px-5 py-2 rounded-2xl border-2 border-slate-100 shadow-sm">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Fecha Previsión:</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setAssignmentDate(getPrevWorkingDay(assignmentDate))}
                  className="p-1 hover:bg-white rounded-lg transition-colors text-slate-400 hover:text-indigo-600"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <div className="flex flex-col items-center min-w-[120px]">
                  <span className="text-[12px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1">
                    {new Date(assignmentDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' })}
                  </span>
                  <input 
                    type="date" 
                    value={assignmentDate} 
                    onChange={(e) => setAssignmentDate(e.target.value)}
                    className="bg-transparent text-base font-black text-slate-800 outline-none cursor-pointer leading-none text-center"
                  />
                </div>
                <button 
                  onClick={() => setAssignmentDate(getNextWorkingDayFromStr(assignmentDate))}
                  className="p-1 hover:bg-white rounded-lg transition-colors text-slate-400 hover:text-indigo-600"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
            {/* Columna de Camiones Disponibles */}
            <div className="lg:col-span-2 bg-slate-50 rounded-3xl p-4 border-2 border-dashed border-slate-200">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Camiones</h3>
              <div className="space-y-2">
                {trucks
                  .filter(t => !dailyAssignments.some(a => a.truck_id === t.id))
                  .filter(t => t.label.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(truck => (
                    <SortableTruckItem key={truck.id} truck={truck} />
                  ))}
                {trucks.filter(t => !dailyAssignments.some(a => a.truck_id === t.id)).length === 0 && (
                  <p className="text-[10px] text-slate-400 text-center italic py-4">Todos asignados</p>
                )}
              </div>
            </div>

            {/* Columnas de Zonas */}
            <div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {ZONES.map(zone => (
                <ZoneColumn 
                  key={zone} 
                  zone={zone} 
                  assignments={dailyAssignments.filter(a => a.zone === zone)}
                  trucks={trucks}
                  onRemove={handleRemoveAssignment}
                  deliveries={deliveries}
                  onEdit={handleEdit}
                  onToggleScheduled={toggleScheduled}
                  onShowLogs={(d) => {
                    if (showHistoryId === d.id) {
                      setShowHistoryId(null);
                    } else {
                      setShowHistoryId(d.id);
                      fetchLogs(d.id);
                    }
                  }}
                  showHistoryId={showHistoryId}
                  deliveryLogs={deliveryLogs}
                  onCloseHistory={() => setShowHistoryId(null)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : view === 'create' ? (
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 animate-fade-in max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Camión / Transportista</label>
                  {newDelivery.truck_id && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Zona:</span>
                      <button 
                        onClick={() => {
                          setPendingZoneTruckId(newDelivery.truck_id!);
                          setIsCreatingAfterZone(false);
                          setShowZoneModal(true);
                        }}
                        className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                      >
                        {trucks.find(t => t.id === newDelivery.truck_id)?.zone || 'SIN ZONA'}
                      </button>
                    </div>
                  )}
                </div>
                <select 
                  value={newDelivery.truck_id || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, truck_id: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={1}
                >
                  <option value="">Seleccionar camión...</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Código Postal (Opcional)</label>
                <input 
                  type="text" 
                  value={newDelivery.postal_code || ''}
                  onChange={e => handlePostalCodeChange(e.target.value)}
                  placeholder="Ej: 28001"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={2}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Población / Localidad</label>
                <div className="relative">
                  {postalCodePlaces.length > 1 ? (
                    <select
                      value={postalCodeLocality}
                      onChange={e => setPostalCodeLocality(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all appearance-none"
                      tabIndex={2.5}
                    >
                      <option value="">-- SELECCIONA LOCALIDAD --</option>
                      {postalCodePlaces.map(place => (
                        <option key={place} value={place}>{place}</option>
                      ))}
                    </select>
                  ) : (
                    <input 
                      type="text" 
                      value={postalCodeLocality}
                      onChange={e => setPostalCodeLocality(e.target.value)}
                      placeholder="Ej: Madrid"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                      tabIndex={2.5}
                    />
                  )}
                  {isSearchingLocality && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  {postalCodePlaces.length > 1 && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Dirección (Opcional)</label>
                <input 
                  type="text" 
                  value={newDelivery.address || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Ej: Calle Mayor, 1"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={2.7}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Número de Pedido</label>
                <input 
                  type="text" 
                  value={newDelivery.order_number || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, order_number: e.target.value }))}
                  placeholder="Ej: 987654"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={3}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Tipo de Mercancía</label>
                <input 
                  type="text" 
                  value={newDelivery.merchandise_type || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, merchandise_type: e.target.value }))}
                  placeholder="Ej: Paletizado / Paquetería"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={4}
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Almacén de Salida</label>
                <select 
                  value={newDelivery.warehouse_origin || '3'}
                  onChange={e => setNewDelivery(prev => ({ ...prev, warehouse_origin: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={5}
                >
                  {WAREHOUSES.map(wh => (
                    <option key={wh.id} value={wh.id}>{wh.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Horario de Entrega</label>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setNewDelivery(prev => ({ ...prev, delivery_time: 'morning' }))}
                    className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${newDelivery.delivery_time === 'morning' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                    tabIndex={6}
                  >
                    Mañana
                  </button>
                  <button 
                    onClick={() => setNewDelivery(prev => ({ ...prev, delivery_time: 'afternoon' }))}
                    className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${newDelivery.delivery_time === 'afternoon' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                    tabIndex={7}
                  >
                    Tarde
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Comentarios / Observaciones</label>
                <textarea 
                  value={newDelivery.comments || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, comments: e.target.value }))}
                  placeholder="Notas para el transportista..."
                  rows={4}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all resize-none"
                  tabIndex={8}
                />
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleCreateDelivery}
            disabled={loading}
            className="w-full bg-slate-900 text-white font-black py-5 rounded-[2rem] shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'PROCESANDO...' : editingId ? 'GUARDAR CAMBIOS' : 'CONFIRMAR Y CREAR'}
          </button>
          
          <button 
            onClick={() => {
              setEditingId(null);
              setNewDelivery({
                warehouse_origin: '3',
                delivery_time: 'morning',
                merchandise_type: ''
              });
              setPostalCodeLocality('');
              setPostalCodePlaces([]);
              setView('agenda');
            }}
            className="w-full mt-4 py-4 bg-slate-100 text-slate-600 font-black rounded-[2rem] uppercase tracking-widest text-xs active:scale-95 transition-all hover:bg-slate-200"
          >
            CANCELAR Y VOLVER
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full max-w-[1800px] mx-auto">
          {/* Print-only Header */}
          <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
            <h1 className="text-3xl font-black uppercase tracking-tighter">Agenda de Repartos</h1>
            <div className="flex justify-between items-end mt-2">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Distribución y Logística</p>
              <p className="text-xl font-black text-slate-900">{new Date(selectedDate).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</p>
            </div>
          </div>

          {/* Tabs de Zonas */}
          <div className="flex flex-col gap-4 mb-2 tabs-container">
            <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
              {['TODOS', 'SIN ZONA', ...ZONES].map(zone => (
                <button
                  key={zone}
                  onClick={() => setActiveZone(zone)}
                  className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeZone === zone 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {zone}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center animate-pulse">
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Cargando agenda de repartos...</p>
            </div>
          ) : trucks.filter(truck => {
              const hasDeliveries = deliveries.some(d => d.truck_id === truck.id);
              const matchesSearch = truck.label.toLowerCase().includes(searchTerm.toLowerCase());
              const dailyAssignment = agendaAssignments.find(a => a.truck_id === truck.id);
              const effectiveZone = dailyAssignment ? dailyAssignment.zone : (truck.zone || 'SIN ZONA');
              const matchesZone = activeZone === 'TODOS' || 
                                (activeZone === 'SIN ZONA' 
                                  ? (effectiveZone === 'SIN ZONA' || effectiveZone === '') 
                                  : effectiveZone === activeZone);
              return (hasDeliveries || !!dailyAssignment) && matchesSearch && matchesZone;
            }).length === 0 ? (
            <div className="bg-white rounded-[3rem] p-20 text-center border border-slate-100 w-full">
              <p className="text-4xl mb-4">🚛</p>
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                {searchTerm ? 'No se encontraron camiones con ese nombre' : 'No hay repartos ni camiones asignados para esta zona/fecha'}
              </p>
            </div>
          ) : trucks.filter(truck => {
              const hasDeliveries = deliveries.some(d => d.truck_id === truck.id);
              const matchesSearch = truck.label.toLowerCase().includes(searchTerm.toLowerCase());
              
              // Determinar la zona efectiva para este día
              const dailyAssignment = agendaAssignments.find(a => a.truck_id === truck.id);
              const effectiveZone = dailyAssignment ? dailyAssignment.zone : (truck.zone || 'SIN ZONA');
              
              const matchesZone = activeZone === 'TODOS' || 
                                (activeZone === 'SIN ZONA' 
                                  ? (effectiveZone === 'SIN ZONA' || effectiveZone === '') 
                                  : effectiveZone === activeZone);
              
              return (hasDeliveries || !!dailyAssignment) && matchesSearch && matchesZone;
            }).map(truck => {
            const truckDeliveries = sortDeliveries(deliveries.filter(d => d.truck_id === truck.id));
            
            // Obtener zona para mostrar en el header
            const dailyAssignment = agendaAssignments.find(a => a.truck_id === truck.id);
            const displayZone = dailyAssignment ? dailyAssignment.zone : (truck.zone || 'SIN ZONA');

            return (
              <div key={truck.id} className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col w-full truck-agenda-item">
                <div className="bg-slate-900 px-6 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleTruckExpand(truck.id)}>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <span className={`text-xl text-white/70 transition-transform duration-300 ${expandedTrucks.has(truck.id) ? 'rotate-0' : '-rotate-90'}`}>
                        {expandedTrucks.has(truck.id) ? '▼' : '▶'}
                      </span>
                      <span className="text-xl">🚚</span>
                      <h4 className="text-white text-sm font-black uppercase tracking-widest">{truck.label}</h4>
                    </div>
                    
                    {dailyAssignment && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAssignment(dailyAssignment.id);
                        }}
                        className="p-1.5 bg-white/10 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-lg border border-white/10 hover:border-red-500/30 transition-all active:scale-95 group/del"
                        title="Eliminar camión de la agenda"
                      >
                        <Trash2 className="w-3.5 h-3.5 group-hover/del:scale-110 transition-transform" />
                      </button>
                    )}
                    
                    <div className="h-6 w-px bg-white/20" />
                    
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">ZONA:</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setPendingZoneTruckId(truck.id);
                            setShowZoneModal(true);
                          }}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all hover:scale-105 active:scale-95 ${dailyAssignment ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/10 text-white/60 border-white/10 hover:bg-white/20'}`}
                          title="Cambiar zona"
                        >
                          {displayZone}
                        </button>
                        {truckDeliveries.length > 0 && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCalculateRoute(truck.id);
                            }}
                            className="bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-emerald-500 transition-all hover:bg-emerald-500 hover:scale-105 active:scale-95 flex items-center gap-2"
                          >
                            <span>🗺️</span>
                            RUTA IA
                          </button>
                        )}
                        {dailyAssignment && (
                          <div className="hidden">Asignado hoy</div>
                        )}
                      </div>
                    </div>

                    <div className="h-6 w-px bg-white/20" />

                    <div className="flex flex-col gap-0.5 min-w-[100px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">AGENDADOS:</span>
                        <span className="text-[11px] font-black text-white">
                          {truckDeliveries.filter(d => d.is_scheduled).length}/{truckDeliveries.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">EN MUELLE:</span>
                        <span className="text-[11px] font-black text-white">
                          {truckDeliveries.filter(d => d.at_dock).length}/{truckDeliveries.length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewDelivery({
                          truck_id: truck.id,
                          warehouse_origin: '3',
                          delivery_time: 'morning',
                          merchandise_type: ''
                        });
                        setView('create');
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                      NUEVO
                    </button>
                    <span className="bg-white/10 text-white/80 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">
                      {truckDeliveries.length} REPARTOS
                    </span>
                  </div>
                </div>
                
                <div className={`grid transition-all duration-500 ease-in-out ${expandedTrucks.has(truck.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="p-3 flex-1 space-y-2">
                      <TruckDroppable truckId={truck.id}>
                        {truckDeliveries.length === 0 ? (
                          <div className="py-10 text-center">
                            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Sin repartos para hoy</p>
                          </div>
                        ) : (
                          <SortableContext items={truckDeliveries.map(d => d.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                              {truckDeliveries.map(delivery => (
                                <SortableAgendaDeliveryItem
                                  key={delivery.id}
                                  delivery={delivery}
                                  onEdit={handleEdit}
                                  onToggleScheduled={toggleScheduled}
                                  onToggleAtDock={toggleAtDock}
                                  onShowLogs={(d) => {
                                    if (showHistoryId === d.id) {
                                      setShowHistoryId(null);
                                    } else {
                                      setShowHistoryId(d.id);
                                      fetchLogs(d.id);
                                    }
                                  }}
                                  showHistoryId={showHistoryId}
                                  deliveryLogs={deliveryLogs}
                                  onCloseHistory={() => setShowHistoryId(null)}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        )}
                      </TruckDroppable>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Selección de Zona */}
      {showZoneModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-scale-in">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                📍
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Asignar Zona al Camión</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                Es el primer pedido agendado para este camión. Selecciona su ruta.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-8">
              <button
                onClick={() => handleAssignZoneAndSchedule('')}
                className="p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border-2 bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
              >
                SIN ZONA
              </button>
              {ZONES.map(zone => (
                <button
                  key={zone}
                  onClick={() => handleAssignZoneAndSchedule(zone)}
                  className="p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border-2 bg-slate-50 hover:bg-indigo-600 hover:text-white border-slate-100 hover:border-indigo-600"
                >
                  {zone}
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => {
                setShowZoneModal(false);
                setPendingZoneTruckId(null);
                setPendingDeliveryId(null);
              }}
              className="w-full py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all"
            >
              CANCELAR
            </button>
          </div>
        </div>
      )}
      {showRouteMap && routeTruckId && (
        <RouteMap 
          truckId={routeTruckId}
          truckLabel={trucks.find(t => t.id === routeTruckId)?.label || ''}
          deliveries={deliveries.filter(d => d.truck_id === routeTruckId)}
          onMaintainRoute={handleMaintainRoute}
          onClose={() => {
            setShowRouteMap(false);
            setRouteTruckId(null);
          }}
        />
      )}
      <ConfirmationModal
        isOpen={showConfirmModal}
        title={confirmModalConfig?.title || ''}
        message={confirmModalConfig?.message || ''}
        onConfirm={() => {
          confirmModalConfig?.onConfirm();
          setShowConfirmModal(false);
        }}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
      <DragOverlay>
        {activeTruckId ? (
          <div className="bg-indigo-600 text-white p-3 rounded-xl shadow-2xl flex items-center gap-2 cursor-grabbing scale-105 rotate-2">
            <Truck className="w-4 h-4" />
            <span className="text-xs font-bold">{trucks.find(t => t.id === activeTruckId)?.label}</span>
          </div>
        ) : activeId ? (
          <div className="bg-white p-4 rounded-xl border-2 border-indigo-500 shadow-2xl opacity-80 scale-105 pointer-events-none">
            <div className="flex items-center gap-3">
              <span className="text-xl">📦</span>
              <div className="flex flex-col">
                <p className="text-sm font-black text-slate-800">
                  {deliveries.find(d => d.id === activeId)?.order_number || 'Moviendo...'}
                </p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {deliveries.find(d => d.id === activeId)?.locality || ''}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default DeliveriesPanel;
