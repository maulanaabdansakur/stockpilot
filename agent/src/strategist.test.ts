/**
 * Strategist unit tests — deterministic price series -> expected decisions.
 * Run: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decide, type PricePoint, type PositionState } from "./strategist.js";

const P = (dollars: number, ts = 0): PricePoint => ({ price: BigInt(Math.round(dollars * 1e8)), ts });
const series = (prices: number[]): PricePoint[] => prices.map((p, i) => P(p, 1000 + i * 1800));

const flatPos = (avgCost: number, amount = 1_000_000_000_000_000_000n): PositionState => ({
  amount,
  avgCost: BigInt(Math.round(avgCost * 1e8)),
  totalCost: 100_000_000n,
});

describe("strategist", () => {
  it("holds with too little history (warming up)", () => {
    const d = decide("NVDA", series([160, 161]), null);
    assert.equal(d.action, "HOLD");
    assert.match(d.rationale, /Warming up/);
  });

  it("holds on a flat series (no signal)", () => {
    const d = decide("NVDA", series([160, 160, 160, 160, 160, 160, 160, 160]), null);
    assert.equal(d.action, "HOLD");
    assert.match(d.rationale, /no signal/);
  });

  it("buys on momentum: steady rise above short MA", () => {
    // Gradual rise: +1.5% over the window, momentum vs short MA > +1%.
    const d = decide("NVDA", series([150, 151, 152, 153, 154, 155, 156, 157.5]), null);
    assert.equal(d.action, "BUY");
    assert.match(d.rationale, /Momentum/);
  });

  it("sells on momentum when holding: steady fall below short MA", () => {
    // avgCost 165 keeps the -1.5% dip inside the stop-loss band (-3%),
    // so momentum — not stop-loss — is the trigger.
    const d = decide("NVDA", series([170, 169, 168, 167, 166, 165, 164, 162.5]), flatPos(165));
    assert.equal(d.action, "SELL");
    assert.match(d.rationale, /Momentum/);
  });

  it("does not sell on momentum when flat (no position to sell)", () => {
    const d = decide("NVDA", series([170, 169, 168, 167, 166, 165, 164, 162.5]), null);
    assert.equal(d.action, "HOLD");
    assert.equal(d.blockedReason, "no position to sell");
  });

  it("does not buy on momentum when already holding", () => {
    // avgCost 155 keeps the +1.6% gain inside the take-profit band (+5%),
    // so the momentum BUY is the signal that gets blocked by the position.
    const d = decide("NVDA", series([150, 151, 152, 153, 154, 155, 156, 157.5]), flatPos(155));
    assert.equal(d.action, "HOLD");
    assert.equal(d.blockedReason, "already holding");
  });

  it("sells when overextended above long MA (mean reversion overrides)", () => {
    // Long flat base then a sharp +4.7% jump: momentum says BUY, mean
    // reversion says SELL. Jump sized so the volatility filter stays quiet.
    const d = decide(
      "NVDA",
      series([150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 157]),
      flatPos(150),
    );
    assert.equal(d.action, "SELL");
    assert.match(d.rationale, /Mean reversion/);
  });

  it("buys the dip when oversold below long MA", () => {
    const d = decide(
      "NVDA",
      series([150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 143]),
      null,
    );
    assert.equal(d.action, "BUY");
    assert.match(d.rationale, /Mean reversion/);
  });

  it("holds when volatility exceeds the filter", () => {
    // Wild swings: ±5% moves each observation.
    const d = decide("NVDA", series([150, 158, 149, 157, 148, 156, 147, 155]), null);
    assert.equal(d.action, "HOLD");
    assert.match(d.rationale, /too volatile/);
    assert.ok((d.signals.volatilityPct ?? 0) > 2);
  });

  it("sells on take-profit at +5% vs avg cost", () => {
    // Flat-ish series ending at +6% vs cost, but momentum vs short MA is
    // small (recent prices flat) so TP must be the trigger.
    const d = decide("NVDA", series([100, 101, 102, 103, 104, 105, 106, 106]), flatPos(100));
    assert.equal(d.action, "SELL");
    assert.match(d.rationale, /Take profit/);
  });

  it("sells on stop-loss at -3% vs avg cost", () => {
    const d = decide("NVDA", series([100, 100, 100, 100, 100, 100, 100, 96.5]), flatPos(100));
    assert.equal(d.action, "SELL");
    assert.match(d.rationale, /Stop loss/);
  });

  it("is deterministic: same input -> same decision", () => {
    const s = series([150, 151, 152, 153, 154, 155, 156, 157.5]);
    assert.deepEqual(decide("NVDA", s, null), decide("NVDA", s, null));
  });
});
