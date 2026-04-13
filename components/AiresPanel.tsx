
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, Installation, Installer, DailyInstallerAssignment, UserRole } from '../types';
import { 
  Calendar, User, ChevronLeft, ChevronRight, Search, Filter, LayoutGrid, List, Plus, X, 
  Trash2, MapPin, Clock, Package, Info, CheckCircle2, AlertCircle, Save, ArrowRight
} from 'lucide-react';
import { 
  DndContext, 
  DragOverlay, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  pointerWithin,
  useDroppable,
  useDraggable
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ZONES = ['GRANADA', 'COSTA 1', 'COSTA 2', 'ANTEQUERA', 'ALMERÍA', 'SIN ZONA', 'NO DISPONIBLE'];

const isSpecialInstaller = (name: string) => {
  const n = (name || '').toUpperCase();
  return n.includes('12 ABEL') || n.includes('ABEL 12');
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

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const TIME_OPTIONS = Array.from({ length: 25 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8;
  const minute = i % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${minute}`;
}).filter(t => {
  const [h] = t.split(':').map(Number);
  return h <= 20;
});

interface AiresPanelProps {
  user: UserProfile;
}

// --- Helper Components for DND ---
const DraggableInstallerItem = ({ installer }: { installer: any }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: installer.id,
    data: { type: 'installer', installer }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 1,
  } : undefined;

  const isSpecial = isSpecialInstaller(installer?.full_name);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className={`p-3 rounded-xl border shadow-sm flex items-center gap-2 cursor-grab active:cursor-grabbing transition-all group ${
        isSpecial 
          ? 'bg-rose-50 border-rose-200 hover:border-rose-400' 
          : 'bg-white border-slate-200 hover:border-indigo-300'
      }`}
    >
      <User className={`w-4 h-4 ${isSpecial ? 'text-rose-500' : 'text-slate-400 group-hover:text-indigo-500'}`} />
      <span className={`text-[10px] font-bold uppercase truncate ${isSpecial ? 'text-rose-700' : 'text-slate-700'}`}>
        {installer?.full_name}
      </span>
    </div>
  );
};

const DraggableAssignedInstaller = ({ assignment, installer, onRemove }: { assignment: any, installer: any, onRemove: (id: string) => void }) => {
  const isVirtual = assignment.id.toString().startsWith('virtual-');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: assignment.id,
    data: { 
      type: 'assigned_installer', 
      assignment, 
      installer,
      isVirtual 
    }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 1,
  } : undefined;

  const isSpecial = isSpecialInstaller(installer?.full_name);

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 rounded-xl border shadow-sm flex items-center justify-between group animate-in fade-in slide-in-from-bottom-2 cursor-grab active:cursor-grabbing ${
        isSpecial 
          ? 'bg-rose-50 border-rose-200' 
          : isVirtual 
            ? 'bg-indigo-50/50 border-indigo-100 border-dashed' 
            : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <User className={`w-3 h-3 ${isSpecial ? 'text-rose-500' : isVirtual ? 'text-indigo-300' : 'text-indigo-500'}`} />
        <span className={`text-[10px] font-bold uppercase truncate ${isSpecial ? 'text-rose-700' : isVirtual ? 'text-slate-400' : 'text-slate-700'}`}>
          {installer?.full_name || 'Desconocido'}
          {isVirtual && <span className="ml-1 text-[7px] opacity-50">(DEF)</span>}
        </span>
      </div>
      {!isVirtual && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onRemove(assignment.id);
          }} 
          className="text-slate-300 hover:text-rose-500 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

const InstallerZoneColumn = ({ zone, assignments, installers, onRemove }: { zone: string, assignments: any[], installers: any[], onRemove: (id: string) => void }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: zone,
    data: { type: 'zone', zone }
  });

  return (
    <div 
      ref={setNodeRef}
      className={`bg-slate-50 rounded-3xl p-4 border-2 transition-colors flex flex-col min-h-[150px] ${
        isOver ? 'bg-indigo-100 border-indigo-300' : 'border-slate-100'
      }`}
    >
      <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">{zone}</h3>
      <div className="space-y-2 flex-1">
        {assignments.map(assignment => {
          const installer = installers.find(i => i.id === (assignment.installer_id || assignment.id.replace('virtual-', '')));
          return (
            <DraggableAssignedInstaller 
              key={assignment.id} 
              assignment={assignment} 
              installer={installer} 
              onRemove={onRemove} 
            />
          );
        })}
        {assignments.length === 0 && (
          <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl py-8">
            <span className="text-[8px] font-bold text-slate-300 uppercase">Sin Asignar</span>
          </div>
        )}
      </div>
    </div>
  );
};

const DroppableAvailableArea = ({ children }: { children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'available-area',
    data: { type: 'available' }
  });

  return (
    <div 
      ref={setNodeRef}
      className={`lg:col-span-2 rounded-3xl p-4 border-2 transition-colors ${
        isOver ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-dashed border-slate-200'
      }`}
    >
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Disponibles (Sin Zona)</h3>
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
        {children}
      </div>
    </div>
  );
};

const DraggableInstallation = ({ inst, onClick }: { inst: Installation, onClick: () => void }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: inst.id,
    data: { type: 'installation', installation: inst }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 100 : 1,
  } : undefined;

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`p-2 rounded-lg border-2 text-xs font-black leading-tight shadow-sm transition-all cursor-grab active:cursor-grabbing relative overflow-hidden group/item ${
        inst.at_dock 
          ? 'bg-blue-600 border-blue-700 text-white' 
          : inst.is_scheduled 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
            : 'bg-white border-slate-100 text-slate-700'
      }`}
      title={`${inst.order_number} - ${inst.locality}\n${inst.merchandise_type}`}
    >
      <div className="flex justify-between items-start gap-1 relative z-10">
        <span className="truncate">{inst.order_number}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-md shrink-0 ${
          inst.at_dock ? 'bg-white/20' : 'bg-slate-100 text-slate-500'
        }`}>
          {inst.start_time || (inst.installation_time === 'morning' ? 'M' : 'T')}
        </span>
      </div>
      <div className={`text-[10px] truncate mt-1 relative z-10 ${
        inst.at_dock ? 'text-blue-100' : 'text-slate-400'
      }`}>
        {inst.locality}
      </div>
      {inst.at_dock && (
        <div className="absolute -right-1 -bottom-1 text-white/10 text-xl font-black rotate-12 group-hover/item:scale-150 transition-transform">🚛</div>
      )}
    </div>
  );
};

const DroppableCell = ({ installerId, date, children, isToday, isWeekend }: { installerId: string, date: Date, children: React.ReactNode, isToday: boolean, isWeekend: boolean }) => {
  const dateStr = formatDate(date);
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${installerId}-${dateStr}`,
    data: { type: 'cell', installerId, dateStr }
  });

  return (
    <td 
      ref={setNodeRef}
      className={`p-1 border-r border-slate-100 align-top transition-colors ${
        isOver ? 'bg-indigo-100' : isToday ? 'bg-indigo-50/30' : isWeekend ? 'bg-slate-50/80' : ''
      }`}
    >
      {children}
    </td>
  );
};

const AiresPanel: React.FC<AiresPanelProps> = ({ user }) => {
  const [view, setView] = useState<'grid' | 'create' | 'daily_installers'>('grid');
  const [installers, setInstallers] = useState<any[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [selectedInstallation, setSelectedInstallation] = useState<Installation | null>(null);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // State for creation/edition
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newInstallation, setNewInstallation] = useState<Partial<Installation>>({
    warehouse_origin: '3',
    start_time: '08:00',
    end_time: '09:00',
    merchandise_type: '',
    address: ''
  });

  // State for daily assignments
  const [dailyAssignments, setDailyAssignments] = useState<DailyInstallerAssignment[]>([]);
  const [assignmentDate, setAssignmentDate] = useState(formatDate(new Date()));
  const [activeInstallerId, setActiveInstallerId] = useState<string | null>(null);
  const [activeInstallation, setActiveInstallation] = useState<Installation | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Generate 5 working days from startDate (skip Sundays)
  const dates = useMemo(() => {
    const days = [];
    let current = new Date(startDate);
    while (days.length < 5) {
      if (current.getDay() !== 0) { // Skip Sunday
        days.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [startDate]);

  const moveDays = (direction: number) => {
    let current = new Date(startDate);
    let moved = 0;
    const step = direction > 0 ? 1 : -1;
    const target = Math.abs(direction);
    while (moved < target) {
      current.setDate(current.getDate() + step);
      if (current.getDay() !== 0) {
        moved++;
      }
    }
    setStartDate(current);
  };

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: installersData } = await supabase.from('installers').select('*').order('full_name');
      
      const endRange = new Date(startDate);
      endRange.setDate(endRange.getDate() + 15); // Fetch a bit more to be safe
      
      const { data: installationsData } = await supabase
        .from('installations')
        .select('*')
        .gte('installation_date', formatDate(startDate))
        .lte('installation_date', formatDate(endRange));

      const { data: assignmentsData } = await supabase
        .from('daily_installer_assignments')
        .select('*')
        .eq('assignment_date', assignmentDate);

      setInstallers(installersData || []);
      setInstallations(installationsData || []);
      setDailyAssignments(assignmentsData || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, assignmentDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateInstallation = async () => {
    if (!newInstallation.installer_id || !newInstallation.order_number) {
      setMessage({ type: 'error', text: 'Faltan campos obligatorios (Instalador y Pedido)' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...newInstallation,
        created_by_name: user.full_name
      };

      if (editingId) {
        const { error } = await supabase
          .from('installations')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Instalación actualizada correctamente' });
      } else {
        const { error } = await supabase.from('installations').insert([payload]);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Instalación creada correctamente' });
      }

      setNewInstallation({
        warehouse_origin: '3',
        start_time: '08:00',
        end_time: '09:00',
        merchandise_type: '',
        address: ''
      });
      setEditingId(null);
      fetchData();
      setView('grid');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleScheduled = async (installation: Installation) => {
    try {
      const newStatus = !installation.is_scheduled;
      const { error } = await supabase
        .from('installations')
        .update({ is_scheduled: newStatus, at_dock: false })
        .eq('id', installation.id);
      
      if (error) throw error;
      
      setInstallations(prev => prev.map(i => 
        i.id === installation.id ? { ...i, is_scheduled: newStatus, at_dock: false } : i
      ));
      setSelectedInstallation(null);
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
      
      setInstallations(prev => prev.map(i => 
        i.id === installation.id ? { ...i, at_dock: newStatus } : i
      ));
      if (selectedInstallation?.id === installation.id) {
        setSelectedInstallation(prev => prev ? { ...prev, at_dock: newStatus } : null);
      }
    } catch (err) {
      console.error("Error toggling status:", err);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'installer') {
      setActiveInstallerId(active.id as string);
    } else if (active.data.current?.type === 'assigned_installer') {
      setActiveInstallerId(active.data.current.installer.id);
    } else if (active.data.current?.type === 'installation') {
      setActiveInstallation(active.data.current.installation);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    // No specific logic needed for over
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveInstallerId(null);
    setActiveInstallation(null);

    if (!over) return;

    // Handle Installer Assignment (Available -> Zone)
    if (active.data.current?.type === 'installer' && over.data.current?.type === 'zone') {
      const installerId = active.id as string;
      const zone = over.data.current.zone;

      try {
        const { error } = await supabase
          .from('daily_installer_assignments')
          .insert([{
            installer_id: installerId,
            zone,
            assignment_date: assignmentDate
          }]);

        if (error) throw error;
        fetchData();
      } catch (err) {
        console.error("Error assigning installer:", err);
      }
    }

    // Handle Installer Move (Zone -> Zone)
    if (active.data.current?.type === 'assigned_installer' && over.data.current?.type === 'zone') {
      const isVirtual = active.data.current.isVirtual;
      const newZone = over.data.current.zone;
      const installerId = active.data.current.installer.id;

      try {
        if (isVirtual) {
          // Create new assignment for today
          const { error } = await supabase
            .from('daily_installer_assignments')
            .insert([{
              installer_id: installerId,
              zone: newZone,
              assignment_date: assignmentDate
            }]);
          if (error) throw error;
        } else {
          // Update existing assignment
          const assignmentId = active.id as string;
          const { error } = await supabase
            .from('daily_installer_assignments')
            .update({ zone: newZone })
            .eq('id', assignmentId);
          if (error) throw error;
        }
        fetchData();
      } catch (err) {
        console.error("Error moving assignment:", err);
      }
    }

    // Handle Installer Removal (Zone -> Available)
    if (active.data.current?.type === 'assigned_installer' && over.data.current?.type === 'available') {
      const isVirtual = active.data.current.isVirtual;
      const installerId = active.data.current.installer.id;

      try {
        if (isVirtual) {
          // To "remove" a virtual assignment (from profile), we assign it to "SIN ZONA" for today
          const { error } = await supabase
            .from('daily_installer_assignments')
            .insert([{
              installer_id: installerId,
              zone: 'SIN ZONA',
              assignment_date: assignmentDate
            }]);
          if (error) throw error;
        } else {
          const assignmentId = active.id as string;
          const { error } = await supabase
            .from('daily_installer_assignments')
            .delete()
            .eq('id', assignmentId);
          if (error) throw error;
        }
        fetchData();
      } catch (err) {
        console.error("Error removing assignment via drag:", err);
      }
    }

    // Handle Installation Move
    if (active.data.current?.type === 'installation' && over.data.current?.type === 'cell') {
      const inst = active.data.current.installation;
      const { installerId, dateStr } = over.data.current;

      try {
        const { error } = await supabase
          .from('installations')
          .update({
            installer_id: installerId,
            installation_date: dateStr
          })
          .eq('id', inst.id);

        if (error) throw error;
        fetchData();
      } catch (err) {
        console.error("Error moving installation:", err);
      }
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('daily_installer_assignments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error("Error removing assignment:", err);
    }
  };

  const getInstallationsForCell = (installerId: string, date: Date) => {
    const dateStr = formatDate(date);
    return installations.filter(i => i.installer_id === installerId && i.installation_date === dateStr);
  };

  const filteredInstallers = useMemo(() => {
    const filtered = installers.filter(installer => {
      const matchesName = (installer.full_name || installer.label || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesOrder = true;
      if (orderSearchTerm) {
        matchesOrder = installations.some(i => 
          i.installer_id === installer.id && 
          i.order_number.toLowerCase().includes(orderSearchTerm.toLowerCase())
        );
      }
      
      return matchesName && matchesOrder;
    });

    // Sort: Special installer last, others alphabetical
    return [...filtered].sort((a, b) => {
      const aSpecial = isSpecialInstaller(a?.full_name);
      const bSpecial = isSpecialInstaller(b?.full_name);
      
      if (aSpecial && !bSpecial) return 1;
      if (!aSpecial && bSpecial) return -1;
      
      return (a?.full_name || '').localeCompare(b?.full_name || '');
    });
  }, [installers, searchTerm, orderSearchTerm, installations]);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {message && (
        <div className={`fixed top-24 right-8 z-[100] p-4 rounded-2xl shadow-2xl border animate-in slide-in-from-right duration-300 ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
        }`}>
          <div className="flex items-center gap-3">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-xs font-black uppercase tracking-widest">{message.text}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-100">
            <LayoutGrid className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Panel Aires</h2>
            <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mt-1">Planificación Visual 30 Días</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Instalador..." 
                className="pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-[10px] font-black outline-none focus:border-indigo-500 transition-all uppercase w-40"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Pedido..." 
                className="pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-[10px] font-black outline-none focus:border-indigo-500 transition-all uppercase w-40"
                value={orderSearchTerm}
                onChange={(e) => setOrderSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setView(view === 'daily_installers' ? 'grid' : 'daily_installers')}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${
                view === 'daily_installers' 
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-100' 
                  : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'
              }`}
            >
              <User className="w-4 h-4" />
              Instaladores
            </button>
            <button 
              onClick={() => {
                setEditingId(null);
                setNewInstallation({
                  warehouse_origin: '3',
                  start_time: '08:00',
                  end_time: '09:00',
                  merchandise_type: '',
                  address: '',
                  installation_date: formatDate(new Date())
                });
                setView('create');
              }}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nuevo
            </button>
          </div>
        </div>
      </div>

      {view === 'daily_installers' ? (
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Previsión de Instaladores</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Asigna instaladores a zonas para el día seleccionado</p>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 px-5 py-2 rounded-2xl border-2 border-slate-100 shadow-sm">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Fecha:</span>
              <input 
                type="date" 
                value={assignmentDate} 
                onChange={(e) => setAssignmentDate(e.target.value)}
                className="bg-transparent text-[11px] font-black text-slate-700 outline-none uppercase"
              />
            </div>
          </div>

          <DndContext 
            sensors={sensors} 
            collisionDetection={pointerWithin} 
            onDragStart={handleDragStart} 
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
              <DroppableAvailableArea>
                {installers
                  .filter(i => !dailyAssignments.some(a => a.installer_id === i.id))
                  .filter(i => !i.zone || !ZONES.includes(i.zone.toUpperCase()))
                  .filter(i => (i.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
                  .sort((a, b) => {
                    const aSpecial = isSpecialInstaller(a.full_name);
                    const bSpecial = isSpecialInstaller(b.full_name);
                    if (aSpecial && !bSpecial) return 1;
                    if (!aSpecial && bSpecial) return -1;
                    return (a.full_name || '').localeCompare(b.full_name || '');
                  })
                  .map(installer => (
                    <DraggableInstallerItem key={installer.id} installer={installer} />
                  ))}
              </DroppableAvailableArea>
              <div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ZONES.map(zone => {
                  const explicit = dailyAssignments.filter(a => a.zone === zone);
                  const virtual = installers
                    .filter(i => i.zone?.toUpperCase() === zone && !dailyAssignments.some(a => a.installer_id === i.id))
                    .map(i => ({ id: `virtual-${i.id}`, installer_id: i.id, zone, isVirtual: true }));

                  return (
                    <InstallerZoneColumn 
                      key={zone} 
                      zone={zone} 
                      assignments={[...explicit, ...virtual]}
                      installers={installers}
                      onRemove={handleRemoveAssignment}
                    />
                  );
                })}
              </div>
            </div>
            <DragOverlay>
              {activeInstallerId ? (
                <div className="bg-indigo-600 text-white p-3 rounded-xl shadow-2xl flex items-center gap-2 cursor-grabbing scale-105 rotate-2">
                  <User className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">{installers.find(i => i.id === activeInstallerId)?.full_name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          
          <div className="mt-8 flex justify-center">
            <button 
              onClick={() => setView('grid')}
              className="px-8 py-4 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-xs active:scale-95 transition-all shadow-xl"
            >
              Volver al Panel
            </button>
          </div>
        </div>
      ) : view === 'create' ? (
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 animate-fade-in max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-indigo-100 p-3 rounded-2xl">
              <Plus className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{editingId ? 'Editar Instalación' : 'Nueva Instalación'}</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Completa los datos del pedido</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Instalador</label>
                <select 
                  value={newInstallation.installer_id || ''}
                  onChange={e => setNewInstallation(prev => ({ ...prev, installer_id: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all uppercase"
                >
                  <option value="">Seleccionar instalador...</option>
                  {installers.map(i => (
                    <option key={i.id} value={i.id}>{i.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Fecha</label>
                <input 
                  type="date" 
                  value={newInstallation.installation_date || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, installation_date: e.target.value }))} 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Número de Pedido</label>
                <input 
                  type="text" 
                  value={newInstallation.order_number || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, order_number: e.target.value.toUpperCase() }))} 
                  placeholder="Ej: 123456" 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Localidad</label>
                <input 
                  type="text" 
                  value={newInstallation.locality || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, locality: e.target.value.toUpperCase() }))} 
                  placeholder="Ej: Madrid" 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all uppercase"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Almacén Origen</label>
                <select 
                  value={newInstallation.warehouse_origin || '3'}
                  onChange={e => setNewInstallation(prev => ({ ...prev, warehouse_origin: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all uppercase"
                >
                  {WAREHOUSES.map(wh => (
                    <option key={wh.id} value={wh.id}>{wh.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Tipo Mercancía</label>
                <input 
                  type="text" 
                  value={newInstallation.merchandise_type || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, merchandise_type: e.target.value.toUpperCase() }))} 
                  placeholder="Ej: Aire Acondicionado" 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all uppercase"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Inicio</label>
                  <select 
                    value={newInstallation.start_time || '08:00'}
                    onChange={e => setNewInstallation(prev => ({ ...prev, start_time: e.target.value }))}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  >
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Fin</label>
                  <select 
                    value={newInstallation.end_time || '09:00'}
                    onChange={e => setNewInstallation(prev => ({ ...prev, end_time: e.target.value }))}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  >
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Dirección</label>
                <input 
                  type="text" 
                  value={newInstallation.address || ''} 
                  onChange={e => setNewInstallation(prev => ({ ...prev, address: e.target.value.toUpperCase() }))} 
                  placeholder="Calle, número, piso..." 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all uppercase"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => setView('grid')}
              className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase tracking-widest text-xs active:scale-95 transition-all hover:bg-slate-200"
            >
              Cancelar
            </button>
            <button 
              onClick={handleCreateInstallation}
              disabled={loading}
              className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl uppercase tracking-widest text-xs active:scale-95 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {editingId ? 'Guardar Cambios' : 'Crear Instalación'}
            </button>
          </div>
        </div>
      ) : (
        <DndContext 
          sensors={sensors} 
          collisionDetection={pointerWithin} 
          onDragStart={handleDragStart} 
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-4">
            {/* Navigation Bar Just Above Calendar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-[2rem] border-2 border-slate-100 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button 
                    onClick={() => moveDays(-5)}
                    className="p-2 hover:bg-white rounded-lg transition-all text-slate-500"
                    title="Retroceder 5 días laborables"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="px-6 flex flex-col items-center min-w-[150px]">
                    <span className="text-xs font-black text-slate-800 uppercase">
                      {dates[0].toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - {dates[4].toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  <button 
                    onClick={() => moveDays(5)}
                    className="p-2 hover:bg-white rounded-lg transition-all text-slate-500"
                    title="Avanzar 5 días laborables"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <Calendar className="w-4 h-4 text-slate-400 ml-2" />
                  <input 
                    type="date" 
                    className="bg-transparent text-[10px] font-black text-slate-700 outline-none p-2 uppercase"
                    value={formatDate(startDate)}
                    onChange={(e) => {
                      if (e.target.value) {
                        setStartDate(parseDate(e.target.value));
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                  <span className="text-[9px] font-black text-slate-500 uppercase">Muelle</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="text-[9px] font-black text-slate-500 uppercase">Agendado</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-sm overflow-hidden flex flex-col relative">
              {loading && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Cargando Planificación...</p>
                  </div>
                </div>
              )}

            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-30">
                  <tr>
                    <th className="sticky left-0 z-40 bg-slate-900 p-4 border-r border-slate-800 min-w-[200px] text-left">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Instalador / Fecha</span>
                    </th>
                    {dates.map((date, idx) => {
                      const isToday = date.toDateString() === new Date().toDateString();
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      
                      return (
                        <th 
                          key={idx} 
                          className={`p-4 border-r border-slate-800 min-w-[180px] text-center transition-colors ${
                            isToday ? 'bg-indigo-600' : isWeekend ? 'bg-slate-800' : 'bg-slate-900'
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <span className={`text-[10px] font-black uppercase tracking-tighter ${isToday ? 'text-indigo-100' : 'text-slate-500'}`}>
                              {date.toLocaleDateString('es-ES', { weekday: 'short' })}
                            </span>
                            <span className={`text-lg font-black ${isToday ? 'text-white' : 'text-slate-200'}`}>
                              {date.getDate()} {date.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase()}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredInstallers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-20">
                          <Search className="w-12 h-12" />
                          <p className="text-xl font-black uppercase tracking-widest">No se encontraron instaladores</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredInstallers.map(installer => {
                      const isSpecial = isSpecialInstaller(installer?.full_name);
                      return (
                        <tr key={installer.id} className="group">
                          <td className={`sticky left-0 z-20 p-3 border-r-2 border-slate-100 font-black text-xs uppercase shadow-[4px_0_10px_rgba(0,0,0,0.03)] transition-colors ${
                            isSpecial ? 'bg-rose-50 text-rose-700 group-hover:bg-rose-100' : 'bg-white text-slate-700 group-hover:bg-slate-50'
                          }`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border group-hover:scale-110 transition-transform ${
                                isSpecial ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                              }`}>
                                <User className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col">
                                <span className="leading-none truncate max-w-[140px]">{installer?.full_name || installer?.label}</span>
                                {installer?.zone && (
                                  <span className={`text-[8px] mt-1 tracking-widest ${isSpecial ? 'text-rose-400' : 'text-indigo-400'}`}>
                                    {installer.zone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          {dates.map((date, idx) => {
                            const cellInstallations = getInstallationsForCell(installer.id, date);
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            const isToday = date.toDateString() === new Date().toDateString();
                            
                            return (
                              <DroppableCell 
                                key={idx} 
                                installerId={installer.id} 
                                date={date} 
                                isToday={isToday} 
                                isWeekend={isWeekend}
                              >
                                <div className="space-y-1 min-h-[50px]">
                                  {cellInstallations.map(inst => (
                                    <DraggableInstallation 
                                      key={inst.id} 
                                      inst={inst} 
                                      onClick={() => setSelectedInstallation(inst)} 
                                    />
                                  ))}
                                  {cellInstallations.length === 0 && (
                                    <div className="h-full w-full flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity">
                                      <Plus className="w-4 h-4 text-slate-400" />
                                    </div>
                                  )}
                                </div>
                              </DroppableCell>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DragOverlay>
            {activeInstallation ? (
              <div className="p-2 rounded-lg border-2 bg-indigo-600 border-indigo-700 text-white text-[8px] font-black shadow-2xl scale-110 rotate-2 opacity-90">
                <div className="flex justify-between items-start gap-1">
                  <span>{activeInstallation.order_number}</span>
                  <span className="bg-white/20 px-1 py-0.5 rounded-md">
                    {activeInstallation.start_time}
                  </span>
                </div>
                <div className="text-indigo-100 truncate mt-0.5">
                  {activeInstallation.locality}
                </div>
              </div>
            ) : activeInstallerId ? (
              <div className="bg-indigo-600 text-white p-3 rounded-xl shadow-2xl flex items-center gap-2 cursor-grabbing scale-105 rotate-2">
                <User className="w-4 h-4" />
                <span className="text-xs font-bold uppercase">{installers.find(i => i.id === activeInstallerId)?.full_name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </div>
      </DndContext>
    )}

      {/* Detail Modal */}
      {selectedInstallation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 border border-white">
            <div className={`px-8 py-6 flex justify-between items-center ${
              selectedInstallation.at_dock ? 'bg-blue-600' : selectedInstallation.is_scheduled ? 'bg-emerald-600' : 'bg-slate-900'
            }`}>
              <div className="flex items-center gap-3 text-white">
                <Package className="w-6 h-6" />
                <div>
                  <h3 className="font-black uppercase tracking-widest text-sm">Pedido {selectedInstallation.order_number}</h3>
                  <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Detalle de Instalación</p>
                </div>
              </div>
              <button onClick={() => setSelectedInstallation(null)} className="text-white/60 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Instalador</span>
                  <div className="flex items-center gap-2 text-slate-700">
                    <User className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-black uppercase">{installers.find(i => i.id === selectedInstallation.installer_id)?.full_name || 'Desconocido'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Fecha</span>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-black uppercase">{new Date(selectedInstallation.installation_date).toLocaleDateString('es-ES')}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Ubicación</span>
                  <div className="flex items-center gap-2 text-slate-700">
                    <MapPin className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-black uppercase">{selectedInstallation.locality}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Horario</span>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-black uppercase">{selectedInstallation.start_time} - {selectedInstallation.end_time}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Mercancía</span>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600 uppercase">
                  {selectedInstallation.merchandise_type}
                </div>
              </div>

              {selectedInstallation.address && (
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Dirección</span>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600 uppercase">
                    {selectedInstallation.address}
                  </div>
                </div>
              )}

              <div className="pt-4 flex flex-col gap-3">
                {!selectedInstallation.is_scheduled ? (
                  <button 
                    onClick={() => toggleScheduled(selectedInstallation)}
                    className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    Agendar Instalación
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => toggleAtDock(selectedInstallation)}
                      className={`w-full py-4 font-black rounded-2xl uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 ${
                        selectedInstallation.at_dock 
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                          : 'bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700'
                      }`}
                    >
                      {selectedInstallation.at_dock ? (
                        <>
                          <ArrowRight className="w-4 h-4 rotate-180" />
                          Quitar de Muelle
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          Pasar a Muelle
                        </>
                      )}
                    </button>
                    <button 
                      onClick={() => toggleScheduled(selectedInstallation)}
                      className="w-full py-3 text-slate-400 font-black rounded-2xl uppercase tracking-widest text-[9px] hover:text-rose-500 transition-all"
                    >
                      Desagendar y volver a pendiente
                    </button>
                  </>
                )}
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setEditingId(selectedInstallation.id);
                      setNewInstallation(selectedInstallation);
                      setView('create');
                      setSelectedInstallation(null);
                    }}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[9px] hover:bg-slate-200 transition-all"
                  >
                    Editar Datos
                  </button>
                  <button 
                    onClick={async () => {
                      if (confirm('¿Eliminar esta instalación?')) {
                        const { error } = await supabase.from('installations').delete().eq('id', selectedInstallation.id);
                        if (!error) {
                          fetchData();
                          setSelectedInstallation(null);
                        }
                      }
                    }}
                    className="flex-1 py-3 bg-rose-50 text-rose-600 font-black rounded-xl uppercase tracking-widest text-[9px] hover:bg-rose-100 transition-all"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 px-4 py-3 bg-slate-900 rounded-3xl border border-slate-800">
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Leyenda:</span>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-600"></div>
          <span className="text-[9px] font-bold text-slate-300 uppercase">En Muelle</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-200"></div>
          <span className="text-[9px] font-bold text-slate-300 uppercase">Agendado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-white border border-slate-100"></div>
          <span className="text-[9px] font-bold text-slate-300 uppercase">Pendiente</span>
        </div>
      </div>
    </div>
  );
};


export default AiresPanel;
