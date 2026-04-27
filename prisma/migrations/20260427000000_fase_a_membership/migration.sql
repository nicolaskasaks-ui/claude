-- Fase A · Membership product (Chuí Loyalty v2)
-- Adds tier perks JSON, reward kinds (incl. ad-hoc personal rewards),
-- referrals, and a first-class Event model with ticketed reservations.
--
-- This migration is idempotent for the Tenant geofence columns since those
-- were added live to production (Supabase) before being represented in the
-- migration history. Running this against local Postgres adds them; running
-- against Supabase is a no-op for those columns.

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('POINTS_REDEMPTION', 'TIER_PERK', 'EVENT_INVITE', 'ADHOC');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SOLD_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventTicketStatus" AS ENUM ('RESERVED', 'PAID', 'CANCELLED', 'ATTENDED');

-- AlterTable Tenant — geofence columns (idempotent: production already has them)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "relevantText" TEXT;

-- AlterTable Customer — referral codes
ALTER TABLE "Customer" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredByCode" TEXT;

-- AlterTable Tier — perks JSON, description, strip override
ALTER TABLE "Tier" ADD COLUMN     "description" TEXT,
ADD COLUMN     "perks" JSONB,
ADD COLUMN     "stripImage" TEXT;

-- AlterTable Reward — kinds, tags, ad-hoc fields
ALTER TABLE "Reward" ADD COLUMN     "cardId" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "kind" "RewardKind" NOT NULL DEFAULT 'POINTS_REDEMPTION',
ADD COLUMN     "tag" TEXT,
ALTER COLUMN "pointsCost" SET DEFAULT 0;

-- CreateTable Event
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "ticketPriceCents" INTEGER NOT NULL DEFAULT 0,
    "presaleTierMin" INTEGER NOT NULL DEFAULT 2,
    "presaleStartsAt" TIMESTAMP(3) NOT NULL,
    "publicStartsAt" TIMESTAMP(3) NOT NULL,
    "reservedForTopTier" INTEGER NOT NULL DEFAULT 0,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable EventTicket
CREATE TABLE "EventTicket" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "EventTicketStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "EventTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_tenantId_status_idx" ON "Event"("tenantId", "status");
CREATE INDEX "Event_tenantId_date_idx" ON "Event"("tenantId", "date");
CREATE INDEX "EventTicket_eventId_status_idx" ON "EventTicket"("eventId", "status");
CREATE INDEX "EventTicket_cardId_idx" ON "EventTicket"("cardId");
CREATE UNIQUE INDEX "EventTicket_eventId_cardId_key" ON "EventTicket"("eventId", "cardId");
CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");
CREATE INDEX "Customer_referralCode_idx" ON "Customer"("referralCode");
CREATE INDEX "Reward_cardId_idx" ON "Reward"("cardId");
CREATE INDEX "Reward_customerId_idx" ON "Reward"("customerId");
CREATE INDEX "Reward_tenantId_tag_idx" ON "Reward"("tenantId", "tag");

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "LoyaltyCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "LoyaltyCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
