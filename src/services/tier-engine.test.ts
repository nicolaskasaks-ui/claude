import { describe, expect, it } from "vitest";
import { pickTier } from "./tier-engine.js";
import type { Tier } from "@prisma/client";

const tier = (overrides: Partial<Tier>): Tier =>
  ({
    id: overrides.name ?? "",
    tenantId: "t",
    name: overrides.name ?? "",
    rank: overrides.rank ?? 1,
    qualifyPoints: overrides.qualifyPoints ?? 0,
    qualifySpend: overrides.qualifySpend ?? 0,
    discountPct: overrides.discountPct ?? 0,
    pointsMultiplier: overrides.pointsMultiplier ?? 1,
    color: overrides.color ?? "#000000",
    createdAt: new Date(),
  }) as Tier;

const SILVER = tier({ name: "Silver", rank: 1 });
const GOLD = tier({ name: "Gold", rank: 2, qualifyPoints: 500, qualifySpend: 50_000 });
const PLATINUM = tier({ name: "Platinum", rank: 3, qualifyPoints: 2000, qualifySpend: 200_000 });

describe("pickTier", () => {
  it("returns Silver when below all thresholds", () => {
    expect(pickTier([SILVER, GOLD, PLATINUM], 100, 1000).name).toBe("Silver");
  });

  it("upgrades to Gold by points alone", () => {
    expect(pickTier([SILVER, GOLD, PLATINUM], 600, 0).name).toBe("Gold");
  });

  it("upgrades to Gold by spend alone", () => {
    expect(pickTier([SILVER, GOLD, PLATINUM], 0, 60_000).name).toBe("Gold");
  });

  it("picks the highest qualifying tier", () => {
    expect(pickTier([SILVER, GOLD, PLATINUM], 2500, 0).name).toBe("Platinum");
  });

  it("works with tiers passed in arbitrary order", () => {
    expect(pickTier([PLATINUM, SILVER, GOLD], 600, 0).name).toBe("Gold");
  });
});
