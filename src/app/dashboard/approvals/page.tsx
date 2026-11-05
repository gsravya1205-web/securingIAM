"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Shield,
  Bot,
  User,
  RefreshCw,
  AlertTriangle,
  Info,
  Calendar,
  Filter,
  Check,
  X,
  MessageSquare,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface ReviewerInfo {
  id: string;
  name: string;
  email: string;
  role?: {
    name: string;
  };
}

interface ApprovalRequestItem {
  id: string;
  requesterType: "USER" | "AGENT";
  requesterId: string;
  requesterName: string;
  targetAction: string;
  resource: string;
  justification: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  reviewerId?: string | null;
  reviewer?: ReviewerInfo | null;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function PendingApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [isSupervisor, setIsSupervisor] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [noteModalId, setNoteModalId] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [reviewerNote, setReviewerNote] = useState<string>("");

  const [notification, setNotification] = useState<{
    text: string;
    type: "success" | "warn";
  } | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/approvals");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load approval records.");
      }

      if (data.success && Array.isArray(data.approvals)) {
        setRequests(data.approvals);
        setCurrentUserId(data.currentUserId || null);
        setCurrentUserRole(data.currentUserRole || null);
        setIsSupervisor(Boolean(data.isSupervisor));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load approval records.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const openDecisionModal = (id: string, decision: "APPROVED" | "REJECTED") => {
    setNoteModalId(id);
    setPendingDecision(decision);
    setReviewerNote("");
  };

  const handleDecisionConfirm = async () => {
    if (!noteModalId || !pendingDecision) return;

    const id = noteModalId;
    const decision = pendingDecision;
    const note = reviewerNote;

    setLoadingId(id);
    setNoteModalId(null);
    setPendingDecision(null);

    try {
      const res = await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, reviewerNote: note }),
      });

      const data = await res.json();

      if (!res.ok) {
        setNotification({
          text: data.error || `Failed to record decision for request ${id}.`,
          type: "warn",
        });
        setTimeout(() => setNotification(null), 5000);
        return;
      }

      // Update local state with returned updated record
      if (data.approval) {
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...data.approval } : r))
        );
      } else {
        await fetchApprovals();
      }

      setNotification({
        text: `Supervisory verdict [${decision}] applied to request ${id}. Recorded in immutable Audit Log.`,
        type: decision === "APPROVED" ? "success" : "warn",
      });
      setTimeout(() => setNotification(null), 5000);
    } catch {
      setNotification({
        text: "Network error communicating with approval service.",
        type: "warn",
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setLoadingId(null);
    }
  };

  const filteredRequests = requests.filter((req) => {
    if (activeFilter === "ALL") return true;
    return req.status === activeFilter;
  });

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
            <Clock className="w-6 h-6 text-[#F59E0B]" />
            Human-in-the-Loop Approval Queue
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Zero-Trust privilege elevation gate. Autonomous AI agents and users cannot approve their own high-risk actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchApprovals()}
            disabled={loading}
            className="px-3 py-1.5 bg-[#111C35] hover:bg-[#172440] border border-[#1E2C4F] rounded-lg text-xs font-medium text-slate-200 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
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

      {/* Security Policy Callout */}
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#38BDF8] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white">
              Dual-Control &amp; Machine Governance Policy
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When an autonomous agent or employee attempts a sensitive action (credential rotation, mass export, or privilege escalation), the operation is queued here. In strict accordance with Separation of Duties (SoD), a requester can never approve their own request.
            </p>
            {currentUserRole && (
              <div className="text-[10px] text-slate-400 flex items-center gap-2 pt-1">
                <span className="text-slate-300">Signed in as:</span>
                <span className="font-semibold text-white">{currentUserRole}</span>
                <span className="text-slate-500">|</span>
                <span>Review authority:</span>
                <span className={isSupervisor ? "text-[#10B981] font-semibold" : "text-slate-400"}>
                  {isSupervisor ? "Authorized Supervisor" : "Observer / Requester Only"}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {["ALL", "PENDING", "APPROVED", "REJECTED", "EXPIRED"].map((status) => {
          const count =
            status === "ALL"
              ? requests.length
              : requests.filter((r) => r.status === status).length;
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

      {/* Approvals Table */}
      <Card>
        <CardHeader
          title="Privilege Elevation &amp; Action Approvals"
          description="Persistent SQLite database records governing human and autonomous agent actions."
        />
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#38BDF8]" />
              <span>Loading approval records from secure storage...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs flex flex-col items-center justify-center gap-3">
              <AlertCircle className="w-8 h-8 text-[#EF4444]" />
              <span className="text-slate-200 font-medium">{error}</span>
              <button
                onClick={() => fetchApprovals()}
                className="px-3 py-1 bg-[#2563EB] text-white rounded-lg text-xs hover:bg-blue-600 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-slate-600" />
              <span className="font-medium text-slate-300">No approval requests found</span>
              <p className="text-[11px] text-slate-500 max-w-sm">
                {activeFilter === "ALL"
                  ? "All sensitive actions are currently synchronized. When a user or agent requests out-of-band access, it will appear here."
                  : `No requests match status filter '${activeFilter}'.`}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
                <tr>
                  <th className="py-3 px-4">Requesting Subject</th>
                  <th className="py-3 px-4">Action &amp; Target</th>
                  <th className="py-3 px-4">Business Justification</th>
                  <th className="py-3 px-4">Temporal TTL</th>
                  <th className="py-3 px-4">Status &amp; Reviewer</th>
                  <th className="py-3 px-4 text-right">Human Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
                {filteredRequests.map((req) => {
                  const isSelf =
                    req.requesterType === "USER" &&
                    Boolean(currentUserId && req.requesterId === currentUserId);
                  const isPending = req.status === "PENDING";
                  const isExpired = req.status === "EXPIRED";

                  return (
                    <tr key={req.id} className="hover:bg-[#0B132B]/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white">
                        <div className="flex items-center gap-2.5">
                          {req.requesterType === "AGENT" ? (
                            <div className="w-7 h-7 rounded-md bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                              <Bot className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white">{req.requesterName}</span>
                              {isSelf && (
                                <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded px-1 py-0.2">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
                              {req.requesterType}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-[11px] text-[#38BDF8] font-semibold">
                          {req.targetAction}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {req.resource}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 max-w-xs text-[11px] leading-relaxed">
                        {req.justification}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                        <div className="text-slate-300">{formatDate(req.createdAt)}</div>
                        {req.expiresAt && (
                          <div className={`text-[10px] mt-0.5 ${isExpired ? "text-[#EF4444] font-medium" : "text-slate-400"}`}>
                            Expires: {formatDate(req.expiresAt)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div>
                          <StatusBadge status={req.status} size="sm" />
                          {req.reviewer && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              By: <span className="text-slate-200">{req.reviewer.name}</span>
                              {req.reviewerNote && (
                                <div className="text-[10px] text-slate-400 italic truncate max-w-xs mt-0.5">
                                  &quot;{req.reviewerNote}&quot;
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isPending ? (
                          isSelf ? (
                            <span className="inline-block text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-md text-right">
                              Self-review prohibited
                            </span>
                          ) : !isSupervisor ? (
                            <span className="inline-block text-[10px] font-medium text-slate-400 bg-slate-800/60 border border-slate-700 px-2 py-1 rounded-md">
                              Supervisor required
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              {loadingId === req.id ? (
                                <div className="p-1 px-3">
                                  <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => openDecisionModal(req.id, "APPROVED")}
                                    className="px-2.5 py-1 bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/30 text-[#10B981] rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => openDecisionModal(req.id, "REJECTED")}
                                    className="px-2.5 py-1 bg-[#EF4444]/15 hover:bg-[#EF4444]/25 border border-[#EF4444]/30 text-[#EF4444] rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                  >
                                    <X className="w-3 h-3" />
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                            Resolved
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

      {/* Reviewer Note Modal */}
      {noteModalId && pendingDecision && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111C35] border border-[#1E2C4F] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#38BDF8]" />
                Confirm Supervisory Verdict: {pendingDecision}
              </h3>
              <button
                onClick={() => {
                  setNoteModalId(null);
                  setPendingDecision(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are applying a supervisory verdict of{" "}
              <strong
                className={
                  pendingDecision === "APPROVED" ? "text-[#10B981]" : "text-[#EF4444]"
                }
              >
                {pendingDecision}
              </strong>
              . This decision will be permanently committed to the SQLite database and recorded in the immutable audit log.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-medium">
                Supervisor Reviewer Note (Optional):
              </label>
              <textarea
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                placeholder="Enter justification or compliance reference..."
                className="w-full bg-[#060A17] border border-[#1E2C4F] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB] h-20 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setNoteModalId(null);
                  setPendingDecision(null);
                }}
                className="px-3 py-1.5 bg-[#0B132B] hover:bg-[#172440] border border-[#1E2C4F] rounded-lg text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDecisionConfirm}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer ${
                  pendingDecision === "APPROVED"
                    ? "bg-[#10B981] hover:bg-emerald-600"
                    : "bg-[#EF4444] hover:bg-red-600"
                }`}
              >
                Confirm {pendingDecision}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
