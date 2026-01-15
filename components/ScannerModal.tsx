import React, { useRef, useEffect, useState } from 'react';
import Quagga from '@ericblade/quagga2';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
  title: string;
}

const ScannerModal: React.FC<ScannerModalProps> = ({ isOpen, onClose, onScan, title }) => {
  const scannerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Ref para manejar la validación de confianza sin re-renders innecesarios
  const scanBuffer = useRef<{ code: string, count: number }>({ code: '', count: 0 });

  useEffect(() => {
    if (isOpen && scannerRef.current) {
      initQuagga();
      scanBuffer.current = { code: '', count: 0 };
    }
    return () => {
      try {
        Quagga.stop();
        Quagga.offDetected();
      } catch (e) {
        // Silencioso
      }
    };
  }, [isOpen]);

  const initQuagga = () => {
    Quagga.init({
      inputStream: {
        // Removed 'name' property as it is not part of Quagga's inputStream types and caused a TS error.
        type: "LiveStream",
        target: scannerRef.current!,
        constraints: {
          width: { min: 640 },
          height: { min: 480 },
          facingMode: "environment"
        },
      },
      locator: {
        patchSize: "medium",
        halfSample: true 
      },
      decoder: {
        readers: [
          "ean_reader",
          "code_128_reader",
          "code_39_reader",
          "upc_reader"
        ],
        multiple: false
      },
      locate: true
    }, (err) => {
      if (err) {
        setError("Error de cámara. Asegúrate de dar permisos.");
        return;
      }
      Quagga.start();
    });

    Quagga.onDetected((data) => {
      if (data?.codeResult?.code) {
        const code = data.codeResult.code.trim();
        
        // --- SISTEMA DE CONFIANZA ---
        // Para evitar lecturas raras, necesitamos que el mismo código 
        // aparezca 3 veces seguidas en el flujo de la cámara.
        if (code === scanBuffer.current.code) {
          scanBuffer.current.count++;
        } else {
          scanBuffer.current.code = code;
          scanBuffer.current.count = 1;
        }

        if (scanBuffer.current.count >= 3) {
           handleScanSuccess(code);
        }
      }
    });
  };

  const handleScanSuccess = (code: string) => {
    if (isSuccess) return;
    setIsSuccess(true);
    
    // Feedback táctil
    if (navigator.vibrate) navigator.vibrate(100);
    
    // Pausamos Quagga para que no siga detectando mientras cerramos
    Quagga.offDetected();
    
    setTimeout(() => {
      onScan(code);
      onClose();
      setIsSuccess(false);
    }, 500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-fade-in">
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
        <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/20">
          <h2 className="text-white font-bold text-sm tracking-wide uppercase flex items-center gap-2">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
            {title}
          </h2>
        </div>
        <button 
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 text-white w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all border border-white/20"
        >
          ✕
        </button>
      </div>

      <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-slate-950">
        <div 
          ref={scannerRef} 
          className={`w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover transition-opacity duration-300 ${isSuccess ? 'opacity-40' : 'opacity-100'}`}
        />
        
        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-8 text-center bg-slate-900/95 backdrop-blur-lg">
            <p className="text-white font-bold mb-4">{error}</p>
            <button 
              onClick={() => { setError(null); initQuagga(); }}
              className="bg-white text-slate-900 px-8 py-3 rounded-2xl font-black"
            >
              REINTENTAR
            </button>
          </div>
        )}

        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className={`relative w-72 h-48 rounded-[2rem] border-2 transition-all duration-500 ${isSuccess ? 'border-emerald-500 bg-emerald-500/20 scale-110' : 'border-white/30'}`}>
            <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 rounded-tl-3xl border-indigo-500"></div>
            <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 rounded-tr-3xl border-indigo-500"></div>
            <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 rounded-bl-3xl border-indigo-500"></div>
            <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 rounded-br-3xl border-indigo-500"></div>
            
            {!isSuccess && (
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,1)] animate-[laser_2s_infinite]"></div>
            )}
          </div>
          <div className="mt-8 px-6 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
            <p className="text-white text-[10px] font-bold uppercase tracking-widest text-center">
              Mantén el pulso firme<br/>
              <span className="text-indigo-400">Verificando precisión...</span>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes laser {
          0% { top: 10%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default ScannerModal;