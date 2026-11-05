# SECUREID – DEMONSTRATION & EVALUATION GUIDE
## Enterprise Role-Based Access Control (RBAC) & Autonomous AI Agent IAM Application

```
  ███████╗███████╗ ██████╗██╗   ██╗██████╗ ███████╗██╗██████╗ 
  ██╔════╝██╔════╝██╔════╝██║   ██║██╔══██╗██╔════╝██║██╔══██╗
  ███████╗█████╗  ██║     ██║   ██║██████╔╝█████╗  ██║██║  ██║
  ╚════██║██╔══╝  ██║     ██║   ██║██╔══██╗██╔══╝  ██║██║  ██║
  ███████║███████╗╚██████╗╚██████╔╝██║  ██║███████╗██║██████╔╝
  ╚══════╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝╚═════╝ 
```

---

## 1. Quick Start & Server Access

- **Target URL**: [http://localhost:3040](http://localhost:3040)
- **Port**: Dedicated to **Port 3040** (Independent from port 3000)
- **Database**: Local SQLite Enterprise Database (`prisma/dev.db`)

### Demonstration Credentials
The login portal features **one-click role preset buttons** for immediate authentication. You may also enter any of the credentials below:

| Role | Email Address | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@secureid.local` *(or `gayatri@gmail.com`)* | `admin123` *(or `123`)* | Full governance (11 permissions): Users, Roles, Agents, Approvals, JIT, Audit |
| **Supervisor / Manager** | `manager@secureid.local` | `manager123` *(or `123`)* | Supervisory oversight (6 permissions): Approvals, Reports, Agent Telemetry |
| **Standard Employee** | `employee@secureid.local` | `employee123` *(or `123`)* | Zero Standing Privilege baseline (1 permission): View General Reports, Request JIT |

---

## 2. Walkthrough of the 10 Key Security Capabilities

### Capability 1: Unified Enterprise Overview (`/dashboard`)
1. Log in as **Admin** (`admin@secureid.local`).
2. Observe the live enterprise metrics fetched in real-time from SQLite:
   - Total Human Identities & Active AI Agents
   - Total Permissions & Configured Roles
   - Cumulative Allowed vs Denied Authorization Decisions
   - Real-time Pending Approval and JIT Ticket counters
3. Click on the Quick Action cards to navigate directly to identity, policy, and monitoring workflows.

### Capability 2: Granular Role & Permission Matrices (`/dashboard/roles`)
1. Navigate to **Roles & Permissions**.
2. Inspect the 4 configured roles: `Admin`, `Manager`, `Employee`, `AI Agent`.
3. Note how granular permission capabilities (`users.read`, `reports.read`, `agents.manage`, etc.) are mapped to roles without hardcoded permission logic.

### Capability 3: AI Agent Identities & CSPRNG Token Registration (`/dashboard/agents`)
1. Navigate to **AI Agent Identities**.
2. Click **"+ Register AI Agent"**.
3. Provide an Agent Name (e.g., `LogAnalyticsBot`) and Rate Limit (e.g., `100 req/min`).
4. Click **Create Agent**.
5. **Security Feature**: A 256-bit cryptographically secure token starting with `sec_agent_` is generated and displayed **only once**. SQLite stores solely the `bcrypt` hash (`apiKeyHash`).

### Capability 4: Autonomous Machine-to-Machine (M2M) Execution & Rate Limiting
1. Autonomous agents communicate via HTTP Bearer token authentication:
   ```bash
   curl -X POST http://localhost:3040/api/agent-runtime/execute \
     -H "Authorization: Bearer sec_agent_research_assistant_live_key" \
     -H "Content-Type: application/json" \
     -d '{"action": "read_telemetry"}'
   ```
2. The server performs constant-time bcrypt verification, tracks request quotas per minute via an in-memory token bucket, and records an immutable entry in `AuditLog`.

### Capability 5: Dual-Control Approval Engine & SoD Enforcement (`/dashboard/approvals`)
1. Log in as **Employee** (`employee@secureid.local`).
2. Navigate to **Pending Approvals** and submit an approval request for a sensitive action (e.g. `reports.create` on `Compliance:AuditReports`).
3. Note that the Employee **cannot approve their own ticket** (Separation of Duties enforced via HTTP 403).
4. Log out and log in as **Manager** (`manager@secureid.local`).
5. Open **Pending Approvals**: View the ticket with requester identity, target resource, and justification.
6. Click **Approve Ticket**. The ticket transitions to `APPROVED`, and an immutable audit record is logged.

### Capability 6: Human-to-Agent Delegated Authorization (`/dashboard/delegations`)
1. Navigate to **Delegated Access**.
2. Click **"+ Create Delegation"**.
3. Select the grantor (Admin), target agent (`SecureID Research Assistant`), permitted capability (`reports.read`), and strict scope (e.g., `Reports:Sales`).
4. Set a duration (e.g., 60 minutes) and business justification.
5. Once created, the AI agent is authorized **strictly within the defined resource scope**.
6. Click **Revoke** on any active delegation: Authorization is terminated instantly at runtime without rotating API keys.

### Capability 7: Zero Standing Privilege (ZSP) & Human JIT Elevation (`/dashboard/access-control`)
1. Log in as **Employee** (`employee@secureid.local`).
2. Open **Access Control Center** -> **Just-In-Time (JIT) Elevation**.
3. Click **"Request JIT Elevation"**.
4. Request capability `users.create` for 60 minutes with justification `"Contractor onboarding shift"`.
5. Log in as **Admin** and click **Approve Elevation**.
6. **Key ZSP Verification**:
   - The user's permanent database role **never changes** (remains `Employee`).
   - The elevated privilege exists solely as an active `PrivilegeElevation` ticket.
   - When the TTL expires, elevated access terminates automatically.

### Capability 8: Centralized Access Policy Decision Point (PDP) (`/dashboard/access-control`)
1. On the **Access Control Center** page, switch to the **Policy Decision Evaluator** tab.
2. Select any Human User or AI Agent from the live database.
3. Select an Action (`users.create`, `reports.read`, etc.) and Resource.
4. Click **"Evaluate Access Policy"**.
5. Observe the live verdict badge (`ALLOW`, `DENY`, or `APPROVAL_REQUIRED`), the exact **Grant Mechanism** (`PERMANENT_ROLE`, `JIT_ELEVATION`, or `DELEGATION`), and the real-time PDP evaluation trace.

### Capability 9: Interactive Agent Playground & 10 Live Scenarios (`/dashboard/agents`)
1. Navigate to **AI Agent Identities** -> Click the **"Agent Playground"** tab.
2. Review the pre-configured official demonstration agent: `SecureID Research Assistant`.
3. Click **"Run All 10 Scenarios"** or click **"Execute"** on individual scenarios:
   - **Scenario 1**: Authorized Access (`ALLOW` 200)
   - **Scenario 2**: Unauthorized Breach Attempt (`DENY` 403)
   - **Scenario 3**: Delegated Access (`ALLOW` 200)
   - **Scenario 4**: Out-of-Scope Breach Attempt (`DENY` 403)
   - **Scenario 5**: Revoked Delegation (`DENY` 403)
   - **Scenario 6**: Human JIT Elevation Active (`ALLOW` 200)
   - **Scenario 7**: Temporal Expiration TTL (`DENY` 403)
   - **Scenario 8**: Dual-Control Supervisor Signoff (`APPROVAL_REQUIRED` 403)
   - **Scenario 9**: Suspended Agent Isolation (`DENY` 403)
   - **Scenario 10**: Emergency Kill-Switch Fleet Freeze (`DENY` 403)

### Capability 10: Security Monitoring, Threat Posture & Emergency Kill-Switch (`/dashboard/monitoring`)
1. Navigate to **Security Monitoring**.
2. Inspect the **SOC Security Alert Feed**: Rule-based threat engine actively flags credential mismatch spikes, excessive rate limits, and access denied clusters.
3. Review the **Security Policy Configuration** at `/dashboard/settings` (configure max JIT duration, max delegation TTL, and agent default rate limits).
4. Test the **Emergency Agent Kill-Switch**:
   - Click **"Activate Emergency Lockdown"**.
   - All active AI agents are instantly suspended in SQLite.
   - Any machine request arriving during lockdown is immediately rejected with HTTP 403.
   - Click **"Deactivate Lockdown"** to restore agent fleet operations.

---

## 3. How to Run the Automated Test Suites

SecureID features an extensive automated test suite covering 100% of the platform's security mechanisms:

```bash
# 1. Reset / Seed Demo Environment
node --experimental-strip-types seed-demo.ts

# 2. Master End-to-End Comprehensive Suite (10 / 10 Tests)
node --experimental-strip-types test-end-to-end.ts

# 3. Agent Playground & 10 Live Scenarios Suite (12 / 12 Tests)
node --experimental-strip-types test-agent-playground.ts

# 4. Security Monitoring & Emergency Kill-Switch Suite (9 / 9 Tests)
node --experimental-strip-types test-security-monitoring.ts

# 5. Zero Standing Privilege & Human JIT Suite (20 / 20 Tests)
node --experimental-strip-types test-jit.ts

# 6. Centralized Policy Decision Point (PDP) Suite (15 / 15 Tests)
node --experimental-strip-types test-policy-engine.ts

# 7. Human-to-Agent Delegated Authorization Suite (20 / 20 Tests)
node --experimental-strip-types test-delegations.ts

# 8. Dual-Control Supervisory Approvals Suite (15 / 15 Tests)
node --experimental-strip-types test-approvals.ts

# 9. Static Role-Based Access Control (RBAC) Suite (15 / 15 Tests)
node --experimental-strip-types test-rbac.ts

# 10. AI Agent M2M Authentication & Key Lifecycle Suite (15 / 15 Tests)
node --experimental-strip-types test-agent-m2m.ts
```

Total Automated Tests: **130+ Passing Tests (100% Success Rate)**.

