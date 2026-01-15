
import React, { useRef, useEffect, useState } from 'react';
import Quagga from 'quagga';

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

  useEffect(() => {
    if (isOpen && scannerRef.current) {
      initQuagga();
    }
    return () => {
      try {
        Quagga.stop();
      } catch (e) {
        // Silencioso si ya está parado
      }
    };
  }, [isOpen]);

  const initQuagga = () => {
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerRef.current!,
        constraints: {
          width: { min: 640 },
          height: { min: 480 },
          facingMode: "environment",
          aspectRatio: { min: 1, max: 2 }
        },
        singleChannel: false // false para mejor precisión en color
      },
      locator: {
        patchSize: "medium",
        halfSample: true // Mejora velocidad y permite detectar códigos más pequeños
      },
      decoder: {
        readers: [
          "ean_reader",      // EAN-13 principal
          "ean_8_reader",    // EAN-8
          "code_128_reader", // Muy común en logística
          "code_39_reader"
        ],
        multiple: false
      },
      locate: true
    }, (err) => {
      if (err) {
        console.error("Quagga init error:", err);
        setError("Error de cámara. Asegúrate de dar permisos y usar HTTPS.");
        return;
      }
      Quagga.start();
    });

    // Filtro para asegurar consistencia en la lectura
    Quagga.onDetected((data) => {
      if (data && data.codeResult && data.codeResult.code) {
        // En logística a veces el código viene con caracteres extra, limpiamos si es necesario
        const code = data.codeResult.code.trim();
        if (code.length > 3) { // Evitar ruidos cortos
           handleScanSuccess(code);
        }
      }
    });
  };

  const handleScanSuccess = (code: string) => {
    if (isSuccess) return;
    
    setIsSuccess(true);
    
    // Feedback sonoro y táctil
    if (navigator.vibrate) navigator.vibrate(150);
    
    // El éxito es instantáneo para el usuario
    setTimeout(() => {
      onScan(code);
      onClose();
      setIsSuccess(false);
    }, 400);
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
          className="bg-white/10 hover:bg-white/20 text-white w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all border border-white/20 active:scale-90"
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
            <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-4">
               <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-white font-bold mb-2">Acceso denegado</p>
            <p className="text-white/60 text-sm mb-6 max-w-xs">{error}</p>
            <button 
              onClick={() => { setError(null); initQuagga(); }}
              className="bg-white text-slate-900 px-8 py-3 rounded-2xl font-black shadow-xl active:scale-95 transition-all"
            >
              REINTENTAR
            </button>
          </div>
        )}

        {/* Visor de Escaneo */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className={`relative w-80 h-48 rounded-[2rem] border-2 transition-all duration-500 ${isSuccess ? 'border-emerald-500 bg-emerald-500/10 scale-110' : 'border-white/30'}`}>
            
            {/* Esquinas estilizadas */}
            <div className={`absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 rounded-tl-3xl transition-colors ${isSuccess ? 'border-emerald-400' : 'border-indigo-500'}`}></div>
            <div className={`absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 rounded-tr-3xl transition-colors ${isSuccess ? 'border-emerald-400' : 'border-indigo-500'}`}></div>
            <div className={`absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 rounded-bl-3xl transition-colors ${isSuccess ? 'border-emerald-400' : 'border-indigo-500'}`}></div>
            <div className={`absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 rounded-br-3xl transition-colors ${isSuccess ? 'border-emerald-400' : 'border-indigo-500'}`}></div>

            {/* Escáner Láser */}
            {!isSuccess && (
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_20px_rgba(99,102,241,1)] animate-[laser_1.5s_ease-in-out_infinite]"></div>
            )}
            
            {isSuccess && (
              <div className="absolute inset-0 flex items-center justify-center animate-bounce">
                <div className="bg-emerald-500 text-white rounded-full p-4 shadow-2xl shadow-emerald-500/50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-8 px-6 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/10">
            <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em]">Encuadra el código EAN</p>
          </div>
        </div>

        {/* Footer info */}
        <div className="absolute bottom-12 left-0 right-0 flex justify-center">
           <div className="flex items-center gap-3 text-white/30">
              <span className="text-xs">AUTOFOCUS</span>
              <div className="w-1 h-1 bg-white/30 rounded-full"></div>
              <span className="text-xs">HD SCAN</span>
              <div className="w-1 h-1 bg-white/30 rounded-full"></div>
              <span className="text-xs">EAN/QR</span>
           </div>
        </div>
      </div>

      <style>{`
        @keyframes laser {
          0% { top: 5%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 95%; opacity: 0; }
        }
        .drawingBuffer { 
          position: absolute; 
          top: 0; 
          left: 0; 
          width: 100%; 
          height: 100%;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
};

export default ScannerModal;
