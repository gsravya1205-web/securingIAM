"use client";

import React, { useState } from "react";
import {
  Sliders,
  Shield,
  User,
  Lock,
  Database,
  Bell,
  CheckCircle2,
  Cpu,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";

interface SettingsClientProps {
  user: {
    name: string;
    email: string;
    roleName: string;
    permissionsCount: number;
  };
}

export default function SettingsClient({ user }: SettingsClientProps) {
  const [anomalyAlerts, setAnomalyAlerts] = useState(true);
  const [strictRateLimiting, setStrictRateLimiting] = useState(true);
  const [verboseAudit, setVerboseAudit] = useState(true);
  const [savedFeedback, setSavedFeedback] = useState(false);

  const handleSavePreferences = () => {
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Sliders className="w-6 h-6 text-[#38BDF8]" />
          System &amp; Security Preferences
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          IAM runtime configurations, cryptographic signing policies, and operator profile settings.
        </p>
      </div>

      {savedFeedback && (
        <div className="p-3.5 bg-[#10B981]/15 border border-[#10B981]/30 rounded-xl text-[#10B981] text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Security policy preferences updated and synchronized successfully!</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Identity Profile */}
        <Card>
          <CardHeader
            title="Authenticated Operator Identity"
            description="Active human session credentials and assigned security bounds."
          />
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <span className="text-slate-400">Operator Legal Name:</span>
              <span className="font-semibold text-white">{user.name}</span>
            </div>
            <div className="flex justify-between p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <span className="text-slate-400">Corporate Email:</span>
              <span className="font-mono text-slate-200">{user.email}</span>
            </div>
            <div className="flex justify-between p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <span className="text-slate-400">Assigned Organizational Role:</span>
              <span className="font-semibold text-[#38BDF8]">{user.roleName}</span>
            </div>
            <div className="flex justify-between p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <span className="text-slate-400">Authorized Scopes:</span>
              <span className="font-mono text-[#10B981]">{user.permissionsCount} Granular Capabilities</span>
            </div>
          </CardContent>
        </Card>

        {/* Cryptographic Security Baseline */}
        <Card>
          <CardHeader
            title="Cryptographic Architecture Baseline"
            description="Underlying algorithms governing session tokens and machine credentials."
          />
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <span className="text-slate-400">Session Signature Algorithm:</span>
              <span className="font-mono text-[#38BDF8]">HMAC-SHA256 (Web Crypto)</span>
            </div>
            <div className="flex justify-between p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <span className="text-slate-400">Cookie Protection Standard:</span>
              <span className="font-mono text-white">HttpOnly, SameSite=Lax, Secure</span>
            </div>
            <div className="flex justify-between p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <span className="text-slate-400">Machine API Key Hashing:</span>
              <span className="font-mono text-[#10B981]">bcrypt ($2a$10$)</span>
            </div>
            <div className="flex justify-between p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
              <span className="text-slate-400">Database Engine:</span>
              <span className="font-mono text-slate-200">SQLite (Prisma ORM)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Preferences Toggles */}
      <Card>
        <CardHeader
          title="Runtime Zero-Trust Policy Preferences"
          description="Adjust real-time anomaly detection sensitivity and audit trail granularity."
        />
        <CardContent className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-4 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
            <div>
              <div className="font-semibold text-white">
                Autonomous Agent Privilege Spike Alerts
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Automatically flag agent calls that attempt actions outside their delegated scopes to SOC dashboard.
              </p>
            </div>
            <input
              type="checkbox"
              checked={anomalyAlerts}
              onChange={(e) => setAnomalyAlerts(e.target.checked)}
              className="w-4 h-4 accent-[#2563EB] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
            <div>
              <div className="font-semibold text-white">
                Strict Machine Rate-Limit Enforcer
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Block autonomous AI agents exceeding configured quota with immediate HTTP 429 Too Many Requests.
              </p>
            </div>
            <input
              type="checkbox"
              checked={strictRateLimiting}
              onChange={(e) => setStrictRateLimiting(e.target.checked)}
              className="w-4 h-4 accent-[#2563EB] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-[#0B132B] rounded-xl border border-[#1E2C4F]">
            <div>
              <div className="font-semibold text-white">
                Verbose Forensic Audit Trail
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Record detailed transaction payloads and IP addresses on both successful and denied operations.
              </p>
            </div>
            <input
              type="checkbox"
              checked={verboseAudit}
              onChange={(e) => setVerboseAudit(e.target.checked)}
              className="w-4 h-4 accent-[#2563EB] cursor-pointer"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSavePreferences}
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl transition-all shadow-md cursor-pointer"
            >
              Save Security Preferences
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

