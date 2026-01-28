
import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { supabase } from '../supabaseClient';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    username: '',
    password_plain: '',
    full_name: '',
    role: UserRole.OPERATOR
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
    setLoading(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.password_plain || !form.full_name) return alert("Rellena todos los campos");
    
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').insert([{
        email: form.username.toLowerCase().trim(),
        password_plain: form.password_plain.trim(),
        full_name: form.full_name.trim(),
        role: form.role
      }]);
      
      if (error) throw error;
      
      setShowModal(false);
      setForm({ username: '', password_plain: '', full_name: '', role: UserRole.OPERATOR });
      fetchUsers();
    } catch (err: any) {
      alert("Error creando usuario: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm("¿Eliminar este acceso?")) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (!error) fetchUsers();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case UserRole.ADMIN: return 'bg-rose-100 text-rose-600';
      case UserRole.EXPEDITION: return 'bg-indigo-100 text-indigo-600';
      case UserRole.OPERATOR: return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-50 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Personal Almacén</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Gestión de Accesos</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-200 active:scale-95 transition-all"
        >
          Nuevo Usuario
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {users.map((u) => (
          <div key={u.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center justify-between group transition-all hover:shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-black text-lg">
                {u.full_name ? u.full_name[0] : '?'}
              </div>
              <div>
                <h4 className="font-black text-slate-800 text-sm leading-none mb-1">{u.full_name}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">@{u.email}</span>
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${getRoleBadgeColor(u.role)}`}>
                    {u.role}
                  </span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => deleteUser(u.id)}
              className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <form onSubmit={handleCreateUser} className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-fade-in space-y-4">
            <div className="text-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase">Nuevo Acceso</h3>
              <p className="text-[9px] font-black text-slate-400 tracking-widest mt-1">Credenciales del sistema</p>
            </div>
            
            <div className="space-y-4">
              <input 
                placeholder="NOMBRE COMPLETO" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase"
                value={form.full_name}
                onChange={e => setForm({...form, full_name: e.target.value})}
              />
              <input 
                placeholder="USUARIO" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase"
                value={form.username}
                onChange={e => setForm({...form, username: e.target.value})}
              />
              <input 
                type="text"
                placeholder="CONTRASEÑA" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all"
                value={form.password_plain}
                onChange={e => setForm({...form, password_plain: e.target.value})}
              />
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Asignar Rol</label>
                <select 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase"
                  value={form.role}
                  onChange={e => setForm({...form, role: e.target.value as UserRole})}
                >
                  <option value={UserRole.OPERATOR}>OPERARIO (CAPTURAS)</option>
                  <option value={UserRole.EXPEDITION}>EXPEDICIÓN (MUELLES)</option>
                  <option value={UserRole.ADMIN}>ADMINISTRADOR (TODO)</option>
                </select>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 transition-all uppercase tracking-widest text-[10px]"
              >
                {loading ? 'CREANDO...' : 'GUARDAR USUARIO'}
              </button>
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]"
              >
                CANCELAR
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
