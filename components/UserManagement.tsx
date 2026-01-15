
import React from 'react';
import { UserRole, UserProfile } from '../types';

const MOCK_USERS: UserProfile[] = [
  { id: '1', email: 'admin@warehouse.com', full_name: 'Admin User', role: UserRole.ADMIN, created_at: '2024-01-01' },
  { id: '2', email: 'op1@warehouse.com', full_name: 'Juan Operador', role: UserRole.OPERATOR, created_at: '2024-02-15' },
  { id: '3', email: 'viewer@warehouse.com', full_name: 'Ana Visora', role: UserRole.VIEWER, created_at: '2024-03-10' },
];

const UserManagement: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-50 flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800">Control de Usuarios</h3>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">
          Invitar Usuario
        </button>
      </div>
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-6 py-4 font-semibold">Usuario</th>
            <th className="px-6 py-4 font-semibold">Email</th>
            <th className="px-6 py-4 font-semibold">Rol</th>
            <th className="px-6 py-4 font-semibold">Fecha Registro</th>
            <th className="px-6 py-4 font-semibold text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {MOCK_USERS.map((user) => (
            <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                    {user.full_name[0]}
                  </div>
                  <span className="font-medium text-slate-700">{user.full_name}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-slate-600 text-sm">{user.email}</td>
              <td className="px-6 py-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                  user.role === UserRole.ADMIN 
                  ? 'bg-rose-100 text-rose-700' 
                  : user.role === UserRole.OPERATOR 
                  ? 'bg-indigo-100 text-indigo-700' 
                  : 'bg-slate-100 text-slate-600'
                }`}>
                  {user.role}
                </span>
              </td>
              <td className="px-6 py-4 text-slate-500 text-sm">{user.created_at}</td>
              <td className="px-6 py-4 text-right">
                <button className="text-slate-400 hover:text-indigo-600 mr-3">Editar</button>
                <button className="text-slate-400 hover:text-rose-600">Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserManagement;
