"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Cpu,
  Clock,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCw,
  Plus,
  Trash2,
  Eye,
  Check,
  X,
  Shield,
  Bot,
  User,
  Zap,
  Lock,
  Layers,
  Sliders,
  Timer,
  RefreshCw,
  Info,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

// Tab types
type GovernanceTab = "decisions" | "approvals" | "delegations";

interface EvaluationSubject {
  id: string;
  name: string;
  type: "USER" | "AGENT";
  roleName: string;
  status: string;
}

interface EvaluationResource {
  id: string;
  name: string;
  category: string;
  action: string;
  requiredPermission: string;
  description: string;
}

interface EvaluationResult {
  decision: "ALLOW" | "DENY" | "APPROVAL_REQUIRED";
  grantType: string;
  subjectName: string;
  subjectType: string;
  assignedRole: string;
  action: string;
  resource: string;
  trace: string[];
  timestamp: string;
  approvalRequired?: boolean;
}

interface ApprovalItem {
  id: string;
  requesterType: "USER" | "AGENT";
  requesterId: string;
  requesterName: string;
  targetAction: string;
  resource: string;
  justification: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  reviewerId?: string | null;
  reviewerName?: string | null;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface DelegationItem {
  id: string;
  grantorId: string;
  agentId: string;
  grantor: { id: string; name: string; email: string; role?: { name: string } };
  agent: { id: string; name: string; status: string };
  permissionsList: string[];
  scope?: string | null;
  reason: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
}

interface JitElevationItem {
  id: string;
  userId: string;
  userName: string;
  userPermanentRole: string;
  permissions: string[];
  scope?: string | null;
  justification: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED" | "REJECTED";
  remainingMinutes?: number;
  approvedDuration?: number;
  expiresAt?: string;
}

interface AccessGovernanceClientProps {
  currentUserRole: string;
  currentUserId: string;
  currentUserName: string;
  initialTab?: GovernanceTab;
}

export default function AccessGovernanceClient({
  currentUserRole,
  currentUserId,
  currentUserName,
  initialTab,
}: AccessGovernanceClientProps) {
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab") as GovernanceTab | null;
  const [activeTab, setActiveTab] = useState<GovernanceTab>(
    initialTabParam === "approvals" || initialTabParam === "delegations"
      ? initialTabParam
      : initialTab || "decisions"
  );

  // Global feedback alert
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "warn" } | null>(null);

  // -------------------------------------------------------------
  // TAB A: ACCESS DECISIONS & JIT STATE
  // -------------------------------------------------------------
  const [subjects, setSubjects] = useState<EvaluationSubject[]>([]);
  const [resources, setResources] = useState<EvaluationResource[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<EvaluationResult[]>([]);
  const [jitElevations, setJitElevations] = useState<JitElevationItem[]>([]);
  const [jitModalOpen, setJitModalOpen] = useState(false);
  const [jitPermission, setJitPermission] = useState("users.create");
  const [jitScope, setJitScope] = useState("Users:Directory");
  const [jitDuration, setJitDuration] = useState("60");
  const [jitReason, setJitReason] = useState("");
  const [jitSubmitting, setJitSubmitting] = useState(false);

  // -------------------------------------------------------------
  // TAB B: PENDING APPROVALS STATE
  // -------------------------------------------------------------
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [approvalsFilter, setApprovalsFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [reviewModalTicket, setReviewModalTicket] = useState<{
    id: string;
    action: "APPROVED" | "REJECTED";
    requesterName: string;
    targetAction: string;
  } | null>(null);
  const [reviewerNoteInput, setReviewerNoteInput] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [detailsApprovalTicket, setDetailsApprovalTicket] = useState<ApprovalItem | null>(null);

  // -------------------------------------------------------------
  // TAB C: DELEGATED ACCESS STATE
  // -------------------------------------------------------------
  const [delegations, setDelegations] = useState<DelegationItem[]>([]);
  const [loadingDelegations, setLoadingDelegations] = useState(false);
  const [createDelegationModalOpen, setCreateDelegationModalOpen] = useState(false);
  const [delGrantorId, setDelGrantorId] = useState(currentUserId);
  const [delAgentId, setDelAgentId] = useState("");
  const [delPermission, setDelPermission] = useState("reports.read");
  const [delScope, setDelScope] = useState("Reports:Sales");
  const [delDuration, setDelDuration] = useState("60");
  const [delReason, setDelReason] = useState("");
  const [detailsDelegation, setDetailsDelegation] = useState<DelegationItem | null>(null);

  // -------------------------------------------------------------
  // FETCHERS
  // -------------------------------------------------------------
  const fetchEvaluationMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/access-control/evaluate");
      if (res.ok) {
        const data = await res.json();
        setSubjects(data.subjects || []);
        setResources(data.resources || []);
        if (data.subjects?.length > 0 && !selectedSubjectId) {
          setSelectedSubjectId(data.subjects[0].id);
        }
        if (data.resources?.length > 0 && !selectedResourceId) {
          setSelectedResourceId(data.resources[0].id);
        }
      }
    } catch (e) {
      console.error("fetchEvaluationMeta error:", e);
    }
  }, [selectedSubjectId, selectedResourceId]);

  const fetchJitElevations = useCallback(async () => {
    try {
      const res = await fetch("/api/privilege-elevations?status=ALL");
      if (res.ok) {
        const data = await res.json();
        setJitElevations(data.elevations || []);
      }
    } catch (e) {
      console.error("fetchJitElevations error:", e);
    }
  }, []);

  const fetchApprovals = useCallback(async () => {
    setLoadingApprovals(true);
    try {
      const res = await fetch(`/api/approvals?status=${approvalsFilter}`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch (e) {
      console.error("fetchApprovals error:", e);
    } finally {
      setLoadingApprovals(false);
    }
  }, [approvalsFilter]);

  const fetchDelegations = useCallback(async () => {
    setLoadingDelegations(true);
    try {
      const res = await fetch("/api/delegations");
      if (res.ok) {
        const data = await res.json();
        setDelegations(data.delegations || []);
      }
    } catch (e) {
      console.error("fetchDelegations error:", e);
    } finally {
      setLoadingDelegations(false);
    }
  }, []);

  useEffect(() => {
    fetchEvaluationMeta();
    fetchJitElevations();
    fetchApprovals();
    fetchDelegations();
  }, [fetchEvaluationMeta, fetchJitElevations, fetchApprovals, fetchDelegations]);

  // -------------------------------------------------------------
  // TAB A ACTIONS: TEST ACCESS REQUEST
  // -------------------------------------------------------------
  const handleTestAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const subject = subjects.find((s) => s.id === selectedSubjectId);
    const resource = resources.find((r) => r.id === selectedResourceId);
    if (!subject || !resource) return;

    setEvaluating(true);
    try {
      const res = await fetch("/api/access-control/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          subjectType: subject.type,
          action: resource.action,
          resource: resource.name,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ text: data.error || "Evaluation failed.", type: "warn" });
        return;
      }

      const evalData = data.evaluation;
      setEvaluationResult(evalData);
      setRecentDecisions((prev) => [evalData, ...prev.slice(0, 9)]);
    } catch {
      setFeedback({ text: "Network error during access policy evaluation.", type: "warn" });
    } finally {
      setEvaluating(false);
    }
  };

  const handleJitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJitSubmitting(true);
    try {
      const res = await fetch("/api/privilege-elevations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: [jitPermission],
          scope: jitScope,
          requestedDuration: parseInt(jitDuration, 10),
          justification: jitReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ text: data.error || "Failed to submit JIT request.", type: "warn" });
        return;
      }
      setJitModalOpen(false);
      setJitReason("");
      setFeedback({
        text: "JIT privilege elevation ticket submitted. Awaiting supervisor review.",
        type: "success",
      });
      fetchJitElevations();
    } catch {
      setFeedback({ text: "Network error creating JIT elevation request.", type: "warn" });
    } finally {
      setJitSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // TAB B ACTIONS: APPROVE / REJECT
  // -------------------------------------------------------------
  const handleReviewDecision = async () => {
    if (!reviewModalTicket) return;
    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/approvals/${reviewModalTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: reviewModalTicket.action,
          reviewerNote: reviewerNoteInput || `${reviewModalTicket.action} by ${currentUserName}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ text: data.error || "Approval review failed.", type: "warn" });
        return;
      }

      setReviewModalTicket(null);
      setReviewerNoteInput("");
      setFeedback({
        text: `Request ${reviewModalTicket.action === "APPROVED" ? "approved" : "rejected"} successfully.`,
        type: "success",
      });
      fetchApprovals();
    } catch {
      setFeedback({ text: "Error rendering approval decision.", type: "warn" });
    } finally {
      setSubmittingReview(false);
    }
  };

  // -------------------------------------------------------------
  // TAB C ACTIONS: CREATE & REVOKE DELEGATION
  // -------------------------------------------------------------
  const handleCreateDelegationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delAgentId) {
      setFeedback({ text: "Please select an AI agent.", type: "warn" });
      return;
    }

    try {
      const res = await fetch("/api/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: delAgentId,
          permissions: [delPermission],
          scope: delScope,
          durationMinutes: parseInt(delDuration, 10),
          reason: delReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ text: data.error || "Delegation failed.", type: "warn" });
        return;
      }

      setCreateDelegationModalOpen(false);
      setDelReason("");
      setFeedback({
        text: "Human-to-agent delegation grant successfully created.",
        type: "success",
      });
      fetchDelegations();
    } catch {
      setFeedback({ text: "Network error creating delegation.", type: "warn" });
    }
  };

  const handleRevokeDelegation = async (delId: string) => {
    if (!confirm("Are you sure you want to revoke this delegation immediately?")) return;
    try {
      const res = await fetch(`/api/delegations/${delId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ text: data.error || "Revocation failed.", type: "warn" });
        return;
      }
      setFeedback({ text: "Delegation revoked. Agent permissions terminated.", type: "warn" });
      fetchDelegations();
    } catch {
      setFeedback({ text: "Network error revoking delegation.", type: "warn" });
    }
  };

  // Calculate summary metrics
  const pendingApprovalsCount = approvals.filter((a) => a.status === "PENDING").length;
  const activeDelegationsCount = delegations.filter((d) => d.status === "ACTIVE").length;
  const activeJitCount = jitElevations.filter((j) => j.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-[#38BDF8]" />
            Access Governance
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Governs how human users and autonomous AI agents obtain, elevate, and delegate permissions under Zero-Trust rules.
          </p>
        </div>

        {/* Action Button depends on active tab */}
        {activeTab === "decisions" && (
          <button
            onClick={() => setJitModalOpen(true)}
            className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer self-start sm:self-auto"
          >
            <Zap className="w-4 h-4" />
            <span>Request Temporary Access (JIT)</span>
          </button>
        )}
        {activeTab === "delegations" && (
          <button
            onClick={() => {
              const firstAgent = subjects.find((s) => s.type === "AGENT");
              if (firstAgent) setDelAgentId(firstAgent.id);
              setCreateDelegationModalOpen(true);
            }}
            className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create Delegation</span>
          </button>
        )}
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
              <div className="text-xs text-slate-400 font-medium">Pending Approvals</div>
              <div className="text-2xl font-bold text-[#F59E0B] mt-1">{pendingApprovalsCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Awaiting supervisor review</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B]">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Active Delegations</div>
              <div className="text-2xl font-bold text-[#38BDF8] mt-1">{activeDelegationsCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Human-to-agent grants</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8]">
              <UserCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Active JIT Sessions</div>
              <div className="text-2xl font-bold text-[#10B981] mt-1">{activeJitCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Zero standing privilege</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
              <Zap className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Policy Engine</div>
              <div className="text-sm font-bold text-emerald-300 mt-2 font-mono">ACTIVE (PDP)</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Centralized decision point</div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <Cpu className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3 Domain Sections / Tabs */}
      <div className="flex items-center bg-[#0B132B] border border-[#1E2C4F] rounded-xl p-1 gap-1">
        <button
          onClick={() => setActiveTab("decisions")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "decisions"
              ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>A. Access Decisions &amp; Policy Evaluator</span>
        </button>

        <button
          onClick={() => setActiveTab("approvals")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${
            activeTab === "approvals"
              ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>B. Pending Approvals</span>
          {pendingApprovalsCount > 0 && (
            <span className="px-1.5 py-0.2 bg-[#F59E0B] text-black text-[10px] font-bold rounded-full ml-1">
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("delegations")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "delegations"
              ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>C. Delegated Access</span>
          {activeDelegationsCount > 0 && (
            <span className="px-1.5 py-0.2 bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/30 text-[10px] font-bold rounded-full ml-1">
              {activeDelegationsCount}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================= */}
      {/* SECTION A: ACCESS DECISIONS & POLICY EVALUATOR             */}
      {/* ========================================================= */}
      {activeTab === "decisions" && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Play className="w-4 h-4 text-[#38BDF8]" />
                    Test Access Request (Policy Decision Engine)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Evaluate an access request for any human user or AI agent against standing roles, JIT elevations, and delegations.
                  </p>
                </div>
              </div>

              <form onSubmit={handleTestAccessRequest} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium text-xs mb-1.5">
                    Subject Identity (User / Agent)
                  </label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs focus:outline-none"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        [{sub.type}] {sub.name} ({sub.roleName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium text-xs mb-1.5">
                    Target Resource &amp; Action
                  </label>
                  <select
                    value={selectedResourceId}
                    onChange={(e) => setSelectedResourceId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs focus:outline-none"
                  >
                    {resources.map((res) => (
                      <option key={res.id} value={res.id}>
                        {res.name} &rarr; {res.action}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={evaluating}
                    className="w-full py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-600/30 cursor-pointer"
                  >
                    {evaluating ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span>{evaluating ? "Evaluating..." : "Evaluate Policy"}</span>
                  </button>
                </div>
              </form>

              {/* Live Verdict Banner */}
              {evaluationResult && (
                <div className="mt-5 p-4 rounded-xl border bg-[#0B132B] border-[#1E2C4F] animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2C4F]">
                    <div className="flex items-center gap-3">
                      {evaluationResult.decision === "ALLOW" && (
                        <div className="px-3 py-1 bg-[#10B981]/20 border border-[#10B981]/40 rounded-lg text-[#10B981] font-bold text-xs flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>ALLOW</span>
                        </div>
                      )}
                      {evaluationResult.decision === "DENY" && (
                        <div className="px-3 py-1 bg-[#EF4444]/20 border border-[#EF4444]/40 rounded-lg text-[#EF4444] font-bold text-xs flex items-center gap-1.5">
                          <XCircle className="w-4 h-4" />
                          <span>DENY</span>
                        </div>
                      )}
                      {evaluationResult.decision === "APPROVAL_REQUIRED" && (
                        <div className="px-3 py-1 bg-[#F59E0B]/20 border border-[#F59E0B]/40 rounded-lg text-[#F59E0B] font-bold text-xs flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          <span>APPROVAL_REQUIRED</span>
                        </div>
                      )}
                      <div>
                        <div className="text-white text-xs font-bold">
                          {evaluationResult.subjectName} &rarr; {evaluationResult.action}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Resource: <code className="text-[#38BDF8]">{evaluationResult.resource}</code>
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Grant: <strong className="text-white">{evaluationResult.grantType}</strong>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-slate-300">
                    <span className="font-semibold text-slate-400">Reason: </span>
                    {evaluationResult.decision === "ALLOW" && (
                      <span>Access authorized via active policy ({evaluationResult.grantType}). Zero-Trust rules satisfied.</span>
                    )}
                    {evaluationResult.decision === "DENY" && (
                      <span>Subject lacks required permission capability and holds no active JIT or delegated grants.</span>
                    )}
                    {evaluationResult.decision === "APPROVAL_REQUIRED" && (
                      <span>Autonomous execution on sensitive resource requires dual-control human supervisor signoff ticket.</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active JIT Temporary Access Sessions */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#10B981]" />
                  Active Just-In-Time (JIT) Temporary Access Sessions
                </h3>
                <span className="text-[11px] text-slate-400">
                  Zero Standing Privilege (Permanent roles unchanged)
                </span>
              </div>

              {jitElevations.filter((j) => j.status === "ACTIVE").length === 0 ? (
                <div className="text-xs text-slate-500 py-3 text-center bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
                  No active JIT sessions. All human users operate under baseline Zero Standing Privilege.
                </div>
              ) : (
                <div className="space-y-2">
                  {jitElevations
                    .filter((j) => j.status === "ACTIVE")
                    .map((jit) => (
                      <div
                        key={jit.id}
                        className="p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center text-[#10B981]">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-white font-semibold flex items-center gap-2">
                              <span>{jit.userName}</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                (Permanent: {jit.userPermanentRole})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Elevated Capability: <code className="text-[#38BDF8]">{jit.permissions.join(", ")}</code> | Scope: {jit.scope || "Global"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/20">
                              Active TTL: {jit.remainingMinutes || jit.approvedDuration || 60}m remaining
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION B: PENDING APPROVALS                              */}
      {/* ========================================================= */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setApprovalsFilter("PENDING")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  approvalsFilter === "PENDING"
                    ? "bg-[#F59E0B] text-black"
                    : "bg-[#0B132B] text-slate-400 border border-[#1E2C4F]"
                }`}
              >
                Awaiting Review Only ({pendingApprovalsCount})
              </button>
              <button
                onClick={() => setApprovalsFilter("ALL")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  approvalsFilter === "ALL"
                    ? "bg-[#2563EB] text-white"
                    : "bg-[#0B132B] text-slate-400 border border-[#1E2C4F]"
                }`}
              >
                All Approval History ({approvals.length})
              </button>
            </div>
            <button
              onClick={() => fetchApprovals()}
              className="p-1.5 text-slate-400 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingApprovals ? "animate-spin" : ""}`} />
            </button>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
                  <tr>
                    <th className="py-3 px-4">Requester</th>
                    <th className="py-3 px-4">Requested Access</th>
                    <th className="py-3 px-4">Justification</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
                  {approvals.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No approval requests found matching the current filter.
                      </td>
                    </tr>
                  ) : (
                    approvals.map((app) => (
                      <tr key={app.id} className="hover:bg-[#0B132B]/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-[#2563EB]/15 border border-[#2563EB]/30 flex items-center justify-center text-[#38BDF8]">
                              {app.requesterType === "USER" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <div className="font-semibold text-white">{app.requesterName}</div>
                              <div className="text-[10px] text-slate-500">{app.requesterType}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          <div className="text-white font-semibold">{app.targetAction}</div>
                          <div className="text-[10px] text-slate-400">{app.resource}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                          {app.justification}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={app.status} size="sm" />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setDetailsApprovalTicket(app)}
                              className="px-2 py-1 bg-[#172440] hover:bg-[#1E2C4F] text-slate-300 rounded text-[11px] inline-flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>

                            {app.status === "PENDING" && (
                              <>
                                <button
                                  onClick={() =>
                                    setReviewModalTicket({
                                      id: app.id,
                                      action: "APPROVED",
                                      requesterName: app.requesterName,
                                      targetAction: app.targetAction,
                                    })
                                  }
                                  className="px-2.5 py-1 bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/30 text-[#10B981] rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Approve</span>
                                </button>

                                <button
                                  onClick={() =>
                                    setReviewModalTicket({
                                      id: app.id,
                                      action: "REJECTED",
                                      requesterName: app.requesterName,
                                      targetAction: app.targetAction,
                                    })
                                  }
                                  className="px-2.5 py-1 bg-[#EF4444]/15 hover:bg-[#EF4444]/25 border border-[#EF4444]/30 text-[#EF4444] rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION C: DELEGATED ACCESS                               */}
      {/* ========================================================= */}
      {activeTab === "delegations" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
                  <tr>
                    <th className="py-3 px-4">Human Grantor</th>
                    <th className="py-3 px-4">Target AI Agent</th>
                    <th className="py-3 px-4">Granted Permission &amp; Scope</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
                  {delegations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No human-to-agent delegations currently exist.
                      </td>
                    </tr>
                  ) : (
                    delegations.map((del) => (
                      <tr key={del.id} className="hover:bg-[#0B132B]/50 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-blue-400" />
                          <span>{del.grantor.name}</span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-white">
                          <div className="flex items-center gap-2">
                            <Bot className="w-3.5 h-3.5 text-purple-400" />
                            <span>{del.agent.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          <span className="text-[#38BDF8]">{del.permissionsList.join(", ")}</span>
                          <span className="text-slate-400"> &rarr; {del.scope || "Global"}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                          {new Date(del.expiresAt).toLocaleTimeString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={del.status} size="sm" />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setDetailsDelegation(del)}
                              className="px-2 py-1 bg-[#172440] hover:bg-[#1E2C4F] text-slate-300 rounded text-[11px] inline-flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>

                            {del.status === "ACTIVE" && (
                              <button
                                onClick={() => handleRevokeDelegation(del.id)}
                                className="px-2.5 py-1 bg-[#EF4444]/15 hover:bg-[#EF4444]/25 border border-[#EF4444]/30 text-[#EF4444] rounded text-[11px] inline-flex items-center gap-1 cursor-pointer font-semibold"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Revoke</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Review Approval Modal */}
      {reviewModalTicket && (
        <Modal
          isOpen={Boolean(reviewModalTicket)}
          onClose={() => setReviewModalTicket(null)}
          title={`${reviewModalTicket.action === "APPROVED" ? "Approve" : "Reject"} Request`}
          description={`Submit your supervisory decision for ${reviewModalTicket.requesterName} on ${reviewModalTicket.targetAction}.`}
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Supervisor Review Note (Optional)</label>
              <textarea
                value={reviewerNoteInput}
                onChange={(e) => setReviewerNoteInput(e.target.value)}
                placeholder="Enter audit justification or conditions..."
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs focus:outline-none h-20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewModalTicket(null)}
                className="px-3 py-1.5 bg-[#172440] text-slate-300 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReviewDecision}
                disabled={submittingReview}
                className={`px-4 py-1.5 text-white font-semibold rounded-xl shadow-md ${
                  reviewModalTicket.action === "APPROVED"
                    ? "bg-[#10B981] hover:bg-[#059669]"
                    : "bg-[#EF4444] hover:bg-[#DC2626]"
                }`}
              >
                {submittingReview ? "Submitting..." : `Confirm ${reviewModalTicket.action}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* JIT Elevation Request Modal */}
      {jitModalOpen && (
        <Modal
          isOpen={jitModalOpen}
          onClose={() => setJitModalOpen(false)}
          title="Request Just-In-Time (JIT) Temporary Privilege"
          description="Request temporary elevated capabilities without mutating your permanent database role."
        >
          <form onSubmit={handleJitSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Requested Capability</label>
              <select
                value={jitPermission}
                onChange={(e) => setJitPermission(e.target.value)}
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs"
              >
                <option value="users.create">users.create (Provision accounts)</option>
                <option value="roles.manage">roles.manage (Edit system roles)</option>
                <option value="agents.manage">agents.manage (Manage AI agents)</option>
                <option value="reports.create">reports.create (High-privilege audit export)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Resource Scope</label>
              <input
                type="text"
                value={jitScope}
                onChange={(e) => setJitScope(e.target.value)}
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs"
                placeholder="e.g. Users:Directory"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Duration (Minutes)</label>
              <select
                value={jitDuration}
                onChange={(e) => setJitDuration(e.target.value)}
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs"
              >
                <option value="30">30 Minutes</option>
                <option value="60">60 Minutes (1 Hour)</option>
                <option value="120">120 Minutes (2 Hours)</option>
                <option value="240">240 Minutes (4 Hours Max)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Business Justification</label>
              <textarea
                value={jitReason}
                onChange={(e) => setJitReason(e.target.value)}
                required
                placeholder="Reason for temporary elevation..."
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs h-16"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setJitModalOpen(false)}
                className="px-3.5 py-2 bg-[#172440] text-slate-300 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={jitSubmitting}
                className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-xl"
              >
                {jitSubmitting ? "Submitting..." : "Submit JIT Ticket"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create Delegation Modal */}
      {createDelegationModalOpen && (
        <Modal
          isOpen={createDelegationModalOpen}
          onClose={() => setCreateDelegationModalOpen(false)}
          title="Create Human-to-Agent Delegation Grant"
          description="Temporarily delegate selected permissions to an autonomous agent within a strict resource scope."
        >
          <form onSubmit={handleCreateDelegationSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Target AI Agent</label>
              <select
                value={delAgentId}
                onChange={(e) => setDelAgentId(e.target.value)}
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs"
              >
                {subjects
                  .filter((s) => s.type === "AGENT")
                  .map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.status})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Delegated Capability</label>
              <select
                value={delPermission}
                onChange={(e) => setDelPermission(e.target.value)}
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs"
              >
                <option value="reports.read">reports.read (Analytics reading)</option>
                <option value="users.read">users.read (Directory inspection)</option>
                <option value="reports.create">reports.create (Report generation)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Resource Scope</label>
              <input
                type="text"
                value={delScope}
                onChange={(e) => setDelScope(e.target.value)}
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs"
                placeholder="e.g. Reports:Sales"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Duration</label>
              <select
                value={delDuration}
                onChange={(e) => setDelDuration(e.target.value)}
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs"
              >
                <option value="30">30 Minutes</option>
                <option value="60">60 Minutes</option>
                <option value="120">120 Minutes</option>
                <option value="480">480 Minutes (8 Hours)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Reason for Delegation</label>
              <textarea
                value={delReason}
                onChange={(e) => setDelReason(e.target.value)}
                required
                placeholder="Specify business purpose for agent execution..."
                className="w-full px-3 py-2 bg-[#060A17] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs h-16"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateDelegationModalOpen(false)}
                className="px-3.5 py-2 bg-[#172440] text-slate-300 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-xl"
              >
                Create Delegation Grant
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Details Modals */}
      {detailsApprovalTicket && (
        <Modal
          isOpen={Boolean(detailsApprovalTicket)}
          onClose={() => setDetailsApprovalTicket(null)}
          title={`Approval Ticket: ${detailsApprovalTicket.targetAction}`}
          description={`Full details for request ID: ${detailsApprovalTicket.id}`}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F] space-y-1.5">
              <div>• Requester: <strong>{detailsApprovalTicket.requesterName}</strong> ({detailsApprovalTicket.requesterType})</div>
              <div>• Resource: <code className="text-[#38BDF8]">{detailsApprovalTicket.resource}</code></div>
              <div>• Status: <StatusBadge status={detailsApprovalTicket.status} size="sm" /></div>
              <div>• Justification: {detailsApprovalTicket.justification}</div>
              {detailsApprovalTicket.reviewerName && (
                <div>• Reviewer: {detailsApprovalTicket.reviewerName} (Note: {detailsApprovalTicket.reviewerNote})</div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setDetailsApprovalTicket(null)}
                className="px-3.5 py-1.5 bg-[#172440] text-slate-200 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {detailsDelegation && (
        <Modal
          isOpen={Boolean(detailsDelegation)}
          onClose={() => setDetailsDelegation(null)}
          title={`Delegation: ${detailsDelegation.agent.name}`}
          description={`Granted by ${detailsDelegation.grantor.name}`}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F] space-y-1.5">
              <div>• Grantor: <strong>{detailsDelegation.grantor.name}</strong> ({detailsDelegation.grantor.email})</div>
              <div>• Target Agent: <strong>{detailsDelegation.agent.name}</strong></div>
              <div>• Permissions: <code className="text-[#38BDF8]">{detailsDelegation.permissionsList.join(", ")}</code></div>
              <div>• Scope: {detailsDelegation.scope || "Global"}</div>
              <div>• Reason: {detailsDelegation.reason}</div>
              <div>• Expires At: {new Date(detailsDelegation.expiresAt).toLocaleString()}</div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setDetailsDelegation(null)}
                className="px-3.5 py-1.5 bg-[#172440] text-slate-200 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
