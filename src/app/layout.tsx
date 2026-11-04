import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SecureID | AI Agent Identity & RBAC Management",
  description: "Enterprise Security & RBAC Management System for Humans and AI Agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark bg-[#060A17]">
      <body className="min-h-screen bg-[#060A17] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
