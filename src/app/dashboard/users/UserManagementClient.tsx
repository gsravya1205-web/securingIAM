"use client";

import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Shield,
  Eye,
  Edit2,
  Lock,
  Mail,
  Calendar,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

interface UserItem {
  id: string;
  name: string;
  email: string;
  createdAt: Date | string;
  role: {
    id: string;
    name: string;
    description: string;
  };
}

interface UserManagementClientProps {
  initialUsers: UserItem[];
  availableRoles: { id: string; name: string }[];
  currentUserRole: string;
  canCreateUser: boolean;
}

export default function UserManagementClient({
  initialUsers,
  availableRoles,
  currentUserRole,
  canCreateUser,
}: UserManagementClientProps) {
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  // New user form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState(
    availableRoles[0]?.name || "Employee"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole =
      roleFilter === "ALL" || u.role.name.toUpperCase() === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          roleName: selectedRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create user.");
      }

      setUsers([
        {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          createdAt: new Date(),
          role: {
            id: "role-" + selectedRole,
            name: data.user.role.name,
            description: "Newly provisioned role",
          },
        },
        ...users,
      ]);

      setSuccess(`User ${data.user.name} provisioned successfully!`);
      setName("");
      setEmail("");
      setPassword("");
      setTimeout(() => {
        setCreateModalOpen(false);
        setSuccess(null);
      }, 1500);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-[#38BDF8]" />
            User Management Directory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Human identity directory with Role-Based Access Control and status management.
          </p>
        </div>

        <div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Provision New User</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Filter Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-[#0B132B] border border-[#1E2C4F] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563EB]"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* User Directory Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
              <tr>
                <th className="py-3 px-4">User Name</th>
                <th className="py-3 px-4">Corporate Email</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No users matching search filters found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[#0B132B]/50 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-white flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[#2563EB]/20 border border-[#2563EB]/30 flex items-center justify-center text-[#38BDF8] text-[11px] font-bold">
                        {user.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <span>{user.name}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300">
                      {user.email}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-200 bg-[#0B132B] px-2.5 py-1 rounded-md border border-[#1E2C4F]">
                        {user.role.name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status="ACTIVE" size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="px-2.5 py-1 bg-[#172440] hover:bg-[#1E2C4F] border border-[#25365E] rounded-lg text-slate-200 text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3 text-[#38BDF8]" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Modal: View User Details */}
      {selectedUser && (
        <Modal
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          title={`User Identity Profile — ${selectedUser.name}`}
          description="Detailed metadata, assigned RBAC hierarchy, and authentication parameters."
        >
          <div className="space-y-4">
            <div className="p-4 bg-[#111C35] rounded-xl border border-[#1E2C4F] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Unique User ID:</span>
                <span className="font-mono text-slate-200">{selectedUser.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="font-mono text-white">{selectedUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="font-semibold text-[#38BDF8]">
                  {selectedUser.role.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Role Scope:</span>
                <span className="text-slate-300 text-right max-w-xs">
                  {selectedUser.role.description}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Password Storage:</span>
                <span className="text-[#10B981] font-mono text-[11px]">
                  Bcrypt Salted Hash (Never Plaintext)
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Provision New User */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Provision New Human User"
        description="Creates an authenticated human identity with role-bounded permissions."
      >
        {!canCreateUser && (
          <div className="mb-4 p-3 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-xl flex items-start gap-2.5 text-[#EF4444] text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              RBAC Restriction: Your current role (<strong>{currentUserRole}</strong>) lacks the <code className="font-mono text-white">users.create</code> permission. Server will reject non-admin creation requests.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-xl text-[#EF4444] text-xs">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-[#10B981]/15 border border-[#10B981]/30 rounded-xl text-[#10B981] text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Full Legal Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Jordan Lee"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-[#111C35] border border-[#1E2C4F] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Corporate Email Address
            </label>
            <input
              type="email"
              required
              placeholder="jordan.lee@secureid.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-[#111C35] border border-[#1E2C4F] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Assigned Security Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 bg-[#111C35] border border-[#1E2C4F] rounded-xl text-white focus:outline-none focus:border-[#2563EB]"
            >
              {availableRoles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Temporary Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#111C35] border border-[#1E2C4F] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Password will be hashed using bcrypt (10 rounds) before SQLite storage.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-300 rounded-xl font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loading ? "Provisioning..." : "Confirm & Provision User"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

