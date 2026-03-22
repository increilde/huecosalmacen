
import React, { useState, useEffect } from 'react';
import { Role } from '../types';
import { supabase } from '../supabaseClient';

const UserManagement: React.FC = () => {
  const [viewMode, setViewMode] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({
    username: '',
    password_plain: '',
    full_name: '',
    role: '',
    prompt_machinery: false,
    has_messaging_access: false,
    avatar_url: ''
  });

  const [roleForm, setRoleForm] = useState({
    name: '',
    permissions: [] as string[]
  });

  const availablePermissions = [
    { id: 'dashboard', label: 'Dashboard Captura', icon: '📊' },
    { id: 'slots', label: 'Mapa Almacén', icon: '📦' },
    { id: 'expedition', label: 'Muelles / Expedición', icon: '🚛' },
    { id: 'deliveries', label: 'Repartos', icon: '📅' },
    { id: 'installations', label: 'Instalaciones', icon: '🛠️' },
    { id: 'messaging', label: 'Mensajería', icon: '💬' },
    { id: 'supplies', label: 'Suministros', icon: '🛠️' },
    { id: 'inventory', label: 'Inventario', icon: '📋' },
    { id: 'rtc', label: 'RTC', icon: '🚛' },
    { id: 'admin', label: 'Administración', icon: '⚙️' },
    { id: 'users', label: 'Gestión Operarios', icon: '👥' },
  ];

  const roleLabels: Record<string, string> = {
    admin: 'ADMIN',
    operator: 'OPERADOR',
    expedition: 'EXPEDICIÓN',
    viewer: 'VISOR'
  };

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: usersData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      const { data: rolesData } = await supabase.from('roles').select('*').order('name');
      
      if (usersData) setUsers(usersData);
      
      let currentRoles = (rolesData || []).map(r => ({
        ...r,
        permissions: Array.isArray(r.permissions) ? r.permissions : JSON.parse(r.permissions || '[]')
      }));
      
      if (usersData) {
        const uniqueRolesInProfiles = Array.from(new Set(usersData.map(u => u.role)));
        const existingRoleNames = currentRoles.map(r => r.name);
        const missingRoles = uniqueRolesInProfiles.filter(r => r && !existingRoleNames.includes(r));
        
        if (missingRoles.length > 0) {
          const rolesToInsert = missingRoles.map(name => ({ name, permissions: [] }));
          await supabase.from('roles').insert(rolesToInsert);
          const { data: refreshedRoles } = await supabase.from('roles').select('*').order('name');
          if (refreshedRoles) {
             currentRoles = refreshedRoles.map(r => ({
              ...r,
              permissions: Array.isArray(r.permissions) ? r.permissions : JSON.parse(r.permissions || '[]')
            }));
          }
        }
      }

      setRoles(currentRoles);
      
      if (currentRoles.length > 0 && !userForm.role) {
        setUserForm(prev => ({ ...prev, role: currentRoles[0].name }));
      }

    } catch (err) {
      console.error("Error al sincronizar datos:", err);
    } finally {
      setLoading(false);
    }
  }, [userForm.role]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.username || !userForm.full_name || !userForm.role) {
      alert("Rellena los campos obligatorios");
      return;
    }
    
    setLoading(true);
    try {
      const payload: any = {
        email: userForm.username.toLowerCase().trim(),
        full_name: userForm.full_name.trim(),
        role: userForm.role,
        prompt_machinery: userForm.prompt_machinery,
        has_messaging_access: userForm.has_messaging_access,
        avatar_url: userForm.avatar_url
      };

      if (userForm.password_plain) {
        payload.password_plain = userForm.password_plain.trim();
      }

      if (editingUserId) {
        const { error } = await supabase.from('profiles').update(payload).eq('id', editingUserId);
        if (error) {
          if (error.message.includes('prompt_machinery')) {
            throw new Error("La base de datos no está actualizada. Ejecuta el SQL en el editor de Supabase.");
          }
          throw error;
        }
      } else {
        if (!userForm.password_plain) return alert("Contraseña obligatoria");
        const { error } = await supabase.from('profiles').insert([payload]);
        if (error) {
          if (error.message.includes('prompt_machinery')) {
            throw new Error("La base de datos no está actualizada. Ejecuta el SQL en el editor de Supabase.");
          }
          throw error;
        }
      }
      
      setShowUserModal(false);
      setEditingUserId(null);
      setUserForm({ username: '', password_plain: '', full_name: '', role: roles[0]?.name || '', prompt_machinery: false, has_messaging_access: false });
      fetchData();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditUser = (user: any) => {
    setUserForm({
      username: user.email,
      password_plain: '',
      full_name: user.full_name,
      role: user.role,
      prompt_machinery: !!user.prompt_machinery,
      has_messaging_access: !!user.has_messaging_access,
      avatar_url: user.avatar_url || ''
    });
    setEditingUserId(user.id);
    setShowUserModal(true);
  };

  const deleteUser = async (id: string) => {
    if (!confirm("¿Eliminar este acceso?")) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (!error) fetchData();
  };

  const handleCreateOrUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.name) return;

    setLoading(true);
    try {
      const name = roleForm.name.toLowerCase().trim();
      const perms = roleForm.permissions;
      
      if (editingRoleId) {
        const { error } = await supabase.from('roles').update({ name, permissions: perms }).eq('id', editingRoleId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('roles').insert([{ name, permissions: perms }]);
        if (error) throw error;
      }
      
      setRoleForm({ name: '', permissions: [] });
      setEditingRoleId(null);
      setShowRoleModal(false);
      fetchData();
    } catch (err: any) {
      alert("Error al gestionar rol: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (permId: string) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
    }));
  };

  const openEditRole = (role: Role) => {
    setRoleForm({
      name: role.name,
      permissions: Array.isArray(role.permissions) ? role.permissions : JSON.parse((role.permissions as any) || '[]')
    });
    setEditingRoleId(role.id);
    setShowRoleModal(true);
  };

  const deleteRole = async (role: Role) => {
    if (['admin', 'operator', 'expedition', 'viewer'].includes(role.name)) {
      alert("No se pueden eliminar los roles base.");
      return;
    }
    if (!confirm(`¿Eliminar el rol "${role.name}"?`)) return;
    const { error } = await supabase.from('roles').delete().eq('id', role.id);
    if (!error) fetchData();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-rose-100 text-rose-600';
      case 'expedition': return 'bg-indigo-100 text-indigo-600';
      case 'operator': return 'bg-slate-100 text-slate-600';
      default: return 'bg-amber-50 text-amber-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Gestión Operarios</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Accesos y Roles Dinámicos</p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setViewMode('users')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'users' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>Usuarios</button>
           <button onClick={() => setViewMode('roles')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'roles' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>Roles</button>
        </div>
        <button 
          onClick={() => {
            setEditingUserId(null); setEditingRoleId(null);
            setUserForm({ username: '', password_plain: '', full_name: '', role: roles[0]?.name || '', prompt_machinery: false, avatar_url: '' });
            setRoleForm({ name: '', permissions: [] });
            viewMode === 'users' ? setShowUserModal(true) : setShowRoleModal(true);
          }}
          className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-200 active:scale-95 transition-all"
        >
          {viewMode === 'users' ? 'Nuevo Usuario' : 'Nuevo Rol'}
        </button>
      </div>

      {viewMode === 'users' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {users.map((u) => (
            <div key={u.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center justify-between group transition-all hover:shadow-xl">
              <div className="flex items-center gap-4">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt={u.full_name} className="w-12 h-12 rounded-2xl object-cover border border-slate-100" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-black text-lg uppercase">{u.full_name?.[0] || '?'}</div>
                )}
                <div>
                  <h4 className="font-black text-slate-800 text-sm leading-none mb-1 uppercase">{u.full_name}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">@{u.email}</span>
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${getRoleBadgeColor(u.role)}`}>{roleLabels[u.role] || u.role.toUpperCase()}</span>
                    {u.prompt_machinery && <span className="text-[7px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">🛠️ JORNADA</span>}
                    {u.has_messaging_access && <span className="text-[7px] font-black bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">💬 CHAT</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEditUser(u)} className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">✏️</button>
                <button onClick={() => deleteUser(u.id)} className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {roles.map((r) => (
            <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col group h-44">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-black text-slate-800 uppercase text-xs">{roleLabels[r.name] || r.name.toUpperCase()}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {r.name}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => openEditRole(r)} className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 flex items-center justify-center">✏️</button>
                  <button onClick={() => deleteRole(r)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-400 flex items-center justify-center">🗑️</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-auto">
                 {r.permissions.map(p => (
                   <span key={p} className="text-[7px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase">{p}</span>
                 ))}
                 {r.permissions.length === 0 && <span className="text-[7px] font-black text-slate-300 uppercase italic">Sin accesos</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <form onSubmit={handleCreateOrUpdateUser} className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-fade-in space-y-4 border border-white">
            <div className="text-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase">{editingUserId ? 'Editar Acceso' : 'Nuevo Acceso'}</h3>
            </div>
            <div className="space-y-4">
              <div className="flex justify-center mb-4">
                <div className="relative group">
                  {userForm.avatar_url ? (
                    <img src={userForm.avatar_url} className="w-20 h-20 rounded-3xl object-cover border-2 border-indigo-100" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-2xl">👤</div>
                  )}
                  <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-3xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-[8px] font-black uppercase">
                    Subir
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new window.FileReader();
                          reader.onloadend = () => setUserForm({ ...userForm, avatar_url: reader.result as string });
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
              <input placeholder="NOMBRE COMPLETO" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase" value={userForm.full_name} onChange={e => setUserForm({...userForm, full_name: e.target.value})} />
              <input placeholder="USUARIO (EMAIL)" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase" value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} />
              <input type="text" placeholder={editingUserId ? "NUEVA CONTRASEÑA (OPCIONAL)" : "CONTRASEÑA"} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500" value={userForm.password_plain} onChange={e => setUserForm({...userForm, password_plain: e.target.value})} />
              <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                {roles.map(r => <option key={r.id} value={r.name}>{roleLabels[r.name] || r.name.toUpperCase()}</option>)}
              </select>

              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100 mt-2">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-800 uppercase leading-none">Petición Maquinaria</span>
                  <span className="text-[7px] font-bold text-slate-400 uppercase mt-1">Pedir Carretilla/PDA al entrar</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUserForm({ ...userForm, prompt_machinery: !userForm.prompt_machinery })}
                  className={`w-10 h-5 rounded-full relative transition-all ${userForm.prompt_machinery ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${userForm.prompt_machinery ? 'left-6 shadow-sm' : 'left-1 shadow-none'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100 mt-2">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-800 uppercase leading-none">Acceso Mensajería</span>
                  <span className="text-[7px] font-bold text-slate-400 uppercase mt-1">Permitir chat interno</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUserForm({ ...userForm, has_messaging_access: !userForm.has_messaging_access })}
                  className={`w-10 h-5 rounded-full relative transition-all ${userForm.has_messaging_access ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${userForm.has_messaging_access ? 'left-6 shadow-sm' : 'left-1 shadow-none'}`}></div>
                </button>
              </div>
            </div>
            <div className="pt-4 space-y-3">
              <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">{loading ? 'GUARDANDO...' : 'GUARDAR'}</button>
              <button type="button" onClick={() => { setShowUserModal(false); setEditingUserId(null); }} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">CANCELAR</button>
            </div>
          </form>
        </div>
      )}

      {showRoleModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <form onSubmit={handleCreateOrUpdateRole} className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl animate-fade-in space-y-6 border border-white max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="text-center">
              <h3 className="text-xl font-black text-slate-800 uppercase">{editingRoleId ? 'Editar Rol' : 'Nuevo Rol'}</h3>
            </div>
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Identificador</label>
                <input placeholder="EJ: CARRETILLERO..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Accesos al Menú</label>
                <div className="grid grid-cols-1 gap-2">
                   {availablePermissions.map(p => (
                     <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePermission(p.id)}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${roleForm.permissions.includes(p.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                     >
                       <span className="flex items-center gap-3">
                         <span>{p.icon}</span>
                         <span className="text-[9px] font-black uppercase tracking-widest">{p.label}</span>
                       </span>
                       {roleForm.permissions.includes(p.id) && <span className="text-[10px]">✓</span>}
                     </button>
                   ))}
                </div>
              </div>
            </div>
            <div className="space-y-3 pt-4">
              <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">{loading ? 'GUARDANDO...' : 'GUARDAR ROL'}</button>
              <button type="button" onClick={() => { setShowRoleModal(false); setEditingRoleId(null); }} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
