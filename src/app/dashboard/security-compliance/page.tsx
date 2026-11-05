import React from "react";
import { getSession } from "@/lib/session";
import SecurityComplianceClient from "./SecurityComplianceClient";

export const dynamic = "force-dynamic";

export default async function SecurityCompliancePage() {
  const session = await getSession();

  return (
    <SecurityComplianceClient
      currentUserRole={session?.roleName || "Employee"}
    />
  );
}

