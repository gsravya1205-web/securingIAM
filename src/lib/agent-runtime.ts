import { prisma } from "@/lib/prisma";

export type ActionRiskClassification = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AgentExecutionContext {
  agent: {
    id: string;
    name: string;
    roleName: string;
    permissions: string[];
    rateLimit: number;
    status: string;
    delegatedAuthUsed?: Record<string, unknown> | null;
  };
  action: string;
  resource: string;
  params?: Record<string, unknown>;
}

export interface AgentActionDefinition {
  name: string;
  requiredPermission: string;
  targetResource: string;
  riskClassification: ActionRiskClassification;
  description: string;
  handler: (context: AgentExecutionContext) => Promise<Record<string, unknown>>;
}

/**
 * Centralized Agent Action Registry with Real Operations.
 * Enforces least-privilege, data sanitization, pagination, and zero-trust controls.
 */
export const AGENT_ACTION_REGISTRY: Record<string, AgentActionDefinition> = {
  /**
   * Action A: Generate Compliance Summary
   * Reads real security telemetry, audit logs, and governance metrics from SQLite.
   * Calculates actual authorization success rates and security event tallies without fabrication.
   */
  generate_compliance_summary: {
    name: "generate_compliance_summary",
    requiredPermission: "reports.create",
    targetResource: "Compliance:Reports",
    riskClassification: "HIGH",
    description: "Generate automated compliance attestation summary from live security records",
    handler: async (context: AgentExecutionContext) => {
      if (context.params?._simulateFailure === true) {
        throw new Error("Simulated system failure during agent execution");
      }
      // 1. Query real database counts
      const [
        totalAuditLogs,
        successfulAudits,
        deniedAudits,
        totalUsers,
        totalAgents,
        activeAgents,
        suspendedAgents,
        revokedAgents,
        activeDelegations,
        activeJitElevations,
        pendingApprovals,
        recentDeniedEvents,
      ] = await Promise.all([
        prisma.auditLog.count(),
        prisma.auditLog.count({ where: { status: "SUCCESS" } }),
        prisma.auditLog.count({ where: { status: "DENIED" } }),
        prisma.user.count(),
        prisma.agent.count(),
        prisma.agent.count({ where: { status: "ACTIVE" } }),
        prisma.agent.count({ where: { status: "SUSPENDED" } }),
        prisma.agent.count({ where: { status: "REVOKED" } }),
        prisma.delegation.count({ where: { status: "ACTIVE", expiresAt: { gt: new Date() } } }),
        prisma.privilegeElevation.count({ where: { status: "ACTIVE", expiresAt: { gt: new Date() } } }),
        prisma.approvalRequest.count({ where: { status: "PENDING" } }),
        prisma.auditLog.findMany({
          where: { status: "DENIED" },
          take: 5,
          orderBy: { timestamp: "desc" },
          select: {
            id: true,
            action: true,
            resource: true,
            actorType: true,
            timestamp: true,
            details: true,
          },
        }),
      ]);

      // 2. Handle insufficient data state gracefully
      if (totalAuditLogs === 0) {
        return {
          task: "generate_compliance_summary",
          status: "INSUFFICIENT_DATA",
          summary: "Audit ledger is currently empty. Insufficient forensic telemetry to generate enterprise compliance attestation.",
          metricsAvailable: false,
          totalAuditEvents: 0,
          timestamp: new Date().toISOString(),
        };
      }

      // 3. Compute derived metrics from real data
      const authSuccessRate = Number(((successfulAudits / totalAuditLogs) * 100).toFixed(2));
      const summaryText = `Real-time compliance ledger summary: ${totalAuditLogs} total security events evaluated (${successfulAudits} permitted, ${deniedAudits} blocked). ${activeAgents} active non-human agents under zero-trust governance.`;

      return {
        task: "generate_compliance_summary",
        status: "COMPLETED",
        summary: summaryText,
        timestamp: new Date().toISOString(),
        metrics: {
          totalAuditEvents: totalAuditLogs,
          allowedOperations: successfulAudits,
          deniedOperations: deniedAudits,
          authorizationSuccessRatePercent: authSuccessRate,
          identities: {
            totalUsers,
            totalAgents,
            activeAgents,
            suspendedAgents,
            revokedAgents,
          },
          zeroTrustControls: {
            activeDelegations,
            activeJitElevations,
            pendingSupervisoryApprovals: pendingApprovals,
          },
        },
        recentAnomaliesOrDenials: recentDeniedEvents.map((e) => ({
          id: e.id,
          action: e.action,
          resource: e.resource,
          actorType: e.actorType,
          timestamp: e.timestamp.toISOString(),
          details: e.details,
        })),
      };
    },
  },

  /**
   * Action B: Query User Directory
   * Real read-only human user directory retrieval with pagination and safe projection.
   * Strictly prevents exposure of password hashes, API keys, or sensitive credentials.
   */
  query_user_directory: {
    name: "query_user_directory",
    requiredPermission: "users.read",
    targetResource: "Users:Directory",
    riskClassification: "MEDIUM",
    description: "Query enterprise human user directory metadata",
    handler: async (context: AgentExecutionContext) => {
      const rawLimit = Number(context.params?.limit);
      const limit = !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20;
      const rawOffset = Number(context.params?.offset);
      const offset = !isNaN(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
      const search = typeof context.params?.search === "string" ? context.params.search.trim() : "";
      const roleFilter = typeof context.params?.role === "string" ? context.params.role.trim() : "";

      const whereClause: Record<string, unknown> = {};
      if (search) {
        whereClause.OR = [
          { name: { contains: search } },
          { email: { contains: search } },
        ];
      }
      if (roleFilter) {
        whereClause.role = { name: roleFilter };
      }

      const [totalCount, users] = await Promise.all([
        prisma.user.count({ where: whereClause }),
        prisma.user.findMany({
          where: whereClause,
          take: limit,
          skip: offset,
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      return {
        task: "query_user_directory",
        status: "SUCCESS",
        scope: context.resource,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + users.length < totalCount,
        },
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role.name,
          createdAt: u.createdAt.toISOString(),
        })),
        timestamp: new Date().toISOString(),
      };
    },
  },

  /**
   * Action C: Read Agent Telemetry
   * Retrieves real operational information for the caller agent and ecosystem metadata.
   * Excludes cryptographic hashes (apiKeyHash) and prevents lateral inspection of other agents' tokens.
   */
  read_agent_telemetry: {
    name: "read_agent_telemetry",
    requiredPermission: "agents.read",
    targetResource: "Agents:Telemetry",
    riskClassification: "LOW",
    description: "Retrieve non-human agent operational and rate-limit telemetry",
    handler: async (context: AgentExecutionContext) => {
      // 1. Fetch agent's active delegations count
      const activeDelegationsCount = await prisma.delegation.count({
        where: {
          agentId: context.agent.id,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
      });

      // 2. Fetch agent's recent audit activities
      const recentAuditLogs = await prisma.auditLog.findMany({
        where: {
          actorType: "AGENT",
          actorId: context.agent.id,
        },
        take: 5,
        orderBy: { timestamp: "desc" },
        select: {
          id: true,
          action: true,
          resource: true,
          status: true,
          timestamp: true,
          details: true,
        },
      });

      // 3. Organization-wide non-sensitive agent statistics
      const [totalAgents, activeAgents, suspendedAgents, revokedAgents] = await Promise.all([
        prisma.agent.count(),
        prisma.agent.count({ where: { status: "ACTIVE" } }),
        prisma.agent.count({ where: { status: "SUSPENDED" } }),
        prisma.agent.count({ where: { status: "REVOKED" } }),
      ]);

      return {
        task: "read_agent_telemetry",
        status: "SUCCESS",
        registeredAgentsCount: totalAgents, // Backward-compatibility field
        agentIdentity: {
          id: context.agent.id,
          name: context.agent.name,
          role: context.agent.roleName,
          status: context.agent.status,
          rateLimit: context.agent.rateLimit,
        },
        delegations: {
          activeCount: activeDelegationsCount,
        },
        recentActivity: recentAuditLogs.map((log) => ({
          id: log.id,
          action: log.action,
          resource: log.resource,
          status: log.status,
          timestamp: log.timestamp.toISOString(),
          details: log.details,
        })),
        registrySummary: {
          totalRegisteredAgents: totalAgents,
          activeAgents,
          suspendedAgents,
          revokedAgents,
        },
        timestamp: new Date().toISOString(),
      };
    },
  },

  /**
   * Action D: Modify System Roles
   * Critical-risk operation. Intentionally disabled for automated machine execution.
   * Returns an explicit unsupported/blocked response without modifying database state.
   */
  modify_system_roles: {
    name: "modify_system_roles",
    requiredPermission: "roles.manage",
    targetResource: "Security:Roles",
    riskClassification: "CRITICAL",
    description: "Modify enterprise role-permission matrices (Disabled for machine execution)",
    handler: async (_context: AgentExecutionContext) => {
      return {
        task: "modify_system_roles",
        status: "BLOCKED",
        supported: false,
        message: "Automated machine modification of system roles is disabled by enterprise security policy. Role definitions require direct administrator intervention.",
        timestamp: new Date().toISOString(),
      };
    },
  },
};

/**
 * Resolves an action definition from the registry.
 */
export function getAgentActionDefinition(actionName: string): AgentActionDefinition | undefined {
  if (!actionName || typeof actionName !== "string") return undefined;
  return AGENT_ACTION_REGISTRY[actionName.trim()];
}

/**
 * Lists all registered agent action definitions.
 */
export function listRegisteredAgentActions(): AgentActionDefinition[] {
  return Object.values(AGENT_ACTION_REGISTRY);
}

/**
 * Checks whether an action name is registered in the agent action registry.
 */
export function isActionRegistered(actionName: string): boolean {
  return Boolean(getAgentActionDefinition(actionName));
}
