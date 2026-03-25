
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, Installation, Installer, InstallationLog, DailyInstallerAssignment, UserRole } from '../types';
import { 
  DndContext, 
  DragOverlay, 
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
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Wrench, MapPin, Plus, History, Search, Filter, ChevronDown, ChevronRight, Save, X, Trash2, GripVertical, Printer, Navigation, User } from 'lucide-react';
import RouteMap from './RouteMap';
import ConfirmationModal from './ConfirmationModal';
import CustomDatePicker from './CustomDatePicker';

interface InstallationsPanelProps {
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
  '18015': ['Granada', 'Albolote'],
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

const ZONES = ['GRANADA', 'COSTA 1', 'COSTA 2', 'ANTEQUERA', 'ALMERÍA', 'NO DISPONIBLE'];

const TIME_OPTIONS = Array.from({ length: 27 }, (_, i) => {
  const totalMinutes = 8 * 60 + i * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
});

const getNextWorkingDay = (date: Date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) { d.setDate(d.getDate() + 1); }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPrevWorkingDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() - 1);
  while (dateObj.getDay() === 0) { dateObj.setDate(dateObj.getDate() - 1); }
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextWorkingDayFromStr = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + 1);
  while (dateObj.getDay() === 0) { dateObj.setDate(dateObj.getDate() + 1); }
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const SortableInstallerItem: React.FC<{ installer: Installer }> = ({ installer }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: installer.id });

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
        <GripVertical className="w-3 h-3 text-indigo-500 shrink-0" />
        <User className="w-3 h-3 text-indigo-500 shrink-0" />
      </div>
      <span className="text-[10px] font-bold text-slate-700 leading-tight break-words w-full">{installer.full_name}</span>
    </div>
  );
};

const InstallerDroppable = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `installer-${id}` });
  
  return (
    <div 
      ref={setNodeRef} 
      className={`min-h-[50px] transition-colors rounded-xl ${isOver ? 'bg-indigo-500/10 border-2 border-dashed border-indigo-500/30' : ''}`}
    >
      {children}
    </div>
  );
};

const SortableAgendaInstallationItem: React.FC<{ 
  installation: Installation; 
  onEdit: (i: Installation) => void;
  onDelete: (id: string) => void;
  onToggleScheduled: (i: Installation) => void;
  onToggleAtDock: (i: Installation) => void;
  onShowHistory: (id: string) => void;
  showHistoryId: string | null;
  installationLogs: InstallationLog[];
  onCloseHistory: () => void;
  warehouses: { id: string, label: string }[];
}> = ({ 
  installation, 
  onEdit, 
  onDelete, 
  onToggleScheduled, 
  onToggleAtDock, 
  onShowHistory, 
  showHistoryId, 
  installationLogs, 
  onCloseHistory,
  warehouses
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: installation.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className={`p-2 px-6 rounded-xl border transition-all group flex items-center justify-between gap-3 ${installation.at_dock ? 'bg-blue-500 border-blue-600 text-white shadow-lg shadow-blue-100' : installation.is_scheduled ? 'bg-emerald-200 border-emerald-300' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}>
        <div className="flex items-center gap-8 flex-1">
          <div className="flex items-center gap-3 shrink-0">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-black/5 rounded transition-colors">
              <GripVertical className={`w-4 h-4 ${installation.at_dock ? 'text-white' : 'text-indigo-500'}`} />
            </div>
            <div className="w-28 flex flex-col gap-1">
              <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase shadow-sm w-fit ${installation.start_time ? 'bg-indigo-600 text-white border border-indigo-700' : installation.installation_time === 'morning' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}>
                {installation.start_time ? `${installation.start_time} - ${installation.end_time}` : installation.installation_time === 'morning' ? 'MAÑANA' : 'TARDE'}
              </span>
              <p className={`text-base font-black tracking-tighter ${installation.at_dock ? 'text-white' : 'text-slate-800'}`}>{installation.order_number}</p>
              <p className={`text-[11px] font-black uppercase tracking-widest ${installation.at_dock ? 'text-blue-100' : 'text-indigo-600'}`}>
                {warehouses.find(w => w.id === installation.warehouse_origin)?.label || installation.warehouse_origin}
              </p>
            </div>
          </div>

          <div className={`h-12 w-px shrink-0 ${installation.at_dock ? 'bg-white/20' : 'bg-slate-200'}`} />

          <div className="flex-1 flex flex-col justify-center gap-2 py-1">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-1">
              <div className="flex items-center gap-2 min-w-[180px]">
                <span className="text-lg">📍</span>
                <div className="flex flex-col">
                  <p className={`text-[12px] font-bold uppercase leading-tight ${installation.at_dock ? 'text-white' : 'text-slate-700'}`}>
                    {installation.postal_code} - {installation.locality}
                  </p>
                  {installation.address && (
                    <p className={`text-[10px] font-medium uppercase leading-tight mt-0.5 ${installation.at_dock ? 'text-blue-100' : 'text-slate-500'}`}>
                      {installation.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-[150px]">
                <span className="text-lg">📦</span>
                <p className={`text-[12px] font-bold uppercase leading-tight break-words ${installation.at_dock ? 'text-white' : 'text-slate-700'}`}>
                  {installation.merchandise_type}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              {installation.created_by_name && (
                <p className={`text-[8px] font-black uppercase tracking-widest ${installation.at_dock ? 'text-blue-100' : 'text-slate-400'}`}>Por: {installation.created_by_name}</p>
              )}
              {installation.comments && (
                <div className={`px-3 py-1.5 rounded-lg border-l-4 w-full mt-0.5 ${installation.at_dock ? 'bg-white/10 border-white' : 'bg-slate-100/80 border-indigo-500'}`}>
                  <p className={`text-[11px] font-bold italic leading-snug break-words ${installation.at_dock ? 'text-white' : 'text-slate-900'}`}>
                    {installation.comments}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col gap-1 items-center">
            <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-xl border border-slate-100 shadow-sm">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onShowHistory(installation.id);
                }}
                className={`p-1.5 rounded-lg transition-all ${showHistoryId === installation.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-400'}`}
                title="Ver histórico"
              >
                <span className="text-xs">📜</span>
              </button>

              <button onClick={(e) => { e.stopPropagation(); onEdit(installation); }} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all" title="Editar instalación"><span className="text-xs">✏️</span></button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(installation.id); }} className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-all" title="Eliminar instalación"><span className="text-xs">🗑️</span></button>
            </div>

            {installation.at_dock ? (
              <div className="bg-white text-blue-500 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 border border-blue-100">
                <span className="text-xs">⚓</span>
                <span className="text-[9px] font-black uppercase tracking-widest">EN MUELLE</span>
                <button onClick={(e) => { e.stopPropagation(); onToggleAtDock(installation); }} className="ml-1 text-blue-300 hover:text-blue-500" title="Quitar de muelle">✕</button>
              </div>
            ) : installation.is_scheduled ? (
              <div className="flex items-center gap-1.5 w-full">
                <button onClick={(e) => { e.stopPropagation(); onToggleAtDock(installation); }} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg shadow-md hover:bg-indigo-700 transition-all flex items-center gap-1.5 flex-1 justify-center">
                  <span className="text-xs">📦</span>
                  <span className="text-[9px] font-black uppercase tracking-widest">PASAR A MUELLE</span>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onToggleScheduled(installation); }}
                  className="p-1.5 bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all"
                  title="Quitar de agenda"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onToggleScheduled(installation); }} className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-1.5 w-full justify-center">
                <span className="text-xs">📅</span>
                <span className="text-[9px] font-black uppercase tracking-widest">AGENDAR</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showHistoryId === installation.id && (
        <div className="mx-6 mb-4 bg-white rounded-2xl border border-slate-100 shadow-inner p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
            <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Histórico de Movimientos</h5>
            <button onClick={(e) => { e.stopPropagation(); onCloseHistory(); }} className="text-slate-300 hover:text-slate-500 text-xs">✕</button>
          </div>
          <div className="space-y-3">
            {installationLogs.length === 0 ? (
              <p className="text-[9px] text-slate-400 italic text-center py-2">No hay registros para esta instalación</p>
            ) : installationLogs.map(log => (
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

const InstallerZoneColumn: React.FC<{ 
  zone: string; 
  assignments: DailyInstallerAssignment[]; 
  installers: Installer[];
  onRemove: (id: string) => void;
}> = ({ zone, assignments, installers, onRemove }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: zone,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col h-full min-h-[300px] rounded-3xl p-4 transition-all ${
        isOver 
          ? 'bg-indigo-50 border-2 border-indigo-200 ring-4 ring-indigo-50' 
          : zone === 'NO DISPONIBLE'
            ? 'bg-rose-50 border-2 border-rose-100'
            : 'bg-slate-50 border-2 border-transparent'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{zone}</h3>
        <span className="bg-white px-2 py-0.5 rounded-full text-[9px] font-black text-slate-400 border border-slate-200">
          {assignments.length}
        </span>
      </div>
      
      <div className="flex-1 space-y-2">
        {assignments.map(assignment => {
          const installer = installers.find(i => i.id === assignment.installer_id);
          return (
            <div key={assignment.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center gap-1 group animate-scale-in relative">
              <button 
                onClick={() => onRemove(assignment.id)}
                className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 no-print"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <User className="w-3 h-3 text-indigo-500 shrink-0" />
              <span className="text-[10px] font-bold text-slate-700 leading-tight break-words w-full">{installer?.full_name || 'Desconocido'}</span>
            </div>
          );
        })}
        {assignments.length === 0 && !isOver && (
          <div className="flex flex-col items-center justify-center h-full py-8 opacity-40">
            <MapPin className="w-6 h-6 text-slate-300 mb-2" />
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Arrastra aquí</p>
          </div>
        )}
      </div>
    </div>
  );
};

const InstallationsPanel: React.FC<InstallationsPanelProps> = ({ user }) => {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [selectedDate, setSelectedDate] = useState(getNextWorkingDay());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [view, setView] = useState<'agenda' | 'create' | 'daily_installers'>('agenda');
  const [dailyAssignments, setDailyAssignments] = useState<DailyInstallerAssignment[]>([]);
  const [agendaAssignments, setAgendaAssignments] = useState<DailyInstallerAssignment[]>([]);
  const [assignmentDate, setAssignmentDate] = useState(getNextWorkingDay());
  const [activeInstallerId, setActiveInstallerId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeZone, setActiveZone] = useState<string>('TODOS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistoryId, setShowHistoryId] = useState<string | null>(null);
  const [installationLogs, setInstallationLogs] = useState<InstallationLog[]>([]);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [routeInstallerId, setRouteInstallerId] = useState<string | null>(null);
  const [pendingZoneInstallerId, setPendingZoneInstallerId] = useState<string | null>(null);
  const [pendingInstallationId, setPendingInstallationId] = useState<string | null>(null);
  const [isCreatingAfterZone, setIsCreatingAfterZone] = useState(false);
  const [expandedInstallers, setExpandedInstallers] = useState<Set<string>>(new Set());
  
  const [newInstallation, setNewInstallation] = useState<Partial<Installation>>({
    warehouse_origin: '3',
    start_time: '08:00',
    end_time: '09:00',
    merchandise_type: ''
  });
  const [postalCodeLocality, setPostalCodeLocality] = useState('');
  const [postalCodePlaces, setPostalCodePlaces] = useState<string[]>([]);
  const [isSearchingLocality, setIsSearchingLocality] = useState(false);

  useEffect(() => {
    fetchInstallers();
    fetchInstallations(selectedDate);
    fetchAgendaAssignments(selectedDate);
    if (view === 'daily_installers') {
      fetchDailyAssignments(assignmentDate);
    }
  }, [selectedDate, assignmentDate, view]);

  // Sync assignmentDate with selectedDate
  useEffect(() => {
    setAssignmentDate(selectedDate);
  }, [selectedDate]);

  // Sync selectedDate with assignmentDate
  useEffect(() => {
    setSelectedDate(assignmentDate);
  }, [assignmentDate]);

  const fetchAgendaAssignments = async (date: string) => {
    try {
      const { data, error } = await supabase
        .from('daily_installer_assignments')
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
        .from('daily_installer_assignments')
        .select('*')
        .eq('assignment_date', date);
      
      if (error) throw error;
      setDailyAssignments(data || []);
    } catch (err) {
      console.error("Error fetching daily assignments:", err);
    }
  };

  const handleSaveAssignment = async (installerId: string, zone: string) => {
    try {
      const { error } = await supabase
        .from('daily_installer_assignments')
        .upsert({ 
          installer_id: installerId, 
          zone, 
          assignment_date: assignmentDate 
        }, { onConflict: 'installer_id,assignment_date' });
      
      if (error) throw error;
      fetchDailyAssignments(assignmentDate);
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
        .from('daily_installer_assignments')
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

  const sortInstallations = (list: Installation[]) => {
    return [...list].sort((a, b) => {
      // Prioridad absoluta a la secuencia manual
      if (a.sequence !== null && a.sequence !== undefined && b.sequence !== null && b.sequence !== undefined) {
        if (a.sequence !== b.sequence) return a.sequence - b.sequence;
      }
      
      if (a.sequence !== null && a.sequence !== undefined) return -1;
      if (b.sequence !== null && b.sequence !== undefined) return 1;

      // Fallback a hora de inicio si no hay secuencia
      const timeA = a.start_time || (a.installation_time === 'morning' ? '08:00' : '14:00');
      const timeB = b.start_time || (b.installation_time === 'morning' ? '08:00' : '14:00');
      
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id as string;
    if (installers.some(i => i.id === activeId)) {
      setActiveInstallerId(activeId);
    } else {
      setActiveId(activeId);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Solo nos interesa si estamos moviendo una instalación
    const activeInstallation = installations.find(i => i.id === activeId);
    if (!activeInstallation) return;

    // Caso A: Sobre otra instalación
    const overInstallation = installations.find(i => i.id === overId);
    if (overInstallation) {
      if (activeInstallation.installer_id !== overInstallation.installer_id) {
        setInstallations(prev => prev.map(i => 
          i.id === activeId ? { ...i, installer_id: overInstallation.installer_id } : i
        ));
      }
    }
    
    // Caso B: Sobre un contenedor de instalador (droppable) o sobre el propio instalador
    else if (overId.startsWith('installer-') || installers.some(i => i.id === overId)) {
      const targetInstallerId = overId.startsWith('installer-') ? overId.replace('installer-', '') : overId;
      if (activeInstallation.installer_id !== targetInstallerId) {
        setInstallations(prev => prev.map(i => 
          i.id === activeId ? { ...i, installer_id: targetInstallerId } : i
        ));
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveInstallerId(null);
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Caso 1: Arrastrar instalador a una zona
    if (ZONES.includes(overId) && installers.some(i => i.id === activeId)) {
      await handleSaveAssignment(activeId, overId);
      return;
    }

    // Caso 2: Arrastrar instalación para reordenar (dentro del mismo instalador o entre instaladores)
    const activeInstallation = installations.find(i => i.id === activeId);
    if (activeInstallation) {
      const overInstallation = installations.find(i => i.id === overId);
      const targetInstallerId = overInstallation ? overInstallation.installer_id : (overId.startsWith('installer-') ? overId.replace('installer-', '') : (installers.some(i => i.id === overId) ? overId : null));
      
      if (targetInstallerId) {
        // Obtenemos las instalaciones del instalador destino, ORDENADAS
        const installerInstallations = sortInstallations(installations.filter(i => i.installer_id === targetInstallerId));
        
        const oldIndex = installerInstallations.findIndex(i => i.id === activeId);
        let newIndex = overInstallation ? installerInstallations.findIndex(i => i.id === overId) : installerInstallations.length;

        if (oldIndex !== -1) {
          // Reordenar dentro del mismo instalador (o ya movido por handleDragOver)
          if (oldIndex !== newIndex || activeInstallation.installer_id !== targetInstallerId) {
            const newOrdered = arrayMove(installerInstallations, oldIndex, newIndex);
            
            const otherInstallations = installations.filter(i => i.installer_id !== targetInstallerId);
            setInstallations([...otherInstallations, ...newOrdered]);
            
            // Actualizar installer_id en DB por si acaso cambió
            await supabase.from('installations').update({ installer_id: targetInstallerId }).eq('id', activeId);
            
            await handleMaintainRoute(newOrdered, true);
          }
        } else {
          // Mover a otro instalador (si handleDragOver no lo hizo)
          const newOrdered = [...installerInstallations];
          const newItem = { ...activeInstallation, installer_id: targetInstallerId };
          newOrdered.splice(newIndex, 0, newItem);
          
          const otherInstallations = installations.filter(i => i.installer_id !== targetInstallerId && i.id !== activeId);
          setInstallations([...otherInstallations, ...newOrdered]);
          
          await supabase.from('installations').update({ 
            installer_id: targetInstallerId
          }).eq('id', activeId);
          
          await handleMaintainRoute(newOrdered, true);
        }
      }
    }
  };

  const fetchInstallers = async () => {
    try {
      const { data, error } = await supabase.from('installers').select('*').order('full_name');
      if (error) throw error;
      setInstallers(data || []);
    } catch (err) {
      console.error("Error fetching installers:", err);
    }
  };

  const handleUpdateInstallerZone = async (installerId: string, zone: string) => {
    try {
      const { error } = await supabase
        .from('installers')
        .update({ zone })
        .eq('id', installerId);
      
      if (error) throw error;
      setInstallers(prev => prev.map(i => i.id === installerId ? { ...i, zone } : i));
    } catch (err) {
      console.error("Error updating installer zone:", err);
    }
  };

  const handleAssignZoneAndSchedule = async (zone: string) => {
    if (!pendingZoneInstallerId) return;
    
    try {
      await handleUpdateInstallerZone(pendingZoneInstallerId, zone);
      
      if (isCreatingAfterZone) {
        await handleCreateInstallation();
        setIsCreatingAfterZone(false);
      } 
      else if (pendingInstallationId) {
        const installation = installations.find(i => i.id === pendingInstallationId);
        if (installation) {
          await toggleScheduled(installation, true);
        }
      }
      else {
        await supabase
          .from('daily_installer_assignments')
          .upsert({ 
            installer_id: pendingZoneInstallerId, 
            zone, 
            assignment_date: selectedDate 
          }, { onConflict: 'installer_id,assignment_date' });
        
        fetchAgendaAssignments(selectedDate);
      }
      
      setShowZoneModal(false);
      setPendingZoneInstallerId(null);
      setPendingInstallationId(null);
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

  const fetchInstallations = async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('installations')
        .select('*')
        .eq('installation_date', date)
        .order('sequence', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setInstallations(data || []);
    } catch (err) {
      console.error("Error fetching installations:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (installationId: string) => {
    try {
      const { data, error } = await supabase
        .from('installation_logs')
        .select('*')
        .eq('installation_id', installationId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setInstallationLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const addLog = async (installationId: string, action: string, details?: string) => {
    try {
      await supabase.from('installation_logs').insert([{
        installation_id: installationId,
        user_name: user.full_name,
        action,
        details
      }]);
    } catch (err) {
      console.error("Error adding log:", err);
    }
  };

  const toggleInstallerExpand = (installerId: string) => {
    setExpandedInstallers(prev => {
      const next = new Set(prev);
      if (next.has(installerId)) next.delete(installerId);
      else next.add(installerId);
      return next;
    });
  };

  const handleCalculateRoute = (installerId: string) => {
    setRouteInstallerId(installerId);
    setShowRouteMap(true);
  };

  const handleMaintainRoute = async (orderedInstallations: Installation[], skipLocalUpdate: boolean = false) => {
    if (orderedInstallations.length === 0) return;
    
    if (!skipLocalUpdate) {
      setLoading(true);
    }
    
    try {
      const updatePromises = orderedInstallations.map((d, i) => 
        supabase
          .from('installations')
          .update({ sequence: i + 1 })
          .eq('id', d.id)
      );

      const results = await Promise.all(updatePromises);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) throw firstError;

      if (!skipLocalUpdate) {
        setMessage({ type: 'success', text: 'Orden de ruta guardado correctamente' });
        fetchInstallations(selectedDate);
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err: any) {
      console.error("Error updating sequence:", err);
      setMessage({ type: 'error', text: `Error al guardar el orden: ${err.message}` });
      if (skipLocalUpdate) {
        fetchInstallations(selectedDate); // Re-fetch en caso de error para restaurar estado
      }
    } finally {
      if (!skipLocalUpdate) {
        setLoading(false);
      }
    }
  };

  const handleCreateInstallation = async () => {
    if (!newInstallation.installer_id || !newInstallation.order_number) {
      setMessage({ type: 'error', text: 'Faltan campos obligatorios (Instalador y Pedido)' });
      return;
    }

    const installer = installers.find(i => i.id === newInstallation.installer_id);
    const hasNoZone = !installer?.zone || installer.zone.trim() === '' || installer.zone === 'SIN ZONA';
    
    if (installer && hasNoZone && !isCreatingAfterZone) {
      setPendingZoneInstallerId(newInstallation.installer_id);
      setIsCreatingAfterZone(true);
      setShowZoneModal(true);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...newInstallation,
        installation_date: selectedDate,
        locality: postalCodeLocality,
        created_by_name: user.full_name
      };

      if (editingId) {
        const { error } = await supabase
          .from('installations')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        await addLog(editingId, 'EDICIÓN', `Pedido: ${payload.order_number}`);
        setMessage({ type: 'success', text: 'Instalación actualizada correctamente' });
      } else {
        const { data, error } = await supabase.from('installations').insert([payload]).select();
        if (error) throw error;
        if (data && data[0]) {
          await addLog(data[0].id, 'CREACIÓN', `Pedido inicial: ${payload.order_number}`);
        }
        setMessage({ type: 'success', text: 'Instalación creada correctamente' });
      }

      setNewInstallation({
        warehouse_origin: '3',
        start_time: '08:00',
        end_time: '09:00',
        merchandise_type: '',
        address: ''
      });
      setPostalCodeLocality('');
      setPostalCodePlaces([]);
      setEditingId(null);
      fetchInstallations(selectedDate);
      setView('agenda');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (installation: Installation) => {
    setNewInstallation({
      installer_id: installation.installer_id,
      order_number: installation.order_number,
      warehouse_origin: installation.warehouse_origin,
      start_time: installation.start_time || '08:00',
      end_time: installation.end_time || '09:00',
      postal_code: installation.postal_code,
      address: installation.address,
      merchandise_type: installation.merchandise_type,
      comments: installation.comments,
      is_scheduled: installation.is_scheduled
    });
    setPostalCodeLocality(installation.locality || '');
    
    if (installation.postal_code && installation.postal_code.length === 5) {
      const localValue = POSTAL_CODES[installation.postal_code];
      if (localValue) {
        const places = Array.isArray(localValue) ? localValue : [localValue];
        setPostalCodePlaces(places);
      }
    } else {
      setPostalCodePlaces([]);
    }

    setEditingId(installation.id);
    setView('create');
  };

  const toggleScheduled = async (installation: Installation, forceValue?: boolean) => {
    try {
      const newStatus = forceValue !== undefined ? forceValue : !installation.is_scheduled;
      
      if (newStatus && !installation.is_scheduled && forceValue === undefined) {
        const installer = installers.find(i => i.id === installation.installer_id);
        const hasNoZone = !installer?.zone || installer.zone.trim() === '' || installer.zone === 'SIN ZONA';
        
        if (installer && hasNoZone) {
          setPendingZoneInstallerId(installation.installer_id);
          setPendingInstallationId(installation.id);
          setShowZoneModal(true);
          return;
        }
      }

      const { error } = await supabase
        .from('installations')
        .update({ is_scheduled: newStatus, at_dock: false })
        .eq('id', installation.id);
      
      if (error) throw error;
      
      await addLog(installation.id, newStatus ? 'AGENDADO' : 'DESAGENDADO');
      
      setInstallations(prev => prev.map(i => 
        i.id === installation.id ? { ...i, is_scheduled: newStatus, at_dock: false } : i
      ));
    } catch (err) {
      console.error("Error toggling scheduled status:", err);
    }
  };

  const toggleAtDock = async (installation: Installation) => {
    try {
      const newStatus = !installation.at_dock;
      const { error } = await supabase
        .from('installations')
        .update({ at_dock: newStatus })
        .eq('id', installation.id);
      
      if (error) throw error;
      
      await addLog(installation.id, newStatus ? 'LISTO' : 'PENDIENTE');
      
      setInstallations(prev => prev.map(i => 
        i.id === installation.id ? { ...i, at_dock: newStatus } : i
      ));
    } catch (err) {
      console.error("Error toggling status:", err);
    }
  };

  const handleDeleteInstallation = async (id: string) => {
    confirm(
      '¿Eliminar instalación?',
      '¿Estás seguro de que deseas eliminar esta instalación permanentemente?',
      async () => {
        setLoading(true);
        try {
          const { error } = await supabase
            .from('installations')
            .delete()
            .eq('id', id);
          
          if (error) throw error;
          
          setInstallations(prev => prev.filter(i => i.id !== id));
          setMessage({ type: 'success', text: 'Instalación eliminada correctamente' });
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
    setNewInstallation(prev => ({ ...prev, postal_code: code }));
    setPostalCodePlaces([]);
    
    if (code.length === 5) {
      setIsSearchingLocality(true);
      try {
        const response = await window.fetch(`https://api.zippopotam.us/es/${code}`);
        if (response.ok) {
          const data = await response.json();
          if (data.places && data.places.length > 0) {
            const places = data.places.map((p: any) => p['place name'].toUpperCase());
            const uniquePlaces = Array.from(new Set(places)) as string[];
            setPostalCodePlaces(uniquePlaces);
            if (uniquePlaces.length === 1) setPostalCodeLocality(uniquePlaces[0]);
            else setPostalCodeLocality('');
          }
        } else {
          const localValue = POSTAL_CODES[code];
          if (localValue) {
            const places = Array.isArray(localValue) ? localValue : [localValue];
            setPostalCodePlaces(places);
            if (places.length === 1) setPostalCodeLocality(places[0]);
            else setPostalCodeLocality('');
          }
        }
      } catch (err) {
        console.error("Error buscando localidad:", err);
      } finally {
        setIsSearchingLocality(false);
      }
    }
  };

  const activeInstallersForDay = installers.filter(installer => 
    installations.some(i => i.installer_id === installer.id) ||
    agendaAssignments.some(a => a.installer_id === installer.id)
  );

  return (
    <div className="p-2 md:p-4 w-full animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6 max-w-[1800px] mx-auto no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Agenda de Instalaciones</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Servicio Técnico e Instalaciones</p>
          
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4 bg-white/50 p-4 rounded-2xl border border-slate-100 shadow-sm no-print">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Día:</span>
              <span className="text-[12px] font-black text-slate-700">{new Date(selectedDate).toLocaleDateString('es-ES')}</span>
            </div>
            <div className="h-4 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Instaladores:</span>
              <span className="text-[12px] font-black text-slate-700">{activeInstallersForDay.length}</span>
            </div>
            <div className="h-4 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total:</span>
              <span className="text-[12px] font-black text-indigo-600">{installations.length}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <Search className="w-3 h-3 text-slate-400" />
            <input 
              type="text" 
              placeholder="Instalador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-24 md:w-32"
            />
          </div>
          <div className="flex items-center gap-3 bg-white px-5 py-2 rounded-2xl border-2 border-slate-200 shadow-md hover:border-indigo-300 transition-all no-print">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Fecha Agenda:</span>
            <button onClick={() => setSelectedDate(getPrevWorkingDay(selectedDate))} className="p-1 text-slate-400 hover:text-indigo-600">
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <CustomDatePicker 
              selectedDate={selectedDate} 
              onChange={setSelectedDate} 
            />
            <button onClick={() => setSelectedDate(getNextWorkingDayFromStr(selectedDate))} className="p-1 text-slate-400 hover:text-indigo-600">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {(user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR_DISTRI) && (
            <button 
              onClick={() => setView(view === 'daily_installers' ? 'agenda' : 'daily_installers')}
              className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center gap-2 ${view === 'daily_installers' ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-white text-emerald-600 border-2 border-emerald-100 shadow-slate-100 hover:border-emerald-300'}`}
            >
              <User className="w-4 h-4" />
              {view === 'daily_installers' ? 'Ver Agenda' : 'Instaladores del Día'}
            </button>
          )}
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

      {view === 'daily_installers' ? (
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Previsión de Instaladores</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Asigna instaladores a zonas</p>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 px-5 py-2 rounded-2xl border-2 border-slate-100 shadow-sm">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Fecha Previsión:</span>
              <button onClick={() => setAssignmentDate(getPrevWorkingDay(assignmentDate))} className="p-1 text-slate-400 hover:text-indigo-600">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <CustomDatePicker 
                selectedDate={assignmentDate} 
                onChange={setAssignmentDate} 
              />
              <button onClick={() => setAssignmentDate(getNextWorkingDayFromStr(assignmentDate))} className="p-1 text-slate-400 hover:text-indigo-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <DndContext 
            sensors={sensors} 
            collisionDetection={pointerWithin} 
            onDragStart={handleDragStart} 
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
              <div className="lg:col-span-2 bg-slate-50 rounded-3xl p-4 border-2 border-dashed border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Instaladores</h3>
                <div className="space-y-2">
                  {installers
                    .filter(i => !dailyAssignments.some(a => a.installer_id === i.id))
                    .filter(i => i.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(installer => (
                      <SortableInstallerItem key={installer.id} installer={installer} />
                    ))}
                </div>
              </div>
              <div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
                {ZONES.map(zone => (
                  <InstallerZoneColumn 
                    key={zone} 
                    zone={zone} 
                    assignments={dailyAssignments.filter(a => a.zone === zone)}
                    installers={installers}
                    onRemove={handleRemoveAssignment}
                  />
                ))}
              </div>
            </div>
            <DragOverlay>
              {activeInstallerId ? (
                <div className="bg-indigo-600 text-white p-3 rounded-xl shadow-2xl flex items-center gap-2 cursor-grabbing scale-105 rotate-2">
                  <User className="w-4 h-4" />
                  <span className="text-xs font-bold">{installers.find(i => i.id === activeInstallerId)?.full_name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      ) : view === 'create' ? (
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 animate-fade-in max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-2">Instalador</label>
                <select 
                  value={newInstallation.installer_id || ''}
                  onChange={e => setNewInstallation(prev => ({ ...prev, installer_id: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={1}
                >
                  <option value="">Seleccionar instalador...</option>
                  {installers.filter(i => {
                    const assignment = agendaAssignments.find(a => a.installer_id === i.id);
                    return !assignment || assignment.zone !== 'NO DISPONIBLE';
                  }).map(i => (
                    <option key={i.id} value={i.id}>{i.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Código Postal</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={newInstallation.postal_code || ''} 
                    onChange={e => handlePostalCodeChange(e.target.value)} 
                    placeholder="Ej: 28001" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                    tabIndex={2}
                  />
                  {isSearchingLocality && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
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
                  value={newInstallation.address || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, address: e.target.value }))} 
                  placeholder="Ej: Calle Mayor, 1" 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={2.7}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Número de Pedido</label>
                <input 
                  type="text" 
                  value={newInstallation.order_number || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, order_number: e.target.value }))} 
                  placeholder="Ej: 987654" 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={3}
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Almacén de Origen</label>
                <select 
                  value={newInstallation.warehouse_origin || '3'}
                  onChange={e => setNewInstallation(prev => ({ ...prev, warehouse_origin: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={4}
                >
                  {WAREHOUSES.map(wh => (
                    <option key={wh.id} value={wh.id}>{wh.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Tipo de Mercancía</label>
                <input 
                  type="text" 
                  value={newInstallation.merchandise_type || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, merchandise_type: e.target.value }))} 
                  placeholder="Ej: Aire Acondicionado / Electrodoméstico" 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={4}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Horario de Instalación</label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block ml-1">Inicio</label>
                    <select 
                      value={newInstallation.start_time || '08:00'}
                      onChange={e => setNewInstallation(prev => ({ ...prev, start_time: e.target.value }))}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                      tabIndex={6}
                    >
                      {TIME_OPTIONS.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block ml-1">Fin</label>
                    <select 
                      value={newInstallation.end_time || '09:00'}
                      onChange={e => setNewInstallation(prev => ({ ...prev, end_time: e.target.value }))}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                      tabIndex={7}
                    >
                      {TIME_OPTIONS.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Comentarios / Observaciones</label>
                <textarea 
                  value={newInstallation.comments || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, comments: e.target.value }))} 
                  placeholder="Notas para el instalador..." 
                  rows={4} 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all resize-none"
                  tabIndex={8}
                />
              </div>
            </div>
          </div>
          <button onClick={handleCreateInstallation} disabled={loading} className="w-full bg-slate-900 text-white font-black py-5 rounded-[2rem] shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all disabled:opacity-50">
            {loading ? 'PROCESANDO...' : editingId ? 'GUARDAR CAMBIOS' : 'CONFIRMAR Y CREAR'}
          </button>
          <button 
            onClick={() => {
              setEditingId(null);
              setNewInstallation({
                warehouse_origin: '3',
                start_time: '08:00',
                end_time: '09:00',
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
        <DndContext 
          sensors={sensors} 
          collisionDetection={pointerWithin} 
          onDragStart={handleDragStart} 
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-6 w-full max-w-[1800px] mx-auto">
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
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Cargando agenda de instalaciones...</p>
            </div>
          ) : installers.filter(installer => {
              const hasInstallations = installations.some(i => i.installer_id === installer.id);
              const matchesSearch = installer.full_name.toLowerCase().includes(searchTerm.toLowerCase());
              const dailyAssignment = agendaAssignments.find(a => a.installer_id === installer.id);
              const effectiveZone = dailyAssignment ? dailyAssignment.zone : (installer.zone || 'SIN ZONA');
              const matchesZone = activeZone === 'TODOS' || (activeZone === 'SIN ZONA' ? (effectiveZone === 'SIN ZONA' || effectiveZone === '') : effectiveZone === activeZone);
              return (hasInstallations || !!dailyAssignment) && matchesSearch && matchesZone;
            }).length === 0 ? (
            <div className="bg-white rounded-[3rem] p-20 text-center border border-slate-100 w-full">
              <p className="text-4xl mb-4">👷</p>
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                {searchTerm ? 'No se encontraron instaladores con ese nombre' : 'No hay instalaciones ni instaladores asignados para esta zona/fecha'}
              </p>
            </div>
          ) : installers.filter(installer => {
              const hasInstallations = installations.some(i => i.installer_id === installer.id);
              const matchesSearch = installer.full_name.toLowerCase().includes(searchTerm.toLowerCase());
              const dailyAssignment = agendaAssignments.find(a => a.installer_id === installer.id);
              const effectiveZone = dailyAssignment ? dailyAssignment.zone : (installer.zone || 'SIN ZONA');
              const matchesZone = activeZone === 'TODOS' || (activeZone === 'SIN ZONA' ? (effectiveZone === 'SIN ZONA' || effectiveZone === '') : effectiveZone === activeZone);
              return (hasInstallations || !!dailyAssignment) && matchesSearch && matchesZone;
            }).map(installer => {
            const installerInstallations = sortInstallations(installations.filter(i => i.installer_id === installer.id));
            
            const dailyAssignment = agendaAssignments.find(a => a.installer_id === installer.id);
            const displayZone = dailyAssignment ? dailyAssignment.zone : (installer.zone || 'SIN ZONA');

            return (
              <div key={installer.id} className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col w-full">
                <div className="bg-slate-900 px-6 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleInstallerExpand(installer.id)}>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <span className={`text-xl text-white/70 transition-transform duration-300 ${expandedInstallers.has(installer.id) ? 'rotate-0' : '-rotate-90'}`}>
                        {expandedInstallers.has(installer.id) ? '▼' : '▶'}
                      </span>
                      <span className="text-xl">👷</span>
                      <h4 className="text-white text-sm font-black uppercase tracking-widest">{installer.full_name}</h4>
                    </div>
                    
                    <div className="h-6 w-px bg-white/20" />
                    
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">ZONA:</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { setPendingZoneInstallerId(installer.id); setShowZoneModal(true); }} 
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all hover:scale-105 active:scale-95 ${dailyAssignment ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/10 text-white/60 border-white/10 hover:bg-white/20'}`}
                          title="Cambiar zona"
                        >
                          {displayZone}
                        </button>
                        {installerInstallations.length > 0 && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCalculateRoute(installer.id);
                            }}
                            className="bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-emerald-500 transition-all hover:bg-emerald-500 hover:scale-105 active:scale-95 flex items-center gap-2"
                          >
                            <span>🗺️</span>
                            RUTA IA
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="h-6 w-px bg-white/20" />

                    <div className="flex flex-col gap-0.5 min-w-[100px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">AGENDADOS:</span>
                        <span className="text-[11px] font-black text-white">
                          {installerInstallations.filter(i => i.is_scheduled).length}/{installerInstallations.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">EN MUELLE:</span>
                        <span className="text-[11px] font-black text-white">
                          {installerInstallations.filter(i => i.at_dock).length}/{installerInstallations.length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {installerInstallations.length === 0 && dailyAssignment && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          confirm(
                            '¿Quitar instalador?',
                            '¿Estás seguro de que deseas quitar este instalador de la agenda de hoy?',
                            () => handleRemoveAssignment(dailyAssignment.id)
                          );
                        }}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        ELIMINAR
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setNewInstallation({ installer_id: installer.id, warehouse_origin: '3', start_time: '08:00', end_time: '09:00', merchandise_type: '' }); setView('create'); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95">NUEVO</button>
                    <span className="bg-white/10 text-white/80 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">{installerInstallations.length} TAREAS</span>
                  </div>
                </div>
                
                <div className={`grid transition-all duration-500 ease-in-out ${expandedInstallers.has(installer.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="p-3 space-y-2">
                      <InstallerDroppable id={installer.id}>
                        {installerInstallations.length === 0 ? (
                          <div className="py-10 text-center">
                            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Sin instalaciones para hoy</p>
                          </div>
                        ) : (
                          <SortableContext 
                            items={installerInstallations.map(i => i.id)} 
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {installerInstallations.map(installation => (
                                <SortableAgendaInstallationItem
                                  key={installation.id}
                                  installation={installation}
                                  onEdit={handleEdit}
                                  onDelete={handleDeleteInstallation}
                                  onToggleScheduled={toggleScheduled}
                                  onToggleAtDock={toggleAtDock}
                                  onShowHistory={(id) => {
                                    if (showHistoryId === id) setShowHistoryId(null);
                                    else {
                                      setShowHistoryId(id);
                                      fetchLogs(id);
                                    }
                                  }}
                                  showHistoryId={showHistoryId}
                                  installationLogs={installationLogs}
                                  onCloseHistory={() => setShowHistoryId(null)}
                                  warehouses={WAREHOUSES}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        )}
                      </InstallerDroppable>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <DragOverlay>
          {activeId && (
            <div className="bg-white p-4 rounded-xl border-2 border-indigo-500 shadow-2xl opacity-80 scale-105 pointer-events-none">
              <div className="flex items-center gap-3">
                <span className="text-xl">📦</span>
                <div className="flex flex-col">
                  <p className="text-sm font-black text-slate-800">
                    {installations.find(i => i.id === activeId)?.order_number || 'Moviendo...'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {installations.find(i => i.id === activeId)?.locality || ''}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    )}

      {showZoneModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-scale-in">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                📍
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Asignar Zona al Instalador</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                Es el primer pedido agendado para este instalador. Selecciona su ruta.
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
                setPendingZoneInstallerId(null);
                setPendingInstallationId(null);
              }} 
              className="w-full py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all"
            >
              CANCELAR
            </button>
          </div>
        </div>
      )}

      {showRouteMap && routeInstallerId && (
        <RouteMap 
          truckId={routeInstallerId}
          truckLabel={installers.find(i => i.id === routeInstallerId)?.full_name || ''}
          deliveries={installations.filter(i => i.installer_id === routeInstallerId)}
          onMaintainRoute={handleMaintainRoute}
          onClose={() => {
            setShowRouteMap(false);
            setRouteInstallerId(null);
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
  );
};

export default InstallationsPanel;
