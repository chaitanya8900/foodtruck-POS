import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import usersApi, { CreateUserData } from '@/api/users';
import { User, UserRole } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import { formatDateTime } from '@/lib/utils';

export const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.CASHIER);
  const [isActive, setIsActive] = useState(true);

  // Fetch users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['usersList'],
    queryFn: usersApi.getUsers,
    staleTime: 60 * 1000,
  });

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setName(user.name);
      setEmail(user.email);
      setPassword('');
      setRole(user.role);
      setIsActive(user.isActive ?? (user as any).is_active ?? true);
    } else {
      setEditingUser(null);
      setName('');
      setEmail('');
      setPassword('');
      setRole(UserRole.CASHIER);
      setIsActive(true);
    }
    setIsModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: CreateUserData) => {
      if (editingUser) {
        return usersApi.updateUser(editingUser.id, data);
      }
      return usersApi.createUser(data);
    },
    onSuccess: () => {
      toast.success(editingUser ? 'User updated' : 'Staff user created');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['usersList'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save user account');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.deleteUser(id),
    onSuccess: () => {
      toast.success('User account removed');
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['usersList'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!editingUser && (!password || password.length < 4)) {
      toast.error('Password must be at least 4 characters');
      return;
    }

    saveMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      password: password || undefined,
      role,
      isActive,
    });
  };

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case UserRole.ADMIN:
        return 'bg-[#3A0A0F] text-white font-bold border-[#5B0F1B]';
      case UserRole.KITCHEN_STAFF:
        return 'bg-[#FAF4F2] text-[#3A0A0F] border-[#EAD8C0]';
      case UserRole.CASHIER:
      default:
        return 'bg-[#EAD8C0] text-[#3A0A0F] border-[#EAD8C0]';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#3A0A0F] tracking-tight">Staff & User Management</h1>
          <p className="text-xs text-[#6B4F48]">
            Control terminal logins and assign role-based permissions (Admin, Cashier, Kitchen Staff)
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => handleOpenModal()}
          className="font-bold shadow-md shadow-[#3A0A0F]/20"
        >
          Add Staff Member
        </Button>
      </div>

      {isLoading && users.length === 0 ? (
        <div className="py-20 flex justify-center">
          <Spinner label="Loading staff accounts..." />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8 text-[#3A0A0F]" />}
          title="No Staff Accounts Found"
          description="Create your first staff user to grant counter and kitchen terminal access."
          action={
            <Button variant="primary" onClick={() => handleOpenModal()}>
              Add First User
            </Button>
          }
        />
      ) : (
        <div className="bg-[#FDF6EC] rounded-2xl border border-[#EAD8C0] overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF4F2] border-b border-[#EAD8C0] text-[#3A0A0F] uppercase font-bold">
              <tr>
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Account Status</th>
                <th className="py-3.5 px-4">Registered Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAD8C0]/60">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#FAF4F2] transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#EAD8C0] text-[#3A0A0F] flex items-center justify-center font-bold text-xs uppercase">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-[#3A0A0F]">{u.name}</p>
                        <p className="text-[#6B4F48] text-[11px]">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getRoleBadge(
                        u.role
                      )}`}
                    >
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        (u.isActive ?? (u as any).is_active ?? true)
                          ? 'bg-[#DDF0E4] text-[#1F5A34] border border-[#BCE1C7]'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {(u.isActive ?? (u as any).is_active ?? true) ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[#6B4F48] font-mono">
                    {formatDateTime(u.createdAt || (u as any).created_at)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenModal(u)}
                        className="p-1.5 rounded-lg text-[#6B4F48] hover:text-[#3A0A0F] hover:bg-[#EAD8C0]/40 transition-colors"
                        title="Edit User"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(u.id)}
                        className="p-1.5 rounded-lg text-[#6B4F48] hover:text-[#5B0F1B] hover:bg-red-50 transition-colors"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit User Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Edit Staff Account' : 'Create Staff Member'}
        description="Configure login credentials and system access permissions"
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            label="Full Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. John Doe"
            required
          />

          <Input
            label="Email Address *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. cashier1@foodtruck.com"
            required
          />

          <Input
            label={editingUser ? 'New Password (Leave blank to keep unchanged)' : 'Password *'}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required={!editingUser}
          />

          <Select
            label="Role & Access Permission *"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            options={[
              { value: UserRole.CASHIER, label: 'Cashier (Counter POS & Mobile Orders)' },
              { value: UserRole.KITCHEN_STAFF, label: 'Kitchen Staff (KOT Display only)' },
              { value: UserRole.ADMIN, label: 'Admin (Full Management & Reporting)' },
            ]}
          />

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="isActiveUser"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-[#3A0A0F] accent-[#3A0A0F] rounded border-[#EAD8C0] focus:ring-[#3A0A0F]"
            />
            <label htmlFor="isActiveUser" className="text-sm font-medium text-[#3A0A0F] select-none">
              Account Active & Enabled for Sign In
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EAD8C0]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={saveMutation.isPending}
              className="font-bold"
            >
              {editingUser ? 'Save Changes' : 'Create Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete User Account?"
        description="Are you sure you want to delete this staff account? They will immediately lose access to the system."
        maxWidth="sm"
      >
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
            isLoading={deleteMutation.isPending}
            className="font-bold"
          >
            Yes, Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
