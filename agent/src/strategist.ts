/**
 * Strategist — rule-based signals over watched prices.
 *
 * RULES DECIDE, LLM EXPLAINS (CONCEPT.md R4): this module is pure and
 * deterministic — given a price history and a position it always returns
 * the same decision. The LLM layer (llm.ts) only rewords the rationale;
 * a failed LLM call never blocks a trade.
 *
 * ## Strategy (documented, v1)
 * Inputs per ticker: price history (8-decimal fixed point, oldest first,
 * latest = current price) and the open position, if any.
 *
 * 1. **Warm-up:** fewer than 4 observations -> HOLD ("warming up").
 * 2. **Volatility filter:** std-dev of the last <=8 per-observation % moves
 *    > 2.0% -> HOLD ("too volatile"). A choppy tape is not a signal.
 * 3. **Take-profit / stop-loss (position-aware, checked first):**
 *    price >= avgCost * 1.05 -> SELL ("take profit +5%");
 *    price <= avgCost * 0.97 -> SELL ("stop loss -3%").
 * 4. **Mean reversion (overrides momentum):** price vs long MA (last 20
 *    observations, or all if fewer): > +4% above -> SELL ("overextended");
 *    < -4% below -> BUY ("oversold dip").
 * 5. **Momentum:** price vs short MA (last 8): > +1% above -> BUY;
 *    < -1% below -> SELL. Otherwise HOLD.
 * 6. **Position gating:** BUY only when flat (one position per ticker at a
 *    time, v1); SELL only when holding — a SELL signal with no position
 *    becomes HOLD ("no position to sell").
 *
 * All thresholds are constants below so they can be tuned (and unit-tested)
 * without touching the decision flow.
 */
import { formatPrice } from "./watcher.js";

export type Action = "BUY" | "SELL" | "HOLD";

export interface PricePoint {
  /** 8-decimal fixed-point price. */
  price: bigint;
  /** Unix seconds. */
  ts: number;
}

export interface PositionState {
  /** TEST token base units held (18 decimals). */
  amount: bigint;
  /** Volume-weighted avg buy price, 8 decimals. */
  avgCost: bigint;
  /** USDC base units (6 dec) paid for the open amount. */
  totalCost: bigint;
}

export interface Decision {
  ticker: string;
  action: Action;
  /** Rule-based rationale (always present; LLM may reword it). */
  rationale: string;
  /** Signal values that produced the decision, for the dashboard/log. */
  signals: {
    price: string;
    shortMa: string | null;
    longMa: string | null;
    momentumPct: number | null;
    meanRevPct: number | null;
    volatilityPct: number | null;
    observations: number;
  };
  /** Why a signal did not become a trade (e.g. "no position to sell"). */
  blockedReason?: string;
}

/** Tunable thresholds. */
export const STRATEGY = {
  minObservations: 4,
  shortMaWindow: 8,
  longMaWindow: 20,
  volatilityMaxPct: 2.0, // per-observation std-dev %
  momentumBuyPct: 1.0,
  momentumSellPct: -1.0,
  meanRevSellPct: 4.0, // overextended
  meanRevBuyPct: -4.0, // oversold
  takeProfitPct: 5.0,
  stopLossPct: -3.0,
} as const;

const toNum = (p: bigint): number => Number(p) / 1e8;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
}

/**
 * Pure decision function. `history` must be oldest-first and include the
 * current price as its last element. `position` is null when flat.
 */
export function decide(
  ticker: string,
  history: PricePoint[],
  position: PositionState | null,
): Decision {
  const price = toNum(history[history.length - 1].price);
  const n = history.length;
  const baseSignals = {
    price: formatPrice(history[history.length - 1].price),
    shortMa: null as string | null,
    longMa: null as string | null,
    momentumPct: null as number | null,
    meanRevPct: null as number | null,
    volatilityPct: null as number | null,
    observations: n,
  };
  const hold = (rationale: string, blockedReason?: string): Decision => ({
    ticker,
    action: "HOLD",
    rationale,
    signals: baseSignals,
    blockedReason,
  });

  if (n < STRATEGY.minObservations) {
    return hold(
      `Warming up: only ${n} price observation(s) for ${ticker} (need ${STRATEGY.minObservations}); holding.`,
    );
  }

  const prices = history.map((p) => toNum(p.price));
  const shortWindow = prices.slice(-STRATEGY.shortMaWindow);
  const longWindow = prices.slice(-STRATEGY.longMaWindow);
  const shortMa = mean(shortWindow);
  const longMa = mean(longWindow);
  const momentumPct = ((price - shortMa) / shortMa) * 100;
  const meanRevPct = ((price - longMa) / longMa) * 100;

  // Per-observation % moves over the short window, for the volatility filter.
  const moves: number[] = [];
  for (let i = Math.max(1, prices.length - STRATEGY.shortMaWindow); i < prices.length; i++) {
    moves.push(((prices[i] - prices[i - 1]) / prices[i - 1]) * 100);
  }
  const volatilityPct = stddev(moves);

  const signals = {
    ...baseSignals,
    shortMa: `$${shortMa.toFixed(2)}`,
    longMa: `$${longMa.toFixed(2)}`,
    momentumPct: +momentumPct.toFixed(2),
    meanRevPct: +meanRevPct.toFixed(2),
    volatilityPct: +volatilityPct.toFixed(2),
  };
  const withSignals = (d: Decision): Decision => ({ ...d, signals });

  // 2. Volatility filter.
  if (volatilityPct > STRATEGY.volatilityMaxPct) {
    return withSignals(
      hold(
        `${ticker} too volatile: per-observation move std-dev ${volatilityPct.toFixed(2)}% exceeds ` +
          `${STRATEGY.volatilityMaxPct}% filter; holding at ${signals.price}.`,
      ),
    );
  }

  const holding = position !== null && position.amount > 0n;

  // 3. Take-profit / stop-loss.
  if (holding && position.avgCost > 0n) {
    const avgCost = toNum(position.avgCost);
    const pnlPct = ((price - avgCost) / avgCost) * 100;
    if (pnlPct >= STRATEGY.takeProfitPct) {
      return withSignals({
        ticker,
        action: "SELL",
        rationale:
          `Take profit: ${ticker} at ${signals.price} is +${pnlPct.toFixed(2)}% vs avg cost ` +
          `$${avgCost.toFixed(2)} (>= +${STRATEGY.takeProfitPct}%).`,
        signals,
      });
    }
    if (pnlPct <= STRATEGY.stopLossPct) {
      return withSignals({
        ticker,
        action: "SELL",
        rationale:
          `Stop loss: ${ticker} at ${signals.price} is ${pnlPct.toFixed(2)}% vs avg cost ` +
          `$${avgCost.toFixed(2)} (<= ${STRATEGY.stopLossPct}%).`,
        signals,
      });
    }
  }

  // 4. Mean reversion overrides momentum.
  if (meanRevPct >= STRATEGY.meanRevSellPct) {
    if (!holding) {
      return withSignals(
        hold(
          `${ticker} overextended (+${meanRevPct.toFixed(2)}% vs long MA ${signals.longMa}) — ` +
            `sell signal, but no position to sell.`,
          "no position to sell",
        ),
      );
    }
    return withSignals({
      ticker,
      action: "SELL",
      rationale:
        `Mean reversion: ${ticker} at ${signals.price} is +${meanRevPct.toFixed(2)}% above its ` +
        `long average ${signals.longMa} (>= +${STRATEGY.meanRevSellPct}%); selling into strength.`,
      signals,
    });
  }
  if (meanRevPct <= STRATEGY.meanRevBuyPct) {
    if (holding) {
      return withSignals(
        hold(
          `${ticker} oversold (${meanRevPct.toFixed(2)}% vs long MA ${signals.longMa}) — buy signal, ` +
            `but already holding; v1 holds one position per ticker.`,
          "already holding",
        ),
      );
    }
    return withSignals({
      ticker,
      action: "BUY",
      rationale:
        `Mean reversion: ${ticker} at ${signals.price} is ${meanRevPct.toFixed(2)}% below its long ` +
        `average ${signals.longMa} (<= ${STRATEGY.meanRevBuyPct}%); buying the dip.`,
      signals,
    });
  }

  // 5. Momentum.
  if (momentumPct >= STRATEGY.momentumBuyPct) {
    if (holding) {
      return withSignals(
        hold(
          `${ticker} momentum +${momentumPct.toFixed(2)}% vs short MA ${signals.shortMa} — buy signal, ` +
            `but already holding; v1 holds one position per ticker.`,
          "already holding",
        ),
      );
    }
    return withSignals({
      ticker,
      action: "BUY",
      rationale:
        `Momentum: ${ticker} at ${signals.price} is +${momentumPct.toFixed(2)}% above its short ` +
        `average ${signals.shortMa} (>= +${STRATEGY.momentumBuyPct}%).`,
      signals,
    });
  }
  if (momentumPct <= STRATEGY.momentumSellPct) {
    if (!holding) {
      return withSignals(
        hold(
          `${ticker} momentum ${momentumPct.toFixed(2)}% vs short MA ${signals.shortMa} — sell signal, ` +
            `but no position to sell.`,
          "no position to sell",
        ),
      );
    }
    return withSignals({
      ticker,
      action: "SELL",
      rationale:
        `Momentum: ${ticker} at ${signals.price} is ${momentumPct.toFixed(2)}% below its short ` +
        `average ${signals.shortMa} (<= ${STRATEGY.momentumSellPct}%).`,
      signals,
    });
  }

  return withSignals(
    hold(
      `${ticker} no signal: momentum ${momentumPct.toFixed(2)}%, mean-reversion ` +
        `${meanRevPct.toFixed(2)}% — inside bands; holding at ${signals.price}.`,
    ),
  );
}
