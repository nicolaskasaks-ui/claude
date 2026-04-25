import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Unauthorized } from "../lib/errors.js";

const loginBody = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/staff/login", async (req) => {
    const body = loginBody.parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { slug: body.tenantSlug } });
    if (!tenant) throw Unauthorized();
    const staff = await prisma.staffUser.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: body.email } },
    });
    if (!staff) throw Unauthorized();
    if (!(await argon2.verify(staff.passwordHash, body.password))) {
      throw Unauthorized();
    }
    const token = await app.jwt.sign({
      sub: staff.id,
      tenantId: tenant.id,
      role: staff.role,
    });
    return { token, role: staff.role, tenantId: tenant.id };
  });
}
