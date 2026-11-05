import React from "react";
import { getSession } from "@/lib/session";
import SecurityComplianceClient from "../security-compliance/SecurityComplianceClient";

export const dynamic = "force-dynamic";

export default async function SecurityMonitoringPage() {
  const session = await getSession();

  return (
    <SecurityComplianceClient
      currentUserRole={session?.roleName || "Employee"}
      initialTab="overview"
    />
  );
}
