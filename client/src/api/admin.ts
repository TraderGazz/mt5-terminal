import { api } from './http';

export interface ApiAdminUser {
  id: number;
  login: string;
  role: 'admin' | 'trader' | 'viewer';
  name: string;
  active: boolean;
  created_at: string;
}

export const getUsers = () => api<{ users: ApiAdminUser[] }>('/admin/users').then((r) => r.users);

export const createUser = (body: {
  login: string;
  password: string;
  role: string;
  name?: string;
}) => api<{ user: ApiAdminUser }>('/admin/users', { method: 'POST', body }).then((r) => r.user);

export const updateUser = (
  id: number,
  body: Partial<{ role: string; name: string; password: string; active: boolean }>,
) => api<{ user: ApiAdminUser }>(`/admin/users/${id}`, { method: 'PATCH', body }).then((r) => r.user);

export const deleteUser = (id: number) =>
  api<{ deleted: true }>(`/admin/users/${id}`, { method: 'DELETE' });
