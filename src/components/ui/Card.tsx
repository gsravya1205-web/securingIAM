import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
}

export function Card({
  children,
  className = "",
  elevated = false,
  ...props
}: CardProps) {
  return (
    <div
      className={`border rounded-2xl transition-all ${
        elevated
          ? "bg-[#172440] border-[#25365E] shadow-lg shadow-black/20"
          : "bg-[#111C35] border-[#1E2C4F] shadow-sm"
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  badge,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`p-5 pb-3 border-b border-[#1E2C4F]/60 flex items-start justify-between gap-4 ${className}`}
    >
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white tracking-tight">
            {title}
          </h3>
          {badge}
        </div>
        {description && (
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

