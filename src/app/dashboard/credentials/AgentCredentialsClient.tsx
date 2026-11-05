"use client";

import React, { useState } from "react";
import {
  KeyRound,
  RotateCw,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  ShieldCheck,
  Bot,
  RefreshCw,
  CheckCircle2,
  Plus,
  Eye,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

interface AgentKeySummary {
  id: string;
  name: string;
  status: string;
  createdAt: Date | string;
  rateLimit: number;
}

interface AgentCredentialsClientProps {
  initialAgents: AgentKeySummary[];
  currentUserRole: string;
}

export default function AgentCredentialsClient({
  initialAgents,
  currentUserRole,
}: AgentCredentialsClientProps) {
  const [agents, setAgents] = useState<AgentKeySummary[]>(initialAgents);
  const [rotatedKeyModal, setRotatedKeyModal] = useState<{
    agentName: string;
    newSecretKey: string;
  } | null>(null);
  const [detailsModalAgent, setDetailsModalAgent] = useState<AgentKeySummary | null>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [selectedAgentForNewKey, setSelectedAgentForNewKey] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loadingAgentId, setLoadingAgentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "success" | "warn";
  } | null>(null);

  const activeCount = agents.filter((a) => a.status === "ACTIVE").length;
  const revokedCount = agents.filter((a) => a.status !== "ACTIVE").length;

  const handleRotateKey = async (agentId: string, agentName: string) => {
    setLoadingAgentId(agentId);
    try {
      const res = await fetch("/api/agents/rotate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          text: data.error || "Failed to rotate agent credentials.",
          type: "warn",
        });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }

      setRotatedKeyModal({
        agentName,
        newSecretKey: data.newSecretKey,
      });
      setCopied(false);
      setFeedback({
        text: `Successfully rotated credentials for [${agentName}]. New bcrypt hash saved.`,
        type: "success",
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback({
        text: "Network error connecting to /api/agents/rotate-key.",
        type: "warn",
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setLoadingAgentId(null);
    }
  };

  const handleRevokeKey = async (agentId: string, agentName: string) => {
    if (!confirm(`Are you sure you want to permanently revoke credentials for '${agentName}'?`)) {
      return;
    }
    setLoadingAgentId(agentId);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agentId, status: "REVOKED" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          text: data.error || "Failed to revoke agent credentials.",
          type: "warn",
        });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }

      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, status: "REVOKED" } : a))
      );
      setFeedback({
        text: `Machine credential for [${agentName}] permanently REVOKED in database.`,
        type: "warn",
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback({
        text: "Network error updating agent status.",
        type: "warn",
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setLoadingAgentId(null);
    }
  };

  const handleGenerateKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentForNewKey) return;
    const targetAgent = agents.find((a) => a.id === selectedAgentForNewKey);
    if (!targetAgent) return;

    setGenerateModalOpen(false);
    await handleRotateKey(targetAgent.id, targetAgent.name);
  };

  const copyToClipboard = () => {
    if (rotatedKeyModal) {
      navigator.clipboard.writeText(rotatedKeyModal.newSecretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-[#38BDF8]" />
            Agent Credentials
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage cryptographic API keys and lifecycle status for autonomous AI agents. Secret keys are displayed only once.
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedAgentForNewKey(agents[0]?.id || "");
            setGenerateModalOpen(true);
          }}
          className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Generate API Key</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 border rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
            feedback.type === "success"
              ? "bg-[#10B981]/15 border-[#10B981]/30 text-[#10B981]"
              : "bg-[#EF4444]/15 border-[#EF4444]/30 text-[#EF4444]"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 3-4 Essential Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Total API Keys</div>
              <div className="text-2xl font-bold text-white mt-1">{agents.length}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Machine identities</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 text-[#38BDF8]">
              <KeyRound className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Active Keys</div>
              <div className="text-2xl font-bold text-[#10B981] mt-1">{activeCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Operational agents</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Revoked / Inactive</div>
              <div className="text-2xl font-bold text-slate-300 mt-1">{revokedCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Access disabled</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 text-slate-400">
              <Trash2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Security Standard</div>
              <div className="text-sm font-bold text-purple-300 mt-2 font-mono">Bcrypt (10 rds)</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Zero plaintext storage</div>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clean Table: Essential Columns Only */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
              <tr>
                <th className="py-3 px-4">Associated Agent</th>
                <th className="py-3 px-4">Key Fingerprint</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Provisioned</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
              {agents.map((ag) => (
                <tr key={ag.id} className="hover:bg-[#0B132B]/50 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold">{ag.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Quota: {ag.rateLimit} req/min</div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px]">
                    <span className="text-[#38BDF8]">sec_agent_</span>
                    <span className="text-slate-500">••••••••••••••••</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={ag.status} size="sm" />
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                    {new Date(ag.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {loadingAgentId === ag.id ? (
                        <div className="p-1 px-3">
                          <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setDetailsModalAgent(ag)}
                            className="px-2.5 py-1 bg-[#172440] hover:bg-[#1E2C4F] border border-[#25365E] rounded-lg text-slate-200 text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3 text-slate-400" />
                            <span>Details</span>
                          </button>

                          <button
                            onClick={() => handleRotateKey(ag.id, ag.name)}
                            disabled={ag.status === "REVOKED"}
                            className="px-2.5 py-1 bg-[#172440] hover:bg-[#1E2C4F] border border-[#25365E] rounded-lg text-slate-200 text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <RotateCw className="w-3 h-3 text-[#38BDF8]" />
                            <span>Rotate</span>
                          </button>

                          {ag.status !== "REVOKED" && (
                            <button
                              onClick={() => handleRevokeKey(ag.id, ag.name)}
                              className="px-2.5 py-1 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/30 rounded-lg text-[#EF4444] text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Revoke</span>
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

      {/* Generate API Key Modal */}
      {generateModalOpen && (
        <Modal
          isOpen={generateModalOpen}
          onClose={() => setGenerateModalOpen(false)}
          title="Generate Agent API Key"
          description="Select an AI agent identity to generate a fresh high-entropy machine token."
        >
          <form onSubmit={handleGenerateKeySubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Target AI Agent</label>
              <select
                value={selectedAgentForNewKey}
                onChange={(e) => setSelectedAgentForNewKey(e.target.value)}
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 focus:outline-none"
              >
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="p-3 bg-[#111C35] rounded-xl border border-[#1E2C4F] text-[11px] text-slate-400">
              Generating a new key rotates any existing key for this agent and generates a 192-bit CSPRNG token starting with <code className="text-[#38BDF8]">sec_agent_</code>.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setGenerateModalOpen(false)}
                className="px-3.5 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-300 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl font-semibold shadow-md shadow-blue-600/30"
              >
                Generate &amp; Reveal Key
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* View Details Modal */}
      {detailsModalAgent && (
        <Modal
          isOpen={Boolean(detailsModalAgent)}
          onClose={() => setDetailsModalAgent(null)}
          title={`Credential Details: ${detailsModalAgent.name}`}
          description="Technical summary of this machine identity's authentication credentials."
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Agent Name</div>
                <div className="text-white font-medium mt-0.5">{detailsModalAgent.name}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Lifecycle Status</div>
                <div className="mt-0.5">
                  <StatusBadge status={detailsModalAgent.status} size="sm" />
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Rate Limit Quota</div>
                <div className="text-slate-300 font-mono mt-0.5">{detailsModalAgent.rateLimit} requests / min</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Provisioned Date</div>
                <div className="text-slate-300 mt-0.5">{new Date(detailsModalAgent.createdAt).toLocaleString()}</div>
              </div>
            </div>

            <div className="p-3 bg-[#111C35] rounded-xl border border-[#1E2C4F] space-y-1.5 text-slate-400 text-[11px]">
              <div className="flex items-center gap-2 text-white font-semibold">
                <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                <span>Zero-Trust Credential Storage</span>
              </div>
              <div>• Key prefix: <code className="text-[#38BDF8]">sec_agent_*</code></div>
              <div>• Hash algorithm: <strong>Bcrypt ($2a$10$) in SQLite</strong></div>
              <div>• Plaintext key is never stored on disk or retrievable via API.</div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setDetailsModalAgent(null)}
                className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-200 rounded-xl font-medium"
              >
                Close Details
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Show Rotated Key Modal (One-Time View) */}
      {rotatedKeyModal && (
        <Modal
          isOpen={Boolean(rotatedKeyModal)}
          onClose={() => setRotatedKeyModal(null)}
          title={`Generated API Key: ${rotatedKeyModal.agentName}`}
          description="Important: This raw high-entropy credential will only be displayed once. Copy and store in your agent's secure environment vault."
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-xl text-[#EF4444] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Never commit this key to version control. It will never be displayed again after closing this window.
              </span>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1.5">
                Machine API Key Token:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={rotatedKeyModal.newSecretKey}
                  className="flex-1 px-3 py-2.5 bg-[#060A17] border border-[#1E2C4F] rounded-xl font-mono text-xs text-[#38BDF8] select-all focus:outline-none"
                />
                <button
                  onClick={copyToClipboard}
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
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setRotatedKeyModal(null)}
                className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-200 rounded-xl font-medium cursor-pointer"
              >
                I Have Saved This Key
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

