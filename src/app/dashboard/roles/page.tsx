import React from "react";
import { prisma } from "@/lib/prisma";
import { Shield, Key, Check, X, Users, Bot } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      include: {
        permissions: {
          include: { permission: true },
        },
        users: { select: { id: true, name: true } },
        agents: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.permission.findMany({
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Shield className="w-6 h-6 text-[#38BDF8]" />
          Roles &amp; Granular RBAC Permissions
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Defined authorization boundaries for human users and autonomous AI agent identities.
        </p>
      </div>

      {/* Role Cards Grid (4 Roles) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {roles.map((role) => (
          <Card key={role.id} className="relative overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white tracking-tight">
                  {role.name}
                </span>
                <span className="text-[10px] font-mono text-[#38BDF8] bg-[#2563EB]/15 border border-[#2563EB]/30 px-2 py-0.5 rounded-full font-semibold">
                  {role.permissions.length} Scopes
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed min-h-[40px]">
                {role.description}
              </p>

              <div className="mt-4 pt-3 border-t border-[#1E2C4F] flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>{role.users.length} Users</span>
                </span>
                <span className="flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                  <span>{role.agents.length} Agents</span>
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Role-Permission Matrix Table */}
      <Card>
        <CardHeader
          title="Role-Based Access Control (RBAC) Permission Matrix"
          description="Granular capabilities mapped against defined organizational roles. Zero-Trust evaluates every API call against this matrix."
        />
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
              <tr>
                <th className="py-3 px-4">Permission Code</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Capability Description</th>
                {roles.map((r) => (
                  <th key={r.id} className="py-3 px-3 text-center">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
              {permissions.map((perm) => {
                return (
                  <tr key={perm.id} className="hover:bg-[#0B132B]/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-white flex items-center gap-2">
                      <Key className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                      <span>{perm.code}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[10px] font-mono text-slate-400 bg-[#0B132B] px-2 py-0.5 rounded border border-[#1E2C4F]">
                        {perm.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-xs">
                      {perm.description}
                    </td>

                    {roles.map((r) => {
                      const hasPerm = r.permissions.some(
                        (rp) => rp.permission?.code === perm.code
                      );

                      return (
                        <td key={r.id} className="py-3.5 px-3 text-center">
                          {hasPerm ? (
                            <div className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#EF4444]/10 text-[#EF4444]/50 border border-[#EF4444]/20">
                              <X className="w-3 h-3" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

