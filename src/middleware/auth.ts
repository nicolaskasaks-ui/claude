import type { FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { prisma } from "../lib/prisma.js";
import { Forbidden, Unauthorized } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    staff?: { id: string; tenantId: string; role: "OWNER" | "MANAGER" | "CASHIER" };
    terminal?: { id: string; tenantId: string };
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; tenantId: string; role: "OWNER" | "MANAGER" | "CASHIER" };
    user: { sub: string; tenantId: string; role: "OWNER" | "MANAGER" | "CASHIER" };
  }
}

export async function requireStaff(req: FastifyRequest, _reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    throw Unauthorized();
  }
  const u = req.user as { sub: string; tenantId: string; role: "OWNER" | "MANAGER" | "CASHIER" };
  req.staff = { id: u.sub, tenantId: u.tenantId, role: u.role };
}

export function requireRole(...roles: ("OWNER" | "MANAGER" | "CASHIER")[]) {
  return async (req: FastifyRequest) => {
    if (!req.staff) throw Unauthorized();
    if (!roles.includes(req.staff.role)) throw Forbidden();
  };
}

// Terminals authenticate with `Authorization: Terminal <api-key>`. The key is
// hashed at rest so a database leak does not expose live credentials.
export async function requireTerminal(req: FastifyRequest) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Terminal ")) throw Unauthorized();
  const apiKey = header.slice("Terminal ".length).trim();

  // We can't query by hash directly (argon2 hashes are non-deterministic).
  // Fetch active terminals for the tenant via a separate header.
  const tenantId = req.headers["x-tenant-id"];
  if (typeof tenantId !== "string") throw Unauthorized("Missing X-Tenant-Id");

  const terminals = await prisma.terminal.findMany({
    where: { tenantId, active: true },
  });
  for (const t of terminals) {
    if (await argon2.verify(t.apiKeyHash, apiKey)) {
      req.terminal = { id: t.id, tenantId: t.tenantId };
      await prisma.terminal.update({
        where: { id: t.id },
        data: { lastSeenAt: new Date() },
      });
      return;
    }
  }
  throw Unauthorized();
}
