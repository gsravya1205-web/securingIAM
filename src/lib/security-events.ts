import { prisma } from "@/lib/prisma";

export interface SecurityAlert {
  id: string;
  type: "BRUTE_FORCE_ATTEMPT" | "ACCESS_DENIED_SPIKE" | "SUSPENDED_AGENT_PROBING" | "KILL_SWITCH_ACTIVE" | "RATE_LIMIT_EXCEEDED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  title: string;
  description: string;
  count: number;
  threshold: number;
  target?: string;
  timestamp: string;
}

export interface SecurityPostureSummary {
  killSwitchActive: boolean;
  activeAgentsCount: number;
  suspendedAgentsCount: number;
  recentViolationsCount: number;
  activeAlerts: SecurityAlert[];
  metrics: {
    failedLogins15m: number;
    deniedRequests15m: number;
    activeElevations: number;
    activeDelegations: number;
  };
}

/**
 * Transparent rule-based security event detector.
 * Scans recent SQLite audit logs for anomalous patterns without relying on opaque black-box models.
 */
export async function analyzeSecurityPosture(): Promise<SecurityPostureSummary> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const [
    failedLogins,
    deniedEvents,
    suspendedAgents,
    activeAgents,
    activeElevations,
    activeDelegations,
    suspendedAgentAudits,
  ] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        action: "AUTH_LOGIN_FAILED",
        timestamp: { gte: fifteenMinutesAgo },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        status: "DENIED",
        timestamp: { gte: fifteenMinutesAgo },
      },
    }),
    prisma.agent.count({ where: { status: "SUSPENDED" } }),
    prisma.agent.count({ where: { status: "ACTIVE" } }),
    prisma.privilegeElevation.count({ where: { status: "ACTIVE" } }),
    prisma.delegation.count({ where: { status: "ACTIVE" } }),
    prisma.auditLog.findMany({
      where: {
        details: { contains: "SUSPENDED" },
        timestamp: { gte: fifteenMinutesAgo },
      },
    }),
  ]);

  const activeAlerts: SecurityAlert[] = [];
  const now = new Date().toISOString();

  // Rule 1: Brute Force Authentication Detection
  if (failedLogins.length >= 3) {
    activeAlerts.push({
      id: "ALERT-BRUTE-FORCE",
      type: "BRUTE_FORCE_ATTEMPT",
      severity: failedLogins.length >= 5 ? "CRITICAL" : "HIGH",
      title: "Repeated Authentication Failures Detected",
      description: `${failedLogins.length} failed login attempts registered within the last 15 minutes. Potential credential stuffing or brute-force attack.`,
      count: failedLogins.length,
      threshold: 3,
      timestamp: now,
    });
  }

  // Rule 2: Access Denied Spike
  if (deniedEvents.length >= 5) {
    activeAlerts.push({
      id: "ALERT-DENIED-SPIKE",
      type: "ACCESS_DENIED_SPIKE",
      severity: "HIGH",
      title: "Access Denied Authorization Spike",
      description: `${deniedEvents.length} access-denied security blocks occurred in the last 15 minutes. Potential privilege escalation probing.`,
      count: deniedEvents.length,
      threshold: 5,
      timestamp: now,
    });
  }

  // Rule 3: Suspended Agent Execution Attempt
  if (suspendedAgentAudits.length > 0) {
    activeAlerts.push({
      id: "ALERT-SUSPENDED-AGENT",
      type: "SUSPENDED_AGENT_PROBING",
      severity: "CRITICAL",
      title: "Suspended Agent Dispatch Blocked",
      description: `${suspendedAgentAudits.length} machine execution attempts were blocked due to SUSPENDED status.`,
      count: suspendedAgentAudits.length,
      threshold: 1,
      timestamp: now,
    });
  }

  // Rule 4: Global Kill-Switch Status
  const killSwitchActive = suspendedAgents > 0 && activeAgents === 0;
  if (killSwitchActive) {
    activeAlerts.push({
      id: "ALERT-KILL-SWITCH",
      type: "KILL_SWITCH_ACTIVE",
      severity: "CRITICAL",
      title: "Fleet-Wide Emergency Kill-Switch Engaged",
      description: "All registered AI machine agent gateways are suspended. Machine execution is frozen.",
      count: suspendedAgents,
      threshold: 1,
      timestamp: now,
    });
  }

  return {
    killSwitchActive,
    activeAgentsCount: activeAgents,
    suspendedAgentsCount: suspendedAgents,
    recentViolationsCount: deniedEvents.length,
    activeAlerts,
    metrics: {
      failedLogins15m: failedLogins.length,
      deniedRequests15m: deniedEvents.length,
      activeElevations,
      activeDelegations,
    },
  };
}

