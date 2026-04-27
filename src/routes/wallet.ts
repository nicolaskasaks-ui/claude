import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { NotFound, Unauthorized } from "../lib/errors.js";
import { buildLoyaltyPass, buildGiftPass } from "../services/wallet-apple.js";
import { buildLoyaltySaveLink, buildGiftSaveLink } from "../services/wallet-google.js";
import { env } from "../lib/env.js";

// Pass distribution endpoints for end users. The merchant's app or a
// self-service link points here.
//   GET /v1/wallet/loyalty/:cardId/apple   -> binary .pkpass
//   GET /v1/wallet/loyalty/:cardId/google  -> 302 to pay.google.com Save link
//   GET /v1/wallet/gift/:giftCardId/apple
//   GET /v1/wallet/gift/:giftCardId/google
//
// Plus the Apple PassKit web service endpoints used by iOS for pass updates
// (registration, list updated serials, fetch latest pass).

function publicHost(req: { protocol: string; hostname: string }): string {
  return `${req.protocol}://${req.hostname}`;
}

export async function walletRoutes(app: FastifyInstance) {
  app.get("/v1/wallet/loyalty/:cardId/apple", async (req, reply) => {
    const { cardId } = req.params as { cardId: string };
    const card = await prisma.loyaltyCard.findUniqueOrThrow({
      where: { id: cardId },
      include: { tenant: true, tier: true, customer: true },
    });
    const customerName = [card.customer.firstName, card.customer.lastName]
      .filter(Boolean)
      .join(" ") || "Miembro";
    const buf = await buildLoyaltyPass({
      tenant: card.tenant,
      card,
      tier: card.tier,
      customerName,
      publicHost: publicHost(req),
    });
    reply.header("Content-Type", "application/vnd.apple.pkpass");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${card.tenant.slug}-friends-card.pkpass"`,
    );
    return reply.send(buf);
  });

  app.get("/v1/wallet/loyalty/:cardId/google", async (req, reply) => {
    const { cardId } = req.params as { cardId: string };
    const card = await prisma.loyaltyCard.findUniqueOrThrow({
      where: { id: cardId },
      include: { tenant: true, tier: true, customer: true },
    });
    const customerName = [card.customer.firstName, card.customer.lastName]
      .filter(Boolean)
      .join(" ") || "Miembro";
    const url = await buildLoyaltySaveLink({
      tenant: card.tenant,
      card,
      tier: card.tier,
      customerName,
    });
    return reply.redirect(url);
  });

  app.get("/v1/wallet/gift/:giftCardId/apple", async (req, reply) => {
    const { giftCardId } = req.params as { giftCardId: string };
    const giftCard = await prisma.giftCard.findUniqueOrThrow({
      where: { id: giftCardId },
      include: { tenant: true, purchase: true },
    });
    const buf = await buildGiftPass({
      tenant: giftCard.tenant,
      giftCard,
      // Bring across the public-purchase metadata so the recipient sees
      // who sent it, the optional message, and whether to hide the amount.
      senderName: giftCard.purchase?.senderName,
      recipientName: giftCard.purchase?.recipientName,
      message: giftCard.purchase?.message ?? undefined,
      hideAmount: giftCard.purchase?.hideAmount ?? false,
      publicHost: publicHost(req),
    });
    reply.header("Content-Type", "application/vnd.apple.pkpass");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${giftCard.tenant.slug}-gift-card.pkpass"`,
    );
    return reply.send(buf);
  });

  app.get("/v1/wallet/gift/:giftCardId/google", async (req, reply) => {
    const { giftCardId } = req.params as { giftCardId: string };
    const giftCard = await prisma.giftCard.findUniqueOrThrow({
      where: { id: giftCardId },
      include: { tenant: true },
    });
    const url = await buildGiftSaveLink({ tenant: giftCard.tenant, giftCard });
    return reply.redirect(url);
  });

  // ---------------------------------------------------------------------------
  // Apple PassKit web service: lets iPhones register for pass updates and
  // fetch the latest pass after we send an APNs ping.
  // Spec: developer.apple.com -> "PassKit Web Service Reference"
  // ---------------------------------------------------------------------------

  function expectAuth(req: { headers: Record<string, string | string[] | undefined> }, cardId: string) {
    const auth = req.headers.authorization;
    if (typeof auth !== "string" || !auth.startsWith("ApplePass ")) throw Unauthorized();
    const token = auth.slice("ApplePass ".length);
    if (token !== cardId) throw Unauthorized();
  }

  // Register a device.
  app.post(
    "/v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber",
    async (req, reply) => {
      const params = req.params as {
        deviceLibraryIdentifier: string;
        passTypeIdentifier: string;
        serialNumber: string;
      };
      const body = req.body as { pushToken?: string };
      const card = await prisma.loyaltyCard.findUnique({ where: { id: params.serialNumber } });
      if (!card) throw NotFound();
      expectAuth(req, card.id);
      if (params.passTypeIdentifier !== env.APPLE_PASS_TYPE_IDENTIFIER) throw NotFound();
      await prisma.walletDevice.upsert({
        where: {
          platform_deviceIdentifier_cardId: {
            platform: "APPLE",
            deviceIdentifier: params.deviceLibraryIdentifier,
            cardId: card.id,
          },
        },
        update: { pushToken: body.pushToken, lastSeenAt: new Date() },
        create: {
          platform: "APPLE",
          deviceIdentifier: params.deviceLibraryIdentifier,
          cardId: card.id,
          pushToken: body.pushToken,
        },
      });
      return reply.code(201).send();
    },
  );

  // Unregister a device.
  app.delete(
    "/v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber",
    async (req, reply) => {
      const params = req.params as {
        deviceLibraryIdentifier: string;
        passTypeIdentifier: string;
        serialNumber: string;
      };
      const card = await prisma.loyaltyCard.findUnique({ where: { id: params.serialNumber } });
      if (!card) throw NotFound();
      expectAuth(req, card.id);
      await prisma.walletDevice.deleteMany({
        where: {
          platform: "APPLE",
          deviceIdentifier: params.deviceLibraryIdentifier,
          cardId: card.id,
        },
      });
      return reply.code(200).send();
    },
  );

  // List serials updated since `passesUpdatedSince`.
  app.get(
    "/v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier",
    async (req) => {
      const params = req.params as { deviceLibraryIdentifier: string };
      const since = (req.query as { passesUpdatedSince?: string }).passesUpdatedSince;
      const sinceDate = since ? new Date(Number(since) * 1000) : new Date(0);
      const devices = await prisma.walletDevice.findMany({
        where: { platform: "APPLE", deviceIdentifier: params.deviceLibraryIdentifier },
        include: { card: true },
      });
      const updated = devices
        .filter((d) => d.card.updatedAt > sinceDate)
        .map((d) => d.card);
      return {
        lastUpdated: String(Math.floor(Date.now() / 1000)),
        serialNumbers: updated.map((c) => c.id),
      };
    },
  );

  // Return the latest pass for a serial.
  app.get(
    "/v1/wallet/apple/v1/passes/:passTypeIdentifier/:serialNumber",
    async (req, reply) => {
      const params = req.params as { passTypeIdentifier: string; serialNumber: string };
      const card = await prisma.loyaltyCard.findUnique({
        where: { id: params.serialNumber },
        include: { tenant: true, tier: true, customer: true },
      });
      if (!card) throw NotFound();
      expectAuth(req, card.id);
      if (params.passTypeIdentifier !== env.APPLE_PASS_TYPE_IDENTIFIER) throw NotFound();
      const customerName = [card.customer.firstName, card.customer.lastName]
        .filter(Boolean)
        .join(" ") || "Miembro";
      const buf = await buildLoyaltyPass({
        tenant: card.tenant,
        card,
        tier: card.tier,
        customerName,
        publicHost: publicHost(req),
      });
      reply.header("Content-Type", "application/vnd.apple.pkpass");
      return reply.send(buf);
    },
  );

  app.post("/v1/wallet/apple/v1/log", async (req, reply) => {
    // Apple sends device-side log lines here; useful for debugging.
    // eslint-disable-next-line no-console
    console.log("[apple-wallet-log]", JSON.stringify(req.body));
    return reply.code(200).send();
  });
}
