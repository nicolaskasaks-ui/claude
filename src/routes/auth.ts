import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { BadRequest, Unauthorized } from "../lib/errors.js";
import { requireStaff } from "../middleware/auth.js";

const loginBody = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const passwordChangeBody = z.object({
  currentPassword: z.string().min(8),
  newPassword: z
    .string()
    .min(10, "La nueva contraseña debe tener al menos 10 caracteres"),
});

export async function authRoutes(app: FastifyInstance) {
  // Stricter bucket on login: 10 attempts/IP/min defends against credential
  // stuffing without locking out legitimate retypes. The global 200/min still
  // applies on top.
  app.post("/v1/auth/staff/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req) => {
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

  // Authenticated password change. Verifies the current password (so a
  // hijacked JWT alone can't lock out the account), then writes a new hash.
  // Tokens issued before the change remain valid until expiry — that's
  // acceptable for an MVP. A stronger v2 would track a password_version on
  // the staff record and embed it in the JWT for immediate invalidation.
  app.patch(
    "/v1/auth/staff/password",
    { preHandler: [requireStaff] },
    async (req) => {
      const body = passwordChangeBody.parse(req.body);
      if (!req.staff) throw Unauthorized();
      const staff = await prisma.staffUser.findUnique({ where: { id: req.staff.id } });
      if (!staff) throw Unauthorized();

      const ok = await argon2.verify(staff.passwordHash, body.currentPassword);
      if (!ok) throw BadRequest("La contraseña actual es incorrecta");

      const newHash = await argon2.hash(body.newPassword);
      await prisma.staffUser.update({
        where: { id: staff.id },
        data: { passwordHash: newHash },
      });
      return { ok: true };
    },
  );
}
