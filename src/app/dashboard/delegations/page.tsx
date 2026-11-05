import React from "react";
import { getSession } from "@/lib/session";
import AccessGovernanceClient from "../governance/AccessGovernanceClient";

export const dynamic = "force-dynamic";

export default async function DelegationsPage() {
  const session = await getSession();

  return (
    <AccessGovernanceClient
      currentUserRole={session?.roleName || "Employee"}
      currentUserId={session?.id || ""}
      currentUserName={session?.name || "User"}
      initialTab="delegations"
    />
  );
}
