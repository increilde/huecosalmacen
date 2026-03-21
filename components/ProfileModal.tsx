
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';

interface ProfileModalProps {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedUser: UserProfile) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, isOpen, onClose, onUpdate }) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // 1. Actualizar perfil en la tabla 'profiles'
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          full_name: fullName,
          avatar_url: avatarUrl
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // 2. Actualizar contraseña si se ha proporcionado una nueva
      if (password.trim()) {
        const { error: authError } = await supabase.auth.updateUser({
          password: password.trim()
        });
        if (authError) throw authError;
      }

      const updatedUser = { ...user, full_name: fullName, avatar_url: avatarUrl };
      onUpdate(updatedUser);
      setMessage({ type: 'success', text: 'Perfil actualizado correctamente' });
      setTimeout(() => {
        onClose();
        setMessage(null);
      }, 1500);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setMessage({ type: 'error', text: err.message || 'Error al actualizar el perfil' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-white overflow-hidden relative">
        <div className="absolute -right-10 -top-10 text-slate-50 text-9xl font-black opacity-10 pointer-events-none">👤</div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Editar Perfil</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center mb-6">
              <div className="relative group">
                <div className="w-24 h-24 rounded-3xl bg-slate-100 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center text-slate-300 text-3xl font-black uppercase">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    fullName.charAt(0)
                  )}
                </div>
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-3xl">
                  <span className="text-white text-[10px] font-black uppercase">Cambiar</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-3">Foto de Perfil</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Nombre de Usuario</label>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-slate-700 outline-none focus:border-indigo-500 transition-all uppercase"
                  placeholder="TU NOMBRE"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Nueva Contraseña</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  placeholder="DEJAR EN BLANCO PARA NO CAMBIAR"
                />
              </div>
            </div>

            {message && (
              <div className={`p-4 rounded-2xl text-[10px] font-black text-center uppercase tracking-widest ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {message.text}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
