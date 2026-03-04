
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface MovementLog {
  id: string;
  operator_name: string;
  operator_email?: string;
  cart_id: string;
  slot_code: string;
  new_status: string;
  new_quantity: number;
  created_at: string;
}

const LiveMapView: React.FC = () => {
  const [allLogs, setAllLogs] = useState<MovementLog[]>([]);
  const [warehouseMaps, setWarehouseMaps] = useState<any[]>([]);
  const [streetCoords, setStreetCoords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = async () => {
    try {
      const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: logs } = await supabase
        .from('movement_logs')
        .select('*')
        .gte('created_at', yesterday)
        .order('created_at', { ascending: false });
      
      const { data: mapsData } = await supabase.from('warehouse_maps').select('*');
      const { data: coordsData } = await supabase.from('warehouse_street_coords').select('*');
      
      setAllLogs(logs || []);
      setWarehouseMaps(mapsData || []);
      setStreetCoords(coordsData || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Actualizar cada 30s
    return () => clearInterval(interval);
  }, []);

  const getOperatorStats = () => {
    const map = new Map<string, { name: string, count: number, logs: MovementLog[], email: string }>();
    allLogs.forEach(log => {
      const key = log.operator_email || log.operator_name;
      if (!map.has(key)) map.set(key, { name: log.operator_name, count: 0, logs: [], email: log.operator_email || '' });
      const entry = map.get(key)!;
      entry.count++;
      entry.logs.push(log);
    });
    return Array.from(map.entries());
  };

  const getOperatorPosition = (streetId: string, plant: string) => {
    const map = warehouseMaps.find(m => m.plant === plant);
    if (!map) return null;
    const coord = streetCoords.find(c => c.map_id === map.id && c.street_id === streetId);
    if (!coord) return null;
    return { x: coord.x_percent, y: coord.y_percent };
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-black uppercase tracking-widest">Cargando Mapa en Vivo...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
           <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg">WH</div>
           <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Mapa en Vivo Full Screen</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Monitorización en tiempo real de la operativa</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Última Actualización</p>
            <p className="text-xs font-black text-slate-800">{lastRefresh.toLocaleTimeString()}</p>
          </div>
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
        </div>
      </div>

      {/* Operarios Activos (Horizontal) */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Operarios Activos (Últimos 15m)</h4>
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
                <div key={email} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all min-w-[180px] ${isInactive ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-white border-slate-100 shadow-sm'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${isInactive ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-600'}`}>
                    {op.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-slate-800 uppercase leading-tight">{op.name}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">{lastLog?.slot_code || 'S/Ubicación'}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[8px] font-black uppercase ${timeDiff !== null && timeDiff < 10 ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {timeDiff !== null ? (timeDiff < 1 ? 'Ahora' : `${timeDiff}m`) : '--'}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Mapa */}
      <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm relative overflow-hidden min-h-[600px]">
        <div className="flex flex-col gap-12 h-full">
          {['U01', 'U02'].map(plant => {
            const realMap = warehouseMaps.find(m => m.plant === plant);
            if (!realMap) return null;
            
            return (
              <div key={plant} className="relative border-2 border-dashed border-slate-200 rounded-[2rem] p-6 flex flex-col min-h-[400px]">
                <div className="absolute top-4 left-4 bg-white px-4 py-1 rounded-full shadow-sm border border-slate-100 z-10">
                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">PLANTA {plant}</span>
                </div>
                
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
                      const pos = getOperatorPosition(streetId, plant);
                      const timeDiff = (new Date().getTime() - new Date(lastLog.created_at).getTime()) / 60000;
                      const isInactive = timeDiff > 10;

                      if (!pos) return null;

                      const count = streetCounts[streetId] || 0;
                      streetCounts[streetId] = count + 1;
                      const offsetX = count * 2.5;
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
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-lg border-2 border-white cursor-help transition-all ${isInactive ? 'bg-slate-400 opacity-50 grayscale' : 'bg-indigo-600 animate-bounce'}`}>
                              {op.name.charAt(0)}
                            </div>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-slate-900 text-white text-[7px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover/op:opacity-100 transition-all whitespace-nowrap z-30">
                              {op.name}
                              <br/>
                              <span className="text-indigo-300">{lastLog.slot_code}</span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Movimientos Recientes */}
      <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
        <h4 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-6">Últimos Movimientos</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[8px]">
              <tr>
                <th className="px-6 py-4">Operario</th>
                <th className="px-6 py-4">Carro</th>
                <th className="px-6 py-4">Hueco</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allLogs.slice(0, 50).map(log => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LiveMapView;
