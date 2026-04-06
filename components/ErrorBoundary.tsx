import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl text-center border border-white">
            <div className="bg-rose-500 w-16 h-16 rounded-3xl flex items-center justify-center text-white text-2xl mx-auto mb-6 font-black">⚠️</div>
            <h1 className="text-xl font-black text-slate-800 uppercase">Algo ha salido mal</h1>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-4 mb-8">
              {this.state.error?.message || 'Error desconocido'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-xs"
            >
              RECARGAR PÁGINA
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
