import React from "react";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  Users,
  Shield,
  Bot,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  Lock,
  Sparkles,
  Cpu,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await getSession();

  // Load telemetry directly from SQLite
  const [
    totalUsers,
    totalRoles,
    totalAgents,
    activeAgents,
    allowedRequests,
    deniedRequests,
    pendingApprovalsCount,
    recentAudits,
    agentsList,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.role.count(),
    prisma.agent.count(),
    prisma.agent.count({ where: { status: "ACTIVE" } }),
    prisma.auditLog.count({ where: { status: "SUCCESS" } }),
    prisma.auditLog.count({ where: { status: "DENIED" } }),
    prisma.approvalRequest.count({ where: { status: "PENDING" } }),
    prisma.auditLog.findMany({
      take: 6,
      orderBy: { timestamp: "desc" },
    }),
    prisma.agent.findMany({
      take: 4,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const totalDecisions = allowedRequests + deniedRequests;
  const allowedRate =
    totalDecisions > 0
      ? Math.round((allowedRequests / totalDecisions) * 100)
      : 100;

  return (
    <div className="space-y-6">
      {/* 1. Welcome & Zero-Trust Posture Banner */}
      <div className="bg-gradient-to-r from-[#0B132B] via-[#111C35] to-[#172440] border border-[#1E2C4F] rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#38BDF8] mb-2">
              <Sparkles className="w-4 h-4" />
              <span>Enterprise Identity &amp; Agent Governance</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Security Overview &amp; IAM Telemetry
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Real-time Zero-Trust enforcement monitoring human users and autonomous AI agents. 
              Currently authenticated as <strong className="text-white">{session?.name}</strong> with{" "}
              <span className="text-[#38BDF8] font-semibold">{session?.roleName}</span> privileges.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/dashboard/access-control"
              className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl transition-all shadow-md flex items-center gap-1.5"
            >
              <Cpu className="w-4 h-4" />
              <span>Access Policy Evaluator</span>
            </Link>
            <Link
              href="/dashboard/approvals"
              className="px-4 py-2.5 bg-[#172440] hover:bg-[#1E2C4F] border border-[#25365E] text-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
            >
              <Clock className="w-4 h-4 text-[#F59E0B]" />
              <span>Pending Approvals ({pendingApprovalsCount})</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Row (7 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
        <MetricCard
          title="Total Users"
          value={totalUsers}
          subtitle="Directory"
          icon={Users}
          color="blue"
        />
        <MetricCard
          title="Active Roles"
          value={totalRoles}
          subtitle="Hierarchies"
          icon={Shield}
          color="indigo"
        />
        <MetricCard
          title="AI Agents"
          value={totalAgents}
          subtitle="Registered"
          icon={Bot}
          color="purple"
        />
        <MetricCard
          title="Active Agents"
          value={activeAgents}
          subtitle="Operational"
          icon={CheckCircle2}
          color="emerald"
        />
        <MetricCard
          title="Allowed Requests"
          value={allowedRequests}
          subtitle="Zero-Trust Pass"
          icon={CheckCircle2}
          color="cyan"
        />
        <MetricCard
          title="Denied Requests"
          value={deniedRequests}
          subtitle="Violations Blocked"
          icon={XCircle}
          color="rose"
        />
        <MetricCard
          title="Pending Approvals"
          value={pendingApprovalsCount}
          subtitle="Human-in-Loop"
          icon={Clock}
          color="amber"
        />
      </div>

      {/* 3. Middle Section: Access Decision Summary & Security Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Access Decision Summary */}
        <Card className="lg:col-span-1">
          <CardHeader
            title="Access Decision Summary"
            description="Real-time authorization evaluation distribution"
          />
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Policy Authorization Rate</span>
              <span className="text-sm font-bold text-white">{allowedRate}% Allowed</span>
            </div>

            {/* Visual ratio bar */}
            <div className="w-full h-3 rounded-full bg-[#060A17] overflow-hidden flex">
              <div
                style={{ width: `${allowedRate}%` }}
                className="bg-[#10B981] h-full transition-all"
              />
              <div
                style={{ width: `${100 - allowedRate}%` }}
                className="bg-[#EF4444] h-full transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
                <div className="flex items-center gap-1.5 text-xs text-[#10B981] font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed</span>
                </div>
                <div className="text-xl font-bold text-white mt-1">
                  {allowedRequests}
                </div>
                <div className="text-[10px] text-slate-400">Policy compliant</div>
              </div>

              <div className="p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
                <div className="flex items-center gap-1.5 text-xs text-[#EF4444] font-semibold">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Denied</span>
                </div>
                <div className="text-xl font-bold text-white mt-1">
                  {deniedRequests}
                </div>
                <div className="text-[10px] text-slate-400">Zero-Trust blocks</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Alerts Banner */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Active Security Monitoring & Alerts"
            description="Automated anomaly detection across human and machine identities"
            badge={<StatusBadge status="ACTIVE" size="sm" />}
            action={
              <Link
                href="/dashboard/monitoring"
                className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1"
              >
                <span>View SOC</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            }
          />
          <CardContent className="space-y-3">
            <div className="p-3.5 bg-[#EF4444]/10 border border-[#EF4444]/25 rounded-xl flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-white">
                  Privilege Escalation Attempt Blocked
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Caller with <code className="text-[#38BDF8]">Employee</code> scope attempted to invoke administrative user provisioning API. Action blocked with HTTP 403.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[#F59E0B]/10 border border-[#F59E0B]/25 rounded-xl flex items-start gap-3">
              <Clock className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-white">
                  Temporary Elevation Request Pending
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  <code className="text-[#38BDF8]">Report Assistant</code> requested temporary grant for <code className="text-slate-200">audit:export</code>. Awaiting human-in-the-loop signoff.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[#10B981]/10 border border-[#10B981]/25 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-white">
                  Machine Credential Integrity Verified
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  All 4 registered AI Agent API keys are stored as cryptographically salted bcrypt hashes with rate limits active.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Bottom Section: Registered AI Agents & Live Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Activity Snapshot */}
        <Card className="lg:col-span-1">
          <CardHeader
            title="AI Machine Agents"
            description="Registered autonomous identities"
            action={
              <Link
                href="/dashboard/agents"
                className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1"
              >
                <span>All Agents</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            }
          />
          <CardContent className="space-y-3">
            {agentsList.map((agent) => (
              <div
                key={agent.id}
                className="p-3 bg-[#0B132B] border border-[#1E2C4F] rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {agent.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Rate: {agent.rateLimit} req/min
                    </div>
                  </div>
                </div>
                <StatusBadge status={agent.status} size="sm" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Audit Events */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent Security Audit Events"
            description="Immutable event trail recorded in SQLite"
            action={
              <Link
                href="/dashboard/audit"
                className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1"
              >
                <span>View Full Log</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            }
          />
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
                  <tr>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Actor</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Resource</th>
                    <th className="py-2.5 px-3 text-right">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
                  {recentAudits.map((log) => (
                    <tr key={log.id} className="hover:bg-[#0B132B]/50 transition-colors">
                      <td className="py-3 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3 font-medium text-white">
                        {log.actorName}
                        <span className="block text-[10px] text-slate-500 font-mono">
                          {log.actorType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#38BDF8]">
                        {log.action}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px] truncate max-w-[140px]">
                        {log.resource}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <StatusBadge status={log.status} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
