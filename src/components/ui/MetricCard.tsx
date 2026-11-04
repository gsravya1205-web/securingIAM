import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: string;
  color?: "blue" | "indigo" | "emerald" | "amber" | "rose" | "purple" | "cyan";
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = "blue",
  className = "",
}: MetricCardProps) {
  const colorMap = {
    blue: "text-[#38BDF8] bg-[#2563EB]/15 border-[#2563EB]/30",
    indigo: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30",
    emerald: "text-[#10B981] bg-[#10B981]/15 border-[#10B981]/30",
    amber: "text-[#F59E0B] bg-[#F59E0B]/15 border-[#F59E0B]/30",
    rose: "text-[#EF4444] bg-[#EF4444]/15 border-[#EF4444]/30",
    purple: "text-purple-400 bg-purple-500/15 border-purple-500/30",
    cyan: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",
  };

  return (
    <div
      className={`bg-[#111C35] border border-[#1E2C4F] rounded-2xl p-5 shadow-sm hover:border-slate-700 transition-all ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <div
          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${colorMap[color]}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="text-2xl font-bold text-white mt-3 tracking-tight">
        {value}
      </div>

      {(subtitle || trend) && (
        <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
          {subtitle && <span>{subtitle}</span>}
          {trend && (
            <span className="font-mono text-emerald-400 font-medium">
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

