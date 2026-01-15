
import React, { useRef, useEffect, useState } from 'react';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
  title: string;
}

const ScannerModal: React.FC<ScannerModalProps> = ({ isOpen, onClose, onScan, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error al acceder a la cámara:", err);
      setError("No se pudo acceder a la cámara. Asegúrate de dar permisos.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    // En una implementación real con OCR o QR, aquí procesaríamos el frame.
    // Por ahora, simulamos una lectura exitosa para demostrar el flujo.
    const mockResult = title.includes("Carro") ? `CARRO-${Math.floor(Math.random() * 900) + 100}` : `A-01-${Math.floor(Math.random() * 20) + 1}`;
    onScan(mockResult);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-fade-in">
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
        <h2 className="text-white font-bold text-lg">{title}</h2>
        <button 
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 text-white w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="relative w-full max-w-md aspect-[3/4] bg-slate-900 overflow-hidden rounded-3xl border-2 border-white/20">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <span className="text-4xl mb-4">⚠️</span>
            <p className="text-white font-medium">{error}</p>
            <button 
              onClick={startCamera}
              className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            {/* Guía visual de escaneo */}
            <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
              <div className="w-full h-full border-2 border-indigo-500 rounded-lg relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-400 -mt-1 -ml-1"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-400 -mt-1 -mr-1"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-400 -mb-1 -ml-1"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-400 -mb-1 -mr-1"></div>
                
                {/* Línea de escaneo animada */}
                <div className="absolute top-0 left-0 w-full h-0.5 bg-indigo-400/50 shadow-[0_0_15px_rgba(129,140,248,0.8)] animate-[scan_2s_linear_infinite]"></div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="absolute bottom-12 flex flex-col items-center gap-4 w-full px-8">
        <p className="text-white/60 text-xs text-center">Encuadra el código dentro del recuadro</p>
        <button 
          onClick={handleCapture}
          className="w-20 h-20 bg-white rounded-full border-8 border-white/20 active:scale-90 transition-transform flex items-center justify-center"
        >
          <div className="w-12 h-12 bg-indigo-600 rounded-full"></div>
        </button>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
      `}</style>
    </div>
  );
};

export default ScannerModal;
