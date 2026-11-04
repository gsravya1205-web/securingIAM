import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";

// GET /api/users -> Requires users.read (Admin, Manager allowed; Employee denied)
export async function GET() {
  const auth = await authorizeRequest({
    requiredPermission: "users.read",
    action: "USER_LIST_READ",
    resource: "Users:Directory",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      role: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, users });
}

// POST /api/users -> Requires users.create (Admin allowed; Manager and Employee denied)
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest({
    requiredPermission: "users.create",
    action: "USER_PROVISION_CREATE",
    resource: "Users:Directory",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await request.json();
    const { name, email, password, roleName } = body;

    if (!name || !email || !password || !roleName) {
      return NextResponse.json(
        { error: "name, email, password, and roleName are required." },
        { status: 400 }
      );
    }

    const role = await prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      return NextResponse.json(
        { error: `Specified role [${roleName}] does not exist.` },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email: String(email).toLowerCase().trim(),
        passwordHash,
        roleId: role.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: { select: { name: true } },
      },
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error: unknown) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Failed to create user. Email may already be registered." },
      { status: 409 }
    );
  }
}

