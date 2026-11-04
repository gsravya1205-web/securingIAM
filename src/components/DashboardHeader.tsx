"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldCheck,
  LogOut,
  Bell,
  Search,
  Sparkles,
  Lock,
  ChevronRight,
} from "lucide-react";

interface DashboardHeaderProps {
  user: {
    id: string;
    name: string;
    email: string;
    roleName: string;
    permissions: string[];
  };
}

export default function DashboardHeader({ user }: DashboardHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const getPageTitle = (path: string) => {
    switch (path) {
      case "/dashboard":
        return "Security Overview & Telemetry";
      case "/dashboard/users":
        return "User Management & IAM Directory";
      case "/dashboard/roles":
        return "Roles & Granular RBAC Permissions";
      case "/dashboard/agents":
        return "Autonomous AI Agent Registry";
      case "/dashboard/api-keys":
        return "Machine Credentials & API Key Management";
      case "/dashboard/access-control":
        return "Access Control Center & Policy Evaluator";
      case "/dashboard/approvals":
        return "Human-in-the-Loop Approval Queue";
      case "/dashboard/monitoring":
        return "Security Operations & Threat Monitoring";
      case "/dashboard/audit":
        return "Immutable Audit Logs & Forensic Trail";
      case "/dashboard/reports":
        return "Compliance & Governance Reports";
      case "/dashboard/settings":
        return "System & Security Preferences";
      default:
        return "Security Portal";
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  };

  return (
    <header className="h-16 border-b border-[#1E2C4F] bg-[#0B132B]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 pl-10 md:pl-0">
        <span className="text-xs text-slate-400 font-medium">SecureID</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-xs font-semibold text-white tracking-tight">
          {getPageTitle(pathname)}
        </span>
      </div>

      {/* Header Actions & Profile Pill */}
      <div className="flex items-center gap-3">
        {/* Session Status Tag */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 bg-[#111C35] border border-[#1E2C4F] px-3 py-1.5 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          <span>
            Role: <strong className="text-white">{user.roleName}</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-[#38BDF8] text-[11px]">
            {user.permissions.length} Scopes
          </span>
        </div>

        {/* Quick Sign Out Button */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sign Out"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-[#111C35] hover:bg-[#172440] border border-[#1E2C4F] px-3 py-1.5 rounded-xl transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">
            {loggingOut ? "Signing Out..." : "Sign Out"}
          </span>
        </button>
      </div>
    </header>
  );
}
