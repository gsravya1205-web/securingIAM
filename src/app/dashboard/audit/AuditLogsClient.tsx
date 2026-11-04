"use client";

import React, { useState } from "react";
import {
  Activity,
  Search,
  Filter,
  Eye,
  Clock,
  Shield,
  Download,
  Calendar,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

interface AuditEntry {
  id: string;
  actorType: string;
  actorId: string;
  actorName: string;
  action: string;
  resource: string;
  status: string;
  ipAddress: string | null;
  details: string | null;
  timestamp: Date | string;
}

interface AuditLogsClientProps {
  initialLogs: AuditEntry[];
  currentUserRole: string;
}

export default function AuditLogsClient({
  initialLogs,
  currentUserRole,
}: AuditLogsClientProps) {
  const [logs, setLogs] = useState<AuditEntry[]>(initialLogs);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [actorTypeFilter, setActorTypeFilter] = useState("ALL");
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      log.actorName.toLowerCase().includes(term) ||
      log.action.toLowerCase().includes(term) ||
      log.resource.toLowerCase().includes(term) ||
      (log.details && log.details.toLowerCase().includes(term));

    const matchesStatus =
      statusFilter === "ALL" || log.status.toUpperCase() === statusFilter;

    const matchesType =
      actorTypeFilter === "ALL" ||
      log.actorType.toUpperCase() === actorTypeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#10B981]" />
            Immutable Security Audit Logs
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tamper-evident forensic ledger capturing every human authentication and autonomous agent interaction.
          </p>
        </div>

        <div className="text-xs text-slate-400 font-mono bg-[#111C35] border border-[#1E2C4F] px-3.5 py-2 rounded-xl flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#10B981]" />
          <span>Ledger Integrity: Verified Append-Only</span>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by caller, action, or resource..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-[#0B132B] border border-[#1E2C4F] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">Verdict:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#0B132B] border border-[#1E2C4F] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563EB]"
              >
                <option value="ALL">All Decisions</option>
                <option value="SUCCESS">Allowed (Success)</option>
                <option value="DENIED">Blocked (Denied)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Caller:</span>
              <select
                value={actorTypeFilter}
                onChange={(e) => setActorTypeFilter(e.target.value)}
                className="bg-[#0B132B] border border-[#1E2C4F] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563EB]"
              >
                <option value="ALL">All Callers</option>
                <option value="USER">Human User</option>
                <option value="AGENT">AI Machine Agent</option>
                <option value="SYSTEM">System Engine</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1E2C4F]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Calling Subject</th>
                <th className="py-3 px-4">Subject Type</th>
                <th className="py-3 px-4">Security Action</th>
                <th className="py-3 px-4">Resource Target</th>
                <th className="py-3 px-4">Verdict</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2C4F]/60 text-slate-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No audit records matching query parameters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#0B132B]/50 transition-colors">
                    <td className="py-3 px-4 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {log.actorName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-mono text-[#38BDF8] bg-[#2563EB]/10 px-2 py-0.5 rounded border border-[#2563EB]/25">
                        {log.actorType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-white">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 truncate max-w-[140px]">
                      {log.resource}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={log.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedEntry(log)}
                        className="px-2.5 py-1 bg-[#172440] hover:bg-[#1E2C4F] border border-[#25365E] rounded-lg text-slate-200 text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Eye className="w-3 h-3 text-[#38BDF8]" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Inspect Audit Entry Modal */}
      {selectedEntry && (
        <Modal
          isOpen={Boolean(selectedEntry)}
          onClose={() => setSelectedEntry(null)}
          title={`Forensic Audit Record — [${selectedEntry.action}]`}
          description="Tamper-evident record captured directly from database transaction ledger."
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-[#111C35] rounded-xl border border-[#1E2C4F] space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Audit Event ID:</span>
                <span className="font-mono text-white">{selectedEntry.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Event Timestamp:</span>
                <span className="font-mono text-slate-300">
                  {new Date(selectedEntry.timestamp).toISOString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Caller Identity:</span>
                <span className="font-semibold text-white">
                  {selectedEntry.actorName} ({selectedEntry.actorType})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Policy Verdict:</span>
                <StatusBadge status={selectedEntry.status} size="sm" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Resource Target:</span>
                <span className="font-mono text-[#38BDF8]">{selectedEntry.resource}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-400 font-semibold block mb-1">
                Detailed Forensic Context:
              </span>
              <div className="p-3 bg-[#0B132B] rounded-xl border border-[#1E2C4F] font-mono text-[11px] text-slate-300 leading-relaxed break-all">
                {selectedEntry.details || "No additional metadata provided."}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 bg-[#172440] hover:bg-[#1E2C4F] text-slate-200 rounded-xl font-medium cursor-pointer"
              >
                Close Audit Record
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

