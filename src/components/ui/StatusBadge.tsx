import React from "react";

type BadgeStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "REVOKED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "SUCCESS"
  | "DENIED"
  | "COMPLIANT"
  | "ALERT"
  | "ROTATED"
  | "HUMAN"
  | "AGENT";

interface StatusBadgeProps {
  status: BadgeStatus | string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusBadge({
  status,
  className = "",
  size = "sm",
}: StatusBadgeProps) {
  const normalized = String(status).toUpperCase();

  const getStyle = () => {
    switch (normalized) {
      case "ACTIVE":
      case "APPROVED":
      case "SUCCESS":
      case "COMPLIANT":
        return "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30";
      case "PENDING":
      case "ROTATED":
        return "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30";
      case "REVOKED":
      case "REJECTED":
      case "DENIED":
      case "ALERT":
      case "SUSPENDED":
      case "EXPIRED":
        return "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30";
      case "AGENT":
        return "bg-purple-500/15 text-purple-300 border-purple-500/30";
      case "HUMAN":
        return "bg-cyan-500/15 text-cyan-300 border-cyan-500/30";
      default:
        return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    }
  };

  const getDotColor = () => {
    switch (normalized) {
      case "ACTIVE":
      case "APPROVED":
      case "SUCCESS":
      case "COMPLIANT":
        return "bg-[#10B981]";
      case "PENDING":
      case "ROTATED":
        return "bg-[#F59E0B]";
      case "REVOKED":
      case "REJECTED":
      case "DENIED":
      case "ALERT":
      case "SUSPENDED":
      case "EXPIRED":
        return "bg-[#EF4444]";
      case "AGENT":
        return "bg-purple-400";
      case "HUMAN":
        return "bg-cyan-400";
      default:
        return "bg-slate-400";
    }
  };

  const sizeClasses =
    size === "sm"
      ? "text-[10px] px-2 py-0.5"
      : "text-xs px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium uppercase tracking-wider rounded-full border ${getStyle()} ${sizeClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${getDotColor()}`} />
      <span>{normalized}</span>
    </span>
  );
}

