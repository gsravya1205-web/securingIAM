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
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

interface AgentKeySummary {
  id: string;
  name: string;
  status: string;
  createdAt: Date | string;
  rateLimit: number;
}

interface ApiKeyManagementClientProps {
  initialAgents: AgentKeySummary[];
  currentUserRole: string;
}

export default function ApiKeyManagementClient({
  initialAgents,
  currentUserRole,
}: ApiKeyManagementClientProps) {
  const [agents, setAgents] = useState(initialAgents);
  const [rotatedKeyModal, setRotatedKeyModal] = useState<{
    agentName: string;
    newSecretKey: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadingAgentId, setLoadingAgentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "success" | "warn";
  } | null>(null);

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
        text: `Successfully rotated credentials for [${agentName}]. New bcrypt hash committed to database.`,
        type: "success",
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      setFeedback({
        text: "Network error updating agent status.",
        type: "warn",
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setLoadingAgentId(null);
    }
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
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-[#38BDF8]" />
          Machine Credentials &amp; API Key Management
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Cryptographic token management for autonomous AI systems. Raw secret keys are shown once and stored as salted bcrypt hashes.
        </p>
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

      {/* Security Architecture Callout */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#10B981]/15 border border-[#10B981]/30 rounded-xl text-[#10B981] shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">
                Zero-Standing Plaintext Credential Policy
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                SecureID hashes all machine credentials using bcrypt. In the event of a database compromise, attacker cannot reconstruct active agent API keys.
              </p>
            </div>
          </div>
          <div className="text-[11px] font-mono text-[#38BDF8] bg-[#0B132B] px-3 py-1.5 rounded-lg border border-[#1E2C4F] shrink-0">
            Prefix: sec_agent_*
          </div>
        </CardContent>
      </Card>

      {/* API Key Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
              <tr>
                <th className="py-3 px-4">AI Agent Identity</th>
                <th className="py-3 px-4">Key Identifier (Fingerprint)</th>
                <th className="py-3 px-4">Encryption Type</th>
                <th className="py-3 px-4">Provisioned Date</th>
                <th className="py-3 px-4">Credential Status</th>
                <th className="py-3 px-4 text-right">Lifecycle Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
              {agents.map((ag) => (
                <tr key={ag.id} className="hover:bg-[#0B132B]/50 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                      <Bot className="w-4 h-4" />
                    </div>
                    <span>{ag.name}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300">
                    <span className="text-[#38BDF8]">sec_agent_</span>
                    <span className="text-slate-500">••••••••••••••••</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/20">
                      Bcrypt (10 Rounds)
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                    {new Date(ag.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={ag.status} size="sm" />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {loadingAgentId === ag.id ? (
                        <div className="p-1 px-3">
                          <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRotateKey(ag.id, ag.name)}
                            disabled={ag.status === "REVOKED"}
                            className="px-2.5 py-1 bg-[#172440] hover:bg-[#1E2C4F] border border-[#25365E] rounded-lg text-slate-200 text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <RotateCw className="w-3 h-3 text-[#38BDF8]" />
                            <span>Rotate Key</span>
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

      {/* Show Key Modal (One-Time View) */}
      {rotatedKeyModal && (
        <Modal
          isOpen={Boolean(rotatedKeyModal)}
          onClose={() => setRotatedKeyModal(null)}
          title={`Rotated API Key: ${rotatedKeyModal.agentName}`}
          description="Important: This raw high-entropy credential will only be displayed once. Copy and store in your agent's secure environment vault."
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-xl text-[#EF4444] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Never commit this key to version control or expose in frontend code. It will never be displayed again after closing this window.
              </span>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1.5">
                New Generated Machine API Key:
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
                      <span>Copy Key</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="p-3 bg-[#111C35] rounded-xl border border-[#1E2C4F] space-y-1 text-slate-400 text-[11px]">
              <div>• Hash Algorithm: <strong>bcrypt ($2a$10$) committed to SQLite</strong></div>
              <div>• Token Entropy: <strong>192 bits CSPRNG</strong></div>
              <div>• Key Lifecycle Event: <strong>AGENT_KEY_ROTATED committed to Audit Trail</strong></div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setRotatedKeyModal(null)}
                className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-200 rounded-xl font-medium cursor-pointer"
              >
                I Have Securely Saved This Key
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
