import React from "react";
import { getSession } from "@/lib/session";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();

  return (
    <SettingsClient
      user={{
        name: session?.name || "Alex Vance",
        email: session?.email || "admin@secureid.local",
        roleName: session?.roleName || "Admin",
        permissionsCount: session?.permissions.length || 11,
      }}
    />
  );
}

