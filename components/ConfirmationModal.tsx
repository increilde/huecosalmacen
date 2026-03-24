import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'danger'
}) => {
  if (!isOpen) return null;

  const variantClasses = {
    danger: 'bg-rose-600 hover:bg-rose-700 shadow-rose-100',
    warning: 'bg-amber-500 hover:bg-amber-600 shadow-amber-100',
    info: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
  };

  const iconClasses = {
    danger: 'text-rose-600 bg-rose-50',
    warning: 'text-amber-500 bg-amber-50',
    info: 'text-indigo-600 bg-indigo-50'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${iconClasses[variant]}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <button 
              onClick={onCancel}
              className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">{title}</h3>
          <p className="text-sm font-bold text-slate-500 leading-relaxed">{message}</p>
        </div>
        
        <div className="p-8 bg-slate-50 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 ${variantClasses[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
