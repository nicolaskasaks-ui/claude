-- Public gift card purchase flow (Sprint 1 of Commerce module)
-- Adds an intent record so we can persist buyer+recipient details before
-- the Mercado Pago payment confirms, then issue the actual GiftCard once
-- the webhook fires.

-- CreateEnum
CREATE TYPE "GiftCardPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "GiftCardPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "giftCardId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientWhatsapp" TEXT,
    "message" TEXT,
    "buyerCustomerId" TEXT,
    "mpPreferenceId" TEXT NOT NULL,
    "mpPaymentId" TEXT,
    "status" "GiftCardPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardPurchase_giftCardId_key" ON "GiftCardPurchase"("giftCardId");
CREATE UNIQUE INDEX "GiftCardPurchase_mpPreferenceId_key" ON "GiftCardPurchase"("mpPreferenceId");
CREATE UNIQUE INDEX "GiftCardPurchase_mpPaymentId_key" ON "GiftCardPurchase"("mpPaymentId");
CREATE INDEX "GiftCardPurchase_tenantId_status_idx" ON "GiftCardPurchase"("tenantId", "status");
CREATE INDEX "GiftCardPurchase_buyerCustomerId_idx" ON "GiftCardPurchase"("buyerCustomerId");

-- AddForeignKey
ALTER TABLE "GiftCardPurchase" ADD CONSTRAINT "GiftCardPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCardPurchase" ADD CONSTRAINT "GiftCardPurchase_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GiftCardPurchase" ADD CONSTRAINT "GiftCardPurchase_buyerCustomerId_fkey" FOREIGN KEY ("buyerCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
