"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  Lock,
  Activity,
  Bot,
  Flame,
  Radio,
  Clock,
  CheckCircle2,
  PowerOff,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

interface ViolationLog {
  id: string;
  actorName: string;
  actorType: string;
  action: string;
  resource: string;
  status: string;
  details: string | null;
  timestamp: Date | string;
}

interface SecurityMonitoringClientProps {
  failedLogins: number;
  deniedEvents: number;
  recentViolations: ViolationLog[];
  agentsCount: number;
}

export default function SecurityMonitoringClient({
  failedLogins,
  deniedEvents,
  recentViolations,
  agentsCount,
}: SecurityMonitoringClientProps) {
  const [killSwitchModalOpen, setKillSwitchModalOpen] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "success" | "warn";
  } | null>(null);

  const handleTriggerKillSwitch = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/monitoring/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACTIVATE" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          text: data.error || "Failed to trigger emergency kill-switch.",
          type: "warn",
        });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }

      setEmergencyActive(true);
      setKillSwitchModalOpen(false);
      setFeedback({
        text: `CRITICAL ACTION: Emergency kill-switch activated. Suspended ${data.suspendedCount} active agents in SQLite. All machine execution frozen.`,
        type: "warn",
      });
    } catch {
      setFeedback({
        text: "Network error communicating with emergency kill-switch gateway.",
        type: "warn",
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeactivateKillSwitch = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/monitoring/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DEACTIVATE" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          text: data.error || "Failed to lift emergency lock.",
          type: "warn",
        });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }

      setEmergencyActive(false);
      setFeedback({
        text: `Normal posture restored. Reactivated ${data.restoredCount} agents under baseline rate-limited quotas.`,
        type: "success",
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback({
        text: "Network error lifting emergency lock.",
        type: "warn",
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-[#EF4444]" />
            Security Operations &amp; Threat Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time telemetry tracking authentication failures, unauthorized privilege escalations, and machine anomalies.
          </p>
        </div>

        {emergencyActive ? (
          <button
            onClick={handleDeactivateKillSwitch}
            disabled={isProcessing}
            className="px-4 py-2.5 bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer animate-pulse disabled:opacity-50"
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>Deactivate Emergency Lockdown</span>
          </button>
        ) : (
          <button
            onClick={() => setKillSwitchModalOpen(true)}
            disabled={isProcessing}
            className="px-4 py-2.5 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-[#EF4444]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <PowerOff className="w-4 h-4" />
            <span>Emergency Agent Kill-Switch</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs animate-in fade-in ${
            feedback.type === "warn"
              ? "bg-[#EF4444]/15 border-[#EF4444]/40 text-[#EF4444]"
              : "bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]"
          }`}
        >
          {feedback.type === "warn" ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="font-medium">{feedback.text}</span>
        </div>
      )}

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Failed Authentication Attempts"
          value={failedLogins}
          subtitle="Invalid password / email"
          icon={Lock}
          color="rose"
        />
        <MetricCard
          title="Blocked Privilege Escalations"
          value={deniedEvents}
          subtitle="RBAC policy violations"
          icon={ShieldAlert}
          color="amber"
        />
        <MetricCard
          title="Monitored Machine Identities"
          value={agentsCount}
          subtitle="Active agent rate limiters"
          icon={Bot}
          color="purple"
        />
        <MetricCard
          title="SOC Threat Posture"
          value={emergencyActive ? "LOCKDOWN" : "SECURE"}
          subtitle="Zero-Trust Enforced"
          icon={Radio}
          color={emergencyActive ? "rose" : "emerald"}
        />
      </div>

      {/* Incident Forensics Feed */}
      <Card>
        <CardHeader
          title="Incident Forensics &amp; Policy Violation Trail"
          description="Detailed inspection of requests intercepted and denied by backend authorization filters."
        />
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
              <tr>
                <th className="py-3 px-4">Event Timestamp</th>
                <th className="py-3 px-4">Calling Subject</th>
                <th className="py-3 px-4">Subject Type</th>
                <th className="py-3 px-4">Attempted Operation</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4">Enforcement Verdict</th>
                <th className="py-3 px-4">Forensic Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
              {recentViolations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No security violations recorded. System operating within compliance bounds.
                  </td>
                </tr>
              ) : (
                recentViolations.map((v) => (
                  <tr key={v.id} className="hover:bg-[#0B132B]/50 transition-colors">
                    <td className="py-3 px-4 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(v.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {v.actorName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                        {v.actorType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#38BDF8]">
                      {v.action}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {v.resource}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status="DENIED" size="sm" />
                    </td>
                    <td className="py-3 px-4 text-slate-300 text-[11px] max-w-xs truncate">
                      {v.details || "Policy check failed"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Emergency Kill-Switch Confirmation Modal */}
      <Modal
        isOpen={killSwitchModalOpen}
        onClose={() => setKillSwitchModalOpen(false)}
        title="Activate Emergency Agent Kill-Switch?"
        description="Immediate circuit-breaker for rogue or anomalous agent behaviors."
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-xl text-[#EF4444] space-y-1">
            <strong>Warning — High Impact Operational Action:</strong>
            <p>
              This will immediately revoke machine authentication tokens for all autonomous agents across all connected gateways. No scheduled workflows or automated reports will execute until manually reinstated.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setKillSwitchModalOpen(false)}
              disabled={isProcessing}
              className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-300 rounded-xl font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleTriggerKillSwitch}
              disabled={isProcessing}
              className="px-4 py-2 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl font-semibold cursor-pointer flex items-center gap-1.5"
            >
              {isProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm Emergency Shutdown</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
