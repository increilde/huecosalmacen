
import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface CustomDatePickerProps {
  selectedDate: string;
  onChange: (date: string) => void;
  label?: string;
  variant?: 'inline' | 'input';
}

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ selectedDate, onChange, label, variant = 'inline' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date((selectedDate || new Date().toISOString().split('T')[0]) + 'T00:00:00'));
  const [occupiedDays, setOccupiedDays] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedDate) {
      setViewDate(new Date(selectedDate + 'T00:00:00'));
    }
  }, [selectedDate]);

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (containerRef.current && !containerRef.current.contains(event.target as any)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchOccupied = async () => {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const [deliveriesRes, installationsRes] = await Promise.all([
        supabase.from('deliveries').select('scheduled_date').eq('is_scheduled', true).gte('scheduled_date', startDate).lte('scheduled_date', endDate),
        supabase.from('installations').select('scheduled_date').eq('is_scheduled', true).gte('scheduled_date', startDate).lte('scheduled_date', endDate)
      ]);

      const days = new Set<string>();
      deliveriesRes.data?.forEach(d => days.add(d.scheduled_date));
      installationsRes.data?.forEach(i => days.add(i.scheduled_date));
      setOccupiedDays(Array.from(days));
    };

    if (isOpen) {
      fetchOccupied();
    }
  }, [isOpen, viewDate]);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDateSelect = (day: number) => {
    const year = viewDate.getFullYear();
    const month = String(viewDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    const d = new Date(dateStr + 'T00:00:00');
    if (d.getDay() === 0) return; // Skip Sundays

    onChange(dateStr);
    setIsOpen(false);
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const days = [];

    // Empty slots for days before the first day of the month
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = dateStr === selectedDate;
      const isOccupied = occupiedDays.includes(dateStr);
      const isSunday = new Date(dateStr + 'T00:00:00').getDay() === 0;

      days.push(
        <button
          key={d}
          disabled={isSunday}
          type="button"
          onClick={() => handleDateSelect(d)}
          className={`h-8 w-8 rounded-lg text-[10px] font-black transition-all flex items-center justify-center
            ${isSunday ? 'text-slate-200 cursor-not-allowed' : 
              isSelected ? 'bg-indigo-600 text-white shadow-lg scale-110' : 
              isOccupied ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 
              'text-slate-600 hover:bg-slate-100'}
          `}
        >
          {d}
        </button>
      );
    }

    return days;
  };

  const monthName = viewDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="relative" ref={containerRef}>
      {variant === 'inline' ? (
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-col items-center min-w-[120px] cursor-pointer group"
        >
          <span className="text-[12px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1 group-hover:text-indigo-500 transition-colors">
            {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' }) : '--'}
          </span>
          <div className="flex items-center gap-2">
            <CalendarIcon size={14} className="text-slate-400" />
            <span className="text-base font-black text-slate-800 leading-none">
              {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '--/--/----'}
            </span>
          </div>
        </div>
      ) : (
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-white p-4 rounded-2xl text-xs font-bold outline-none border border-slate-200 focus:border-indigo-500 transition-all flex items-center justify-between cursor-pointer"
        >
          <span className="text-slate-700">
            {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '--/--/----'}
          </span>
          <CalendarIcon size={14} className="text-slate-400" />
        </div>
      )}

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 z-[100] w-64 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-all">
              <ChevronLeft size={16} />
            </button>
            <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{monthName}</span>
            <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-all">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map(d => (
              <div key={d} className="h-8 w-8 flex items-center justify-center text-[9px] font-black text-slate-300 uppercase">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {renderCalendar()}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Con pedidos</span>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-[8px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-600"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;
