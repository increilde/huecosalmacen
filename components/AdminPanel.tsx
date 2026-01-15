
import React from 'react';

const AdminPanel: React.FC = () => {
  const stats = [
    { label: 'Movimientos Hoy', value: '142', trend: '+12%', color: 'indigo' },
    { label: 'Eficiencia Espacio', value: '84%', trend: '+3%', color: 'emerald' },
    { label: 'Errores Escaneo', value: '2', trend: '-5%', color: 'rose' },
  ];

  const recentLogs = [
    { user: 'Op. Juan', action: 'Llenado A-12', time: 'hace 5 min' },
    { user: 'Op. Maria', action: 'Vaciado B-04', time: 'hace 12 min' },
    { user: 'Terminal 02', action: 'Llenado C-01', time: 'hace 18 min' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
            <div className="flex items-end justify-between mt-1">
              <span className="text-2xl font-black text-slate-800">{stat.value}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                stat.trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                {stat.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span>📝</span> Actividad Reciente
        </h3>
        <div className="space-y-4">
          {recentLogs.map((log, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs">👤</div>
                <div>
                  <p className="text-sm font-bold text-slate-700">{log.user}</p>
                  <p className="text-xs text-slate-400">{log.action}</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 italic">{log.time}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button className="bg-slate-900 text-white p-4 rounded-3xl font-bold text-sm hover:bg-slate-800 transition-colors flex flex-col items-center gap-2 active:scale-95">
          <span className="text-xl">📊</span>
          Exportar Reporte
        </button>
        <button className="bg-white text-slate-900 border-2 border-slate-100 p-4 rounded-3xl font-bold text-sm hover:bg-slate-50 transition-colors flex flex-col items-center gap-2 active:scale-95">
          <span className="text-xl">🧹</span>
          Limpiar Historial
        </button>
      </div>
    </div>
  );
};

export default AdminPanel;
