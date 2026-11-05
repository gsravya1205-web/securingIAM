"use client";

import React, { useState } from "react";
import AgentPlayground from "./AgentPlayground";
import {
  Bot,
  Plus,
  Shield,
  Eye,
  PauseCircle,
  PlayCircle,
  XCircle,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Key,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

interface AgentData {
  id: string;
  name: string;
  description: string;
  status: string;
  rateLimit: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  role: {
    id: string;
    name: string;
    description: string;
    permissions: {
      permission: {
        code: string;
        description: string;
      };
    }[];
  };
}

interface AgentRegistryClientProps {
  initialAgents: AgentData[];
  currentUserRole: string;
}

export default function AgentRegistryClient({
  initialAgents,
  currentUserRole,
}: AgentRegistryClientProps) {
  const [activeTab, setActiveTab] = useState<"registry" | "playground">("registry");
  const [agents, setAgents] = useState<AgentData[]>(initialAgents);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals state
  const [selectedAgent, setSelectedAgent] = useState<AgentData | null>(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [newKeyModal, setNewKeyModal] = useState<{
    agentName: string;
    rawApiKey: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Status & action loading states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    text: string;
    type: "success" | "warn";
  } | null>(null);

  // New Agent Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rateLimit, setRateLimit] = useState(120);

  const filteredAgents = agents.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || a.status.toUpperCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = async (agentId: string, newStatus: string) => {
    setActionLoadingId(agentId);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agentId, status: newStatus }),
      });

      const data = await res.json();

      if (!res.ok) {
        setBannerMessage({
          text: data.error || `Failed to update status to ${newStatus}.`,
          type: "warn",
        });
        setTimeout(() => setBannerMessage(null), 4000);
        return;
      }

      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? data.agent : a))
      );
      setBannerMessage({
        text: `Autonomous Agent status updated to [${newStatus}]. Machine token policies synchronized with SQLite.`,
        type: newStatus === "ACTIVE" ? "success" : "warn",
      });
      setTimeout(() => setBannerMessage(null), 3500);
    } catch (err: unknown) {
      setBannerMessage({
        text: "Network error connecting to /api/agents backend.",
        type: "warn",
      });
      setTimeout(() => setBannerMessage(null), 4000);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          rateLimit: Number(rateLimit),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setBannerMessage({
          text: data.error || "Failed to register AI Agent identity.",
          type: "warn",
        });
        setTimeout(() => setBannerMessage(null), 4000);
        return;
      }

      // Add newly registered agent to state
      setAgents([data.agent, ...agents]);
      setName("");
      setDescription("");
      setRegisterModalOpen(false);

      // Open one-time API key display modal
      setNewKeyModal({
        agentName: data.agent.name,
        rawApiKey: data.rawApiKey,
      });

      setBannerMessage({
        text: `AI Agent [${data.agent.name}] provisioned with delegated Non-Human Identity and registered in database!`,
        type: "success",
      });
      setTimeout(() => setBannerMessage(null), 4000);
    } catch (err: unknown) {
      setBannerMessage({
        text: "Network error connecting to /api/agents backend.",
        type: "warn",
      });
      setTimeout(() => setBannerMessage(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyKeyToClipboard = () => {
    if (newKeyModal) {
      navigator.clipboard.writeText(newKeyModal.rawApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-purple-400" />
            Autonomous AI Agent Governance
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Governs non-human machine identities, delegated authority limits, and tool execution boundaries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Navigation */}
          <div className="flex items-center bg-[#0B132B] border border-[#1E2C4F] rounded-xl p-1 gap-1">
            <button
              onClick={() => setActiveTab("registry")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === "registry"
                  ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Agent Registry</span>
            </button>
            <button
              onClick={() => setActiveTab("playground")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === "playground"
                  ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Agent Playground (10 Scenarios)</span>
            </button>
          </div>

          {activeTab === "registry" && (
            <button
              onClick={() => setRegisterModalOpen(true)}
              className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Register Agent</span>
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Feedback Banner */}
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs animate-in fade-in ${
            bannerMessage.type === "success"
              ? "bg-[#10B981]/15 border-[#10B981]/30 text-[#10B981]"
              : "bg-[#F59E0B]/15 border-[#F59E0B]/30 text-[#F59E0B]"
          }`}
        >
          {bannerMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{bannerMessage.text}</span>
        </div>
      )}

      {/* 1. AGENT REGISTRY VIEW */}
      {activeTab === "registry" && (
        <>
          {/* Filter and Search Bar */}
          <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search agent name or purpose..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0B132B] border border-[#1E2C4F] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563EB]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* AI Agent Registry Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
              <tr>
                <th className="py-3 px-4">Agent Identity</th>
                <th className="py-3 px-4">Human Owner</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Rate Limit</th>
                <th className="py-3 px-4">Operational Status</th>
                <th className="py-3 px-4 text-right">Governance Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
              {filteredAgents.map((agent) => (
                <tr key={agent.id} className="hover:bg-[#0B132B]/50 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-white">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">{agent.name}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">
                          {agent.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-slate-300">SOC Operations Team</span>
                    <span className="block text-[10px] text-slate-500">Delegated Scope</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-[11px]">
                      {agent.role?.name || "AI Agent"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300">
                    {agent.rateLimit} req/min
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={agent.status} size="sm" />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedAgent(agent)}
                        title="View non-human identity specs"
                        className="p-1.5 bg-[#172440] hover:bg-[#1E2C4F] border border-[#25365E] rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {actionLoadingId === agent.id ? (
                        <div className="p-1.5">
                          <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                        </div>
                      ) : (
                        <>
                          {agent.status === "ACTIVE" ? (
                            <button
                              onClick={() => handleStatusChange(agent.id, "SUSPENDED")}
                              title="Suspend Machine Authority"
                              className="p-1.5 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30 rounded-lg text-[#F59E0B] transition-colors cursor-pointer"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                            </button>
                          ) : agent.status === "SUSPENDED" ? (
                            <button
                              onClick={() => handleStatusChange(agent.id, "ACTIVE")}
                              title="Reactivate Agent"
                              className="p-1.5 bg-[#10B981]/10 hover:bg-[#10B981]/20 border border-[#10B981]/30 rounded-lg text-[#10B981] transition-colors cursor-pointer"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                            </button>
                          ) : null}

                          {agent.status !== "REVOKED" && (
                            <button
                              onClick={() => handleStatusChange(agent.id, "REVOKED")}
                              title="Permanently Revoke Machine Identity"
                              className="p-1.5 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/30 rounded-lg text-[#EF4444] transition-colors cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      </>
      )}

      {/* 2. AGENT PLAYGROUND & LIVE 10 DEMO SCENARIOS */}
      {activeTab === "playground" && <AgentPlayground />}

      {/* Inspect Agent Details Modal */}
      {selectedAgent && (
        <Modal
          isOpen={Boolean(selectedAgent)}
          onClose={() => setSelectedAgent(null)}
          title={`Non-Human Identity Specs: ${selectedAgent.name}`}
          description="Autonomous agent credentials, delegated authority limits, and tool scopes."
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-[#111C35] border border-[#1E2C4F] rounded-xl space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Agent Identifier:</span>
                <span className="font-mono text-white">{selectedAgent.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="font-mono text-purple-300 font-semibold">
                  {selectedAgent.role?.name || "AI Agent"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Current Status:</span>
                <StatusBadge status={selectedAgent.status} size="sm" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Rate Limiter Quota:</span>
                <span className="font-mono text-slate-200">
                  {selectedAgent.rateLimit} requests / minute
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">API Key Encryption:</span>
                <span className="font-mono text-[#10B981]">
                  Bcrypt Salted Hash (Raw Key Never Stored)
                </span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-2 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-[#38BDF8]" />
                Delegated Granular Permissions:
              </h4>
              <div className="space-y-1.5">
                {selectedAgent.role?.permissions?.map((p) => (
                  <div
                    key={p.permission.code}
                    className="p-2 bg-[#0B132B] border border-[#1E2C4F] rounded-lg flex items-center justify-between"
                  >
                    <code className="text-[#38BDF8] font-mono text-[11px]">
                      {p.permission.code}
                    </code>
                    <span className="text-slate-400 text-[10px]">
                      {p.permission.description}
                    </span>
                  </div>
                )) || (
                  <div className="text-slate-500 italic p-2">
                    Default scoped permissions active.
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-[11px] text-slate-300">
              <strong className="text-white">Least-Privilege Notice:</strong> Autonomous agents never automatically inherit human owner superuser credentials. All actions are restricted by delegated scopes.
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAgent(null)}
                className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-200 rounded-xl font-medium cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Register Agent Modal */}
      <Modal
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        title="Register Autonomous AI Machine Agent"
        description="Creates a discrete non-human identity bound by delegated RBAC policy in SQLite."
      >
        <form onSubmit={handleRegisterAgent} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Agent Call Sign / Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sentinel-ComplianceBot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-[#111C35] border border-[#1E2C4F] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Purpose &amp; Operational Scope
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describes autonomous workflow tasks and resource boundaries..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-[#111C35] border border-[#1E2C4F] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Rate Limit Threshold (Requests per Minute)
            </label>
            <input
              type="number"
              min={10}
              max={1000}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#111C35] border border-[#1E2C4F] rounded-xl text-white focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setRegisterModalOpen(false)}
              className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-300 rounded-xl font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <span>Provision Identity &amp; Key</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Generated One-Time Machine Secret Modal */}
      {newKeyModal && (
        <Modal
          isOpen={Boolean(newKeyModal)}
          onClose={() => setNewKeyModal(null)}
          title={`Machine API Key Generated: ${newKeyModal.agentName}`}
          description="Important: This raw high-entropy credential will only be displayed once. Copy and store it immediately in your AI Agent runtime environment."
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-xl text-[#EF4444] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Zero-Trust Security Policy: SecureID stores only the salted bcrypt hash. This plain text key cannot be recovered after this modal is dismissed.
              </span>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1.5">
                Raw Machine Token:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newKeyModal.rawApiKey}
                  className="flex-1 px-3 py-2.5 bg-[#060A17] border border-[#1E2C4F] rounded-xl font-mono text-xs text-[#38BDF8] select-all focus:outline-none"
                />
                <button
                  onClick={copyKeyToClipboard}
                  className="px-3.5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Key</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="p-3 bg-[#111C35] rounded-xl border border-[#1E2C4F] space-y-1 text-slate-400 text-[11px]">
              <div>• Role Scope: <strong>AI Agent (reports.read, reports.create, agents.read)</strong></div>
              <div>• Hash Algorithm: <strong>bcrypt ($2a$10$) committed to SQLite</strong></div>
              <div>• Audit Event: <strong>AGENT_PROVISIONED logged</strong></div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setNewKeyModal(null)}
                className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-200 rounded-xl font-medium cursor-pointer"
              >
                I Have Stored This Key Safely
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
