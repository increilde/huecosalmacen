import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, InventoryReading, InventoryItem, WarehouseSlot } from '../types';

interface InventoryPanelProps {
  user: UserProfile;
}

const InventoryPanel: React.FC<InventoryPanelProps> = ({ user }) => {
  const [mode, setMode] = useState<'scan' | 'admin'>(user.role === 'admin' ? 'admin' : 'scan');
  const [step, setStep] = useState<'location' | 'items'>('location');
  const [location, setLocation] = useState('');
  const [items, setItems] = useState<{ code: string, quantity: number }[]>([]);
  const [activeReadingId, setActiveReadingId] = useState<string | null>(null);
  const [currentItemCode, setCurrentItemCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
  
  // Admin states
  const [pendingReadings, setPendingReadings] = useState<(InventoryReading & { items: InventoryItem[] })[]>([]);
  const [completedReadings, setCompletedReadings] = useState<(InventoryReading & { items: InventoryItem[] })[]>([]);
  const [missingSlots, setMissingSlots] = useState<WarehouseSlot[]>([]);
  const [allTheoreticalStock, setAllTheoreticalStock] = useState<any[]>([]);
  const [adminTab, setAdminTab] = useState<'pending' | 'completed' | 'missing' | 'theoretical'>('pending');
  const [adminSearch, setAdminSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [theoreticalItems, setTheoreticalItems] = useState<{ item_code: string, quantity: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState<any[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  
  const [validationWarnings, setValidationWarnings] = useState<{slot: string, date: string}[]>([]);
  const [showWarningModal, setShowWarningModal] = useState(false);

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({
    itemCode: -1,
    slotCode: -1,
    quantity: -1,
    description: -1
  });
  const [showMappingModal, setShowMappingModal] = useState(false);
  
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showCreateSlotModal, setShowCreateSlotModal] = useState(false);
  const [capacity, setCapacity] = useState<number>(100);
  const [selectedSize, setSelectedSize] = useState<string>('Mediano');

  const locationInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);
  
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (mode === 'scan') {
      if (step === 'location') locationInputRef.current?.focus();
      else itemInputRef.current?.focus();
    }
  }, [mode, step]);

  useEffect(() => {
    if (mode === 'admin') {
      fetchAdminData();
    }
  }, [mode, adminTab]);

  const fetchAdminData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch Readings (All history for validated, but we can filter in memory)
      const { data: readings, error: readingsError } = await supabase
        .from('inventory_readings')
        .select('*, items:inventory_items(*)')
        .order('created_at', { ascending: false });

      if (readingsError) throw readingsError;
      
      // Pending: only from today (to avoid cluttering with old unfinished ones)
      // Validated: all history
      const pending = (readings || []).filter(r => r.status === 'pending' && r.created_at.startsWith(today));
      const completed = (readings || []).filter(r => r.status === 'completed');
      
      if (isMountedRef.current) {
        setPendingReadings(pending);
        setCompletedReadings(completed);
      }

      // 2. Fetch Missing Slots (Only compared to today's readings)
      const { data: allSlots, error: slotsError } = await supabase
        .from('warehouse_slots')
        .select('*');
      
      if (slotsError) throw slotsError;

      const readTodaySlotCodes = new Set((readings || []).filter(r => r.created_at.startsWith(today)).map(r => r.slot_code));
      const missing = (allSlots || []).filter(s => !readTodaySlotCodes.has(s.code));
      if (isMountedRef.current) setMissingSlots(missing);

      // 3. Fetch All Theoretical Stock
      const { data: theoretical, error: theoreticalError } = await supabase
        .from('theoretical_stock')
        .select('*');
      
      if (theoreticalError) throw theoreticalError;
      if (isMountedRef.current) setAllTheoreticalStock(theoretical || []);

    } catch (err: any) {
      if (isMountedRef.current) console.error('Error fetching admin data:', err.message);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        isFetchingRef.current = false;
      }
    }
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) return;

    setLoading(true);
    try {
      // Check if location exists in warehouse_slots
      const { data: slot, error: slotError } = await supabase
        .from('warehouse_slots')
        .select('*')
        .eq('code', location.toUpperCase())
        .single();

      if (slotError || !slot) {
        setShowCreateSlotModal(true);
        return;
      }

      // Check if already read (pending or completed today)
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch Theoretical Stock for this slot
      const { data: tStock, error: tError } = await supabase
        .from('theoretical_stock')
        .select('item_code, quantity, description')
        .eq('slot_code', location.toUpperCase());
      
      if (!tError && tStock) {
        setTheoreticalItems(tStock);
      } else {
        setTheoreticalItems([]);
      }

      const { data: existing, error: existingError } = await supabase
        .from('inventory_readings')
        .select('*, items:inventory_items(*)')
        .eq('slot_code', location.toUpperCase())
        .gte('created_at', `${today}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        const lastReading = existing[0];
        if (lastReading.status === 'completed') {
          setMessage({ text: `ESTA UBICACIÓN YA HA SIDO VALIDADA HOY`, type: 'info' });
          setLocation('');
          return;
        } else {
          // If pending, load the items and the ID so we can update it
          setItems(lastReading.items.map((i: any) => ({ code: i.item_code, quantity: i.quantity })));
          setActiveReadingId(lastReading.id);
          setCapacity(lastReading.capacity_percent || 100);
          setMessage({ text: `CARGANDO LECTURA PENDIENTE DE VALIDAR`, type: 'info' });
        }
      } else {
        setActiveReadingId(null);
      }

      // Ask for size if not set
      if (slot.size) {
        setStep('items');
        setMessage(null);
      } else {
        setSelectedSize('Mediano');
        setShowSizeModal(true);
        setMessage(null);
      }
    } catch (err: any) {
      setMessage({ text: 'ERROR AL VALIDAR UBICACIÓN', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const confirmSize = async () => {
    setLoading(true);
    try {
      await supabase
        .from('warehouse_slots')
        .update({ size: selectedSize })
        .eq('code', location.toUpperCase());
      
      setShowSizeModal(false);
      setStep('items');
    } catch (err: any) {
      setMessage({ text: 'ERROR AL GUARDAR TAMAÑO', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSlot = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('warehouse_slots')
        .insert([{
          code: location.toUpperCase(),
          size: 'Mediano',
          status: 'empty',
          quantity: 0,
          is_scanned_once: true,
          last_updated: new Date().toISOString()
        }]);

      if (error) throw error;
      
      setShowCreateSlotModal(false);
      setSelectedSize('Mediano');
      setShowSizeModal(true);
    } catch (err: any) {
      setMessage({ text: 'ERROR AL CREAR UBICACIÓN', type: 'error' });
      setShowCreateSlotModal(false);
    } finally {
      setLoading(false);
    }
  };

  const handleItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItemCode) return;

    const code = currentItemCode.toUpperCase().trim();
    setItems(prev => {
      const existingIndex = prev.findIndex(i => i.code === code);
      if (existingIndex !== -1) {
        const updated = { ...prev[existingIndex], quantity: prev[existingIndex].quantity + 1 };
        const filtered = prev.filter((_, idx) => idx !== existingIndex);
        return [updated, ...filtered];
      }
      return [{ code, quantity: 1 }, ...prev];
    });
    setCurrentItemCode('');
    // Use a small timeout to ensure focus happens after render
    setTimeout(() => {
      itemInputRef.current?.focus();
    }, 10);
  };

  const handleFinishSlot = () => {
    if (items.length === 0) {
      setMessage({ text: 'DEBES ESCANEAR AL MENOS UN ARTÍCULO', type: 'error' });
      return;
    }
    setShowCapacityModal(true);
  };

  const saveReading = async () => {
    setLoading(true);
    try {
      let readingId = activeReadingId;

      if (readingId) {
        // 1. Update existing reading
        const { error: updateError } = await supabase
          .from('inventory_readings')
          .update({
            capacity_percent: capacity,
            operator_email: user.email,
            operator_name: user.full_name,
            created_at: new Date().toISOString() // Update timestamp to show it was touched
          })
          .eq('id', readingId);

        if (updateError) throw updateError;

        // 2. Delete old items
        const { error: deleteError } = await supabase
          .from('inventory_items')
          .delete()
          .eq('reading_id', readingId);

        if (deleteError) throw deleteError;
      } else {
        // 1. Create new reading
        const { data: reading, error: readingError } = await supabase
          .from('inventory_readings')
          .insert([{
            slot_code: location.toUpperCase(),
            operator_email: user.email,
            operator_name: user.full_name,
            status: 'pending',
            capacity_percent: capacity
          }])
          .select()
          .single();

        if (readingError) throw readingError;
        readingId = reading.id;
      }

      // 3. Create/Insert items
      const itemsToInsert = items.map(i => ({
        reading_id: readingId,
        item_code: i.code,
        quantity: i.quantity
      }));

      const { error: itemsError } = await supabase
        .from('inventory_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // 3. Update warehouse_slot status (optional, user said "actualizar el estado como en el dashboard")
      // In dashboard, it updates quantity and status.
      // Here we might just mark it as scanned or update with first item? 
      // User said "actualizar el estado como en el dashboard", which usually means occupied/empty based on quantity.
      const totalQty = items.reduce((acc, curr) => acc + curr.quantity, 0);
      await supabase
        .from('warehouse_slots')
        .update({
          status: totalQty > 0 ? 'occupied' : 'empty',
          quantity: capacity, // Or maybe sum of items? Dashboard uses capacity for the slot itself usually.
          item_name: items.length > 0 ? items[0].code : '', // Just first item as reference
          is_scanned_once: true,
          last_updated: new Date().toISOString()
        })
        .eq('code', location.toUpperCase());

      setMessage({ text: 'HUECO TERMINADO Y GUARDADO CORRECTAMENTE', type: 'success' });
      resetScan();
    } catch (err: any) {
      setMessage({ text: 'ERROR AL GUARDAR INVENTARIO: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
      setShowCapacityModal(false);
    }
  };

  const resetScan = () => {
    setStep('location');
    setLocation('');
    setItems([]);
    setTheoreticalItems([]);
    setActiveReadingId(null);
    setCurrentItemCode('');
    setCapacity(100);
  };

  const markAsCompleted = async (readingId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('inventory_readings')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by_name: user.full_name
        })
        .eq('id', readingId);

      if (error) throw error;
      fetchAdminData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage({ text: 'PROCESANDO CSV...', type: 'info' });

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      
      if (lines.length < 2) {
        throw new Error('El archivo está vacío o no tiene suficientes líneas');
      }

      const separator = ';';
      const parsedRows: string[][] = [];
      let headers: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns: string[] = [];
        let currentField = '';
        let insideQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            insideQuotes = !insideQuotes;
          } else if (char === separator && !insideQuotes) {
            columns.push(currentField.trim().replace(/^["']|["']$/g, ''));
            currentField = '';
          } else {
            currentField += char;
          }
        }
        columns.push(currentField.trim().replace(/^["']|["']$/g, ''));
        
        if (i === 0) {
          headers = columns;
        } else {
          parsedRows.push(columns);
        }
      }

      setCsvHeaders(headers);
      setCsvRows(parsedRows);
      setShowMappingModal(true);
      setMessage(null);
    } catch (err: any) {
      console.error('CSV Error:', err);
      setMessage({ text: 'ERROR AL CARGAR CSV: ' + err.message, type: 'error' });
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const processMappedCSV = async () => {
    if (mapping.itemCode === -1 || mapping.slotCode === -1 || mapping.quantity === -1) {
      alert('Por favor, define las columnas para Artículo, Hueco y Cantidad');
      return;
    }

    setUploading(true);
    const groupedData = new Map<string, any>();

    try {
      for (const columns of csvRows) {
        let itemCodeRaw = columns[mapping.itemCode] || ''; 
        const description = mapping.description !== -1 ? (columns[mapping.description] || '') : ''; 
        const slotCode = (columns[mapping.slotCode] || '').toUpperCase(); 
        const qtyRaw = columns[mapping.quantity] || '0'; 
        const qty = parseFloat(qtyRaw.replace(',', '.') || '0');

        if (itemCodeRaw && slotCode) {
          // Handle scientific notation
          if (itemCodeRaw.toLowerCase().includes('e') && /^-?\d*\.?\d+e[+-]?\d+$/i.test(itemCodeRaw)) {
            try {
              const num = Number(itemCodeRaw.replace(',', '.'));
              if (!isNaN(num)) {
                itemCodeRaw = num.toLocaleString('fullwide', { useGrouping: false });
              }
            } catch (e) {
              // Ignore parsing errors for scientific notation
            }
          }

          const numericCode = itemCodeRaw.replace(/\D/g, '');
          if (numericCode) {
            const finalItemCode = numericCode.padStart(14, '0');
            const key = `${slotCode}|${finalItemCode}`;
            
            if (groupedData.has(key)) {
              const existing = groupedData.get(key);
              existing.quantity += qty;
            } else {
              groupedData.set(key, {
                item_code: finalItemCode,
                description: description,
                slot_code: slotCode,
                quantity: qty
              });
            }
          }
        }
      }

      const dataToInsert = Array.from(groupedData.values());

      if (dataToInsert.length === 0) {
        throw new Error('No se encontraron datos válidos con el mapeo seleccionado.');
      }

      // Check for already validated slots in history
      const uniqueSlots = Array.from(new Set(dataToInsert.map(d => d.slot_code)));
      
      // Query in chunks to avoid Supabase/Postgres limits if many slots
      const warnings: {slot: string, date: string}[] = [];
      for (let i = 0; i < uniqueSlots.length; i += 500) {
        const chunk = uniqueSlots.slice(i, i + 500);
        const { data: alreadyValidated } = await supabase
          .from('inventory_readings')
          .select('slot_code, completed_at')
          .eq('status', 'completed')
          .in('slot_code', chunk);
        
        if (alreadyValidated) {
          alreadyValidated.forEach(v => {
            warnings.push({
              slot: v.slot_code,
              date: new Date(v.completed_at).toLocaleString()
            });
          });
        }
      }

      setCsvPreviewData(dataToInsert);
      setShowMappingModal(false);
      
      if (warnings.length > 0) {
        setValidationWarnings(warnings);
        setShowWarningModal(true);
      } else {
        setShowCsvPreview(true);
      }
    } catch (err: any) {
      alert('Error al procesar: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const confirmCSVUpload = async () => {
    setUploading(true);
    setMessage({ text: 'GUARDANDO DATOS EN BASE DE DATOS...', type: 'info' });
    try {
      // Clear old stock
      const { error: deleteError } = await supabase.from('theoretical_stock').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (deleteError) throw deleteError;

      // Insert in chunks
      for (let i = 0; i < csvPreviewData.length; i += 1000) {
        const chunk = csvPreviewData.slice(i, i + 1000);
        const { error: insertError } = await supabase.from('theoretical_stock').insert(chunk);
        if (insertError) throw insertError;
      }

      setMessage({ text: `STOCK TEÓRICO CARGADO: ${csvPreviewData.length} REGISTROS`, type: 'success' });
      setShowCsvPreview(false);
      setCsvPreviewData([]);
    } catch (err: any) {
      setMessage({ text: 'ERROR AL GUARDAR EN BD: ' + err.message, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const filteredPending = React.useMemo(() => {
    const search = adminSearch.toUpperCase();
    const itemS = itemSearch.toUpperCase();
    return pendingReadings.filter(r => {
      const matchesSlot = (r.slot_code || '').toUpperCase().includes(search);
      const matchesItem = itemSearch === '' || (r.items || []).some(i => (i.item_code || '').toUpperCase().includes(itemS));
      return matchesSlot && matchesItem;
    });
  }, [pendingReadings, adminSearch, itemSearch]);

  const filteredCompleted = React.useMemo(() => {
    const search = adminSearch.toUpperCase();
    const itemS = itemSearch.toUpperCase();
    return completedReadings.filter(r => {
      const matchesSlot = (r.slot_code || '').toUpperCase().includes(search);
      const matchesItem = itemSearch === '' || (r.items || []).some(i => (i.item_code || '').toUpperCase().includes(itemS));
      return matchesSlot && matchesItem;
    });
  }, [completedReadings, adminSearch, itemSearch]);

  const filteredMissing = React.useMemo(() => {
    const search = adminSearch.toUpperCase();
    const itemS = itemSearch.toUpperCase();
    
    // Optimize: if itemSearch is active, create a set of slots that contain that item
    let slotsWithItem: Set<string> | null = null;
    if (itemSearch !== '') {
      slotsWithItem = new Set(
        allTheoreticalStock
          .filter(t => (t.item_code || '').toUpperCase().includes(itemS))
          .map(t => t.slot_code)
      );
    }

    return (missingSlots || []).filter(s => {
      const matchesSlot = (s.code || '').toUpperCase().includes(search);
      const matchesItem = slotsWithItem === null || slotsWithItem.has(s.code);
      return matchesSlot && matchesItem;
    });
  }, [missingSlots, allTheoreticalStock, adminSearch, itemSearch]);

  const renderReadingCard = (reading: InventoryReading & { items: InventoryItem[] }) => {
    const isPending = reading.status === 'pending';
    return (
      <div key={reading.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ubicación</p>
            <h4 className="text-xl font-black text-slate-800 tracking-tighter">{reading.slot_code}</h4>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Capacidad</p>
            <span className="text-xs font-black text-indigo-600">{reading.capacity_percent}%</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Comparativa Stock</p>
          <div className="space-y-2">
            {(() => {
              const slotTheoretical = allTheoreticalStock.filter(t => t.slot_code === reading.slot_code);
              const allCodes = Array.from(new Set([
                ...slotTheoretical.map(t => t.item_code),
                ...(reading.items || []).map(i => i.item_code)
              ]));

              return allCodes.map(code => {
                const tItem = slotTheoretical.find(t => t.item_code === code);
                const rItem = (reading.items || []).find(i => i.item_code === code);
                const scannedQty = rItem ? rItem.quantity : 0;
                const expectedQty = tItem ? tItem.quantity : 0;
                
                const isFromCSV = !!tItem;
                const isMatch = scannedQty === expectedQty;
                const isLess = scannedQty < expectedQty;
                const isNotInCSV = !isFromCSV;

                let bgColor = 'bg-slate-50';
                let textColor = 'text-slate-600';
                let statusText = '';

                if (isNotInCSV) {
                  bgColor = 'bg-blue-50';
                  textColor = 'text-blue-700';
                  statusText = '(No en CSV)';
                } else if (isMatch) {
                  bgColor = 'bg-emerald-50';
                  textColor = 'text-emerald-700';
                  statusText = '(OK)';
                } else if (isLess) {
                  bgColor = 'bg-rose-50';
                  textColor = 'text-rose-700';
                  statusText = `(Faltan ${expectedQty - scannedQty})`;
                } else {
                  bgColor = 'bg-rose-50';
                  textColor = 'text-rose-700';
                  statusText = `(Exceso ${scannedQty - expectedQty})`;
                }

                return (
                  <div key={code} className={`flex flex-col p-3 rounded-xl text-[10px] font-bold uppercase transition-all ${bgColor} ${textColor} gap-1`}>
                    <div className="flex justify-between items-start gap-2">
                      <span className="break-all flex-1">{code}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs">{scannedQty}</span>
                        {isFromCSV && (
                          <>
                            <span className="opacity-30">/</span>
                            <span className="opacity-50">{expectedQty}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[7px] opacity-70">{statusText}</span>
                      {tItem?.description && (
                        <span className="text-[7px] opacity-50 italic leading-tight">{tItem.description}</span>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-50 flex justify-between items-end">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                Leído: <span className="text-slate-600 ml-1">{new Date(reading.created_at).toLocaleString()}</span>
              </p>
            </div>
            {reading.status === 'completed' && reading.completed_at && (
              <div className="flex items-center gap-2 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">
                  Validado: <span className="ml-1">{new Date(reading.completed_at).toLocaleString()}</span>
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                Operario: <span className="text-slate-600 ml-1">{reading.operator_name}</span>
              </p>
            </div>
          </div>
          {isPending && (
            <button 
              onClick={() => markAsCompleted(reading.id)}
              className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
            >
              Validar
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Inventario Real</h2>
        <div className="flex gap-2">
          {user.role === 'admin' && (
            <button 
              onClick={() => setMode(mode === 'scan' ? 'admin' : 'scan')}
              className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${mode === 'admin' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {mode === 'admin' ? 'Modo Escaneo' : `Admin (${pendingReadings.length})`}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl font-bold text-xs uppercase text-center animate-bounce ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
          message.type === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
          'bg-amber-50 text-amber-600 border border-amber-100'
        }`}>
          {message.text}
        </div>
      )}

      {mode === 'scan' ? (
        <div className="max-w-md mx-auto space-y-6">
          {step === 'location' ? (
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6">
              <div className="text-center space-y-2">
                <div className="text-4xl">📍</div>
                <h3 className="text-lg font-black text-slate-800 uppercase">Escanear Ubicación</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lee el código de barras del hueco</p>
              </div>
              <form onSubmit={handleLocationSubmit} className="space-y-4">
                <input 
                  ref={locationInputRef}
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="UBICACIÓN..."
                  className="w-full bg-slate-50 p-6 rounded-3xl text-center text-2xl font-black outline-none border-2 border-transparent focus:border-indigo-500 transition-all uppercase"
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={loading || !location}
                  className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? 'VALIDANDO...' : 'CONTINUAR'}
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-indigo-600 p-6 rounded-[2.5rem] text-white shadow-xl flex justify-between items-center relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] opacity-60">Ubicación Actual</p>
                    {theoreticalItems.length > 0 && (
                      <span className="bg-white/20 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border border-white/30">Controlado CSV</span>
                    )}
                  </div>
                  <h3 className="text-2xl font-black tracking-tighter">{location.toUpperCase()}</h3>
                </div>
                <button onClick={resetScan} className="relative z-10 bg-white/20 p-3 rounded-2xl hover:bg-white/30 transition-all">✕</button>
                
                {/* Decorative background pattern for controlled slots */}
                {theoreticalItems.length > 0 && (
                  <div className="absolute -right-4 -bottom-4 text-white/10 text-8xl font-black select-none pointer-events-none">CSV</div>
                )}
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6 pl-[1px] pr-[25px]">
                <div className="text-center space-y-2">
                  <div className="text-4xl">📦</div>
                  <h3 className="text-lg font-black text-slate-800 uppercase">Escanear Artículos</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lee los códigos de los productos</p>
                </div>
                <form onSubmit={handleItemSubmit} className="space-y-4">
                  <input 
                    ref={itemInputRef}
                    type="text"
                    value={currentItemCode}
                    onChange={e => setCurrentItemCode(e.target.value)}
                    placeholder="CÓDIGO ARTÍCULO..."
                    className="w-full bg-slate-50 p-6 rounded-3xl text-center text-xl font-black outline-none border-2 border-transparent focus:border-indigo-500 transition-all uppercase"
                    autoFocus
                  />
                </form>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pl-[5px] pr-0">
                  {(() => {
                    const allItemCodes = Array.from(new Set([
                      ...theoreticalItems.map(t => t.item_code),
                      ...items.map(i => i.code)
                    ]));

                    if (allItemCodes.length === 0) {
                      return <p className="text-center py-8 text-slate-300 font-black uppercase text-[10px] tracking-widest">Esperando lecturas...</p>;
                    }

                    return allItemCodes.map((code) => {
                      const tItem = theoreticalItems.find(t => t.item_code === code);
                      const scannedItem = items.find(i => i.code === code);
                      const scannedQty = scannedItem ? scannedItem.quantity : 0;
                      const expectedQty = tItem ? tItem.quantity : 0;
                      const description = tItem ? tItem.description : '';
                      
                      const isFromCSV = !!tItem;
                      const isMatch = scannedQty === expectedQty;
                      const isLess = scannedQty < expectedQty;
                      const isMore = scannedQty > expectedQty;
                      const isNotInCSV = !isFromCSV;

                      let bgColor = 'bg-slate-50 border-slate-100';
                      let borderColor = 'border-slate-200';
                      let statusLabel = 'Pendiente';
                      let statusColor = 'text-slate-400';

                      if (isNotInCSV) {
                        bgColor = 'bg-blue-50';
                        borderColor = 'border-blue-200';
                        statusLabel = 'No en CSV';
                        statusColor = 'text-blue-600';
                      } else if (isMatch) {
                        bgColor = 'bg-emerald-50';
                        borderColor = 'border-emerald-200';
                        statusLabel = 'Cuadrada';
                        statusColor = 'text-emerald-600';
                      } else if (isLess) {
                        bgColor = 'bg-rose-50';
                        borderColor = 'border-rose-200';
                        statusLabel = 'Menor';
                        statusColor = 'text-rose-600';
                      } else if (isMore) {
                        bgColor = 'bg-rose-50';
                        borderColor = 'border-rose-200';
                        statusLabel = 'Exceso';
                        statusColor = 'text-rose-600';
                      }

                      return (
                        <div key={code} className={`flex flex-col p-3 rounded-2xl border-2 transition-all animate-slide-in ${bgColor} ${borderColor} gap-1 w-[250px] mx-auto`}>
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="text-[15px] font-black text-black tracking-wider font-mono break-all leading-none">{code}</span>
                              {description && (
                                <p className="text-[9px] font-normal text-slate-800 uppercase leading-tight mt-1 font-sans">{description}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <div className="flex items-center gap-1">
                                <span className={`text-xl font-black ${statusColor}`}>
                                  {scannedQty}
                                </span>
                                {isFromCSV && (
                                  <span className="text-xs font-black text-slate-300">/ {expectedQty}</span>
                                )}
                              </div>
                              <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${bgColor.replace('bg-', 'text-').replace('-50', '-600')} ${bgColor.replace('bg-', 'bg-').replace('-50', '-100')}`}>
                                {statusLabel}
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center mt-1 pt-1 border-t border-black/5">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{statusLabel}</span>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setItems(prev => {
                                  const existing = prev.find(i => i.code === code);
                                  if (!existing) return prev;
                                  const updated = { ...existing, quantity: Math.max(0, existing.quantity - 1) };
                                  if (updated.quantity === 0) return prev.filter(i => i.code !== code);
                                  return prev.map(i => i.code === code ? updated : i);
                                })}
                                className="w-[30px] h-[30px] rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all shadow-sm active:scale-90"
                              >
                                -
                              </button>
                              <button 
                                onClick={() => setItems(prev => {
                                  const existing = prev.find(i => i.code === code);
                                  if (existing) {
                                    return prev.map(i => i.code === code ? { ...i, quantity: i.quantity + 1 } : i);
                                  }
                                  return [...prev, { code, quantity: 1 }];
                                })}
                                className="w-[30px] h-[30px] rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-500 transition-all shadow-sm active:scale-90"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                <button 
                  onClick={handleFinishSlot}
                  disabled={items.length === 0}
                  className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-100 active:scale-95 transition-all disabled:opacity-50"
                >
                  TERMINAR HUECO
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-full md:w-auto">
              <button 
                onClick={() => setAdminTab('pending')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Pendientes ({pendingReadings.length})
              </button>
              <button 
                onClick={() => setAdminTab('completed')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'completed' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Validados ({completedReadings.length})
              </button>
              <button 
                onClick={() => setAdminTab('missing')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'missing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Faltan ({missingSlots.length})
              </button>
              <button 
                onClick={() => setAdminTab('theoretical')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'theoretical' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Stock Teórico
              </button>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-48">
                <input 
                  type="text"
                  placeholder="BUSCAR HUECO..."
                  value={adminSearch}
                  onChange={e => setAdminSearch(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="relative w-full md:w-48">
                <input 
                  type="text"
                  placeholder="BUSCAR ARTÍCULO..."
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                {itemSearch && (
                  <button 
                    onClick={() => setItemSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {itemSearch !== '' ? (
            <div className="space-y-12">
              {filteredPending.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Pendientes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPending.map(renderReadingCard)}
                  </div>
                </div>
              )}
              {filteredCompleted.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Validados</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCompleted.map(renderReadingCard)}
                  </div>
                </div>
              )}
              {filteredMissing.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Faltan por leer</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {filteredMissing.map(slot => (
                      <div key={slot.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center space-y-2">
                        <span className="text-xs font-black text-slate-800 tracking-tighter">{slot.code}</span>
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{slot.size || 'S/T'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {filteredPending.length === 0 && filteredCompleted.length === 0 && filteredMissing.length === 0 && (
                <div className="py-20 text-center">
                  <p className="text-slate-300 font-black uppercase text-xs tracking-widest">No se encontraron resultados para "{itemSearch}"</p>
                </div>
              )}
            </div>
          ) : adminTab === 'missing' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredMissing.map(slot => (
                <div key={slot.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center space-y-2">
                  <span className="text-xs font-black text-slate-800 tracking-tighter">{slot.code}</span>
                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{slot.size || 'S/T'}</div>
                </div>
              ))}
              {filteredMissing.length === 0 && (
                <div className="col-span-full py-20 text-center">
                  <p className="text-slate-300 font-black uppercase text-xs tracking-widest">No hay huecos pendientes de lectura</p>
                </div>
              )}
            </div>
          ) : adminTab === 'theoretical' ? (
            <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl text-center space-y-6">
              <div className="text-6xl">📄</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Cargar Stock Teórico</h3>
              <p className="text-xs font-bold text-slate-400 uppercase max-w-md mx-auto leading-relaxed">
                Sube un archivo CSV con el stock de tu programa. 
                <br/>
                <span className="text-[10px] text-indigo-500 mt-2 block">Podrás definir qué columna corresponde a cada campo después de subir el archivo.</span>
              </p>
              
              <div className="pt-6">
                <label className="inline-block bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-indigo-600 transition-all shadow-lg active:scale-95">
                  {uploading ? 'PROCESANDO...' : 'SELECCIONAR ARCHIVO CSV'}
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    onChange={handleCSVUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(adminTab === 'pending' ? filteredPending : filteredCompleted).map(renderReadingCard)}
              {(adminTab === 'pending' ? filteredPending : filteredCompleted).length === 0 && (
                <div className="col-span-full py-20 text-center">
                  <p className="text-slate-300 font-black uppercase text-xs tracking-widest">No hay lecturas en esta sección</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Slot Modal */}
      {showCreateSlotModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-scale-in">
            <div className="text-center space-y-4 mb-8">
              <div className="text-4xl">🆕</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Nueva Ubicación</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">El hueco {location} no existe. ¿Deseas darlo de alta?</p>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => { setShowCreateSlotModal(false); setLocation(''); }}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                No, Cancelar
              </button>
              <button 
                onClick={handleCreateSlot}
                disabled={loading}
                className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {loading ? 'CREANDO...' : 'SÍ, DAR DE ALTA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Size Modal */}
      {showSizeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-scale-in">
            <div className="text-center space-y-4 mb-8">
              <div className="text-4xl">📏</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Tamaño del Hueco</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selecciona el tamaño físico del hueco {location}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-8">
              {['Grande', 'Mediano', 'Pequeño'].map(size => (
                <button 
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`py-5 rounded-3xl font-black text-sm uppercase tracking-widest transition-all ${
                    selectedSize === size ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => { setShowSizeModal(false); setLocation(''); }}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmSize}
                disabled={loading}
                className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {loading ? 'GUARDANDO...' : 'CONFIRMAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capacity Modal */}
      {showCapacityModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-scale-in">
            <div className="text-center space-y-4 mb-8">
              <div className="text-4xl">📊</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Capacidad del Hueco</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">¿Cómo de lleno está el hueco {location}?</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-8">
              {[100, 50, 0].map(val => (
                <button 
                  key={val}
                  onClick={() => setCapacity(val)}
                  className={`py-6 rounded-3xl font-black text-lg transition-all ${
                    capacity === val ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowCapacityModal(false)}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={saveReading}
                disabled={loading}
                className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {loading ? 'GUARDANDO...' : 'CONFIRMAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Mapping Modal */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl animate-scale-in flex flex-col max-h-[90vh]">
            <div className="text-center space-y-4 mb-6">
              <div className="text-4xl">🗺️</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Definir Columnas</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Asigna las columnas de tu archivo a los campos del sistema</p>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Artículo (Obligatorio)</label>
                <select 
                  value={mapping.itemCode}
                  onChange={e => setMapping(prev => ({ ...prev, itemCode: parseInt(e.target.value) }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="-1">Seleccionar columna...</option>
                  {csvHeaders.map((header, idx) => (
                    <option key={idx} value={idx}>{header || `Columna ${idx + 1}`}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hueco / Ubicación (Obligatorio)</label>
                <select 
                  value={mapping.slotCode}
                  onChange={e => setMapping(prev => ({ ...prev, slotCode: parseInt(e.target.value) }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="-1">Seleccionar columna...</option>
                  {csvHeaders.map((header, idx) => (
                    <option key={idx} value={idx}>{header || `Columna ${idx + 1}`}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cantidad (Obligatorio)</label>
                <select 
                  value={mapping.quantity}
                  onChange={e => setMapping(prev => ({ ...prev, quantity: parseInt(e.target.value) }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="-1">Seleccionar columna...</option>
                  {csvHeaders.map((header, idx) => (
                    <option key={idx} value={idx}>{header || `Columna ${idx + 1}`}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción (Opcional)</label>
                <select 
                  value={mapping.description}
                  onChange={e => setMapping(prev => ({ ...prev, description: parseInt(e.target.value) }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="-1">Ninguna</option>
                  {csvHeaders.map((header, idx) => (
                    <option key={idx} value={idx}>{header || `Columna ${idx + 1}`}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => { setShowMappingModal(false); setCsvHeaders([]); setCsvRows([]); }}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={processMappedCSV}
                className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                Procesar Datos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl animate-scale-in flex flex-col max-h-[90vh]">
            <div className="text-center space-y-4 mb-6">
              <div className="text-4xl">⚠️</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Huecos ya Validados</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Se han detectado {validationWarnings.length} huecos en el CSV que ya fueron validados previamente.</p>
            </div>

            <div className="flex-1 overflow-y-auto mb-6 border border-rose-100 rounded-2xl bg-rose-50/30 p-4">
              <div className="space-y-3">
                {validationWarnings.map((w, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px] font-bold border-b border-rose-100 pb-2 last:border-0">
                    <span className="text-slate-700">{w.slot}</span>
                    <span className="text-rose-600">Validado: {w.date}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-[9px] font-bold text-slate-500 text-center uppercase mb-2">¿Deseas continuar con la importación de todas formas?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setShowWarningModal(false); setCsvPreviewData([]); setValidationWarnings([]); }}
                  className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => { setShowWarningModal(false); setShowCsvPreview(true); }}
                  className="flex-1 bg-rose-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Preview Modal */}
      {showCsvPreview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-8 shadow-2xl animate-scale-in flex flex-col max-h-[90vh]">
            <div className="text-center space-y-4 mb-6">
              <div className="text-4xl">🔍</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Vista Previa del CSV</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revisa los datos antes de importar ({csvPreviewData.length} registros)</p>
            </div>

            <div className="flex-1 overflow-y-auto mb-6 border border-slate-100 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="p-3 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Artículo (14 dig)</th>
                    <th className="p-3 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Descripción</th>
                    <th className="p-3 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Hueco</th>
                    <th className="p-3 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreviewData.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-50">
                      <td className="p-3 text-[10px] font-bold text-slate-600 font-mono">{row.item_code}</td>
                      <td className="p-3 text-[10px] font-bold text-slate-500 truncate max-w-[150px]">{row.description}</td>
                      <td className="p-3 text-[10px] font-black text-slate-800">{row.slot_code}</td>
                      <td className="p-3 text-[10px] font-black text-indigo-600">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvPreviewData.length > 50 && (
                <p className="p-4 text-center text-[8px] font-bold text-slate-400 uppercase italic">Mostrando solo los primeros 50 registros...</p>
              )}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => { setShowCsvPreview(false); setCsvPreviewData([]); }}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmCSVUpload}
                disabled={uploading}
                className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {uploading ? 'GUARDANDO...' : 'CONFIRMAR IMPORTACIÓN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryPanel;
