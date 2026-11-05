"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  KeyRound,
  Shield,
  Bot,
  User,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  X,
  Lock,
  Layers,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface GrantorInfo {
  id: string;
  name: string;
  email: string;
  role?: { name: string };
}

interface AgentInfo {
  id: string;
  name: string;
  status: string;
  role?: { name: string };
}

interface DelegationItem {
  id: string;
  grantorId: string;
  agentId: string;
  grantor: GrantorInfo;
  agent: AgentInfo;
  permissionsList: string[];
  scope?: string | null;
  reason: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AvailableAgent {
  id: string;
  name: string;
  status: string;
  description?: string;
}

export default function DelegationsPage() {
  const [delegations, setDelegations] = useState<DelegationItem[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [isSupervisor, setIsSupervisor] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Form states
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [scopeInput, setScopeInput] = useState<string>("");
  const [reasonInput, setReasonInput] = useState<string>("");
  const [durationHours, setDurationHours] = useState<number>(2);
  const [formError, setFormError] = useState<string | null>(null);

  const [notification, setNotification] = useState<{
    text: string;
    type: "success" | "warn";
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [delRes, meRes, agentsRes] = await Promise.all([
        fetch("/api/delegations"),
        fetch("/api/auth/me"),
        fetch("/api/agents"),
      ]);

      const delData = await delRes.json();
      const meData = await meRes.json();
      const agentsData = await agentsRes.json();

      if (!delRes.ok) {
        throw new Error(delData.error || "Failed to load delegation records.");
      }

      if (delData.success && Array.isArray(delData.delegations)) {
        setDelegations(delData.delegations);
        setCurrentUserId(delData.currentUserId || null);
        setCurrentUserRole(delData.currentUserRole || null);
        setIsSupervisor(Boolean(delData.isSupervisor));
      }

      if (meData.user?.permissions) {
        setUserPermissions(meData.user.permissions);
      }

      if (agentsData.agents) {
        setAvailableAgents(agentsData.agents.filter((a: AvailableAgent) => a.status === "ACTIVE"));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load delegation data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedAgentId) {
      setFormError("Please select a target AI agent.");
      return;
    }

    if (selectedPerms.length === 0) {
      setFormError("Please select at least one permission to delegate.");
      return;
    }

    if (!reasonInput || reasonInput.trim().length < 5) {
      setFormError("A business reason of at least 5 characters is required.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgentId,
          permissions: selectedPerms,
          scope: scopeInput.trim() || undefined,
          reason: reasonInput.trim(),
          expiresInHours: Number(durationHours),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to create delegation grant.");
        return;
      }

      setShowCreateModal(false);
      setSelectedAgentId("");
      setSelectedPerms([]);
      setScopeInput("");
      setReasonInput("");
      setDurationHours(2);

      setNotification({
        text: `Delegated authority successfully granted to agent. Recorded in immutable audit log.`,
        type: "success",
      });
      setTimeout(() => setNotification(null), 5000);

      await fetchData();
    } catch {
      setFormError("Network error while creating delegation grant.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeConfirmId) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/delegations/${revokeConfirmId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setNotification({
          text: data.error || "Failed to revoke delegation.",
          type: "warn",
        });
        setTimeout(() => setNotification(null), 5000);
        return;
      }

      setRevokeConfirmId(null);
      setNotification({
        text: "Delegation revoked successfully. Agent authority immediately terminated.",
        type: "success",
      });
      setTimeout(() => setNotification(null), 5000);

      await fetchData();
    } catch {
      setNotification({
        text: "Network error while revoking delegation.",
        type: "warn",
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setActionLoading(false);
    }
  };

  const togglePermission = (perm: string) => {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const filteredDelegations = delegations.filter((del) => {
    if (activeFilter === "ALL") return true;
    return del.status === activeFilter;
  });

  const counts = {
    total: delegations.length,
    active: delegations.filter((d) => d.status === "ACTIVE").length,
    expired: delegations.filter((d) => d.status === "EXPIRED").length,
    revoked: delegations.filter((d) => d.status === "REVOKED").length,
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    try {
      const d = new Date(dateString);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-[#38BDF8]" />
            Human-to-Agent Delegated Authorization
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Zero Standing Privilege (ZSP) architecture. Temporarily delegate scoped permissions to autonomous agents without sharing credentials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="px-3 py-1.5 bg-[#111C35] hover:bg-[#172440] border border-[#1E2C4F] rounded-lg text-xs font-medium text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              setShowCreateModal(true);
              setFormError(null);
            }}
            className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-blue-600 border border-blue-500 rounded-lg text-xs font-semibold text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Delegation
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`p-3.5 border rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
            notification.type === "success"
              ? "bg-[#10B981]/15 border-[#10B981]/30 text-[#10B981]"
              : "bg-[#EF4444]/15 border-[#EF4444]/30 text-[#EF4444]"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                Total Delegations
              </div>
              <div className="text-2xl font-bold text-white mt-1">{counts.total}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[#38BDF8]">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                Active Grants
              </div>
              <div className="text-2xl font-bold text-[#10B981] mt-1">{counts.active}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 flex items-center justify-center text-[#10B981]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                Expired (TTL)
              </div>
              <div className="text-2xl font-bold text-slate-300 mt-1">{counts.expired}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                Revoked Grants
              </div>
              <div className="text-2xl font-bold text-[#EF4444] mt-1">{counts.revoked}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center text-[#EF4444]">
              <Trash2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Governance Callout */}
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#38BDF8] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white">
              Zero Standing Privilege (ZSP) &amp; Permission Boundary Policy
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Delegation enforces strict permission boundaries: a human user can only delegate permissions they currently hold. The target AI agent executes exclusively within the delegated resource scope and time-to-live (TTL). If the grantor is deactivated or demoted, the delegation immediately invalidates.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {["ALL", "ACTIVE", "EXPIRED", "REVOKED"].map((status) => {
          const count =
            status === "ALL"
              ? delegations.length
              : delegations.filter((d) => d.status === status).length;
          const isActive = activeFilter === status;
          return (
            <button
              key={status}
              onClick={() => setActiveFilter(status)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? "bg-[#2563EB] border-[#2563EB] text-white"
                  : "bg-[#0B132B] border-[#1E2C4F] text-slate-400 hover:text-white hover:bg-[#111C35]"
              }`}
            >
              <span>{status}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Delegations Table */}
      <Card>
        <CardHeader
          title="Delegated Authority Registry"
          description="Active and historical human-to-machine permission grants recorded in SQLite."
        />
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#38BDF8]" />
              <span>Loading delegation registry from secure storage...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs flex flex-col items-center justify-center gap-3">
              <AlertCircle className="w-8 h-8 text-[#EF4444]" />
              <span className="text-slate-200 font-medium">{error}</span>
              <button
                onClick={() => fetchData()}
                className="px-3 py-1 bg-[#2563EB] text-white rounded-lg text-xs hover:bg-blue-600 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredDelegations.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
              <KeyRound className="w-8 h-8 text-slate-600" />
              <span className="font-medium text-slate-300">No delegations found</span>
              <p className="text-[11px] text-slate-500 max-w-sm">
                {activeFilter === "ALL"
                  ? "No active or historical delegation grants found. Click 'Create Delegation' to issue a scoped temporary grant."
                  : `No delegation grants match status filter '${activeFilter}'.`}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
                <tr>
                  <th className="py-3 px-4">Grantor (Human)</th>
                  <th className="py-3 px-4">Target AI Agent</th>
                  <th className="py-3 px-4">Delegated Permissions</th>
                  <th className="py-3 px-4">Resource Scope &amp; Reason</th>
                  <th className="py-3 px-4">Validity (TTL)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
                {filteredDelegations.map((del) => {
                  const isActive = del.status === "ACTIVE";
                  const canRevoke =
                    isActive &&
                    (del.grantorId === currentUserId ||
                      currentUserRole === "Admin" ||
                      isSupervisor);

                  return (
                    <tr key={del.id} className="hover:bg-[#0B132B]/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-semibold text-white block">{del.grantor.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {del.grantor.role?.name || "Human"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-semibold text-white block">{del.agent.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Status: {del.agent.status}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {del.permissionsList.map((p) => (
                            <span
                              key={p}
                              className="px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-[#38BDF8] font-mono text-[10px]"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-[11px] font-mono text-slate-300">
                          Scope: <span className="text-white font-medium">{del.scope || "Global"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5" title={del.reason}>
                          {del.reason}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                        <div className="text-slate-300">Created: {formatDate(del.createdAt)}</div>
                        <div className={`text-[10px] mt-0.5 ${isActive ? "text-amber-400" : "text-slate-500"}`}>
                          Expires: {formatDate(del.expiresAt)}
                        </div>
                        {del.revokedAt && (
                          <div className="text-[10px] text-[#EF4444] mt-0.5">
                            Revoked: {formatDate(del.revokedAt)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={del.status} size="sm" />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {canRevoke ? (
                          <button
                            onClick={() => setRevokeConfirmId(del.id)}
                            className="px-2.5 py-1 bg-[#EF4444]/15 hover:bg-[#EF4444]/25 border border-[#EF4444]/30 text-[#EF4444] rounded-lg text-[11px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Revoke
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                            {del.status === "ACTIVE" ? "Protected" : "Archived"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create Delegation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111C35] border border-[#1E2C4F] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1E2C4F] pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#38BDF8]" />
                Issue Temporary Delegation Grant
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-xl text-xs text-[#EF4444] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateDelegation} className="space-y-4 text-xs">
              {/* Grantor (Automatically Derived) */}
              <div className="p-3 rounded-xl bg-[#0B132B] border border-[#1E2C4F] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="text-slate-400 text-[11px] block">Grantor Identity:</span>
                    <span className="text-white font-semibold">You ({currentUserRole})</span>
                  </div>
                </div>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded px-2 py-0.5">
                  Server-Verified Session
                </span>
              </div>

              {/* Target AI Agent */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">Target AI Machine Agent:</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full bg-[#060A17] border border-[#1E2C4F] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="">-- Select Active Autonomous Agent --</option>
                  {availableAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Delegated Permissions */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-medium">Permissions to Delegate:</label>
                  <span className="text-[10px] text-slate-400">
                    Bounded by your effective role ({userPermissions.length} available)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 bg-[#060A17] border border-[#1E2C4F] rounded-xl max-h-36 overflow-y-auto">
                  {userPermissions.map((perm) => {
                    const isChecked = selectedPerms.includes(perm);
                    return (
                      <label
                        key={perm}
                        className={`flex items-center gap-2 p-1.5 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                          isChecked
                            ? "bg-blue-500/20 border-blue-500/40 text-[#38BDF8]"
                            : "bg-[#0B132B]/60 border-[#1E2C4F]/60 text-slate-300 hover:bg-[#111C35]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermission(perm)}
                          className="rounded border-slate-600 text-[#2563EB] focus:ring-0"
                        />
                        <span className="font-mono text-[10px] truncate">{perm}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Resource Scope */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">
                  Resource Scope Boundary (Optional):
                </label>
                <input
                  type="text"
                  value={scopeInput}
                  onChange={(e) => setScopeInput(e.target.value)}
                  placeholder="e.g. Sales Reports, Compliance:Audit, or department:finance"
                  className="w-full bg-[#060A17] border border-[#1E2C4F] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
                <p className="text-[10px] text-slate-400">
                  Restricts delegated authority strictly to matching resource targets. Leave blank for global scope.
                </p>
              </div>

              {/* Business Reason */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">Business Justification Reason:</label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="e.g. Weekly automated financial audit report generation"
                  className="w-full bg-[#060A17] border border-[#1E2C4F] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              {/* Validity TTL Duration */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">Delegation Duration (TTL):</label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full bg-[#060A17] border border-[#1E2C4F] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                >
                  <option value={1}>1 Hour (Standard temporary elevation)</option>
                  <option value={2}>2 Hours (Default recommended)</option>
                  <option value={4}>4 Hours (Half-day operation window)</option>
                  <option value={8}>8 Hours (Full business shift)</option>
                  <option value={24}>24 Hours (Overnight batch cycle)</option>
                  <option value={72}>72 Hours (Maximum policy limit)</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1E2C4F]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-1.5 bg-[#0B132B] hover:bg-[#172440] border border-[#1E2C4F] rounded-lg text-xs text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-[#2563EB] hover:bg-blue-600 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {actionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Confirm &amp; Issue Grant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revocation Confirmation Modal */}
      {revokeConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111C35] border border-[#1E2C4F] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
                Confirm Delegation Revocation
              </h3>
              <button
                onClick={() => setRevokeConfirmId(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to revoke this delegation grant? The target AI agent will immediately lose delegated authority, and the event will be permanently recorded in the security audit log.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRevokeConfirmId(null)}
                className="px-3 py-1.5 bg-[#0B132B] hover:bg-[#172440] border border-[#1E2C4F] rounded-lg text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-[#EF4444] hover:bg-red-600 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                Confirm Revocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

