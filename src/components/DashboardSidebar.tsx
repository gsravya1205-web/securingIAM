"use client";

import React, { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Shield,
  Bot,
  KeyRound,
  Cpu,
  Sliders,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  UserCheck,
  Activity,
  FileText,
  ShieldAlert,
} from "lucide-react";

interface DashboardSidebarProps {
  user: {
    id: string;
    name: string;
    email: string;
    roleName: string;
    permissions: string[];
  };
}

interface NavSubItem {
  label: string;
  href: string;
  tabKey: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPaths?: string[];
  subItems?: NavSubItem[];
}

export default function DashboardSidebar({ user }: DashboardSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "";
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Expanded state for domains with sub-sections
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({
    "Access Governance": true,
    "Security & Compliance": true,
  });

  const toggleDomainExpand = (label: string) => {
    setExpandedDomains((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error("Logout failed:", e);
      router.push("/login");
    }
  };

  /**
   * EXACT 8-DOMAIN ORDER SPECIFIED:
   * 1. Overview
   * 2. User Management
   * 3. Roles & Permissions
   * 4. AI Agent Identities
   * 5. Settings
   * 6. Agent Credentials
   * 7. Access Governance
   * 8. Security & Compliance
   */
  const navItems: NavItem[] = [
    {
      label: "Overview",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "User Management",
      href: "/dashboard/users",
      icon: Users,
    },
    {
      label: "Roles & Permissions",
      href: "/dashboard/roles",
      icon: Shield,
    },
    {
      label: "AI Agent Identities",
      href: "/dashboard/agents",
      icon: Bot,
    },
    {
      label: "Settings",
      href: "/dashboard/settings",
      icon: Sliders,
    },
    {
      label: "Agent Credentials",
      href: "/dashboard/credentials",
      icon: KeyRound,
      matchPaths: ["/dashboard/credentials", "/dashboard/api-keys"],
    },
    {
      label: "Access Governance",
      href: "/dashboard/governance",
      icon: Cpu,
      matchPaths: [
        "/dashboard/governance",
        "/dashboard/access-control",
        "/dashboard/approvals",
        "/dashboard/delegations",
      ],
      subItems: [
        { label: "Access Decisions & JIT", href: "/dashboard/governance?tab=decisions", tabKey: "decisions" },
        { label: "Pending Approvals", href: "/dashboard/governance?tab=approvals", tabKey: "approvals" },
        { label: "Delegated Access", href: "/dashboard/governance?tab=delegations", tabKey: "delegations" },
      ],
    },
    {
      label: "Security & Compliance",
      href: "/dashboard/security-compliance",
      icon: ShieldCheck,
      matchPaths: [
        "/dashboard/security-compliance",
        "/dashboard/monitoring",
        "/dashboard/audit",
        "/dashboard/reports",
      ],
      subItems: [
        { label: "Security Overview", href: "/dashboard/security-compliance?tab=overview", tabKey: "overview" },
        { label: "Audit Activity", href: "/dashboard/security-compliance?tab=audit", tabKey: "audit" },
        { label: "Compliance Reports", href: "/dashboard/security-compliance?tab=compliance", tabKey: "compliance" },
      ],
    },
  ];

  const getRoleBadgeStyle = (role: string) => {
    switch (role.toUpperCase()) {
      case "ADMIN":
        return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
      case "MANAGER":
        return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
      case "EMPLOYEE":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "AI AGENT":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      default:
        return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    }
  };

  const isNavActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some((p) => pathname.startsWith(p));
    }
    return pathname === item.href;
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-[#1E2C4F]/60 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="p-2 bg-[#2563EB]/20 border border-[#2563EB]/30 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-[#38BDF8]" />
          </div>
          <div>
            <div className="font-bold text-white tracking-tight flex items-center gap-1.5 text-sm">
              SecureID
              <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-[#2563EB]/15 text-[#38BDF8] border border-[#2563EB]/30 font-semibold">
                IAM
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Zero-Trust Identity</p>
          </div>
        </Link>

        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* User Identity Profile Card */}
      <div className="p-3.5 m-3 bg-[#111C35] border border-[#1E2C4F] rounded-xl shadow-inner shrink-0">
        <div className="flex items-center gap-3 mb-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2563EB]/20 border border-[#2563EB]/30 flex items-center justify-center text-[#38BDF8] font-bold text-xs shrink-0">
            {user.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-semibold text-white truncate">
              {user.name}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {user.email}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#1E2C4F]/60">
          <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
            Assigned Role
          </span>
          <span
            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getRoleBadgeStyle(
              user.roleName
            )}`}
          >
            {user.roleName}
          </span>
        </div>
      </div>

      {/* Navigation Items (Exactly 8 Domains in strict order) */}
      <div className="px-3 py-1 space-y-0.5 overflow-y-auto flex-1 min-h-0">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1">
          Identity Domains (8)
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item);
            const hasSub = Boolean(item.subItems && item.subItems.length > 0);
            const isExpanded = expandedDomains[item.label] ?? true;

            return (
              <div key={item.label} className="space-y-0.5">
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    active
                      ? "bg-[#2563EB]/20 text-[#38BDF8] border border-[#2563EB]/40 font-semibold shadow-sm"
                      : "text-slate-300 hover:text-white hover:bg-[#111C35]"
                  }`}
                >
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 flex-1 min-w-0"
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? "text-[#38BDF8]" : "text-slate-400"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>

                  {hasSub ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDomainExpand(item.label);
                      }}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : active ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0" />
                  ) : null}
                </div>

                {/* Sub-items (if domain has sub-sections and is expanded or active) */}
                {hasSub && isExpanded && (
                  <div className="ml-5 pl-3 border-l border-[#1E2C4F] space-y-0.5 pt-0.5 pb-1">
                    {item.subItems!.map((sub) => {
                      const isSubActive =
                        active && (currentTab === sub.tabKey || (!currentTab && sub.tabKey === "decisions") || (!currentTab && sub.tabKey === "overview"));

                      return (
                        <Link
                          key={sub.label}
                          href={sub.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${
                            isSubActive
                              ? "text-[#38BDF8] bg-[#2563EB]/10 font-semibold"
                              : "text-slate-400 hover:text-slate-200 hover:bg-[#111C35]/50"
                          }`}
                        >
                          <span className="truncate">{sub.label}</span>
                          {isSubActive && (
                            <span className="w-1 h-1 rounded-full bg-[#38BDF8]" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer & Logout */}
      <div className="p-3 border-t border-[#1E2C4F]/60 space-y-2 shrink-0">
        <div className="p-2.5 bg-[#060A17]/80 border border-[#1E2C4F] rounded-lg flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5 text-[#10B981] font-medium text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            Zero-Trust Active
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {user.permissions.length} perms
          </span>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 text-xs text-[#EF4444] hover:text-white bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/20 py-2 px-3 rounded-xl transition-all cursor-pointer disabled:opacity-50"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{loggingOut ? "Signing Out..." : "Sign Out"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="md:hidden fixed top-3 left-3 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 bg-[#0B132B] border border-[#1E2C4F] text-slate-300 rounded-xl"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 w-64 bg-[#0B132B] border-r border-[#1E2C4F] z-50 transform transition-transform duration-200 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#0B132B] border-r border-[#1E2C4F] shrink-0 h-screen sticky top-0 flex-col">
        {sidebarContent}
      </aside>
    </>
  );
}
