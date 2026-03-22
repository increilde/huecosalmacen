
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot, UserProfile, Trucker, Installer, UserRole, Machinery, Task, Role, MachineryMaintenance } from '../types';
import UserManagement from './UserManagement';

interface MovementLog {
  id: string;
  operator_name: string;
  operator_email?: string;
  cart_id: string;
  slot_code: string;
  new_status: string;
  new_quantity: number;
  old_quantity?: number;
  created_at: string;
}

interface TaskLog {
  id: string;
  task_id: string;
  operator_email: string;
  start_time: string;
  end_time: string | null;
  created_at: string;
  tasks?: { name: string };
  profiles?: { full_name: string };
}

type AdminTab = 'movements' | 'operators' | 'sectors' | 'reports' | 'machinery' | 'tasks' | 'map' | 'map_config';
type ReportScope = 'range' | 'week' | 'today';

interface AdminPanelProps {
  user: UserProfile;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ user }) => {
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>(user.role === 'supervisor_distri' ? 'movements' : 'reports');
  const [selectedMachineryId, setSelectedMachineryId] = useState<string | null>(null);
  const [tasksView, setTasksView] = useState<'report' | 'config'>('report');
  const [loading, setLoading] = useState(true);
  
  const todayLocal = new Date().toLocaleDateString('en-CA');
  
  // Periodo seleccionado - Por defecto hoy
  const [scope, setScope] = useState<ReportScope>('today');
  const [dateFrom, setDateFrom] = useState(todayLocal); 
  const [dateTo, setDateTo] = useState(todayLocal);
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [cartSearch, setCartSearch] = useState('');

  const [allLogs, setAllLogs] = useState<MovementLog[]>([]);
  const [truckers, setTruckers] = useState<Trucker[]>([]);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showTruckerModal, setShowTruckerModal] = useState(false);
  const [showInstallerModal, setShowInstallerModal] = useState(false);
  const [showMachineryModal, setShowMachineryModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  
  const [truckerForm, setTruckerForm] = useState({ label: '' });
  const [installerForm, setInstallerForm] = useState({ label: '' });
  const [machineryForm, setMachineryForm] = useState({ type: 'carretilla' as 'carretilla' | 'pda', identifier: '' });
  
  // Estados para Tareas (Creación / Edición)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ 
    name: '', 
    description: '',
    allowed_roles: [] as string[], 
    assigned_user_emails: [] as string[],
    task_type: 'free' as 'daily' | 'once' | 'free',
    is_timed: false 
  });

  // Estados para Filtros de Historial de Tareas de Tiempo
  const [taskLogDateFrom, setTaskLogDateFrom] = useState(todayLocal);
  const [taskLogDateTo, setTaskLogDateTo] = useState(todayLocal);
  const [taskLogOperator, setTaskLogOperator] = useState<string>('todos');
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [loadingTaskLogs, setLoadingTaskLogs] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    occupied: 0,
    empty: 0,
    pending: 0
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [warehouseBreakdown, setWarehouseBreakdown] = useState<any[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MachineryMaintenance[]>([]);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<string | null>(null);
  const [maintenanceForm, setMaintenanceForm] = useState({
    machinery_id: '',
    type: 'averia' as 'averia' | 'reparacion' | 'revision',
    description: '',
    cost: 0,
    status: 'pending' as 'pending' | 'completed'
  });
  const [selectedFile, setSelectedFile] = useState<any>(null);

  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [profiles, setProfiles] = useState<any[]>([]);

  // Estados para Mapa Real
  const [warehouseMaps, setWarehouseMaps] = useState<any[]>([]);
  const [streetCoords, setStreetCoords] = useState<any[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<any[]>([]);
  const [operatorLocations, setOperatorLocations] = useState<any[]>([]);
  const [isConfiguringMap, setIsConfiguringMap] = useState(false);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [mapForm, setMapForm] = useState({ plant: 'U01', image_url: '' });
  const [coordForm, setCoordForm] = useState({ street_id: '', x_percent: 50, y_percent: 50 });
  const [calibForm, setCalibForm] = useState({ point_name: 'Punto 1', latitude: 0, longitude: 0, x_percent: 50, y_percent: 50 });
  const [configMode, setConfigMode] = useState<'streets' | 'gps'>('streets');

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setLastRefresh(new Date());
    try {
      if (activeSubTab === 'movements' || activeSubTab === 'reports' || activeSubTab === 'map') {
        let query = supabase.from('movement_logs').select('*');
        
        // Fetch profiles for reports and map
        const { data: profData } = await supabase.from('profiles').select('id, email, full_name, avatar_url');
        setProfiles(profData || []);

        if (activeSubTab === 'map') {
          const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString();
          query = query.gte('created_at', yesterday);
          
          // Fetch map data even in 'map' tab
          const { data: mapsData, error: mapsError } = await supabase.from('warehouse_maps').select('*');
          const { data: coordsData, error: coordsError } = await supabase.from('warehouse_street_coords').select('*');
          const { data: calibData } = await supabase.from('warehouse_map_calibration').select('*');
          const { data: locData } = await supabase.from('operator_locations').select('*').order('created_at', { ascending: false }).limit(100);
          
          if (mapsError || coordsError) {
            console.warn("Map tables might be missing. Ensure SQL is executed.", mapsError || coordsError);
          }
          
          setWarehouseMaps(mapsData || []);
          setStreetCoords(coordsData || []);
          setCalibrationPoints(calibData || []);
          setOperatorLocations(locData || []);
          setProfiles(profData || []);
        } else {
          query = query.gte('created_at', `${dateFrom}T00:00:00`).lte('created_at', `${dateTo}T23:59:59`);
        }

        const { data: logs } = await query.order('created_at', { ascending: false });
        setAllLogs(logs || []);

        if (activeSubTab === 'reports') {
          let allSlots: WarehouseSlot[] = [];
          let from = 0;
          const step = 1000;
          let hasMore = true;
          
          while (hasMore) {
            const { data, error } = await supabase
              .from('warehouse_slots')
              .select('*')
              .range(from, from + step - 1);
            
            if (error) { hasMore = false; break; }
            if (data && data.length > 0) {
              allSlots = [...allSlots, ...data as WarehouseSlot[]];
              if (data.length < step) hasMore = false;
              from += step;
            } else { hasMore = false; }
          }

          if (allSlots.length > 0) {
            const breakdown = processWarehouseReport(allSlots);
            setWarehouseBreakdown(breakdown);
          }
        }
        
        const { data } = await supabase.from('machinery').select('*').order('type', { ascending: true }).order('identifier', { ascending: true });
        setMachinery(data || []);
        const { data: maintData } = await supabase.from('machinery_maintenance').select('*').order('created_at', { ascending: false });
        setMaintenanceRecords(maintData || []);
      } else if (activeSubTab === 'tasks') {
        const { data: tasksData } = await supabase.from('tasks').select('*').order('name');
        
        // Migración: Si hay tareas sin tipo o con tipo antiguo, ponerlas como 'free' (Libre)
        const tasksToUpdate = tasksData?.filter(t => !t.task_type || (t.task_type !== 'daily' && t.task_type !== 'once' && t.task_type !== 'free')) || [];
        if (tasksToUpdate.length > 0) {
          for (const t of tasksToUpdate) {
            try {
              const { error } = await supabase.from('tasks').update({ task_type: 'free' }).eq('id', t.id);
              if (error) console.warn("Error migrating task type:", error.message);
            } catch (e) {
              console.warn("Migration failed for task", t.id);
            }
          }
          // Re-fetch after update
          const { data: updatedTasks } = await supabase.from('tasks').select('*').order('name');
          setTasks(updatedTasks || []);
        } else {
          setTasks(tasksData || []);
        }

        const { data: rolesData } = await supabase.from('roles').select('*').order('name');
        const { data: profData } = await supabase.from('profiles').select('id, email, full_name, avatar_url');
        setRoles(rolesData || []);
        setProfiles(profData || []);
      } else if (activeSubTab === 'map_config') {
        const { data: mapsData } = await supabase.from('warehouse_maps').select('*');
        const { data: coordsData } = await supabase.from('warehouse_street_coords').select('*');
        setWarehouseMaps(mapsData || []);
        setStreetCoords(coordsData || []);
      } else if (activeSubTab === 'sectors') {
        let allSectorSlots: any[] = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('warehouse_slots')
            .select('is_scanned_once, quantity')
            .range(from, from + step - 1);
          
          if (error || !data || data.length === 0) {
            hasMore = false;
          } else {
            allSectorSlots = [...allSectorSlots, ...data];
            if (data.length < step) hasMore = false;
            from += step;
          }
        }

        if (allSectorSlots.length > 0) {
          setStats({
            total: allSectorSlots.length,
            occupied: allSectorSlots.filter(s => s.quantity && s.quantity > 0).length,
            empty: allSectorSlots.filter(s => s.is_scanned_once && s.quantity === 0).length,
            pending: allSectorSlots.filter(s => !s.is_scanned_once).length
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeSubTab, dateFrom, dateTo]);

  useEffect(() => {
    let interval: any;
    if (activeSubTab === 'map') {
      interval = setInterval(() => {
        fetchData();
      }, 30000); // Auto-refresh cada 30s
    }
    return () => clearInterval(interval);
  }, [activeSubTab, fetchData]);

  const fetchTaskLogs = React.useCallback(async () => {
    setLoadingTaskLogs(true);
    try {
      let query = supabase
        .from('task_logs')
        .select(`
          id, task_id, operator_email, start_time, end_time, created_at,
          tasks ( name ),
          profiles ( full_name )
        `)
        .gte('created_at', `${taskLogDateFrom}T00:00:00`)
        .lte('created_at', `${taskLogDateTo}T23:59:59`)
        .order('created_at', { ascending: false });

      if (taskLogOperator !== 'todos') {
        query = query.eq('operator_email', taskLogOperator);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTaskLogs((data || []) as any[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTaskLogs(false);
    }
  }, [taskLogDateFrom, taskLogDateTo, taskLogOperator]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeSubTab === 'tasks' && tasksView === 'report') {
      fetchTaskLogs();
    }
  }, [activeSubTab, tasksView, fetchTaskLogs]);

  const setRangeToThisWeek = () => {
    const now = new Date();
    const day = now.getDay() || 7; 
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    setDateFrom(monday.toLocaleDateString('en-CA'));
    setDateTo(sunday.toLocaleDateString('en-CA'));
    setScope('week');
  };

  const setRangeToToday = () => {
    setDateFrom(todayLocal);
    setDateTo(todayLocal);
    setScope('today');
  };

  /**
   * Lógica de redondeo: 
   * - Mínimo 15 min.
   * - Tramos de 15 min siempre al alza.
   */
  const getRoundedDurationMs = (start: string, end: string | null): number => {
    if (!end) return 0;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const diffMs = Math.max(0, endMs - startMs);
    
    const intervalMs = 15 * 60 * 1000; // 15 minutos en ms
    
    if (diffMs === 0) return 0;
    
    // Aplicar mínimo 15 minutos y redondear al alza al siguiente tramo de 15 min
    return Math.ceil(Math.max(diffMs, intervalMs) / intervalMs) * intervalMs;
  };

  const formatMsToHHMM = (ms: number): string => {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  const calculateTotalTimeRounded = (logs: TaskLog[]) => {
    let totalMs = 0;
    logs.forEach(log => {
      if (log.start_time && log.end_time) {
        totalMs += getRoundedDurationMs(log.start_time, log.end_time);
      }
    });
    return formatMsToHHMM(totalMs);
  };

  const getDiscoveredStreets = () => {
    const streets = new Set<string>();
    allLogs.forEach(log => {
      if (log.slot_code && log.slot_code.length >= 5) {
        // Tomamos los primeros 5 caracteres (Ej: U01-C) o similar
        // El usuario dice que los 5 primeros indican planta y calle
        streets.add(log.slot_code.substring(0, 5));
      }
    });
    return Array.from(streets).sort();
  };

  const processWarehouseReport = (slots: WarehouseSlot[]) => {
    const plants = ['U01', 'U02'];
    const sizes = ['Grande', 'Mediano', 'Pequeño'];
    
    return plants.map(plant => {
      const plantSlots = slots.filter(s => s.code.startsWith(plant));
      const sizeBreakdown = sizes.map(size => {
        const sSlots = plantSlots.filter(s => s.size === size);
        const total = sSlots.length;
        const full = sSlots.filter(s => s.quantity === 100).length;
        const half = sSlots.filter(s => s.quantity === 50).length;
        const empty = sSlots.filter(s => s.is_scanned_once && s.quantity === 0).length;
        
        const occupancy = total > 0 
          ? Math.round((sSlots.filter(s => (s.quantity || 0) > 0).length / total) * 100)
          : 0;

        return { size, total, full, half, empty, occupancy };
      });

      const totalPlant = plantSlots.length;
      const avgOccupancy = totalPlant > 0 
        ? Math.round((plantSlots.filter(s => (s.quantity || 0) > 0).length / totalPlant) * 100)
        : 0;

      return { plant, sizeBreakdown, avgOccupancy, totalScanned: plantSlots.filter(s => s.is_scanned_once).length, totalSlots: totalPlant };
    });
  };

  const getOperatorStats = () => {
    const map = new Map<string, { name: string, count: number, logs: MovementLog[], email: string, avatar_url?: string }>();
    allLogs.forEach(log => {
      const key = log.operator_email || log.operator_name;
      if (!map.has(key)) {
        const profile = profiles.find(p => p.email === log.operator_email);
        map.set(key, { 
          name: log.operator_name, 
          count: 0, 
          logs: [], 
          email: log.operator_email || '',
          avatar_url: profile?.avatar_url 
        });
      }
      const entry = map.get(key)!;
      entry.count++;
      entry.logs.push(log);
    });
    return Array.from(map.entries());
  };

  const calculateAvgTime = (logs: MovementLog[]) => {
    if (logs.length < 2) return '--';
    const sorted = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let totalDiff = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalDiff += new Date(sorted[i].created_at).getTime() - new Date(sorted[i-1].created_at).getTime();
    }
    const avgMs = totalDiff / (sorted.length - 1);
    const mins = Math.floor(avgMs / 60000);
    const secs = Math.floor((avgMs % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const filteredLogs = allLogs.filter(l => {
    const matchesOperator = selectedOperator ? (l.operator_email || l.operator_name) === selectedOperator : true;
    const matchesCart = cartSearch ? (l.cart_id || '').toUpperCase().includes(cartSearch.toUpperCase()) : true;
    return matchesOperator && matchesCart;
  });

  const handleCreateTrucker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckerForm.label) return;
    const { error } = await supabase.from('truckers').insert([{ 
      full_name: truckerForm.label.toUpperCase().trim()
    }]);
    if (!error) { setTruckerForm({ label: '' }); setShowTruckerModal(false); fetchData(); }
  };

  const deleteTrucker = async (id: string) => {
    if (confirm("¿Eliminar camión?")) {
      await supabase.from('truckers').delete().eq('id', id);
      fetchData();
    }
  };

  const handleCreateInstaller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installerForm.label) return;
    const { error } = await supabase.from('installers').insert([{ 
      full_name: installerForm.label.toUpperCase().trim()
    }]);
    if (!error) { setInstallerForm({ label: '' }); setShowInstallerModal(false); fetchData(); }
  };

  const deleteInstaller = async (id: string) => {
    if (confirm("¿Eliminar instalador?")) {
      await supabase.from('installers').delete().eq('id', id);
      fetchData();
    }
  };

  const handleCreateMachinery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineryForm.identifier) return;
    const { error } = await supabase.from('machinery').insert([{ 
      type: machineryForm.type, 
      identifier: machineryForm.identifier.toUpperCase().trim() 
    }]);
    if (!error) { 
      setMachineryForm({ type: 'carretilla', identifier: '' }); 
      setShowMachineryModal(false); 
      fetchData(); 
    }
  };

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceForm.machinery_id || !maintenanceForm.description) return;
    
    setLoading(true);
    try {
      let attachment_url = (editingMaintenanceId && maintenanceRecords.find(m => m.id === editingMaintenanceId)?.attachment_url) || null;

      if (selectedFile) {
        console.log("Intentando subir archivo:", selectedFile.name);
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `maintenance/${fileName}`;

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('machinery-attachments')
          .upload(filePath, selectedFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error("Error en Storage:", uploadError);
          throw new Error(`Error al subir archivo: ${uploadError.message}`);
        }

        console.log("Archivo subido con éxito:", uploadData);

        const { data: { publicUrl } } = supabase.storage
          .from('machinery-attachments')
          .getPublicUrl(filePath);
        
        attachment_url = publicUrl;
        console.log("URL pública generada:", attachment_url);
      }

      const payload = {
        ...maintenanceForm,
        reported_by: user.full_name,
        completed_at: maintenanceForm.status === 'completed' ? new Date().toISOString() : null,
        attachment_url
      };

      if (editingMaintenanceId) {
        const { error } = await supabase
          .from('machinery_maintenance')
          .update(payload)
          .eq('id', editingMaintenanceId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('machinery_maintenance').insert([payload]);
        if (error) throw error;
      }

      setShowMaintenanceModal(false);
      setEditingMaintenanceId(null);
      setSelectedFile(null);
      setMaintenanceForm({
        machinery_id: '',
        type: 'averia',
        description: '',
        cost: 0,
        status: 'pending'
      });
      fetchData();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const toggleMaintenanceStatus = async (record: MachineryMaintenance) => {
    const newStatus = record.status === 'pending' ? 'completed' : 'pending';
    const { error } = await supabase
      .from('machinery_maintenance')
      .update({ 
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', record.id);
    if (!error) fetchData();
  };

  const deleteMaintenance = async (id: string) => {
    if (!confirm("¿Eliminar este registro?")) return;
    const { error } = await supabase.from('machinery_maintenance').delete().eq('id', id);
    if (!error) fetchData();
  };

  const deleteMachinery = async (id: string) => {
    if (confirm("¿Eliminar maquinaria?")) {
      await supabase.from('machinery').delete().eq('id', id);
      fetchData();
    }
  };

  const openMaintenanceModal = (machineryId: string) => {
    setEditingMaintenanceId(null);
    setSelectedFile(null);
    setErrorMessage(null);
    setMaintenanceForm({
      machinery_id: machineryId,
      type: 'averia',
      description: '',
      cost: 0,
      status: 'pending'
    });
    setShowMaintenanceModal(true);
  };

  const openEditMaintenance = (record: MachineryMaintenance) => {
    setEditingMaintenanceId(record.id);
    setSelectedFile(null);
    setErrorMessage(null);
    setMaintenanceForm({
      machinery_id: record.machinery_id,
      type: record.type,
      description: record.description,
      cost: record.cost || 0,
      status: record.status
    });
    setShowMaintenanceModal(true);
  };

  const handleCreateOrUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.name) return;
    
    setLoading(true);
    try {
      const payload = {
        name: taskForm.name.toUpperCase().trim(),
        description: taskForm.description.trim(),
        allowed_roles: taskForm.allowed_roles,
        assigned_user_emails: taskForm.assigned_user_emails,
        task_type: taskForm.task_type,
        is_timed: taskForm.is_timed
      };

      if (editingTaskId) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editingTaskId);
        if (error) {
          if (error.code === '23514' && error.message.includes('tasks_task_type_check')) {
            alert("Error de base de datos: El tipo de tarea 'Libre' no está habilitado en tu base de datos. Por favor, ejecuta el SQL de actualización en tu panel de Supabase.");
          }
          throw error;
        }
      } else {
        const { error } = await supabase.from('tasks').insert([payload]);
        if (error) {
          if (error.code === '23514' && error.message.includes('tasks_task_type_check')) {
            alert("Error de base de datos: El tipo de tarea 'Libre' no está habilitado en tu base de datos. Por favor, ejecuta el SQL de actualización en tu panel de Supabase.");
          }
          throw error;
        }
      }

      setTaskForm({ 
        name: '', 
        description: '',
        allowed_roles: [], 
        assigned_user_emails: [],
        task_type: 'free',
        is_timed: false 
      });
      setEditingTaskId(null);
      setShowTaskModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openEditTask = (task: Task) => {
    setTaskForm({
      name: task.name,
      description: task.description || '',
      allowed_roles: task.allowed_roles,
      assigned_user_emails: task.assigned_user_emails || [],
      task_type: task.task_type || 'free',
      is_timed: task.is_timed
    });
    setEditingTaskId(task.id);
    setShowTaskModal(true);
  };

  const deleteTask = async (id: string) => {
    if (confirm("¿Eliminar esta tarea?")) {
      await supabase.from('tasks').delete().eq('id', id);
      fetchData();
    }
  };

  const toggleRoleForTask = (roleName: string) => {
    setTaskForm(prev => ({
      ...prev,
      allowed_roles: prev.allowed_roles.includes(roleName)
        ? prev.allowed_roles.filter(r => r !== roleName)
        : [...prev.allowed_roles, roleName]
    }));
  };

  const toggleUserForTask = (email: string) => {
    setTaskForm(prev => ({
      ...prev,
      assigned_user_emails: prev.assigned_user_emails.includes(email)
        ? prev.assigned_user_emails.filter(e => e !== email)
        : [...prev.assigned_user_emails, email]
    }));
  };

  const handleFinishTaskLog = async (logId: string) => {
    if (user.role !== 'admin') return;
    if (!confirm("¿Deseas finalizar esta tarea manualmente con la hora actual?")) return;
    
    setLoadingTaskLogs(true);
    try {
      const { error } = await supabase
        .from('task_logs')
        .update({ end_time: new Date().toISOString() })
        .eq('id', logId);
      if (error) throw error;
      await fetchTaskLogs();
    } catch (err: any) {
      alert("Error al finalizar: " + err.message);
    } finally {
      setLoadingTaskLogs(false);
    }
  };

  const handleDeleteTaskLog = async (logId: string) => {
    if (user.role !== 'admin') return;
    if (!confirm("¿Estás seguro de eliminar este registro de tiempo? Esta acción no se puede deshacer.")) return;
    
    setLoadingTaskLogs(true);
    try {
      const { error } = await supabase
        .from('task_logs')
        .delete()
        .eq('id', logId);
      if (error) throw error;
      await fetchTaskLogs();
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    } finally {
      setLoadingTaskLogs(false);
    }
  };

  const handleSaveMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapForm.image_url) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('warehouse_maps').upsert([mapForm], { onConflict: 'plant' });
      if (error) throw error;
      alert("Plano guardado correctamente");
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("Error al guardar el plano: " + err.message + ". Asegúrate de haber ejecutado el SQL en Supabase.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new window.FileReader();
    reader.onloadend = () => {
      setMapForm(prev => ({ ...prev, image_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCoord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMapId || !coordForm.street_id) return;
    const { error } = await supabase.from('warehouse_street_coords').upsert([{
      map_id: selectedMapId,
      ...coordForm
    }], { onConflict: 'map_id,street_id' });
    if (!error) { 
      setCoordForm({ street_id: '', x_percent: 50, y_percent: 50 });
      fetchData(); 
    }
  };

  const handleSaveCalibration = async (e: React.FormEvent, calibForm: any) => {
    e.preventDefault();
    if (!selectedMapId) return;
    const { error } = await supabase.from('warehouse_map_calibration').upsert([{
      map_id: selectedMapId,
      ...calibForm
    }]);
    if (!error) fetchData();
  };

  const deleteCalibration = async (id: string) => {
    if (confirm("¿Eliminar este punto de calibración?")) {
      await supabase.from('warehouse_map_calibration').delete().eq('id', id);
      fetchData();
    }
  };

  const deleteCoord = async (id: string) => {
    if (confirm("¿Eliminar esta coordenada?")) {
      await supabase.from('warehouse_street_coords').delete().eq('id', id);
      fetchData();
    }
  };

  const getGPSPosition = (lat: number, lng: number, mapId: string) => {
    const points = calibrationPoints.filter(p => p.map_id === mapId);
    if (points.length < 2) return null;

    const p1 = points[0];
    const p2 = points[1];

    const latRange = p2.latitude - p1.latitude;
    const lngRange = p2.longitude - p1.longitude;
    const xRange = p2.x_percent - p1.x_percent;
    const yRange = p2.y_percent - p1.y_percent;

    if (latRange === 0 || lngRange === 0) return null;

    const x = p1.x_percent + ((lng - p1.longitude) / lngRange) * xRange;
    const y = p1.y_percent + ((lat - p1.latitude) / latRange) * yRange;

    return { x, y };
  };

  const getOperatorPosition = (email: string, streetId: string, plant: string) => {
    const map = warehouseMaps.find(m => m.plant === plant);
    if (!map) return null;

    // Intentar obtener posición GPS reciente (últimos 30 segundos)
    const recentLoc = operatorLocations.find(l => 
      l.operator_email === email && 
      (new Date().getTime() - new Date(l.created_at).getTime()) < 30000
    );

    if (recentLoc) {
      const gpsPos = getGPSPosition(recentLoc.latitude, recentLoc.longitude, map.id);
      if (gpsPos) return { ...gpsPos, isGPS: true };
    }

    // Fallback a la calle si no hay GPS o no está calibrado
    const coord = streetCoords.find(c => c.map_id === map.id && c.street_id === streetId);
    if (!coord) return null;
    return { x: coord.x_percent, y: coord.y_percent, isGPS: false };
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex justify-center">
        <nav className="bg-slate-950 p-1 rounded-[1.5rem] shadow-2xl flex items-center gap-1 border border-slate-800 overflow-x-auto no-scrollbar max-w-full">
          {[
            { id: 'map', label: 'MAPA VIVO', icon: '📍' },
            { id: 'reports', label: 'INFORME', icon: '📈' },
            { id: 'movements', label: 'HISTORIAL', icon: '📋' },
            { id: 'operators', label: 'OPERARIOS', icon: '👥' },
            { id: 'sectors', label: 'SECTORES', icon: '📊' },
            { id: 'machinery', label: 'MAQUINARIA', icon: '🛠️' },
            { id: 'tasks', label: 'TAREAS', icon: '📌' },
          ].filter(tab => {
            if (user.role === 'admin') return true;
            if (user.role === 'supervisor_distri') {
              return tab.id === 'movements' || tab.id === 'reports';
            }
            return false;
          }).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as AdminTab)}
              className={`px-2.5 md:px-4 py-2 rounded-[1.2rem] flex flex-col items-center gap-0.5 transition-all min-w-[60px] md:min-w-[80px] ${
                activeSubTab === tab.id 
                ? 'bg-white text-slate-900 shadow-xl scale-105' 
                : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-xs md:text-sm">{tab.icon}</span>
              <span className="text-[5px] md:text-[7px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white p-4 md:p-10 rounded-[3rem] border border-slate-100 shadow-sm min-h-[500px]">
        {activeSubTab === 'map' && (
          <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Mapa de Nave en Tiempo Real</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ubicación aproximada basada en el último escaneo</p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => window.open(window.location.origin + '?view=live-map', '_blank')}
                  className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
                >
                  <span>🖥️</span>
                  <span>Abrir en Ventana Nueva</span>
                </button>
                <button 
                  onClick={() => setActiveSubTab('map_config')}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
                >
                  <span>⚙️</span>
                  <span>Configurar Plano Real</span>
                </button>
                <button 
                  onClick={() => fetchData()}
                  className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <span>🔄</span>
                  <span>Actualizar ({lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sistema Activo</span>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100">
                <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Operarios Activos</h4>
                <div className="flex flex-wrap gap-4">
                  {getOperatorStats()
                    .filter(([_, op]) => {
                      const lastLog = op.logs[0];
                      if (!lastLog) return false;
                      const timeDiff = (new Date().getTime() - new Date(lastLog.created_at).getTime()) / 60000;
                      return timeDiff < 15;
                    })
                    .map(([email, op]) => {
                      const lastLog = op.logs[0];
                      const timeDiff = lastLog ? Math.round((new Date().getTime() - new Date(lastLog.created_at).getTime()) / 60000) : null;
                      const isInactive = timeDiff !== null && timeDiff > 10;
                      
                      return (
                        <div key={email} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all min-w-[220px] ${isInactive ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-white border-slate-100 shadow-sm'}`}>
                          {op.avatar_url ? (
                            <img src={op.avatar_url} alt={op.name} className="w-12 h-12 rounded-full object-cover border border-slate-100" referrerPolicy="no-referrer" />
                          ) : (
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black ${isInactive ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-600'}`}>
                              {op.name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="text-sm font-black text-slate-800 uppercase leading-tight">{op.name}</p>
                            <p className="text-xs font-bold text-slate-400 uppercase">{lastLog?.slot_code || 'S/Ubicación'}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-black uppercase ${timeDiff !== null && timeDiff < 10 ? 'text-emerald-500' : 'text-slate-400'}`}>
                              {timeDiff !== null ? (timeDiff < 1 ? 'Ahora' : `${timeDiff}m`) : '--'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="bg-slate-50 rounded-[3rem] p-8 border border-slate-100 min-h-[600px] relative overflow-hidden">
                {/* Representación de la Nave Dinámica */}
                <div className="flex flex-col gap-12 h-full">
                  {['U01', 'U02'].map(plant => {
                    const plantStreets = getDiscoveredStreets().filter(s => s.startsWith(plant));
                    const realMap = warehouseMaps.find(m => m.plant === plant);
                    
                    return (
                      <div key={plant} className="relative border-2 border-dashed border-slate-200 rounded-[2rem] p-6 flex flex-col min-h-[400px]">
                        <div className="absolute top-4 left-4 bg-white px-4 py-1 rounded-full shadow-sm border border-slate-100 z-10">
                          <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">PLANTA {plant}</span>
                        </div>
                        
                        {realMap ? (
                          <div className="relative mt-12 w-full aspect-video bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <img 
                              src={realMap.image_url} 
                              alt={`Mapa ${plant}`} 
                              className="w-full h-full object-contain opacity-40"
                              referrerPolicy="no-referrer"
                            />
                            {/* Operarios en Mapa Real */}
                            {(() => {
                              const streetCounts: Record<string, number> = {};
                              return getOperatorStats().filter(([_, op]) => {
                                const lastLog = op.logs[0];
                                if (!lastLog) return false;
                                const timeDiff = (new Date().getTime() - new Date(lastLog.created_at).getTime()) / 60000;
                                return lastLog.slot_code.startsWith(plant) && timeDiff < 15;
                              }).map(([email, op]) => {
                                const lastLog = op.logs[0];
                                const streetId = lastLog.slot_code.substring(0, 5);
                                const pos = getOperatorPosition(email, streetId, plant);
                                const timeDiff = (new Date().getTime() - new Date(lastLog.created_at).getTime()) / 60000;
                                const isInactive = timeDiff > 10;

                                if (!pos) return null;

                                // Calcular desplazamiento si hay varios en la misma calle
                                const count = streetCounts[streetId] || 0;
                                streetCounts[streetId] = count + 1;
                                const offsetX = count * 2.5; // Desplazamiento en % para que no se tapen
                                const offsetY = count * 1.5;

                                return (
                                  <div 
                                    key={email} 
                                    className="absolute transition-all duration-1000 z-20"
                                    style={{ 
                                      left: `${pos.x + offsetX}%`, 
                                      top: `${pos.y + offsetY}%`, 
                                      transform: 'translate(-50%, -50%)' 
                                    }}
                                  >
                                    <div className="relative group/op">
                                      {op.avatar_url ? (
                                        <img 
                                          src={op.avatar_url} 
                                          alt={op.name} 
                                          className={`w-8 h-8 rounded-full object-cover shadow-lg border-2 cursor-help transition-all ${isInactive ? 'opacity-50 grayscale border-slate-300' : 'animate-bounce ' + (pos.isGPS ? 'border-emerald-400' : 'border-white')}`} 
                                          referrerPolicy="no-referrer" 
                                        />
                                      ) : (
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-lg border-2 cursor-help transition-all ${isInactive ? 'bg-slate-400 opacity-50 grayscale border-white' : 'bg-indigo-600 animate-bounce ' + (pos.isGPS ? 'border-emerald-400' : 'border-white')}`}>
                                          {op.name.charAt(0)}
                                        </div>
                                      )}
                                      {pos.isGPS && <span className="absolute -top-1 -right-1 text-[8px] z-10">🛰️</span>}
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-slate-900 text-white text-[7px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover/op:opacity-100 transition-all whitespace-nowrap z-30">
                                        {op.name}
                                        <br/>
                                        <span className="text-indigo-300">{lastLog.slot_code}</span>
                                        {pos.isGPS && <span className="text-emerald-400 ml-1">(GPS)</span>}
                                      </div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        ) : plantStreets.length > 0 ? (
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-12">
                            {plantStreets.map(streetId => {
                              const operatorsInStreet = getOperatorStats().filter(([_, op]) => {
                                const lastLog = op.logs[0];
                                if (!lastLog) return false;
                                const timeDiff = (new Date().getTime() - new Date(lastLog.created_at).getTime()) / 60000;
                                return lastLog.slot_code.startsWith(streetId) && timeDiff < 15;
                              });

                              return (
                                <div key={streetId} className="bg-white/50 rounded-2xl border border-slate-100 p-4 flex flex-col items-center justify-center relative group hover:bg-white hover:shadow-md transition-all min-h-[100px]">
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest absolute top-2">{streetId}</span>
                                  
                                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                                    {operatorsInStreet.length > 0 ? (
                                      operatorsInStreet.map(([email, op]) => {
                                        const lastLog = op.logs[0];
                                        const timeDiff = (new Date().getTime() - new Date(lastLog.created_at).getTime()) / 60000;
                                        const isInactive = timeDiff > 10;

                                        return (
                                          <div key={email} className="relative group/op">
                                            {op.avatar_url ? (
                                              <img 
                                                src={op.avatar_url} 
                                                alt={op.name} 
                                                className={`w-10 h-10 rounded-full object-cover shadow-lg border-2 border-white cursor-help transition-all ${isInactive ? 'opacity-50 scale-90 grayscale' : 'animate-bounce'}`} 
                                                referrerPolicy="no-referrer" 
                                              />
                                            ) : (
                                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black shadow-lg border-2 border-white cursor-help transition-all ${isInactive ? 'bg-slate-400 opacity-50 scale-90 grayscale' : 'bg-indigo-600 animate-bounce'}`}>
                                                {op.name.charAt(0)}
                                              </div>
                                            )}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover/op:opacity-100 transition-all whitespace-nowrap z-20">
                                              {op.name} {isInactive && '(INACTIVO)'}
                                              <br/>
                                              <span className="text-indigo-300 text-[9px]">{op.logs[0].slot_code}</span>
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="w-6 h-6 rounded-full border border-dashed border-slate-200 flex items-center justify-center text-[8px] text-slate-200">
                                        ∅
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Esperando lecturas en Planta {plant}...</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Zona de Recepción / Expedición */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-16 bg-slate-200/50 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-around px-12">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">MUELLES DE CARGA / DESCARGA</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'movements' && (
          <div className="space-y-8">
            {/* Filtros Historial */}
            <div className="flex flex-col lg:flex-row gap-4 items-end justify-between">
               <div className="w-full flex flex-col md:flex-row gap-4 flex-wrap">
                 <div className="space-y-2">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Periodo Consulta</label>
                   <div className="flex gap-2">
                      <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setScope('range'); }} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                      <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setScope('range'); }} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                   </div>
                 </div>
                 <div className="space-y-2 min-w-[180px]">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Operario</label>
                   <select 
                    value={selectedOperator || ''} 
                    onChange={e => setSelectedOperator(e.target.value || null)}
                    className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100 uppercase"
                   >
                     <option value="">TODOS LOS EMPLEADOS</option>
                     {getOperatorStats().map(([key, op]) => (
                       <option key={key} value={key}>{op.name}</option>
                     ))}
                   </select>
                 </div>
                 <div className="space-y-2 flex-1 min-w-[180px]">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Buscar Carro</label>
                   <input 
                    type="text" 
                    placeholder="ID CARRO..." 
                    value={cartSearch} 
                    onChange={e => setCartSearch(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100 uppercase"
                   />
                 </div>
               </div>
               {(selectedOperator || cartSearch) && (
                 <button onClick={() => { setSelectedOperator(null); setCartSearch(''); }} className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 mb-1 whitespace-nowrap">Limpiar Filtros ✕</button>
               )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {getOperatorStats().map(([key, op]) => (
                <button 
                  key={key} 
                  onClick={() => setSelectedOperator(key)}
                  className={`p-5 rounded-[2rem] border-2 transition-all text-left flex flex-col justify-between h-28 ${selectedOperator === key ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-100 text-white' : 'bg-slate-50 border-slate-50 hover:border-indigo-200'}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xl">👷</span>
                    <span className={`text-[12px] font-black ${selectedOperator === key ? 'text-indigo-100' : 'text-indigo-500'}`}>{op.count}</span>
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-tight leading-tight line-clamp-2 ${selectedOperator === key ? 'text-white' : 'text-slate-800'}`}>{op.name}</p>
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-slate-50 shadow-inner">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[8px]">
                  <tr>
                    <th className="px-6 py-5">TRABAJADOR</th>
                    <th className="px-6 py-5">CARRO</th>
                    <th className="px-6 py-5">HUECO</th>
                    <th className="px-6 py-5">ESTADO</th>
                    <th className="px-6 py-5 text-right">HORA</th>
                    <th className="px-6 py-5 text-right">FECHA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLogs.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">No hay movimientos que coincidan</td></tr>
                  ) : filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800 uppercase">{log.operator_name}</td>
                      <td className="px-6 py-4 font-black text-indigo-600">{log.cart_id}</td>
                      <td className="px-6 py-4 font-black text-slate-900">{log.slot_code}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-lg font-black ${log.new_quantity === 100 ? 'bg-rose-50 text-rose-600' : log.new_quantity === 50 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {log.new_quantity}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-bold text-right">{new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                      <td className="px-6 py-4 text-slate-400 font-bold text-right">{new Date(log.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'operators' && <UserManagement />}

        {activeSubTab === 'map_config' && (
          <div className="space-y-8 animate-fade-in">
            <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl mb-8">
              <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-2">⚠️ Configuración de Base de Datos Necesaria</h4>
              <p className="text-[9px] text-amber-700 font-bold uppercase mb-4">Para que el GPS y el Mapa funcionen, debes ejecutar este SQL en Supabase:</p>
              <pre className="bg-slate-900 text-indigo-300 p-4 rounded-xl text-[8px] overflow-x-auto font-mono">
{`CREATE TABLE IF NOT EXISTS operator_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_email TEXT,
  latitude FLOAT8,
  longitude FLOAT8,
  accuracy FLOAT8,
  machinery_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_map_calibration (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id UUID REFERENCES warehouse_maps(id) ON DELETE CASCADE,
  point_name TEXT,
  latitude FLOAT8,
  longitude FLOAT8,
  x_percent FLOAT8,
  y_percent FLOAT8,
  created_at TIMESTAMPTZ DEFAULT now()
);`}
              </pre>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setActiveSubTab('map')}
                  className="bg-slate-100 p-3 rounded-2xl text-slate-600 hover:bg-slate-200 transition-all"
                >
                  ←
                </button>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Configuración de Plano Real</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sube tu PNG y define las coordenadas de las calles</p>
                </div>
              </div>
              <div className="bg-indigo-600 p-4 rounded-2xl text-white max-w-xs">
                <p className="text-[8px] font-black uppercase tracking-widest mb-2 text-indigo-200">Guía Rápida</p>
                <ol className="text-[9px] font-bold space-y-1 list-decimal ml-4 opacity-90">
                  <li>Elige la planta (U01/U02) y sube el PNG.</li>
                  <li><b>Calles:</b> Escribe el ID, haz clic en el mapa y guarda.</li>
                  <li><b>GPS:</b> Cambia a la pestaña "GPS (Beta)".</li>
                  <li>Haz clic en un punto del mapa (ej: esquina).</li>
                  <li>Escribe la Lat/Long real de ese punto y guarda.</li>
                  <li>Repite con un segundo punto alejado del primero.</li>
                </ol>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-4">
                <div className="text-xl">🛰️</div>
                <div>
                  <p className="text-[8px] font-black text-emerald-800 uppercase tracking-widest">Estado GPS Local</p>
                  <button 
                    onClick={() => {
                      if ("geolocation" in navigator) {
                        navigator.geolocation.getCurrentPosition(
                          (pos) => alert(`GPS OK: Lat ${pos.coords.latitude}, Long ${pos.coords.longitude}`),
                          (err) => alert(`Error GPS: ${err.message}. Si estás en la vista previa del editor, prueba a abrir la aplicación en una pestaña nueva (botón arriba a la derecha) para que el navegador te pida los permisos correctamente.`)
                        );
                      } else {
                        alert("Tu navegador no soporta GPS");
                      }
                    }}
                    className="text-[9px] font-bold text-emerald-600 underline uppercase"
                  >
                    Probar GPS en este dispositivo
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">1. Seleccionar Planta</h4>
                  <div className="flex gap-2 mb-6">
                    {['U01', 'U02'].map(p => (
                      <button 
                        key={p}
                        onClick={() => setMapForm(prev => ({ ...prev, plant: p }))}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${mapForm.plant === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-100'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSaveMap} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Imagen del Plano</label>
                      <div 
                        className={`w-full bg-white border-2 border-dashed p-6 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all ${mapForm.image_url.startsWith('data:') ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}
                      >
                        <span className="text-3xl">{mapForm.image_url.startsWith('data:') ? '✅' : '🗺️'}</span>
                        <div className="text-center">
                          <p className="text-[10px] font-black text-slate-800 uppercase">
                            {mapForm.image_url.startsWith('data:') ? 'Imagen Cargada' : 'Sin Imagen Seleccionada'}
                          </p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">PNG o JPG (Max 5MB)</p>
                        </div>
                        
                        <label className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                          {mapForm.image_url.startsWith('data:') ? 'Cambiar Imagen' : 'Seleccionar Archivo'}
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {mapForm.image_url && (
                        <button 
                          type="button"
                          onClick={() => setMapForm(prev => ({ ...prev, image_url: '' }))}
                          className="text-[8px] font-black text-rose-500 uppercase tracking-widest mt-1 ml-2"
                        >
                          Limpiar Imagen ✕
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">O pega la URL del Plano</label>
                      <input 
                        type="text" 
                        placeholder="https://..." 
                        value={mapForm.image_url.startsWith('data:') ? 'Imagen cargada localmente' : mapForm.image_url}
                        onChange={e => setMapForm(prev => ({ ...prev, image_url: e.target.value }))}
                        className="w-full bg-white p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100"
                      />
                    </div>
                    <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-800 transition-all">
                      Guardar Plano
                    </button>
                  </form>
                </div>

                {warehouseMaps.find(m => m.plant === mapForm.plant) && (
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                      <button 
                        onClick={() => setConfigMode('streets')}
                        className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${configMode === 'streets' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        Calles
                      </button>
                      <button 
                        onClick={() => setConfigMode('gps')}
                        className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${configMode === 'gps' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        GPS (Calibración)
                      </button>
                    </div>

                    {configMode === 'streets' ? (
                      <>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">2. Definir Coordenadas de Calles</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Haz clic en el mapa de la derecha para situar una calle</p>
                        
                        <form onSubmit={handleSaveCoord} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">ID Calle (Ej: U01-C01)</label>
                            <input 
                              type="text" 
                              placeholder="U01-C01" 
                              value={coordForm.street_id}
                              onChange={e => setCoordForm(prev => ({ ...prev, street_id: e.target.value.toUpperCase() }))}
                              className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100 uppercase"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-3 rounded-xl text-center">
                              <span className="text-[8px] font-black text-slate-400 uppercase block">X %</span>
                              <span className="text-xs font-black">{coordForm.x_percent.toFixed(1)}</span>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl text-center">
                              <span className="text-[8px] font-black text-slate-400 uppercase block">Y %</span>
                              <span className="text-xs font-black">{coordForm.y_percent.toFixed(1)}</span>
                            </div>
                          </div>
                          <button 
                            type="submit" 
                            disabled={!coordForm.street_id}
                            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                          >
                            Guardar Ubicación
                          </button>
                        </form>

                        <div className="pt-6 border-t border-slate-100">
                          <h5 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-4">Calles Configuradas</h5>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                            {streetCoords.filter(c => c.map_id === warehouseMaps.find(m => m.plant === mapForm.plant)?.id).map(c => (
                              <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <span className="text-[9px] font-black text-slate-700 uppercase">{c.street_id}</span>
                                <button onClick={() => deleteCoord(c.id)} className="text-rose-500 hover:text-rose-700 transition-colors">✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">2. Calibración GPS</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Necesitas 2 puntos para calibrar el plano</p>
                        
                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 mb-4">
                          <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest mb-2">Calibración Automática</p>
                          <button 
                            type="button"
                            onClick={() => {
                              if ("geolocation" in navigator) {
                                navigator.geolocation.getCurrentPosition(
                                  (pos) => {
                                    setCalibForm(prev => ({ 
                                      ...prev, 
                                      latitude: pos.coords.latitude, 
                                      longitude: pos.coords.longitude 
                                    }));
                                    // Feedback visual
                                    const btn = document.getElementById('gps-btn');
                                    if (btn) {
                                      btn.classList.add('bg-emerald-800');
                                      setTimeout(() => btn.classList.remove('bg-emerald-800'), 500);
                                    }
                                  },
                                  (err) => alert("Error al obtener ubicación: " + err.message),
                                  { enableHighAccuracy: true }
                                );
                              } else {
                                alert("GPS no soportado");
                              }
                            }}
                            id="gps-btn"
                            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                          >
                            <span>📍</span>
                            Obtener Ubicación Actual
                          </button>
                        </div>

                        <form onSubmit={(e) => handleSaveCalibration(e, calibForm)} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Nombre del Punto</label>
                            <input 
                              type="text" 
                              value={calibForm.point_name}
                              onChange={e => setCalibForm(prev => ({ ...prev, point_name: e.target.value }))}
                              className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Latitud</label>
                              <input 
                                type="number" 
                                step="any"
                                value={calibForm.latitude}
                                onChange={e => setCalibForm(prev => ({ ...prev, latitude: parseFloat(e.target.value) }))}
                                className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Longitud</label>
                              <input 
                                type="number" 
                                step="any"
                                value={calibForm.longitude}
                                onChange={e => setCalibForm(prev => ({ ...prev, longitude: parseFloat(e.target.value) }))}
                                className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-3 rounded-xl text-center">
                              <span className="text-[8px] font-black text-slate-400 uppercase block">X %</span>
                              <span className="text-xs font-black">{calibForm.x_percent.toFixed(1)}</span>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl text-center">
                              <span className="text-[8px] font-black text-slate-400 uppercase block">Y %</span>
                              <span className="text-xs font-black">{calibForm.y_percent.toFixed(1)}</span>
                            </div>
                          </div>
                          <button 
                            type="submit" 
                            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 transition-all"
                          >
                            Guardar Punto de Calibración
                          </button>
                        </form>

                        <div className="pt-6 border-t border-slate-100">
                          <h5 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-4">Puntos de Calibración</h5>
                          <div className="space-y-2">
                            {calibrationPoints.filter(p => p.map_id === warehouseMaps.find(m => m.plant === mapForm.plant)?.id).map(p => (
                              <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black text-slate-700 uppercase">{p.point_name}</span>
                                  <span className="text-[7px] text-slate-400">{p.latitude}, {p.longitude}</span>
                                </div>
                                <button onClick={() => deleteCalibration(p.id)} className="text-rose-500 hover:text-rose-700 transition-colors">✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="lg:col-span-2">
                <div className="bg-slate-900 rounded-[3rem] p-4 border border-slate-800 shadow-2xl relative overflow-hidden min-h-[600px] flex items-center justify-center">
                  {mapForm.image_url ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img 
                        src={mapForm.image_url} 
                        alt="Vista previa plano" 
                        className="max-w-full max-h-[700px] object-contain cursor-crosshair"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = ((e.clientX - rect.left) / rect.width) * 100;
                          const y = ((e.clientY - rect.top) / rect.height) * 100;
                          setSelectedMapId(warehouseMaps.find(m => m.plant === mapForm.plant)?.id || null);
                          
                          if (configMode === 'streets') {
                            setCoordForm(prev => ({ ...prev, x_percent: x, y_percent: y }));
                          } else {
                            setCalibForm(prev => ({ ...prev, x_percent: x, y_percent: y }));
                          }
                        }}
                        referrerPolicy="no-referrer"
                      />
                      {/* Marcadores de calles ya configuradas */}
                      {streetCoords.filter(c => c.map_id === warehouseMaps.find(m => m.plant === mapForm.plant)?.id).map(c => (
                        <div 
                          key={c.id}
                          className="absolute w-4 h-4 bg-indigo-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
                          style={{ left: `${c.x_percent}%`, top: `${c.y_percent}%`, transform: 'translate(-50%, -50%)' }}
                        >
                          <div className="absolute bottom-full mb-1 px-2 py-0.5 bg-indigo-600 text-white text-[6px] font-black rounded uppercase whitespace-nowrap">
                            {c.street_id}
                          </div>
                        </div>
                      ))}
                      {/* Marcadores de calibración GPS */}
                      {calibrationPoints.filter(p => p.map_id === warehouseMaps.find(m => m.plant === mapForm.plant)?.id).map(p => (
                        <div 
                          key={p.id}
                          className="absolute w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
                          style={{ left: `${p.x_percent}%`, top: `${p.y_percent}%`, transform: 'translate(-50%, -50%)' }}
                        >
                          <div className="absolute bottom-full mb-1 px-2 py-0.5 bg-emerald-600 text-white text-[6px] font-black rounded uppercase whitespace-nowrap">
                            {p.point_name}
                          </div>
                        </div>
                      ))}
                      {/* Marcador temporal (el que se está situando) */}
                      {configMode === 'streets' ? (
                        coordForm.street_id && (
                          <div 
                            className="absolute w-6 h-6 bg-rose-500 rounded-full border-2 border-white shadow-xl animate-pulse flex items-center justify-center"
                            style={{ left: `${coordForm.x_percent}%`, top: `${coordForm.y_percent}%`, transform: 'translate(-50%, -50%)' }}
                          >
                            <div className="absolute bottom-full mb-2 px-2 py-1 bg-rose-600 text-white text-[7px] font-black rounded uppercase whitespace-nowrap">
                              NUEVO: {coordForm.street_id}
                            </div>
                          </div>
                        )
                      ) : (
                        <div 
                          className="absolute w-6 h-6 bg-amber-500 rounded-full border-2 border-white shadow-xl animate-pulse flex items-center justify-center"
                          style={{ left: `${calibForm.x_percent}%`, top: `${calibForm.y_percent}%`, transform: 'translate(-50%, -50%)' }}
                        >
                          <div className="absolute bottom-full mb-2 px-2 py-1 bg-amber-600 text-white text-[7px] font-black rounded uppercase whitespace-nowrap">
                            CALIBRAR: {calibForm.point_name}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="text-6xl">🗺️</div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Introduce una URL de imagen para empezar</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'tasks' && (
          <div className="space-y-8">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mx-auto mb-8 shadow-inner">
               <button 
                onClick={() => setTasksView('report')} 
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tasksView === 'report' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 Informe de Tiempos
               </button>
               <button 
                onClick={() => setTasksView('config')} 
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tasksView === 'config' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 Configuración
               </button>
            </div>

            {tasksView === 'report' ? (
              <section className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-8 animate-fade-in">
                 <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div className="space-y-2">
                      <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Rendimiento en Tareas (Redondeado)</h3>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tramos de 15 min al alza (Regla 15 min min.)</p>
                    </div>
                    <div className="flex flex-wrap gap-4 items-end">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Desde</label>
                          <input type="date" value={taskLogDateFrom} onChange={e => setTaskLogDateFrom(e.target.value)} className="bg-white p-3 rounded-xl text-[10px] font-black outline-none border border-slate-200" />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Hasta</label>
                          <input type="date" value={taskLogDateTo} onChange={e => setTaskLogDateTo(e.target.value)} className="bg-white p-3 rounded-xl text-[10px] font-black outline-none border border-slate-200" />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Operario</label>
                          <select 
                            value={taskLogOperator} 
                            onChange={e => setTaskLogOperator(e.target.value)}
                            className="bg-white p-3 rounded-xl text-[10px] font-black outline-none border border-slate-200 uppercase min-w-[150px]"
                          >
                            <option value="todos">Todos los Operarios</option>
                            {getOperatorStats().map(([key, op]) => (
                              <option key={key} value={op.email}>{op.name.toUpperCase()}</option>
                            ))}
                          </select>
                       </div>
                    </div>
                 </div>

                 <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl text-white flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 text-white/10 text-[12rem] font-black pointer-events-none">Σ</div>
                    <div className="relative z-10 text-center md:text-left">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-200 mb-2">Total tiempo acumulado</p>
                      <p className="text-6xl font-black tracking-tighter">{calculateTotalTimeRounded(taskLogs)}</p>
                      <p className="text-[8px] font-bold uppercase tracking-widest mt-2 opacity-60">HH:MM DE ACTIVIDAD FACTURABLE</p>
                    </div>
                    <div className="relative z-10 bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest mb-1">Registros</p>
                      <p className="text-3xl font-black">{taskLogs.length}</p>
                    </div>
                 </div>

                 <div className="overflow-x-auto rounded-[2rem] bg-white border border-slate-100">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-950 text-white font-black uppercase tracking-widest text-[8px]">
                        <tr>
                          <th className="px-6 py-4">TAREA</th>
                          <th className="px-6 py-4">TIPO</th>
                          <th className="px-6 py-4">OPERARIO</th>
                          <th className="px-6 py-4 text-center">INICIO</th>
                          <th className="px-6 py-4 text-center">FIN</th>
                          <th className="px-6 py-4 text-right">DURACIÓN (REDON)</th>
                          <th className="px-6 py-4 text-center">ACCIONES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {loadingTaskLogs ? (
                          <tr><td colSpan={7} className="py-16 text-center animate-pulse text-slate-300 font-black uppercase text-[10px]">Cargando registros...</td></tr>
                        ) : taskLogs.length === 0 ? (
                          <tr><td colSpan={7} className="py-16 text-center text-slate-300 font-black uppercase text-[10px]">Sin actividad en el periodo</td></tr>
                        ) : taskLogs.map(log => {
                          const roundedMs = getRoundedDurationMs(log.start_time, log.end_time);
                          const durationStr = log.end_time ? formatMsToHHMM(roundedMs) : '--:--';
                          
                          return (
                            <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <p className="font-black text-slate-800 uppercase">{log.tasks?.name || 'Desconocida'}</p>
                                {log.tasks?.description && <p className="text-[7px] text-slate-400 font-bold uppercase mt-0.5">{log.tasks.description}</p>}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border uppercase ${
                                  log.tasks?.task_type === 'daily' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                  log.tasks?.task_type === 'once' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                                  'bg-emerald-50 text-emerald-600 border-emerald-100'
                                }`}>
                                  {log.tasks?.task_type === 'daily' ? 'Diaria' : log.tasks?.task_type === 'once' ? 'Puntual' : 'Libre'}
                                </span>
                              </td>
                              <td className="px-6 py-4 font-bold text-indigo-600 uppercase">{log.profiles?.full_name || log.operator_email}</td>
                              <td className="px-6 py-4 text-slate-400 font-bold text-center text-[10px]">
                                {new Date(log.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                              </td>
                              <td className="px-6 py-4 text-slate-400 font-bold text-center text-[10px]">
                                {log.end_time ? new Date(log.end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : <span className="text-rose-500 font-black">ABIERTA</span>}
                              </td>
                              <td className="px-6 py-4 text-right font-black text-slate-900">
                                {durationStr}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex justify-center gap-2">
                                  {user.role === 'admin' && (
                                    <>
                                      {!log.end_time && (
                                        <button 
                                          onClick={() => handleFinishTaskLog(log.id)}
                                          className="bg-emerald-50 text-emerald-600 p-2 rounded-lg hover:bg-emerald-100 transition-all active:scale-90"
                                          title="Finalizar tarea manualmente"
                                        >
                                          🏁
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => handleDeleteTaskLog(log.id)}
                                        className="bg-rose-50 text-rose-600 p-2 rounded-lg hover:bg-rose-100 transition-all active:scale-90"
                                        title="Eliminar registro"
                                      >
                                        🗑️
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                 </div>
              </section>
            ) : (
              <section className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Gestión de Tareas Disponibles</h3>
                   <button onClick={() => { 
                     setEditingTaskId(null); 
                     setTaskForm({ 
                       name: '', 
                       description: '',
                       allowed_roles: [], 
                       assigned_user_emails: [],
                       task_type: 'free',
                       is_timed: false 
                     }); 
                     setShowTaskModal(true); 
                   }} className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all">Nueva Tarea</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                   {tasks.map(t => (
                     <div key={t.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex flex-col justify-between group transition-all hover:bg-white hover:shadow-xl relative overflow-hidden h-44">
                        <div className="flex justify-between items-start">
                          <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-lg">
                            {t.is_timed ? '⏱️' : '📌'}
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => openEditTask(t)} className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 flex items-center justify-center">✏️</button>
                            <button onClick={() => deleteTask(t.id)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-400 flex items-center justify-center">🗑️</button>
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="font-black text-slate-800 uppercase text-xs line-clamp-1">{t.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[7px] font-black text-slate-400 uppercase">
                              {t.task_type === 'daily' ? '📅 Diaria' : t.task_type === 'once' ? '🎯 Puntual' : '🔓 Libre'}
                            </p>
                            {t.assigned_user_emails && t.assigned_user_emails.length > 0 && (
                              <span className="text-[6px] font-black bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded-full uppercase border border-rose-100 animate-pulse">Personal</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {t.allowed_roles.map(r => (
                              <span key={r} className="text-[7px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">{r}</span>
                            ))}
                            {t.assigned_user_emails && t.assigned_user_emails.length > 0 && (
                              <span className="text-[7px] font-black text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase">+{t.assigned_user_emails.length} Usuarios</span>
                            )}
                          </div>
                        </div>
                     </div>
                   ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeSubTab === 'machinery' && (
          <div className="space-y-6 animate-fade-in">
            {selectedMachineryId ? (
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setSelectedMachineryId(null)}
                    className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all"
                  >
                    ←
                  </button>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                      Ficha de Maquinaria: {machinery.find(m => m.id === selectedMachineryId)?.identifier}
                    </h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Historial y control de mantenimiento</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1 space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-3xl mb-4 mx-auto">
                        {machinery.find(m => m.id === selectedMachineryId)?.type === 'carretilla' ? '🚜' : '📱'}
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-2xl font-black text-slate-800 uppercase">{machinery.find(m => m.id === selectedMachineryId)?.identifier}</p>
                        <p className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full uppercase inline-block">
                          {machinery.find(m => m.id === selectedMachineryId)?.type}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4">
                          Registrada el {new Date(machinery.find(m => m.id === selectedMachineryId)?.created_at || '').toLocaleDateString()}
                        </p>
                      </div>
                      
                      <div className="mt-8 pt-8 border-t border-slate-200">
                        <button 
                          onClick={() => openMaintenanceModal(selectedMachineryId)}
                          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 active:scale-95 transition-all"
                        >
                          + Registrar Avería/Revisión
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Historial de Intervenciones</h4>
                    <div className="space-y-4">
                      {maintenanceRecords.filter(r => r.machinery_id === selectedMachineryId).length === 0 ? (
                        <div className="py-20 text-center bg-slate-50 rounded-[3rem] border border-slate-100">
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sin historial de mantenimiento</p>
                        </div>
                      ) : (
                        maintenanceRecords.filter(r => r.machinery_id === selectedMachineryId).map(record => (
                          <div 
                            key={record.id} 
                            onClick={() => openEditMaintenance(record)}
                            className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${
                                record.type === 'averia' ? 'bg-rose-50 text-rose-500' : 
                                record.type === 'reparacion' ? 'bg-emerald-50 text-emerald-500' : 
                                'bg-indigo-50 text-indigo-500'
                              }`}>
                                {record.type === 'averia' ? '⚠️' : record.type === 'reparacion' ? '🔧' : '📋'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${
                                    record.type === 'averia' ? 'bg-rose-100 text-rose-600' : 
                                    record.type === 'reparacion' ? 'bg-emerald-100 text-emerald-600' : 
                                    'bg-indigo-100 text-indigo-600'
                                  }`}>
                                    {record.type}
                                  </span>
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">{new Date(record.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-[10px] text-slate-800 font-bold mt-1 whitespace-pre-wrap">{record.description}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[8px] font-medium text-slate-400 uppercase">Por: {record.reported_by}</span>
                                  {record.cost && record.cost > 0 && (
                                    <span className="text-[8px] font-black text-slate-600 uppercase">Coste: {record.cost}€</span>
                                  )}
                                  {record.attachment_url && (
                                    <a 
                                      href={record.attachment_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[8px] font-black text-indigo-600 uppercase hover:underline flex items-center gap-1"
                                    >
                                      <span>📄 Ver PDF</span>
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 self-end md:self-center">
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleMaintenanceStatus(record); }}
                                className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${
                                  record.status === 'completed' 
                                  ? 'bg-emerald-600 text-white border-emerald-600' 
                                  : 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100'
                                }`}
                              >
                                {record.status === 'completed' ? 'Completado' : 'Pendiente'}
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteMaintenance(record.id); }}
                                className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Maquinaria y PDAs</h3>
                   <button onClick={() => setShowMachineryModal(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all">Nueva Maquina</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                   {machinery.map(m => {
                     const hasPendingBreakdown = maintenanceRecords.some(r => r.machinery_id === m.id && r.type === 'averia' && r.status === 'pending');
                     
                     return (
                       <div 
                        key={m.id} 
                        onClick={() => setSelectedMachineryId(m.id)}
                        className={`p-6 rounded-[2.5rem] border flex items-center justify-between group cursor-pointer hover:shadow-xl transition-all ${
                          hasPendingBreakdown 
                          ? 'bg-rose-50 border-rose-200 hover:bg-rose-100 hover:border-rose-300' 
                          : 'bg-slate-50 border-slate-100 hover:bg-white hover:border-indigo-200'
                        }`}
                       >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl shadow-sm flex items-center justify-center ${hasPendingBreakdown ? 'bg-rose-100' : 'bg-white'}`}>
                              {m.type === 'carretilla' ? '🚜' : '📱'}
                            </div>
                            <div>
                              <p className={`font-black uppercase text-sm ${hasPendingBreakdown ? 'text-rose-900' : 'text-slate-800'}`}>{m.identifier}</p>
                              <p className={`text-[8px] font-bold uppercase tracking-widest mt-1 ${hasPendingBreakdown ? 'text-rose-400' : 'text-slate-400'}`}>{m.type}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all ${hasPendingBreakdown ? 'bg-rose-200 text-rose-600' : 'bg-indigo-50 text-indigo-400'}`}>👁️</div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteMachinery(m.id); }} 
                              className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                            >
                              🗑️
                            </button>
                          </div>
                       </div>
                     );
                   })}
                </div>
              </>
            )}
          </div>
        )}

        {activeSubTab === 'truckers' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Transportistas Habituales</h3>
               <button onClick={() => setShowTruckerModal(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100">Nuevo Camión</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
               {truckers.map(t => (
                 <div key={t.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div className="flex-1">
                      <p className="font-black text-slate-800 uppercase text-sm">{t.label}</p>
                    </div>
                    <button onClick={() => deleteTrucker(t.id)} className="w-10 h-10 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">🗑️</button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeSubTab === 'installers' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Instaladores Habituales</h3>
               <button onClick={() => setShowInstallerModal(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100">Nuevo Instalador</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
               {installers.map(t => (
                 <div key={t.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div className="flex-1">
                      <p className="font-black text-slate-800 uppercase text-sm">{t.label}</p>
                    </div>
                    <button onClick={() => deleteInstaller(t.id)} className="w-10 h-10 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">🗑️</button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeSubTab === 'sectors' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Estado Global Inventario</h4>
                <div className="space-y-4">
                   <div className="flex justify-between items-end">
                      <span className="text-2xl font-black text-slate-800">{stats.total}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Huecos Totales</span>
                   </div>
                   <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all" style={{width: `${(stats.occupied / stats.total) * 100}%`}}></div>
                   </div>
                   <div className="grid grid-cols-3 gap-2">
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-emerald-500">{stats.empty}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">Vacíos</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-rose-500">{stats.occupied}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">Ocupados</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-amber-500">{stats.pending}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">S/Lectura</p>
                      </div>
                   </div>
                </div>
             </div>
             <div className="bg-indigo-900 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-center text-white">
                <div className="absolute -right-10 -bottom-10 text-white/10 text-[10rem] font-black pointer-events-none">OK</div>
                <h4 className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.3em] mb-4">Métrica de Ocupación</h4>
                <p className="text-5xl font-black">{stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-4 opacity-60">Saturación del Almacén</p>
             </div>
          </div>
        )}

        {activeSubTab === 'reports' && (
          <div className="space-y-12 animate-fade-in">
             <div className="flex flex-col md:flex-row gap-6 items-end mb-8">
               <div className="flex-1 space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Periodo del Informe</label>
                 <div className="flex flex-wrap gap-2">
                    <button onClick={setRangeToToday} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${scope === 'today' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Hoy</button>
                    <button onClick={setRangeToThisWeek} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${scope === 'week' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Esta Semana</button>
                    <button onClick={() => setScope('range')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${scope === 'range' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Manual</button>
                 </div>
                 <div className="flex gap-2">
                    <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setScope('range'); }} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                    <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setScope('range'); }} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                 </div>
               </div>
            </div>

            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 uppercase tracking-tight ml-2">Desglose Ocupación por Planta y Tamaño (Huecos)</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {warehouseBreakdown.map((plantData: any) => (
                   <div key={plantData.plant} className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-6">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                        <div>
                          <h4 className="text-3xl font-bold text-indigo-600 leading-none">{plantData.plant}</h4>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] mt-2">PLANTA DE ALMACENAMIENTO</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-slate-800">{plantData.avgOccupancy}%</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Media Ocupación</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {plantData.sizeBreakdown.map((sizeData: any) => (
                          <div key={sizeData.size} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                             <div className="flex justify-between items-center mb-4">
                                <span className="text-sm font-semibold text-slate-800 uppercase">{sizeData.size}</span>
                                <span className="text-base font-bold text-indigo-500">{sizeData.occupancy}%</span>
                             </div>
                             <div className="grid grid-cols-4 gap-2 text-center">
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-slate-800 leading-none">{sizeData.total}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Capacidad</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-rose-500 leading-none">{sizeData.full}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Llenos</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-amber-500 leading-none">{sizeData.half}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Medios</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-emerald-500 leading-none">{sizeData.empty}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Libres</span>
                               </div>
                             </div>
                             <div className="mt-5 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 transition-all" style={{width: `${sizeData.occupancy}%`}}></div>
                             </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-center text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-2">Ocupación real calculada sobre {plantData.totalSlots} huecos en {plantData.plant}</p>
                   </div>
                 ))}
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 uppercase tracking-tight ml-2">Rendimiento Operarios (Promedio en Periodo Seleccionado)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getOperatorStats().map(([key, op]) => (
                  <div key={key} className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm">👷</div>
                      <div>
                        <p className="font-semibold text-slate-800 uppercase text-sm tracking-tight">{op.name}</p>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] mt-1">{op.count} CAPTURAS EN EL PERIODO</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold text-indigo-600 leading-none">{calculateAvgTime(op.logs)}</p>
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Tiempo Medio</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form 
            onSubmit={handleCreateOrUpdateTask} 
            className="bg-white w-full max-w-md rounded-[2.5rem] p-6 md:p-8 shadow-2xl space-y-4 animate-fade-in border border-white max-h-[95vh] overflow-y-auto"
           >
              <div className="text-center">
                 <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tighter">{editingTaskId ? 'Editar Tarea' : 'Nueva Tarea'}</h3>
                 <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Configuración de actividad</p>
              </div>
              
              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre</label>
                  <input 
                    autoFocus 
                    placeholder="EJ: TRASPASOS..." 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-5 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                    value={taskForm.name} 
                    onChange={e => setTaskForm({ ...taskForm, name: e.target.value })} 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción</label>
                  <textarea 
                    placeholder="DETALLES..." 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-5 font-black text-[10px] outline-none focus:border-indigo-500 min-h-[50px]" 
                    value={taskForm.description} 
                    onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                    <div className="flex flex-col gap-1.5">
                      {(['once', 'daily', 'free'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setTaskForm({ ...taskForm, task_type: type })}
                          className={`py-2 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${
                            taskForm.task_type === type 
                            ? (type === 'once' ? 'bg-slate-900 text-white' : type === 'daily' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white') 
                            : 'bg-slate-50 text-slate-400 border-slate-100'
                          }`}
                        >
                          {type === 'once' ? 'Puntual' : type === 'daily' ? 'Diaria' : 'Libre'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Roles</label>
                    <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {roles.map(role => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleRoleForTask(role.name)}
                          className={`py-2 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${taskForm.allowed_roles.includes(role.name) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                        >
                          {role.name.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Asignación Personal</label>
                  <div className="max-h-40 overflow-y-auto pr-1 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    {profiles.length === 0 ? (
                      <p className="text-[8px] text-slate-400 text-center py-4 uppercase font-bold">No hay usuarios</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {profiles.map(profile => (
                          <button
                            key={profile.id || profile.email}
                            type="button"
                            onClick={() => toggleUserForTask(profile.email)}
                            className={`p-2 rounded-xl border transition-all flex flex-col items-center text-center gap-1.5 group relative ${
                              taskForm.assigned_user_emails.includes(profile.email) 
                              ? 'bg-indigo-600 border-indigo-600' 
                              : 'bg-white border-white shadow-sm'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] overflow-hidden border transition-all ${
                              taskForm.assigned_user_emails.includes(profile.email) ? 'border-indigo-400' : 'border-slate-50'
                            }`}>
                              {profile.avatar_url ? (
                                <img src={profile.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className={`w-full h-full flex items-center justify-center font-black ${
                                  taskForm.assigned_user_emails.includes(profile.email) ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {profile.full_name?.charAt(0) || '?'}
                                </div>
                              )}
                            </div>
                            <p className={`text-[7px] font-black uppercase tracking-tight leading-tight line-clamp-1 ${
                              taskForm.assigned_user_emails.includes(profile.email) ? 'text-white' : 'text-slate-800'
                            }`}>
                              {profile.full_name}
                            </p>
                            {taskForm.assigned_user_emails.includes(profile.email) && (
                              <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-md text-[8px]">
                                ⭐
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-800 uppercase">Cronómetro</span>
                    <span className="text-[6px] font-bold text-slate-400 uppercase">Activar al iniciar</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskForm({ ...taskForm, is_timed: !taskForm.is_timed })}
                    className={`w-10 h-5 rounded-full relative transition-all ${taskForm.is_timed ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${taskForm.is_timed ? 'left-5.5 shadow-sm' : 'left-0.5 shadow-none'}`}></div>
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                 <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-3 rounded-xl shadow-lg uppercase tracking-widest text-[9px] active:scale-95 transition-all">
                    {loading ? 'GUARDANDO...' : (editingTaskId ? 'Actualizar' : 'Guardar Tarea')}
                 </button>
                 <button type="button" onClick={() => { setShowTaskModal(false); setEditingTaskId(null); }} className="w-full py-2 text-slate-400 font-black text-[8px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}

      {showTruckerModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateTrucker} className="bg-white w-full max-sm rounded-[3rem] p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">Nuevo Transportista</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Registrar para habituales</p>
              </div>
              <input 
                autoFocus 
                placeholder="NOMBRE / Nº CAMIÓN" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                value={truckerForm.label} 
                onChange={e => setTruckerForm({ ...truckerForm, label: e.target.value })} 
              />
              <div className="space-y-3">
                 <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">Guardar Transportista</button>
                 <button type="button" onClick={() => setShowTruckerModal(false)} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}

      {showInstallerModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateInstaller} className="bg-white w-full max-sm rounded-[3rem] p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">Nuevo Instalador</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Registrar para habituales</p>
              </div>
              <input 
                autoFocus 
                placeholder="NOMBRE COMPLETO" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                value={installerForm.label} 
                onChange={e => setInstallerForm({ ...installerForm, label: e.target.value })} 
              />
              <div className="space-y-3">
                 <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">Guardar Instalador</button>
                 <button type="button" onClick={() => setShowInstallerModal(false)} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}

      {showMachineryModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateMachinery} className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">Nueva Maquinaria</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Carretillas y PDAs</p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Tipo</label>
                  <select 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase"
                    value={machineryForm.type}
                    onChange={e => setMachineryForm({ ...machineryForm, type: e.target.value as any })}
                  >
                    <option value="carretilla">🚜 CARRETILLA</option>
                    <option value="pda">📱 PDA</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Identificador</label>
                  <input 
                    autoFocus 
                    placeholder="EJ: C-14, PDA-02..." 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                    value={machineryForm.identifier} 
                    onChange={e => setMachineryForm({ ...machineryForm, identifier: e.target.value })} 
                  />
                </div>
              </div>

              <div className="space-y-3">
                 <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">Registrar Maquina</button>
                 <button type="button" onClick={() => setShowMachineryModal(false)} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}

      {showMaintenanceModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleSaveMaintenance} className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">{editingMaintenanceId ? 'Editar Intervención' : 'Registro Mantenimiento'}</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{editingMaintenanceId ? 'Actualizar detalles' : 'Averías y revisiones'}</p>
              </div>

              {errorMessage && (
                <div className="bg-rose-50 border-2 border-rose-100 p-4 rounded-2xl">
                  <p className="text-[10px] font-black text-rose-600 uppercase leading-relaxed text-center">
                    ⚠️ {errorMessage}
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Máquina</label>
                  <select 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase disabled:opacity-50"
                    value={maintenanceForm.machinery_id}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, machinery_id: e.target.value })}
                    required
                    disabled={!!editingMaintenanceId}
                  >
                    <option value="">-- SELECCIONAR --</option>
                    {machinery.map(m => (
                      <option key={m.id} value={m.id}>{m.identifier} ({m.type})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Tipo de Intervención</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['averia', 'reparacion', 'revision'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setMaintenanceForm({ ...maintenanceForm, type })}
                        className={`py-3 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${maintenanceForm.type === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Descripción / Notas</label>
                  <textarea 
                    placeholder="DETALLES DE LA INTERVENCIÓN..." 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 min-h-[100px]" 
                    value={maintenanceForm.description} 
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} 
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Coste (€)</label>
                    <input 
                      type="number"
                      placeholder="0" 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs text-center outline-none focus:border-indigo-500" 
                      value={maintenanceForm.cost} 
                      onChange={e => setMaintenanceForm({ ...maintenanceForm, cost: Number(e.target.value) })} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Estado</label>
                    <select 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase"
                      value={maintenanceForm.status}
                      onChange={e => setMaintenanceForm({ ...maintenanceForm, status: e.target.value as any })}
                    >
                      <option value="pending">PENDIENTE</option>
                      <option value="completed">COMPLETADO</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Documento PDF (Opcional)</label>
                  
                  {editingMaintenanceId && maintenanceRecords.find(m => m.id === editingMaintenanceId)?.attachment_url && (
                    <div className="mb-3 p-4 bg-indigo-50 rounded-2xl border-2 border-indigo-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📄</span>
                        <div>
                          <p className="text-[9px] font-black text-indigo-900 uppercase tracking-tight">PDF Actualmente subido</p>
                          <a 
                            href={maintenanceRecords.find(m => m.id === editingMaintenanceId)?.attachment_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[8px] font-bold text-indigo-500 underline uppercase"
                          >
                            Ver documento actual
                          </a>
                        </div>
                      </div>
                      <span className="text-[8px] font-black text-indigo-300 uppercase">Existente</span>
                    </div>
                  )}

                  <div className="relative">
                    <input 
                      type="file"
                      accept="application/pdf"
                      onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-[10px] outline-none focus:border-indigo-500 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                    {editingMaintenanceId && maintenanceRecords.find(m => m.id === editingMaintenanceId)?.attachment_url && (
                      <p className="text-[7px] font-bold text-slate-400 uppercase mt-2 ml-2 italic">
                        * Selecciona un archivo nuevo solo si deseas reemplazar el actual
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                 <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] active:scale-95 transition-all">
                    {loading ? 'GUARDANDO...' : (editingMaintenanceId ? 'Actualizar Registro' : 'Guardar Registro')}
                 </button>
                 <button type="button" onClick={() => { setShowMaintenanceModal(false); setEditingMaintenanceId(null); }} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
