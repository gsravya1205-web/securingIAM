"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Shield,
  Bot,
  User,
  ArrowRight,
  Filter,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface ApprovalRequest {
  id: string;
  requesterName: string;
  requesterType: "HUMAN" | "AGENT";
  agentName?: string;
  requestedAction: string;
  resource: string;
  reason: string;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
}

export default function PendingApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([
    {
      id: "apr-101",
      requesterName: "Report Assistant",
      requesterType: "AGENT",
      agentName: "Report Assistant",
      requestedAction: "EXPORT_AUDIT_LOGS",
      resource: "Compliance:QuarterlyAudit",
      reason: "Automated generation of ISO 27001 exportable evidence archive.",
      date: "Today, 14:15",
      status: "PENDING",
    },
    {
      id: "apr-102",
      requesterName: "Security Monitoring Agent",
      requesterType: "AGENT",
      agentName: "Security Monitoring Agent",
      requestedAction: "EMERGENCY_KEY_ROTATION",
      resource: "Agents:GatewayTokens",
      reason: "Detected unusual latency spikes; requesting proactive credential rotation.",
      date: "Today, 13:40",
      status: "PENDING",
    },
    {
      id: "apr-103",
      requesterName: "Morgan Chen",
      requesterType: "HUMAN",
      requestedAction: "ELEVATE_TO_ADMIN_1HR",
      resource: "Roles:AdminMatrix",
      reason: "Temporary break-glass privilege grant for incident remediation triage.",
      date: "Today, 11:20",
      status: "PENDING",
    },
    {
      id: "apr-104",
      requesterName: "User Support Agent",
      requesterType: "AGENT",
      agentName: "User Support Agent",
      requestedAction: "READ_USER_EMAILS",
      resource: "Users:Directory",
      reason: "Batch lookup of onboarding tickets for internal employees.",
      date: "Yesterday",
      status: "APPROVED",
    },
  ]);

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    text: string;
    type: "success" | "warn";
  } | null>(null);

  // Fetch initial live approvals from API if available
  useEffect(() => {
    fetch("/api/approvals")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.approvals) {
          setRequests(data.approvals);
        }
      })
      .catch(() => {
        // Fallback to initial state
      });
  }, []);

  const handleDecision = async (id: string, decision: "APPROVED" | "REJECTED") => {
    setLoadingId(id);
    try {
      const res = await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });

      const data = await res.json();

      if (!res.ok) {
        setNotification({
          text: data.error || `Failed to record decision for request ${id}.`,
          type: "warn",
        });
        setTimeout(() => setNotification(null), 4000);
        return;
      }

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: decision } : r))
      );

      const req = requests.find((r) => r.id === id);
      setNotification({
        text: `Human Supervisor verdict [${decision}] applied to [${req?.requestedAction}]. Recorded in immutable Audit Log.`,
        type: decision === "APPROVED" ? "success" : "warn",
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: unknown) {
      setNotification({
        text: "Network error communicating with /api/approvals.",
        type: "warn",
      });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Clock className="w-6 h-6 text-[#F59E0B]" />
          Human-in-the-Loop Approval Queue
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Zero-Trust privilege elevation gate. Autonomous AI agents cannot approve their own high-risk actions.
        </p>
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

      {/* Security Policy Callout */}
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#38BDF8] shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold text-white">
              Dual-Control &amp; Machine Governance Policy
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              When an autonomous agent or employee attempts an out-of-band sensitive action (such as credential rotation, mass data export, or role escalation), the request is queued here. Execution remains frozen until an authorized human supervisor renders a decision.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Approvals Table */}
      <Card>
        <CardHeader
          title="Privilege Elevation &amp; Action Approvals"
          description="Pending and historical requests requiring human authorization."
        />
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
              <tr>
                <th className="py-3 px-4">Requesting Subject</th>
                <th className="py-3 px-4">Requested Action</th>
                <th className="py-3 px-4">Resource Target</th>
                <th className="py-3 px-4">Business Justification</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Human Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-[#0B132B]/50 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-white">
                    <div className="flex items-center gap-2">
                      {req.requesterType === "AGENT" ? (
                        <div className="w-6 h-6 rounded-md bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <span>{req.requesterName}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-[#38BDF8]">
                    {req.requestedAction}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                    {req.resource}
                  </td>
                  <td className="py-3.5 px-4 text-slate-300 max-w-xs text-[11px]">
                    {req.reason}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                    {req.date}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={req.status} size="sm" />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {req.status === "PENDING" ? (
                      <div className="inline-flex items-center gap-2">
                        {loadingId === req.id ? (
                          <div className="p-1 px-3">
                            <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleDecision(req.id, "APPROVED")}
                              className="px-2.5 py-1 bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/30 text-[#10B981] rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleDecision(req.id, "REJECTED")}
                              className="px-2.5 py-1 bg-[#EF4444]/15 hover:bg-[#EF4444]/25 border border-[#EF4444]/30 text-[#EF4444] rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        {req.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
