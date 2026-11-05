import { prisma } from "@/lib/prisma";
import { evaluateUserJitPermission } from "@/lib/jit";
import { evaluateDelegatedPermission } from "@/lib/delegations";

export type PolicyDecision = "ALLOW" | "DENY" | "APPROVAL_REQUIRED";

export interface PolicyEvaluationInput {
  subjectId: string;
  subjectType: "USER" | "AGENT";
  action: string;
  resource: string;
  context?: {
    ipAddress?: string;
    targetScope?: string;
  };
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  subjectId: string;
  subjectType: "USER" | "AGENT";
  subjectName: string;
  subjectRole: string;
  subjectStatus: string;
  action: string;
  resource: string;
  reason: string;
  applicablePermission?: string;
  grantType?: "PERMANENT_ROLE" | "JIT_ELEVATION" | "DELEGATION" | "NONE";
  delegationId?: string;
  elevationId?: string;
  approvalId?: string;
  policyRule: string;
  timestamp: string;
  trace: string[];
}

/**
 * Standard enterprise resources recognized by the Policy Engine
 */
export const ENTERPRISE_RESOURCES = [
  { code: "Users:Directory", name: "User Directory & Credentials", highRisk: false },
  { code: "Audit:Logs", name: "Forensic Security Audit Logs", highRisk: true },
  { code: "Compliance:Reports", name: "Compliance & SOC Reports", highRisk: false },
  { code: "Agents:Registry", name: "AI Agent Identifiers & API Keys", highRisk: true },
  { code: "Roles:Matrix", name: "RBAC Roles & Permission Schema", highRisk: true },
  { code: "Reports:General", name: "General Organizational Analytics", highRisk: false },
  { code: "Reports:Sales", name: "Quarterly Sales & Revenue Telemetry", highRisk: false },
  { code: "Records:HR", name: "Employee HR Records & Compensation", highRisk: true },
  { code: "Reports:SensitiveFinancial", name: "Sensitive Financial & Treasury Reports", highRisk: true },
];

/**
 * High-risk actions requiring supervisory dual-control approval for machine execution
 */
export const SENSITIVE_ACTIONS = new Set([
  "users.create",
  "users.delete",
  "roles.manage",
  "agents.manage",
]);

/**
 * High-risk resources requiring approval
 */
export const SENSITIVE_RESOURCES = new Set([
  "Audit:Logs",
  "Agents:Registry",
  "Roles:Matrix",
  "Records:HR",
  "Reports:SensitiveFinancial",
]);

/**
 * Centralized Policy Decision Engine (PDP)
 * Evaluates access requests for human users and AI agents against:
 * 1. Identity existence and lifecycle status (Active/Suspended/Revoked)
 * 2. Standing role permissions (RBAC)
 * 3. Human JIT privilege elevation (Zero Standing Privilege)
 * 4. Human-to-Agent delegated authorization (Delegated Authority)
 * 5. Resource scope boundaries
 * 6. Dual-control approval requirements
 */
export async function evaluateAccessPolicy(
  input: PolicyEvaluationInput
): Promise<PolicyEvaluationResult> {
  const { subjectId, subjectType, action, resource } = input;
  const trace: string[] = [];
  const now = new Date();
  const timestamp = now.toISOString();

  trace.push(`[PDP Initiated] Evaluating access for ${subjectType} [${subjectId}] -> Action: [${action}] on Resource: [${resource}]`);

  // =================================================================
  // 1. SUBJECT RESOLUTION & LIFECYCLE STATE CHECK
  // =================================================================
  if (subjectType === "AGENT") {
    const agent = await prisma.agent.findUnique({
      where: { id: subjectId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!agent) {
      trace.push(`[DENY] Machine agent ID not found in database.`);
      return {
        decision: "DENY",
        subjectId,
        subjectType,
        subjectName: "Unknown Agent",
        subjectRole: "None",
        subjectStatus: "NOT_FOUND",
        action,
        resource,
        reason: "Subject identity does not exist in agent registry.",
        policyRule: "SEC-POL-001: Machine Identity Verification",
        timestamp,
        trace,
      };
    }

    trace.push(`[Agent Resolved] ${agent.name} (Role: ${agent.role.name}, Status: ${agent.status})`);

    // Enforce Active Status
    if (agent.status !== "ACTIVE") {
      trace.push(`[DENY] Agent status is '${agent.status}'. Non-active agents are blocked.`);
      return {
        decision: "DENY",
        subjectId,
        subjectType,
        subjectName: agent.name,
        subjectRole: agent.role.name,
        subjectStatus: agent.status,
        action,
        resource,
        reason: `Access blocked: Agent status is ${agent.status}. Machine executions are prohibited.`,
        policyRule: "SEC-POL-002: Machine Identity Lifecycle Control",
        timestamp,
        trace,
      };
    }

    const staticPerms = agent.role.permissions.map((rp) => rp.permission.code);
    let hasCapability = staticPerms.includes(action);
    let grantType: "PERMANENT_ROLE" | "DELEGATION" | "NONE" = hasCapability ? "PERMANENT_ROLE" : "NONE";
    let delegationId: string | undefined;

    // Check Human-to-Agent Delegation if not in static role
    if (!hasCapability) {
      trace.push(`[Checking Delegation] Agent lacks standing permission [${action}]. Inspecting active delegations...`);
      const delEval = await evaluateDelegatedPermission(agent.id, action, resource);
      if (delEval.authorized && delEval.delegation) {
        hasCapability = true;
        grantType = "DELEGATION";
        delegationId = delEval.delegation.id;
        trace.push(`[Delegation Active] Valid delegation [${delegationId}] from grantor [${delEval.grantor?.id || "human"}] matches scope.`);
      } else {
        trace.push(`[Delegation Check] No valid delegation found: ${delEval.reason}`);
      }
    }

    if (!hasCapability) {
      trace.push(`[DENY] Neither standing role nor delegated authorization provides permission [${action}].`);
      return {
        decision: "DENY",
        subjectId,
        subjectType,
        subjectName: agent.name,
        subjectRole: agent.role.name,
        subjectStatus: agent.status,
        action,
        resource,
        reason: `RBAC Violation: Agent [${agent.name}] lacks permission [${action}] and possesses no active delegated authority for resource [${resource}].`,
        policyRule: "SEC-POL-003: Autonomous Least-Privilege Boundary",
        timestamp,
        trace,
      };
    }

    // =================================================================
    // 2. AGENT HIGH-RISK / APPROVAL-REQUIRED EVALUATION
    // =================================================================
    const isSensitiveAction = SENSITIVE_ACTIONS.has(action);
    const isSensitiveResource = SENSITIVE_RESOURCES.has(resource) || resource.toLowerCase().includes("financial") || resource.toLowerCase().includes("sensitive");

    if (isSensitiveAction || isSensitiveResource) {
      trace.push(`[High-Risk Check] Operation is classified high-risk (actionSensitive=${isSensitiveAction}, resourceSensitive=${isSensitiveResource}).`);

      // Check if an APPROVED unexpired ApprovalRequest exists
      const existingApproval = await prisma.approvalRequest.findFirst({
        where: {
          requesterType: "AGENT",
          requesterId: agent.id,
          targetAction: action,
          resource,
          status: "APPROVED",
        },
        orderBy: { updatedAt: "desc" },
      });

      if (existingApproval) {
        trace.push(`[Approval Verified] Supervisory approval [${existingApproval.id}] signed off by reviewer [${existingApproval.reviewerId}].`);
        return {
          decision: "ALLOW",
          subjectId,
          subjectType,
          subjectName: agent.name,
          subjectRole: agent.role.name,
          subjectStatus: agent.status,
          action,
          resource,
          reason: `High-risk operation permitted: Agent [${agent.name}] possesses capability via ${grantType} with verified supervisor approval [${existingApproval.id}].`,
          applicablePermission: action,
          grantType,
          delegationId,
          approvalId: existingApproval.id,
          policyRule: "SEC-POL-004: Dual-Control Machine Signoff Satisfied",
          timestamp,
          trace,
        };
      }

      trace.push(`[APPROVAL REQUIRED] No approved human supervisor ticket on file for this high-risk machine operation.`);
      return {
        decision: "APPROVAL_REQUIRED",
        subjectId,
        subjectType,
        subjectName: agent.name,
        subjectRole: agent.role.name,
        subjectStatus: agent.status,
        action,
        resource,
        reason: `Operation [${action}] on [${resource}] requires human-in-the-loop supervisory approval before machine execution.`,
        applicablePermission: action,
        grantType,
        delegationId,
        policyRule: "SEC-POL-005: Dual-Control Autonomous Operation Governance",
        timestamp,
        trace,
      };
    }

    // Standard autonomous operation ALLOW
    trace.push(`[ALLOW] Standard autonomous operation authorized under Zero-Trust rules.`);
    return {
      decision: "ALLOW",
      subjectId,
      subjectType,
      subjectName: agent.name,
      subjectRole: agent.role.name,
      subjectStatus: agent.status,
      action,
      resource,
      reason: `Access Authorized: Agent [${agent.name}] authorized for [${action}] on [${resource}] via ${grantType}.`,
      applicablePermission: action,
      grantType,
      delegationId,
      policyRule: "SEC-POL-006: Autonomous Machine Access Authorized",
      timestamp,
      trace,
    };
  }

  // =================================================================
  // 3. HUMAN USER EVALUATION
  // =================================================================
  const user = await prisma.user.findUnique({
    where: { id: subjectId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!user) {
    trace.push(`[DENY] Human user ID not found in database.`);
    return {
      decision: "DENY",
      subjectId,
      subjectType,
      subjectName: "Unknown User",
      subjectRole: "None",
      subjectStatus: "NOT_FOUND",
      action,
      resource,
      reason: "User record does not exist in corporate directory.",
      policyRule: "SEC-POL-001: Human Identity Verification",
      timestamp,
      trace,
    };
  }

  trace.push(`[User Resolved] ${user.name} (${user.email}) - Standing Role: ${user.role.name}`);

  const userStandingPerms = user.role.permissions.map((rp) => rp.permission.code);
  let hasUserPerm = userStandingPerms.includes(action);
  let userGrantType: "PERMANENT_ROLE" | "JIT_ELEVATION" | "NONE" = hasUserPerm ? "PERMANENT_ROLE" : "NONE";
  let elevationId: string | undefined;

  // Check Human Just-In-Time (JIT) Privilege Elevation if standing role lacks capability
  if (!hasUserPerm) {
    trace.push(`[Checking JIT] Standing role [${user.role.name}] lacks [${action}]. Evaluating active JIT elevations...`);
    const jitEval = await evaluateUserJitPermission(user.id, action, resource);
    if (jitEval.hasPermission && jitEval.elevation) {
      hasUserPerm = true;
      userGrantType = "JIT_ELEVATION";
      elevationId = jitEval.elevation.id;
      trace.push(`[JIT Elevation Active] Active elevation [${elevationId}] granted temporary permission until ${jitEval.elevation.expiresAt.toISOString()}.`);
    } else {
      trace.push(`[JIT Check] No active elevation found: ${jitEval.reason}`);
    }
  }

  if (!hasUserPerm) {
    trace.push(`[DENY] User lacks required permission [${action}] and has no active JIT elevation.`);
    return {
      decision: "DENY",
      subjectId,
      subjectType,
      subjectName: user.name,
      subjectRole: user.role.name,
      subjectStatus: "ACTIVE",
      action,
      resource,
      reason: `Access Denied: User [${user.name}] (${user.role.name}) lacks capability [${action}] and holds no active JIT elevation.`,
      policyRule: "SEC-POL-007: Zero Standing Privilege Enforcement",
      timestamp,
      trace,
    };
  }

  // Human access ALLOW
  trace.push(`[ALLOW] Human access granted via ${userGrantType}.`);
  return {
    decision: "ALLOW",
    subjectId,
    subjectType,
    subjectName: user.name,
    subjectRole: user.role.name,
    subjectStatus: "ACTIVE",
    action,
    resource,
    reason: `Access Authorized: User [${user.name}] authorized for [${action}] on [${resource}] via ${userGrantType}.`,
    applicablePermission: action,
    grantType: userGrantType,
    elevationId,
    policyRule: "SEC-POL-008: Human Role & JIT Authorization",
    timestamp,
    trace,
  };
}
