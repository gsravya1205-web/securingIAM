"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Link from "next/link";

export default function AccessControlCenterPage() {
  const identities = [
    { id: "u-admin", name: "Alex Vance", type: "HUMAN", role: "Admin", perms: ["users.read", "users.create", "users.update", "users.delete", "reports.read", "reports.create", "roles.read", "roles.manage", "agents.read", "agents.manage", "audit.read"] },
    { id: "u-manager", name: "Morgan Chen", type: "HUMAN", role: "Manager", perms: ["users.read", "reports.read", "reports.create", "roles.read", "agents.read", "audit.read"] },
    { id: "u-employee", name: "Taylor Brooks", type: "HUMAN", role: "Employee", perms: ["reports.read"] },
    { id: "a-report", name: "Report Assistant", type: "AGENT", role: "AI Agent", perms: ["reports.read", "reports.create", "agents.read"] },
    { id: "a-support", name: "User Support Agent", type: "AGENT", role: "AI Agent", perms: ["reports.read", "agents.read"] },
    { id: "a-secmon", name: "Security Monitoring Agent", type: "AGENT", role: "AI Agent", perms: ["reports.read", "audit.read", "agents.read"] },
  ];

  const resources = [
    { code: "Users:Directory", name: "User Directory & Credentials" },
    { code: "Audit:Logs", name: "Immutable Security Audit Logs" },
    { code: "Compliance:Reports", name: "Compliance & SOC Reports" },
    { code: "Agents:Registry", name: "AI Agent Identifiers & API Keys" },
    { code: "Roles:Matrix", name: "RBAC Roles & Permission Schema" },
  ];

  const actions = [
    { code: "users.read", label: "Read User Accounts", required: "users.read", sensitive: false },
    { code: "users.create", label: "Provision New User", required: "users.create", sensitive: true },
    { code: "users.delete", label: "Delete / Revoke User", required: "users.delete", sensitive: true },
    { code: "reports.read", label: "Read Analytical Reports", required: "reports.read", sensitive: false },
    { code: "reports.create", label: "Generate Compliance Report", required: "reports.create", sensitive: false },
    { code: "roles.manage", label: "Modify RBAC Role Matrix", required: "roles.manage", sensitive: true },
    { code: "agents.manage", label: "Deploy / Rotate Agent Keys", required: "agents.manage", sensitive: true },
    { code: "audit.read", label: "Inspect Forensic Audit Logs", required: "audit.read", sensitive: false },
  ];

  const [selectedIdentityId, setSelectedIdentityId] = useState(identities[0].id);
  const [selectedResource, setSelectedResource] = useState(resources[0].code);
  const [selectedActionCode, setSelectedActionCode] = useState(actions[0].code);

  const activeIdentity = identities.find((i) => i.id === selectedIdentityId)!;
  const activeAction = actions.find((a) => a.code === selectedActionCode)!;

  // Evaluation logic
  const hasPermission = activeIdentity.perms.includes(activeAction.required);

  let decision: "ALLOW" | "DENY" | "APPROVAL REQUIRED" = "DENY";
  let explanation = "";

  if (hasPermission) {
    if (activeAction.sensitive && activeIdentity.type === "AGENT") {
      decision = "APPROVAL REQUIRED";
      explanation = `Action [${activeAction.code}] is marked high-risk. While the agent holds basic delegation, policy requires human-in-the-loop supervisor approval before machine execution.`;
    } else {
      decision = "ALLOW";
      explanation = `Identity [${activeIdentity.name}] holds role [${activeIdentity.role}] which explicitly grants required permission code [${activeAction.required}]. Access authorized under Zero-Trust rules.`;
    }
  } else {
    decision = "DENY";
    explanation = `RBAC Violation: Role [${activeIdentity.role}] lacks required capability [${activeAction.required}]. Request would be halted on the server with HTTP 403 Forbidden.`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Cpu className="w-6 h-6 text-[#38BDF8]" />
          Access Control Center &amp; Policy Evaluator
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Evaluate and verify Zero-Trust authorization decisions across human users and autonomous AI agents.
        </p>
      </div>

      {/* Evaluation Inputs & Live Verdict Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Policy Evaluation Controls */}
        <Card className="lg:col-span-7">
          <CardHeader
            title="Configure Access Evaluation Scenario"
            description="Select the requesting subject, target enterprise resource, and intended operation."
          />
          <CardContent className="space-y-4 text-xs">
            {/* Identity Selection */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#38BDF8]" />
                Requesting Subject (Human or Agent):
              </label>
              <select
                value={selectedIdentityId}
                onChange={(e) => setSelectedIdentityId(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-white focus:outline-none focus:border-[#2563EB]"
              >
                {identities.map((id) => (
                  <option key={id.id} value={id.id}>
                    [{id.type}] {id.name} ({id.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Resource */}
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
                    {res.name} ({res.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Requested Action */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#38BDF8]" />
                Requested Action / Operation:
              </label>
              <select
                value={selectedActionCode}
                onChange={(e) => setSelectedActionCode(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-white focus:outline-none focus:border-[#2563EB]"
              >
                {actions.map((act) => (
                  <option key={act.code} value={act.code}>
                    {act.label} [Requires: {act.required}]
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Context Summary */}
            <div className="p-3.5 bg-[#0B132B] border border-[#1E2C4F] rounded-xl space-y-1.5 text-slate-400">
              <div className="flex justify-between">
                <span>Selected Subject Type:</span>
                <span className="font-semibold text-white">{activeIdentity.type}</span>
              </div>
              <div className="flex justify-between">
                <span>Subject Assigned Role:</span>
                <span className="text-[#38BDF8] font-mono">{activeIdentity.role}</span>
              </div>
              <div className="flex justify-between">
                <span>Active Permissions Count:</span>
                <span className="text-white font-mono">{activeIdentity.perms.length} Granted</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Policy Decision Display */}
        <Card className="lg:col-span-5 flex flex-col justify-between">
          <CardHeader
            title="Authorization Engine Verdict"
            description="Real-time Zero-Trust evaluation result"
          />
          <CardContent className="space-y-4">
            {/* Big Status Badge */}
            <div
              className={`p-6 rounded-2xl border text-center transition-all ${
                decision === "ALLOW"
                  ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]"
                  : decision === "DENY"
                  ? "bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]"
                  : "bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]"
              }`}
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 border bg-black/20">
                {decision === "ALLOW" ? (
                  <CheckCircle2 className="w-7 h-7" />
                ) : decision === "DENY" ? (
                  <XCircle className="w-7 h-7" />
                ) : (
                  <Clock className="w-7 h-7" />
                )}
              </div>
              <div className="text-2xl font-black tracking-wider uppercase">
                {decision}
              </div>
              <div className="text-xs mt-1 text-slate-300 font-medium">
                {decision === "ALLOW"
                  ? "Policy Authorization Approved"
                  : decision === "DENY"
                  ? "Zero-Trust Enforcement Blocked"
                  : "Escalated for Human-in-the-Loop Signoff"}
              </div>
            </div>

            {/* Step-by-Step Reason */}
            <div className="p-4 bg-[#0B132B] border border-[#1E2C4F] rounded-xl space-y-2 text-xs">
              <span className="font-semibold text-white block">
                Policy Reason &amp; Audit Trace:
              </span>
              <p className="text-slate-300 leading-relaxed">{explanation}</p>
            </div>

            {decision === "APPROVAL REQUIRED" && (
              <Link
                href="/dashboard/approvals"
                className="w-full py-2.5 bg-[#F59E0B] hover:bg-[#D97706] text-black font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md"
              >
                <span>Navigate to Pending Approvals Queue</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

