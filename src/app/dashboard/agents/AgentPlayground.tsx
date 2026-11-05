"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Zap,
  Lock,
  Layers,
  FileCode,
  Shield,
  HelpCircle,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Link from "next/link";

interface ScenarioItem {
  id: number;
  title: string;
  description: string;
  expected: "ALLOW" | "DENY" | "APPROVAL_REQUIRED";
  resource: string;
  action: string;
}

interface DemoAgentInfo {
  id: string;
  name: string;
  status: string;
  description: string;
  rateLimit: number;
}

interface ScenarioExecutionResult {
  scenarioId: number;
  title: string;
  expectedVerdict: "ALLOW" | "DENY" | "APPROVAL_REQUIRED";
  actualStatus: number;
  actualVerdict: "ALLOW" | "DENY" | "APPROVAL_REQUIRED";
  endpoint: string;
  agentName: string;
  responsePayload: Record<string, unknown>;
  explanation: string;
  timestamp: string;
}

export default function AgentPlayground() {
  const [agent, setAgent] = useState<DemoAgentInfo | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(1);
  const [running, setRunning] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<ScenarioExecutionResult | null>(null);
  const [history, setHistory] = useState<ScenarioExecutionResult[]>([]);
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true);

  const fetchMeta = async () => {
    try {
      setLoadingMeta(true);
      const res = await fetch("/api/demonstration/run-scenario");
      const data = await res.json();
      if (res.ok && data.success) {
        setAgent(data.agent);
        setScenarios(data.scenarios || []);
      }
    } catch (err) {
      console.error("Failed to load playground metadata:", err);
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    fetchMeta();
  }, []);

  const handleRunScenario = async () => {
    try {
      setRunning(true);
      const res = await fetch("/api/demonstration/run-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: selectedScenarioId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to execute scenario");
      }
      const result = data.result as ScenarioExecutionResult;
      setExecutionResult(result);
      setHistory((prev) => [result, ...prev.slice(0, 9)]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error executing scenario");
    } finally {
      setRunning(false);
    }
  };

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];

  return (
    <div className="space-y-6">
      {/* Playground Banner */}
      <div className="bg-gradient-to-r from-[#0B132B] via-[#111A36] to-[#1E2C4F] p-6 rounded-2xl border border-[#1E2C4F] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#38BDF8] mb-1.5">
            <Sparkles className="w-4 h-4" />
            <span>Autonomous Machine-to-Machine Testing Console</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            AI Agent IAM Playground &amp; 10 Live Scenarios
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Execute real machine-to-machine HTTP requests from the registered <strong>SecureID Research Assistant</strong>. 
            All calls use cryptographic Bearer tokens, evaluate active delegations and JIT rules, and record immutable audit logs.
          </p>
        </div>

        {agent && (
          <div className="p-3 bg-[#060A17]/80 border border-[#1E2C4F] rounded-xl text-xs space-y-1 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Target Agent:</span>
              <span className="font-semibold text-white">{agent.name}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Status:</span>
              <StatusBadge status={agent.status} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Rate Limit:</span>
              <span className="font-mono text-emerald-400">{agent.rateLimit} req/min</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Controls vs Result */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Scenario Selection Card */}
        <Card className="lg:col-span-7">
          <CardHeader
            title="Select Demonstration Scenario"
            description="Choose one of the 10 security scenarios to dispatch against the live backend API."
          />
          <CardContent className="space-y-4 text-xs">
            {/* Scenarios Grid */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {scenarios.map((sc) => {
                const isSelected = sc.id === selectedScenarioId;
                return (
                  <div
                    key={sc.id}
                    onClick={() => setSelectedScenarioId(sc.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                      isSelected
                        ? "bg-[#2563EB]/15 border-[#2563EB] shadow-md shadow-blue-600/10"
                        : "bg-[#0B132B] border-[#1E2C4F] hover:bg-[#111A36]"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${isSelected ? "text-white" : "text-slate-200"}`}>
                          {sc.title}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            sc.expected === "ALLOW"
                              ? "bg-[#10B981]/20 text-[#10B981]"
                              : sc.expected === "DENY"
                              ? "bg-[#EF4444]/20 text-[#EF4444]"
                              : "bg-[#F59E0B]/20 text-[#F59E0B]"
                          }`}
                        >
                          Expected: {sc.expected}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {sc.description}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono pt-0.5">
                        <span>Resource: {sc.resource}</span>
                        <span>•</span>
                        <span>Action: {sc.action}</span>
                      </div>
                    </div>

                    <div className="pt-1 shrink-0">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? "border-blue-400 bg-blue-500" : "border-slate-600"
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Run Button */}
            <button
              onClick={handleRunScenario}
              disabled={running || loadingMeta}
              className="w-full py-3 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#2563EB] text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
              <span>{running ? "Executing Autonomous Machine Request..." : "Run Selected Demonstration Scenario"}</span>
            </button>
          </CardContent>
        </Card>

        {/* Live Execution Verdict Display */}
        <Card className="lg:col-span-5 flex flex-col justify-between">
          <CardHeader
            title="Live M2M Execution Output"
            description="Real-time HTTP response received from SecureID backend gateway"
          />
          <CardContent className="space-y-4 text-xs">
            {executionResult ? (
              <>
                <div
                  className={`p-6 rounded-2xl border text-center transition-all ${
                    executionResult.actualVerdict === "ALLOW"
                      ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]"
                      : executionResult.actualVerdict === "DENY"
                      ? "bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]"
                      : "bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]"
                  }`}
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 border bg-black/20">
                    {executionResult.actualVerdict === "ALLOW" ? (
                      <CheckCircle2 className="w-7 h-7" />
                    ) : executionResult.actualVerdict === "DENY" ? (
                      <XCircle className="w-7 h-7" />
                    ) : (
                      <Clock className="w-7 h-7" />
                    )}
                  </div>
                  <div className="text-2xl font-black tracking-wider uppercase">
                    HTTP {executionResult.actualStatus} {executionResult.actualVerdict}
                  </div>
                  <div className="text-xs mt-1 text-slate-300 font-medium">
                    {executionResult.title}
                  </div>
                </div>

                <div className="p-3 bg-[#0B132B] border border-[#1E2C4F] rounded-xl space-y-1">
                  <span className="font-semibold text-white block">Security Explanation:</span>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    {executionResult.explanation}
                  </p>
                </div>

                {/* Response JSON Payload */}
                <div className="p-3 bg-[#060A17] border border-[#1E2C4F] rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-1">
                    <span className="flex items-center gap-1">
                      <FileCode className="w-3.5 h-3.5 text-blue-400" />
                      Payload Body ({executionResult.endpoint}):
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">200 OK</span>
                  </div>
                  <pre className="text-[10px] font-mono text-slate-300 overflow-x-auto max-h-36 p-2 bg-black/40 rounded-lg">
                    {JSON.stringify(executionResult.responsePayload, null, 2)}
                  </pre>
                </div>

                {executionResult.actualVerdict === "APPROVAL_REQUIRED" && (
                  <Link
                    href="/dashboard/approvals"
                    className="w-full py-2 bg-[#F59E0B] hover:bg-[#D97706] text-black font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md"
                  >
                    <span>Inspect Pending Supervisory Approvals</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </>
            ) : (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Bot className="w-10 h-10 text-slate-600 mx-auto" />
                <p>Select a demonstration scenario and click &quot;Run Selected Demonstration Scenario&quot; to inspect real-time M2M execution.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scenario History Ledger */}
      {history.length > 0 && (
        <Card>
          <CardHeader
            title="Demonstration Execution History"
            description="Audit trace of agent scenarios executed during this session."
          />
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1E2C4F] text-slate-400 font-medium">
                    <th className="pb-3 px-3">Timestamp</th>
                    <th className="pb-3 px-3">Scenario</th>
                    <th className="pb-3 px-3">Target Endpoint</th>
                    <th className="pb-3 px-3">Expected</th>
                    <th className="pb-3 px-3">Actual Verdict</th>
                    <th className="pb-3 px-3">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2C4F]/60">
                  {history.map((h, idx) => (
                    <tr key={idx} className="hover:bg-[#111A36]/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                        {new Date(h.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {h.title}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-[#38BDF8]">
                        {h.endpoint}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                        {h.expectedVerdict}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            h.actualVerdict === "ALLOW"
                              ? "bg-[#10B981]/20 text-[#10B981]"
                              : h.actualVerdict === "DENY"
                              ? "bg-[#EF4444]/20 text-[#EF4444]"
                              : "bg-[#F59E0B]/20 text-[#F59E0B]"
                          }`}
                        >
                          HTTP {h.actualStatus} {h.actualVerdict}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-300 max-w-xs truncate" title={h.explanation}>
                        {h.explanation}
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
  );
}

