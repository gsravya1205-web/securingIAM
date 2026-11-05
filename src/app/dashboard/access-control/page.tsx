"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Shield,
  Bot,
  User,
  Sliders,
  FileText,
  AlertTriangle,
  Zap,
  Plus,
  RefreshCw,
  Check,
  X,
  Ban,
  Timer,
  Lock,
  Unlock,
  Key,
  ShieldAlert,
  Play,
  History,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Link from "next/link";

interface PrivilegeElevationItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPermanentRole: string;
  permissions: string[];
  requestedRole?: string | null;
  scope?: string | null;
  justification: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "ACTIVE" | "EXPIRED" | "REVOKED";
  reviewerId?: string | null;
  reviewerName?: string | null;
  reviewerEmail?: string | null;
  reviewerRole?: string | null;
  reviewerNote?: string | null;
  requestedDuration: number;
  approvedDuration?: number | null;
  remainingMinutes?: number | null;
  activatedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

interface PolicyIdentity {
  id: string;
  name: string;
  email?: string;
  type: "USER" | "AGENT";
  role: string;
  status: string;
  perms: string[];
}

interface PolicyResource {
  code: string;
  name: string;
  highRisk: boolean;
}

interface PolicyAction {
  code: string;
  label: string;
  category: string;
}

interface PolicyEvaluationResponse {
  decision: "ALLOW" | "DENY" | "APPROVAL_REQUIRED";
  subjectId: string;
  subjectType: "USER" | "AGENT";
  subjectName: string;
  subjectRole: string;
  subjectStatus: string;
  action: string;
  resource: string;
  reason: string;
  applicablePermission?: string;
  grantType?: "PERMANENT_ROLE" | "JIT_ELEVATION" | "DELEGATION" | "NONE";
  delegationId?: string;
  elevationId?: string;
  approvalId?: string;
  policyRule: string;
  timestamp: string;
  trace: string[];
}

export default function AccessControlCenterPage() {
  const [activeTab, setActiveTab] = useState<"policy" | "jit">("jit");

  // ==========================================
  // REAL BACKEND POLICY EVALUATOR STATE
  // ==========================================
  const [identities, setIdentities] = useState<PolicyIdentity[]>([]);
  const [resources, setResources] = useState<PolicyResource[]>([]);
  const [actions, setActions] = useState<PolicyAction[]>([]);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>("");
  const [selectedResource, setSelectedResource] = useState<string>("");
  const [selectedActionCode, setSelectedActionCode] = useState<string>("");
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [policyResult, setPolicyResult] = useState<PolicyEvaluationResponse | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<PolicyEvaluationResponse[]>([]);
  const [policyMetaLoading, setPolicyMetaLoading] = useState<boolean>(false);

  // Fetch real policy metadata from backend
  const fetchPolicyMetadata = useCallback(async () => {
    try {
      setPolicyMetaLoading(true);
      const res = await fetch("/api/access-control/evaluate");
      const data = await res.json();
      if (res.ok && data.success) {
        setIdentities(data.identities || []);
        setResources(data.resources || []);
        setActions(data.actions || []);

        if (data.identities && data.identities.length > 0 && !selectedIdentityId) {
          setSelectedIdentityId(data.identities[0].id);
        }
        if (data.resources && data.resources.length > 0 && !selectedResource) {
          setSelectedResource(data.resources[0].code);
        }
        if (data.actions && data.actions.length > 0 && !selectedActionCode) {
          setSelectedActionCode(data.actions[0].code);
        }
      }
    } catch (err) {
      console.error("Failed to fetch policy metadata:", err);
    } finally {
      setPolicyMetaLoading(false);
    }
  }, [selectedIdentityId, selectedResource, selectedActionCode]);

  useEffect(() => {
    fetchPolicyMetadata();
  }, [fetchPolicyMetadata]);

  const activeIdentity = identities.find((i) => i.id === selectedIdentityId) || identities[0];

  const handleEvaluatePolicy = async () => {
    if (!activeIdentity || !selectedResource || !selectedActionCode) return;
    try {
      setEvaluating(true);
      const res = await fetch("/api/access-control/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: activeIdentity.id,
          subjectType: activeIdentity.type,
          action: selectedActionCode,
          resource: selectedResource,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Evaluation failed");
      }

      const evalData = data.evaluation as PolicyEvaluationResponse;
      setPolicyResult(evalData);
      setEvaluationHistory((prev) => [evalData, ...prev.slice(0, 9)]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error evaluating policy");
    } finally {
      setEvaluating(false);
    }
  };

  // ==========================================
  // JIT PRIVILEGE ELEVATION STATE
  // ==========================================
  const [elevations, setElevations] = useState<PrivilegeElevationItem[]>([]);
  const [jitLoading, setJitLoading] = useState(false);
  const [currentSessionUser, setCurrentSessionUser] = useState<{
    id: string;
    name: string;
    role: string;
    isSupervisor: boolean;
  } | null>(null);

  // Modal State for Requesting Elevation
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [formPermissions, setFormPermissions] = useState<string[]>(["users.create"]);
  const [formDuration, setFormDuration] = useState<number>(60);
  const [formScope, setFormScope] = useState<string>("Users:Directory");
  const [formJustification, setFormJustification] = useState<string>("");

  // Modal State for Supervisor Review
  const [reviewModalElevation, setReviewModalElevation] = useState<PrivilegeElevationItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [reviewNote, setReviewNote] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Action status message
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchElevations = useCallback(async () => {
    try {
      setJitLoading(true);
      const res = await fetch("/api/privilege-elevations");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load JIT elevations.");
      }
      setElevations(data.elevations || []);
      if (data.currentUser) {
        setCurrentSessionUser(data.currentUser);
      }
    } catch {
      // silently handle
    } finally {
      setJitLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchElevations();
  }, [fetchElevations]);

  const handleCreateElevation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formJustification.trim()) {
      alert("A valid business justification is required.");
      return;
    }
    try {
      setSubmittingRequest(true);
      const res = await fetch("/api/privilege-elevations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: formPermissions,
          scope: formScope,
          justification: formJustification,
          durationMinutes: formDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request.");
      }
      setToastMsg({ text: "JIT Elevation ticket created successfully! Awaiting supervisor approval.", type: "success" });
      setShowRequestModal(false);
      setFormJustification("");
      await fetchElevations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error creating elevation");
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleReviewElevation = async () => {
    if (!reviewModalElevation) return;
    try {
      setSubmittingReview(true);
      const res = await fetch(`/api/privilege-elevations/${reviewModalElevation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reviewDecision,
          reviewerNote: reviewNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Review operation rejected.");
      }
      setToastMsg({
        text: `Elevation request #${reviewModalElevation.id.slice(-6)} ${reviewDecision === "APPROVE" ? "APPROVED & ACTIVATED" : "REJECTED"}.`,
        type: "success",
      });
      setReviewModalElevation(null);
      setReviewNote("");
      await fetchElevations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Review error");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleRevokeElevation = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this active privilege elevation immediately?")) {
      return;
    }
    try {
      const res = await fetch(`/api/privilege-elevations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVOKE",
          reviewerNote: "Manually revoked by administrator via Access Control Center.",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to revoke elevation.");
      }
      setToastMsg({ text: "Privilege elevation revoked immediately. Zero Standing Privilege enforced.", type: "success" });
      await fetchElevations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Revocation error");
    }
  };

  // Metrics computation
  const pendingCount = elevations.filter((e) => e.status === "PENDING").length;
  const activeCount = elevations.filter((e) => e.status === "ACTIVE").length;
  const expiredCount = elevations.filter((e) => e.status === "EXPIRED").length;
  const revokedCount = elevations.filter((e) => e.status === "REVOKED").length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
            toastMsg.type === "success"
              ? "bg-[#10B981]/15 border-[#10B981]/30 text-[#10B981]"
              : "bg-[#EF4444]/15 border-[#EF4444]/30 text-[#EF4444]"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-[#38BDF8]" />
            Access Control Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Centralized Policy Decision Engine (PDP), Zero Standing Privilege (ZSP), and Human Just-In-Time (JIT) access.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center bg-[#0B132B] border border-[#1E2C4F] rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab("jit")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === "jit"
                ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Human JIT &amp; ZSP Engine</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-[#F59E0B] text-black text-[10px] font-bold rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("policy")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === "policy"
                ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Centralized Policy Evaluator</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: JIT PRIVILEGE ELEVATION & ZERO STANDING PRIVILEGE  */}
      {/* ========================================================= */}
      {activeTab === "jit" && (
        <div className="space-y-6">
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Pending Approvals</div>
                  <div className="text-2xl font-bold text-[#F59E0B] mt-1">{pendingCount}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Dual-control required</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20">
                  <Clock className="w-5 h-5 text-[#F59E0B]" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Active JIT Sessions</div>
                  <div className="text-2xl font-bold text-[#10B981] mt-1">{activeCount}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Zero standing privilege</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20">
                  <Zap className="w-5 h-5 text-[#10B981]" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Expired Tickets</div>
                  <div className="text-2xl font-bold text-slate-300 mt-1">{expiredCount}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">TTL elapsed &amp; revoked</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                  <Timer className="w-5 h-5 text-slate-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Revoked Access</div>
                  <div className="text-2xl font-bold text-[#EF4444] mt-1">{revokedCount}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Admin emergency stops</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20">
                  <Ban className="w-5 h-5 text-[#EF4444]" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Header & Request Button */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-[#0B132B]/80 border border-[#1E2C4F] rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#2563EB]/15 border border-[#2563EB]/30 rounded-xl text-[#38BDF8]">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Temporary Privilege Elevation Queue</h3>
                <p className="text-xs text-slate-400">
                  Submit just-in-time access requests. Standing roles in the database remain unchanged.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchElevations}
                disabled={jitLoading}
                className="p-2 bg-[#111A36] hover:bg-[#1A264F] border border-[#1E2C4F] text-slate-300 rounded-xl transition-all cursor-pointer text-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${jitLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => setShowRequestModal(true)}
                className="py-2 px-3.5 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#2563EB] text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/25 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Request JIT Elevation</span>
              </button>
            </div>
          </div>

          {/* Elevations List Table */}
          <Card>
            <CardHeader
              title="Privilege Elevation Tickets"
              description="Complete lifecycle audit of temporary authorizations (Separation of Duties enforced)."
            />
            <CardContent>
              {jitLoading && elevations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  <span>Loading elevation records...</span>
                </div>
              ) : elevations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No elevation tickets found. Click &quot;Request JIT Elevation&quot; to test temporary access.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1E2C4F] text-slate-400 font-medium">
                        <th className="pb-3 px-3">Requester (Standing Role)</th>
                        <th className="pb-3 px-3">Elevated Permissions</th>
                        <th className="pb-3 px-3">Duration &amp; Expiry</th>
                        <th className="pb-3 px-3">Business Justification</th>
                        <th className="pb-3 px-3">Status</th>
                        <th className="pb-3 px-3">Reviewer</th>
                        <th className="pb-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2C4F]/60">
                      {elevations.map((el) => {
                        const isRequesterSelf = currentSessionUser?.id === el.userId;
                        const canReview = currentSessionUser?.isSupervisor && !isRequesterSelf && el.status === "PENDING";
                        const canRevoke = (currentSessionUser?.role === "Admin" || currentSessionUser?.role === "Manager") && el.status === "ACTIVE";

                        return (
                          <tr key={el.id} className="hover:bg-[#111A36]/40 transition-colors">
                            {/* Requester */}
                            <td className="py-3 px-3">
                              <div className="font-semibold text-white">{el.userName}</div>
                              <div className="text-[11px] text-slate-400">{el.userEmail}</div>
                              <div className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[9px]">
                                Standing: {el.userPermanentRole}
                              </div>
                            </td>

                            {/* Elevated Permissions */}
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {el.permissions.map((p) => (
                                  <span
                                    key={p}
                                    className="px-1.5 py-0.5 bg-[#2563EB]/15 text-[#38BDF8] border border-[#2563EB]/30 rounded text-[10px] font-mono"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                              {el.scope && (
                                <div className="text-[10px] text-slate-500 mt-1">Scope: {el.scope}</div>
                              )}
                            </td>

                            {/* Duration & Expiry */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1 font-mono text-slate-300">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>{el.requestedDuration} mins</span>
                              </div>
                              {el.status === "ACTIVE" && el.remainingMinutes !== null && (
                                <div className="mt-1 flex items-center gap-1 text-[11px] text-[#10B981] font-semibold animate-pulse">
                                  <Timer className="w-3 h-3" />
                                  <span>{el.remainingMinutes}m remaining</span>
                                </div>
                              )}
                              {el.expiresAt && el.status !== "ACTIVE" && (
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  {new Date(el.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              )}
                            </td>

                            {/* Justification */}
                            <td className="py-3 px-3 max-w-[220px]">
                              <p className="text-slate-300 text-[11px] line-clamp-2" title={el.justification}>
                                {el.justification}
                              </p>
                              {el.reviewerNote && (
                                <div className="mt-1 text-[10px] text-amber-300/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                  Note: {el.reviewerNote}
                                </div>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3">
                              <StatusBadge status={el.status} size="sm" />
                            </td>

                            {/* Reviewer */}
                            <td className="py-3 px-3 text-[11px] text-slate-400">
                              {el.reviewerName ? (
                                <div>
                                  <span className="text-white font-medium">{el.reviewerName}</span>
                                  <div className="text-[10px] text-slate-500">({el.reviewerRole})</div>
                                </div>
                              ) : (
                                <span className="italic text-slate-600">Pending Review</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-3 text-right">
                              {canReview && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setReviewModalElevation(el);
                                      setReviewDecision("APPROVE");
                                    }}
                                    className="p-1.5 bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border border-[#10B981]/30 rounded-lg transition-all"
                                    title="Approve Elevation"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setReviewModalElevation(el);
                                      setReviewDecision("REJECT");
                                    }}
                                    className="p-1.5 bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30 rounded-lg transition-all"
                                    title="Reject Elevation"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {isRequesterSelf && el.status === "PENDING" && (
                                <span className="text-[10px] text-slate-500 italic block">
                                  Self-approval blocked
                                </span>
                              )}

                              {canRevoke && (
                                <button
                                  onClick={() => handleRevokeElevation(el.id)}
                                  className="px-2.5 py-1 bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30 rounded-lg text-[10px] font-semibold transition-all inline-flex items-center gap-1"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>Revoke</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: CENTRALIZED BACKEND POLICY EVALUATOR               */}
      {/* ========================================================= */}
      {activeTab === "policy" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Policy Evaluation Inputs */}
            <Card className="lg:col-span-7">
              <CardHeader
                title="Centralized Policy Decision Engine (PDP)"
                description="Evaluate access decisions against real database identities, RBAC roles, JIT elevations, delegations, and approval rules."
              />
              <CardContent className="space-y-4 text-xs">
                {/* Identity Selection */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#38BDF8]" />
                      Requesting Subject Identity (Live Database):
                    </span>
                    {policyMetaLoading && (
                      <span className="text-[10px] text-blue-400">Loading identities...</span>
                    )}
                  </label>
                  <select
                    value={selectedIdentityId}
                    onChange={(e) => setSelectedIdentityId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-white focus:outline-none focus:border-[#2563EB]"
                  >
                    {identities.map((id) => (
                      <option key={id.id} value={id.id}>
                        [{id.type}] {id.name} ({id.role}) - {id.status}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Enterprise Resource */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" />
                    Target Enterprise Resource:
                  </label>
                  <select
                    value={selectedResource}
                    onChange={(e) => setSelectedResource(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-white focus:outline-none focus:border-[#2563EB]"
                  >
                    {resources.map((res) => (
                      <option key={res.code} value={res.code}>
                        {res.name} ({res.code}) {res.highRisk ? "[High-Risk]" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Requested Action */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#38BDF8]" />
                    Requested Action / Permission Capability:
                  </label>
                  <select
                    value={selectedActionCode}
                    onChange={(e) => setSelectedActionCode(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-white focus:outline-none focus:border-[#2563EB]"
                  >
                    {actions.map((act) => (
                      <option key={act.code} value={act.code}>
                        {act.code} - {act.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Summary Pill */}
                {activeIdentity && (
                  <div className="p-3 bg-[#0B132B] border border-[#1E2C4F] rounded-xl space-y-1.5 text-slate-400">
                    <div className="flex justify-between">
                      <span>Subject Type:</span>
                      <span className="font-semibold text-white">{activeIdentity.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Assigned Role:</span>
                      <span className="text-[#38BDF8] font-mono">{activeIdentity.role}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Standing Permissions:</span>
                      <span className="text-white font-mono">{activeIdentity.perms.length} Granted</span>
                    </div>
                  </div>
                )}

                {/* Evaluate Button */}
                <button
                  type="button"
                  onClick={handleEvaluatePolicy}
                  disabled={evaluating || !activeIdentity}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#2563EB] text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <Play className={`w-4 h-4 ${evaluating ? "animate-spin" : ""}`} />
                  <span>{evaluating ? "Evaluating Access Policy..." : "Evaluate Access Policy"}</span>
                </button>
              </CardContent>
            </Card>

            {/* Live Policy Decision Display */}
            <Card className="lg:col-span-5 flex flex-col justify-between">
              <CardHeader
                title="Authorization Engine Verdict"
                description="Live result evaluated by backend Policy Decision Engine (PDP)"
              />
              <CardContent className="space-y-4">
                {policyResult ? (
                  <>
                    <div
                      className={`p-6 rounded-2xl border text-center transition-all ${
                        policyResult.decision === "ALLOW"
                          ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]"
                          : policyResult.decision === "DENY"
                          ? "bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]"
                          : "bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]"
                      }`}
                    >
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 border bg-black/20">
                        {policyResult.decision === "ALLOW" ? (
                          <CheckCircle2 className="w-7 h-7" />
                        ) : policyResult.decision === "DENY" ? (
                          <XCircle className="w-7 h-7" />
                        ) : (
                          <Clock className="w-7 h-7" />
                        )}
                      </div>
                      <div className="text-2xl font-black tracking-wider uppercase">
                        {policyResult.decision}
                      </div>
                      <div className="text-xs mt-1 text-slate-300 font-medium">
                        {policyResult.policyRule}
                      </div>
                    </div>

                    <div className="p-3 bg-[#0B132B] border border-[#1E2C4F] rounded-xl space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Grant Mechanism:</span>
                        <span className="text-[#38BDF8] font-mono">{policyResult.grantType || "NONE"}</span>
                      </div>
                      <div className="text-slate-300 leading-relaxed mt-1">
                        {policyResult.reason}
                      </div>
                    </div>

                    {/* Step-by-Step PDP Evaluation Trace */}
                    <div className="p-3 bg-[#060A17] border border-[#1E2C4F] rounded-xl space-y-1 text-[11px] font-mono text-slate-400 max-h-36 overflow-y-auto">
                      <div className="text-slate-300 font-semibold mb-1 flex items-center gap-1">
                        <History className="w-3.5 h-3.5 text-blue-400" />
                        <span>PDP Evaluation Trace:</span>
                      </div>
                      {policyResult.trace.map((t, idx) => (
                        <div key={idx} className="leading-tight text-slate-400">
                          {t}
                        </div>
                      ))}
                    </div>

                    {policyResult.decision === "APPROVAL_REQUIRED" && (
                      <Link
                        href="/dashboard/approvals"
                        className="w-full py-2.5 bg-[#F59E0B] hover:bg-[#D97706] text-black font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md"
                      >
                        <span>Navigate to Supervisory Approvals Queue</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                    <Shield className="w-8 h-8 text-slate-600 mx-auto" />
                    <p>Select a subject, resource, and action, then click &quot;Evaluate Access Policy&quot; to test the real backend decision engine.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Evaluation History Table */}
          {evaluationHistory.length > 0 && (
            <Card>
              <CardHeader
                title="Recent Policy Evaluations (Live Audit Trail)"
                description="History of access policy evaluations executed in this administrative session."
              />
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1E2C4F] text-slate-400 font-medium">
                        <th className="pb-3 px-3">Timestamp</th>
                        <th className="pb-3 px-3">Subject</th>
                        <th className="pb-3 px-3">Action</th>
                        <th className="pb-3 px-3">Resource</th>
                        <th className="pb-3 px-3">Verdict</th>
                        <th className="pb-3 px-3">Policy Rule</th>
                        <th className="pb-3 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2C4F]/60">
                      {evaluationHistory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[#111A36]/40 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-white">{item.subjectName}</span>
                            <span className="ml-1 text-[10px] text-slate-400 font-mono">({item.subjectType})</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#38BDF8]">
                            {item.action}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {item.resource}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.decision === "ALLOW"
                                  ? "bg-[#10B981]/20 text-[#10B981]"
                                  : item.decision === "DENY"
                                  ? "bg-[#EF4444]/20 text-[#EF4444]"
                                  : "bg-[#F59E0B]/20 text-[#F59E0B]"
                              }`}
                            >
                              {item.decision}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-400">
                            {item.policyRule}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-300 max-w-xs truncate" title={item.reason}>
                            {item.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: REQUEST TEMPORARY PRIVILEGE ELEVATION              */}
      {/* ========================================================= */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B132B] border border-[#1E2C4F] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#1E2C4F] pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-[#38BDF8]" />
                <h3 className="text-sm font-semibold text-white">Request JIT Privilege Elevation</h3>
              </div>
              <button
                onClick={() => setShowRequestModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateElevation} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Select Required Privilege Codes:
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[#111A36] p-3 rounded-xl border border-[#1E2C4F]">
                  {[
                    { code: "users.create", label: "users.create (Provision Users)" },
                    { code: "users.delete", label: "users.delete (Revoke Users)" },
                    { code: "roles.manage", label: "roles.manage (Modify RBAC)" },
                    { code: "agents.manage", label: "agents.manage (Rotate Agent Keys)" },
                    { code: "reports.create", label: "reports.create (Audit Reports)" },
                    { code: "audit.read", label: "audit.read (Forensic Logs)" },
                  ].map((perm) => {
                    const isChecked = formPermissions.includes(perm.code);
                    return (
                      <label
                        key={perm.code}
                        className={`p-2 rounded-lg border cursor-pointer flex items-center gap-2 transition-all ${
                          isChecked
                            ? "bg-[#2563EB]/20 border-[#2563EB] text-blue-300"
                            : "bg-[#0B132B] border-[#1E2C4F] text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormPermissions([...formPermissions, perm.code]);
                            } else {
                              setFormPermissions(formPermissions.filter((p) => p !== perm.code));
                            }
                          }}
                          className="rounded border-slate-700 text-blue-500"
                        />
                        <span className="font-mono text-[11px]">{perm.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Target Scope / Resource:
                </label>
                <input
                  type="text"
                  value={formScope}
                  onChange={(e) => setFormScope(e.target.value)}
                  placeholder="e.g. Users:Directory or *"
                  className="w-full px-3 py-2 bg-[#111A36] border border-[#1E2C4F] rounded-xl text-white font-mono focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Requested Temporary Duration:
                </label>
                <select
                  value={formDuration}
                  onChange={(e) => setFormDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#111A36] border border-[#1E2C4F] rounded-xl text-white focus:outline-none focus:border-[#2563EB]"
                >
                  <option value={15}>15 Minutes (Emergency Patch)</option>
                  <option value={30}>30 Minutes (Short Maintenance)</option>
                  <option value={60}>60 Minutes / 1 Hour (Standard)</option>
                  <option value={120}>120 Minutes / 2 Hours (Extended)</option>
                  <option value={240}>240 Minutes / 4 Hours (Maximum Policy Limit)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Mandatory Business Justification:
                </label>
                <textarea
                  required
                  rows={3}
                  value={formJustification}
                  onChange={(e) => setFormJustification(e.target.value)}
                  placeholder="Provide incident reference, ticket number, or reason for elevation..."
                  className="w-full px-3 py-2 bg-[#111A36] border border-[#1E2C4F] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E2C4F]">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 bg-[#111A36] text-slate-300 rounded-xl hover:bg-[#1A264F] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest || formPermissions.length === 0}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingRequest ? "Submitting..." : "Submit Elevation Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SUPERVISOR REVIEW / DECISION                       */}
      {/* ========================================================= */}
      {reviewModalElevation && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B132B] border border-[#1E2C4F] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#1E2C4F] pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Supervisor Decision (Dual-Control)</h3>
              </div>
              <button
                onClick={() => setReviewModalElevation(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#111A36] border border-[#1E2C4F] rounded-xl space-y-1">
                <div className="text-slate-400">Requester:</div>
                <div className="text-white font-semibold">{reviewModalElevation.userName} ({reviewModalElevation.userEmail})</div>
                <div className="text-slate-400 text-[11px]">Requested Duration: {reviewModalElevation.requestedDuration} mins</div>
                <div className="text-slate-400 text-[11px]">Permissions: {reviewModalElevation.permissions.join(", ")}</div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Supervisor Decision:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewDecision("APPROVE")}
                    className={`p-2.5 rounded-xl border font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      reviewDecision === "APPROVE"
                        ? "bg-[#10B981]/20 border-[#10B981] text-[#10B981]"
                        : "bg-[#111A36] border-[#1E2C4F] text-slate-400"
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve &amp; Activate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewDecision("REJECT")}
                    className={`p-2.5 rounded-xl border font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      reviewDecision === "REJECT"
                        ? "bg-[#EF4444]/20 border-[#EF4444] text-[#EF4444]"
                        : "bg-[#111A36] border-[#1E2C4F] text-slate-400"
                    }`}
                  >
                    <X className="w-4 h-4" />
                    <span>Reject Request</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Supervisor Reviewer Note:
                </label>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Optional review reason or compliance signoff code..."
                  className="w-full px-3 py-2 bg-[#111A36] border border-[#1E2C4F] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E2C4F]">
                <button
                  type="button"
                  onClick={() => setReviewModalElevation(null)}
                  className="px-4 py-2 bg-[#111A36] text-slate-300 rounded-xl hover:bg-[#1A264F] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReviewElevation}
                  disabled={submittingReview}
                  className={`px-4 py-2 font-semibold rounded-xl text-white shadow-md transition-all flex items-center gap-1.5 ${
                    reviewDecision === "APPROVE"
                      ? "bg-[#10B981] hover:bg-[#059669]"
                      : "bg-[#EF4444] hover:bg-[#DC2626]"
                  }`}
                >
                  {submittingReview ? "Processing..." : `Confirm ${reviewDecision}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
