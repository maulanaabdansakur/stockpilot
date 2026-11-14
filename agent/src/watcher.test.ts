/**
 * Watcher unit tests — staleness logic + market-hours logic.
 * Run: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessFreshness, formatPrice } from "./watcher.js";
import { isMarketOpen, MAX_STALE_AGE_SEC } from "./config.js";

describe("assessFreshness", () => {
  // Monday 2026-11-16 15:00 UTC — market open.
  const mon15 = Math.floor(Date.UTC(2026, 10, 16, 15, 0, 0) / 1000);

  it("fresh feed during market hours is not stale", () => {
    const f = assessFreshness(mon15 - 600, mon15); // 10 min old
    assert.equal(f.stale, false);
    assert.equal(f.marketOpen, true);
    assert.match(f.reason, /fresh/);
  });

  it("weekend hold (Fri close, ~40h old) is NOT stale (within 3 days)", () => {
    // Sunday 2026-11-15 15:00 UTC, feed last updated Fri 2026-11-13 23:36 UTC.
    const sun15 = Math.floor(Date.UTC(2026, 10, 15, 15, 0, 0) / 1000);
    const fri2336 = Math.floor(Date.UTC(2026, 10, 13, 23, 36, 23) / 1000);
    const f = assessFreshness(fri2336, sun15);
    assert.equal(f.stale, false);
    assert.equal(f.marketOpen, false);
    assert.match(f.reason, /market closed/);
  });

  it("feed older than 3 days is stale", () => {
    const f = assessFreshness(mon15 - MAX_STALE_AGE_SEC - 3600, mon15);
    assert.equal(f.stale, true);
    assert.match(f.reason, /exceeds max stale age/);
  });

  it("feed exactly at the 3-day boundary is not stale", () => {
    const f = assessFreshness(mon15 - MAX_STALE_AGE_SEC, mon15);
    assert.equal(f.stale, false);
  });

  it("future timestamp is not stale (clock skew tolerance)", () => {
    const f = assessFreshness(mon15 + 300, mon15);
    assert.equal(f.stale, false);
  });
});

describe("isMarketOpen", () => {
  const d = (y: number, m: number, day: number, h: number, min: number) =>
    new Date(Date.UTC(y, m, day, h, min));

  it("Monday 15:00 UTC is open", () => assert.equal(isMarketOpen(d(2026, 10, 16, 15, 0)), true));
  it("Monday 10:00 UTC is closed (pre-market)", () => assert.equal(isMarketOpen(d(2026, 10, 16, 10, 0)), false));
  it("Friday 20:30 UTC is closed (after close)", () => assert.equal(isMarketOpen(d(2026, 10, 13, 20, 30)), false));
  it("Saturday is closed", () => assert.equal(isMarketOpen(d(2026, 10, 14, 15, 0)), false));
  it("Sunday is closed", () => assert.equal(isMarketOpen(d(2026, 10, 15, 15, 0)), false));
  it("13:30 UTC open boundary is open", () => assert.equal(isMarketOpen(d(2026, 10, 16, 13, 30)), true));
  it("13:29 UTC is closed", () => assert.equal(isMarketOpen(d(2026, 10, 16, 13, 29)), false));
  it("20:00 UTC close boundary is closed", () => assert.equal(isMarketOpen(d(2026, 10, 16, 20, 0)), false));
});

describe("formatPrice", () => {
  it("formats 8-decimal fixed point as dollars", () => {
    assert.equal(formatPrice(16076543559n), "$160.76");
    assert.equal(formatPrice(35558500000n), "$355.58");
    assert.equal(formatPrice(10000000000n), "$100.00");
  });
});
