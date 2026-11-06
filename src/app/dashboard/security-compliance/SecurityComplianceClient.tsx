"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Search,
  Filter,
  Eye,
  RefreshCw,
  Power,
  Lock,
  Unlock,
  User,
  Bot,
  Calendar,
  Clock,
  Ban,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

type SecurityTab = "overview" | "audit" | "compliance";

interface SecurityAlert {
  id: string;
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  timestamp: string;
}

interface SecurityThreatEvent {
  id: string;
  timestamp: string;
  actorType: string;
  actorName: string;
  action: string;
  resource: string;
  status: string;
  details: string;
}

interface SecurityPosture {
  systemStatus: "SECURE" | "ELEVATED_RISK" | "UNDER_ATTACK" | "EMERGENCY_LOCKDOWN";
  activeAgentsCount: number;
  suspendedAgentsCount: number;
  totalAgentsCount: number;
  activeAlerts: SecurityAlert[];
  recentThreatEvents: SecurityThreatEvent[];
  killSwitchEngaged: boolean;
}

interface AuditLogItem {
  id: string;
  timestamp: string;
  actorType: "USER" | "AGENT";
  actorId: string;
  actorName: string;
  action: string;
  resource: string;
  status: "SUCCESS" | "DENIED";
  details?: string | null;
}

interface RoleDistributionItem {
  name: string;
  count: number;
}

interface SecurityComplianceClientProps {
  currentUserRole: string;
  initialTab?: SecurityTab;
}

export default function SecurityComplianceClient({
  currentUserRole,
  initialTab,
}: SecurityComplianceClientProps) {
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab") as SecurityTab | null;
  const [activeTab, setActiveTab] = useState<SecurityTab>(
    initialTabParam === "audit" || initialTabParam === "compliance"
      ? initialTabParam
      : initialTab || "overview"
  );

  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "warn" } | null>(null);

  // -------------------------------------------------------------
  // TAB A: SECURITY OVERVIEW STATE
  // -------------------------------------------------------------
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [loadingPosture, setLoadingPosture] = useState(false);
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);

  // -------------------------------------------------------------
  // TAB B: AUDIT ACTIVITY STATE
  // -------------------------------------------------------------
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SUCCESS" | "DENIED">("ALL");
  const [detailsLog, setDetailsLog] = useState<AuditLogItem | null>(null);

  // -------------------------------------------------------------
  // TAB C: COMPLIANCE REPORTS STATE
  // -------------------------------------------------------------
  const [complianceStats, setComplianceStats] = useState<{
    totalLogs: number;
    allowedCount: number;
    deniedCount: number;
    roleDistribution: RoleDistributionItem[];
  } | null>(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);

  // -------------------------------------------------------------
  // DATA FETCHING
  // -------------------------------------------------------------
  const fetchPosture = useCallback(async () => {
    setLoadingPosture(true);
    try {
      const res = await fetch("/api/monitoring/security-events");
      if (res.ok) {
        const data = await res.json();
        setPosture(data.posture || null);
      }
    } catch (e) {
      console.error("fetchPosture error:", e);
    } finally {
      setLoadingPosture(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/audit");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error("fetchLogs error:", e);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const fetchCompliance = useCallback(async () => {
    setLoadingCompliance(true);
    try {
      const res = await fetch("/api/reports");
      if (res.ok) {
        const data = await res.json();
        setComplianceStats({
          totalLogs: data.totalLogs || 0,
          allowedCount: data.allowedCount || 0,
          deniedCount: data.deniedCount || 0,
          roleDistribution: data.roleDistribution || [],
        });
      }
    } catch (e) {
      console.error("fetchCompliance error:", e);
    } finally {
      setLoadingCompliance(false);
    }
  }, []);

  useEffect(() => {
    fetchPosture();
    fetchLogs();
    fetchCompliance();
  }, [fetchPosture, fetchLogs, fetchCompliance]);

  // -------------------------------------------------------------
  // KILL-SWITCH ACTION
  // -------------------------------------------------------------
  const handleToggleKillSwitch = async () => {
    if (!posture) return;
    const isEngaged = posture.killSwitchEngaged;
    const confirmPrompt = isEngaged
      ? "Lift emergency lockdown and restore active agent identities?"
      : "Engage EMERGENCY KILL-SWITCH? All active AI agents will be immediately suspended across fleet!";

    if (!confirm(confirmPrompt)) return;

    setKillSwitchLoading(true);
    try {
      const res = await fetch("/api/monitoring/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isEngaged ? "DEACTIVATE" : "ACTIVATE" }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ text: data.error || "Kill-switch command failed.", type: "warn" });
        return;
      }

      setFeedback({
        text: isEngaged
          ? `Lockdown lifted. ${data.restoredCount || data.reactivatedCount || 0} agents restored.`
          : `Emergency lockdown engaged! ${data.suspendedCount || 0} agents suspended.`,
        type: isEngaged ? "success" : "warn",
      });
      fetchPosture();
      fetchCompliance();
    } catch {
      setFeedback({ text: "Error executing emergency kill switch.", type: "warn" });
    } finally {
      setKillSwitchLoading(false);
    }
  };

  // -------------------------------------------------------------
  // AUDIT LOG FILTERING
  // -------------------------------------------------------------
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !searchQuery ||
      log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "ALL" || log.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate compliance ratios
  const totalDecisions = complianceStats?.totalLogs || 0;
  const allowedDecisions = complianceStats?.allowedCount || 0;
  const deniedDecisions = complianceStats?.deniedCount || 0;
  const allowRate = totalDecisions > 0 ? Math.round((allowedDecisions / totalDecisions) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#38BDF8]" />
            Security &amp; Compliance
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Consolidates real-time threat monitoring, immutable forensic audit records, and exportable compliance reports.
          </p>
        </div>

        {/* Tab C action buttons */}
        {activeTab === "compliance" && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <a
              href="/api/reports?export=csv"
              download
              className="px-3 py-1.5 bg-[#172440] hover:bg-[#1E2C4F] text-slate-200 border border-[#25365E] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Export CSV</span>
            </a>
            <a
              href="/api/reports?export=json"
              download
              className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </a>
          </div>
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
              <div className="text-xs text-slate-400 font-medium">System Status</div>
              <div className="text-sm font-bold text-emerald-300 mt-2 font-mono flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${posture?.killSwitchEngaged ? "bg-[#EF4444] animate-ping" : "bg-[#10B981]"}`} />
                {posture?.killSwitchEngaged ? "LOCKDOWN" : "SECURE"}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Threat posture active</div>
            </div>
            <div className={`p-2.5 rounded-xl ${posture?.killSwitchEngaged ? "bg-[#EF4444]/15 text-[#EF4444]" : "bg-[#10B981]/15 text-[#10B981]"}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Critical Alerts</div>
              <div className={`text-2xl font-bold mt-1 ${(posture?.activeAlerts?.length || 0) > 0 ? "text-[#F59E0B]" : "text-slate-300"}`}>
                {posture?.activeAlerts?.length || 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Rule-based threat engine</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B]">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Audit Activity</div>
              <div className="text-2xl font-bold text-white mt-1">{totalDecisions}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Immutable records logged</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 text-[#38BDF8]">
              <Activity className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Compliance Rate</div>
              <div className="text-2xl font-bold text-[#10B981] mt-1">{allowRate}%</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{allowedDecisions} allowed / {deniedDecisions} denied</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
              <FileText className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3 Domain Sections / Tabs */}
      <div className="flex items-center bg-[#0B132B] border border-[#1E2C4F] rounded-xl p-1 gap-1">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "overview"
              ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>A. Security Overview &amp; Emergency Lockdown</span>
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "audit"
              ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>B. Audit Activity Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab("compliance")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "compliance"
              ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>C. Compliance &amp; Export Reports</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* SECTION A: SECURITY OVERVIEW & KILL SWITCH                */}
      {/* ========================================================= */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Emergency Kill Switch Card */}
          <Card className={posture?.killSwitchEngaged ? "border-[#EF4444] bg-[#EF4444]/10" : ""}>
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`p-3 rounded-xl border ${
                    posture?.killSwitchEngaged
                      ? "bg-[#EF4444]/20 border-[#EF4444]/40 text-[#EF4444]"
                      : "bg-[#172440] border-[#25365E] text-slate-300"
                  }`}
                >
                  <Power className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Emergency Machine Agent Kill-Switch
                    {posture?.killSwitchEngaged && (
                      <span className="px-2 py-0.5 bg-[#EF4444] text-white text-[10px] font-bold rounded-full animate-pulse">
                        LOCKDOWN ACTIVE
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
                    Instantly suspends machine authority for all registered AI agents across all ingress gateways. Human supervisory and administrative access remains fully functional.
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleKillSwitch}
                disabled={killSwitchLoading}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer shrink-0 ${
                  posture?.killSwitchEngaged
                    ? "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-600/30"
                    : "bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-red-600/30"
                }`}
              >
                {killSwitchLoading
                  ? "Executing..."
                  : posture?.killSwitchEngaged
                  ? "Deactivate Lockdown (Restore Fleet)"
                  : "Activate Emergency Lockdown"}
              </button>
            </CardContent>
          </Card>

          {/* Critical Security Alerts */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                  Active Security Alerts ({posture?.activeAlerts?.length || 0})
                </h3>
                <span className="text-[11px] text-slate-400">Rule-based threat analysis</span>
              </div>

              {(!posture?.activeAlerts || posture.activeAlerts.length === 0) ? (
                <div className="text-xs text-slate-400 py-6 text-center bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
                  <CheckCircle2 className="w-6 h-6 text-[#10B981] mx-auto mb-1.5" />
                  No critical security alerts detected. System is operating normally under Zero-Trust rules.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {posture.activeAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-3.5 bg-[#0B132B] rounded-xl border border-[#1E2C4F] flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-1.5 rounded-lg border mt-0.5 ${
                            alert.severity === "HIGH"
                              ? "bg-[#EF4444]/15 border-[#EF4444]/30 text-[#EF4444]"
                              : "bg-[#F59E0B]/15 border-[#F59E0B]/30 text-[#F59E0B]"
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-white font-semibold flex items-center gap-2">
                            <span>{alert.title}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                alert.severity === "HIGH"
                                  ? "bg-[#EF4444]/20 text-[#EF4444]"
                                  : "bg-[#F59E0B]/20 text-[#F59E0B]"
                              }`}
                            >
                              {alert.severity}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{alert.description}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION B: AUDIT ACTIVITY LEDGER                          */}
      {/* ========================================================= */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by who, what, or resource..."
                className="w-full pl-9 pr-3 py-1.5 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-slate-200 text-xs focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setStatusFilter("ALL")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === "ALL"
                    ? "bg-[#2563EB] text-white"
                    : "bg-[#0B132B] text-slate-400 border border-[#1E2C4F]"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter("SUCCESS")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === "SUCCESS"
                    ? "bg-[#10B981] text-white"
                    : "bg-[#0B132B] text-slate-400 border border-[#1E2C4F]"
                }`}
              >
                Allowed Only
              </button>
              <button
                onClick={() => setStatusFilter("DENIED")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === "DENIED"
                    ? "bg-[#EF4444] text-white"
                    : "bg-[#0B132B] text-slate-400 border border-[#1E2C4F]"
                }`}
              >
                Denied Only
              </button>
            </div>
          </div>

          {/* 5-Question Audit Table */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
                  <tr>
                    <th className="py-3 px-4">1. Who? (Actor)</th>
                    <th className="py-3 px-4">2. What Action?</th>
                    <th className="py-3 px-4">3. Which Resource?</th>
                    <th className="py-3 px-4">4. Outcome</th>
                    <th className="py-3 px-4">5. When?</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No audit events matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.slice(0, 50).map((log) => (
                      <tr key={log.id} className="hover:bg-[#0B132B]/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-[#2563EB]/15 border border-[#2563EB]/30 flex items-center justify-center text-[#38BDF8]">
                              {log.actorType === "USER" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                            </div>
                            <span className="font-semibold text-white">{log.actorName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                          {log.action}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          <code>{log.resource}</code>
                        </td>
                        <td className="py-3 px-4">
                          {log.status === "SUCCESS" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                              ALLOWED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30">
                              DENIED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setDetailsLog(log)}
                            className="px-2 py-1 bg-[#172440] hover:bg-[#1E2C4F] text-slate-300 rounded text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
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
      {/* SECTION C: COMPLIANCE REPORTS                             */}
      {/* ========================================================= */}
      {activeTab === "compliance" && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-bold text-white mb-3">Enterprise Access &amp; Compliance Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3.5 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
                  <div className="text-xs text-slate-400">Total Evaluated Operations</div>
                  <div className="text-2xl font-bold text-white mt-1">{totalDecisions}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Recorded in SQLite audit ledger</div>
                </div>

                <div className="p-3.5 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
                  <div className="text-xs text-slate-400">Authorized Operations</div>
                  <div className="text-2xl font-bold text-[#10B981] mt-1">{allowedDecisions}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{allowRate}% compliance rate</div>
                </div>

                <div className="p-3.5 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
                  <div className="text-xs text-slate-400">Blocked Security Violations</div>
                  <div className="text-2xl font-bold text-[#EF4444] mt-1">{deniedDecisions}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Halted under Zero-Trust rules</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Role & Governance Breakdown */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-bold text-white mb-3">Identity Distribution by Enterprise Role</h3>
              <div className="space-y-2">
                {complianceStats?.roleDistribution.map((role) => (
                  <div
                    key={role.name}
                    className="p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F] flex items-center justify-between text-xs"
                  >
                    <div className="font-semibold text-white">{role.name}</div>
                    <div className="text-slate-400">
                      <strong>{role.count}</strong> Assigned Identities
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Details Modal */}
      {detailsLog && (
        <Modal
          isOpen={Boolean(detailsLog)}
          onClose={() => setDetailsLog(null)}
          title="Forensic Audit Record"
          description={`Tamper-evident log entry ID: ${detailsLog.id}`}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F] space-y-1.5">
              <div>• Actor: <strong>{detailsLog.actorName}</strong> ({detailsLog.actorType})</div>
              <div>• Action: <code className="text-[#38BDF8]">{detailsLog.action}</code></div>
              <div>• Target Resource: <code>{detailsLog.resource}</code></div>
              <div>• Outcome: <strong className={detailsLog.status === "SUCCESS" ? "text-[#10B981]" : "text-[#EF4444]"}>{detailsLog.status === "SUCCESS" ? "ALLOWED" : "DENIED"}</strong></div>
              <div>• Details: {detailsLog.details || "No extra metadata."}</div>
              <div>• Timestamp: {new Date(detailsLog.timestamp).toLocaleString()}</div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setDetailsLog(null)}
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
