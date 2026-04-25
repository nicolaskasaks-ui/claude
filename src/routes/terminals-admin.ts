import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { prisma } from "../lib/prisma.js";
import { requireRole, requireStaff } from "../middleware/auth.js";

const provisionBody = z.object({
  name: z.string().min(1),
  locationId: z.string().optional(),
});

const generateApiKey = customAlphabet(
  "ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnpqrstvwxyz23456789",
  40,
);

export async function terminalAdminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);

  // Provision a new terminal. Returns the raw API key exactly once — the
  // caller must store it securely on the device. We only persist a hash.
  app.post(
    "/v1/admin/terminals",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const body = provisionBody.parse(req.body);
      const apiKey = generateApiKey();
      const apiKeyHash = await argon2.hash(apiKey);
      const terminal = await prisma.terminal.create({
        data: {
          tenantId: req.staff!.tenantId,
          locationId: body.locationId,
          name: body.name,
          apiKeyHash,
        },
      });
      return { terminal, apiKey };
    },
  );

  app.get("/v1/admin/terminals", async (req) => {
    return prisma.terminal.findMany({
      where: { tenantId: req.staff!.tenantId },
      orderBy: { createdAt: "desc" },
    });
  });
}
