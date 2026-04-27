import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireStaff } from "../middleware/auth.js";
import { issueCard } from "../services/loyalty.js";

const createCustomerBody = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  birthDate: z.string().datetime().optional(),
  issueCard: z.boolean().default(true),
});

const patchCustomerBody = z.object({
  email: z.string().email().nullable().optional(),
  phone: z.string().min(5).nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  birthDate: z.string().datetime().nullable().optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);

  app.post("/v1/customers", async (req) => {
    const body = createCustomerBody.parse(req.body);
    const tenantId = req.staff!.tenantId;
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        email: body.email,
        phone: body.phone,
        firstName: body.firstName,
        lastName: body.lastName,
        birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
      },
    });
    const card = body.issueCard
      ? await issueCard({ tenantId, customerId: customer.id })
      : null;
    return { customer, card };
  });

  app.get("/v1/customers/:id", async (req) => {
    const { id } = req.params as { id: string };
    return prisma.customer.findFirstOrThrow({
      where: { id, tenantId: req.staff!.tenantId },
      include: { cards: { include: { tier: true } }, giftCards: true },
    });
  });

  app.patch("/v1/customers/:id", async (req) => {
    const { id } = req.params as { id: string };
    const tenantId = req.staff!.tenantId;
    await prisma.customer.findFirstOrThrow({ where: { id, tenantId } });
    const body = patchCustomerBody.parse(req.body);
    return prisma.customer.update({
      where: { id },
      data: {
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
        ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
        ...(body.birthDate !== undefined
          ? { birthDate: body.birthDate ? new Date(body.birthDate) : null }
          : {}),
      },
    });
  });

  app.get("/v1/customers", async (req) => {
    const q = (req.query as { q?: string }).q;
    return prisma.customer.findMany({
      where: {
        tenantId: req.staff!.tenantId,
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
  });
}
