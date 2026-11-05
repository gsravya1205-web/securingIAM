import React from "react";
import { getSession } from "@/lib/session";
import AccessGovernanceClient from "./AccessGovernanceClient";

export const dynamic = "force-dynamic";

export default async function AccessGovernancePage() {
  const session = await getSession();

  return (
    <AccessGovernanceClient
      currentUserRole={session?.roleName || "Employee"}
      currentUserId={session?.id || ""}
      currentUserName={session?.name || "User"}
    />
  );
}

