"use client";

import { useCallback, useEffect, useState } from "react";
import Onboarding from "@/components/Onboarding";
import {
  CONTRACTS_DEPLOYED,
  PAPER_MARKET_ADDRESS,
  TEST_ORACLE_ADDRESS,
  VAULT_ADDRESS,
  formatTs,
  formatUsd,
  formatUsdRaw,
  mainnetAddressUrl,
  sepoliaAddressUrl,
  sepoliaTxUrl,
} from "@/lib/config";

/* ---------------- types ---------------- */

interface FeedPrice {
  ticker: string;
  feed: string;
  price: string | null;
  priceUsd: number | null;
  updatedAt: number | null;
  ageSec: number | null;
  stale: boolean;
  ok: boolean;
}

interface PricesResp {
  status: string;
  marketOpen: boolean;
  fetchedAt: string;
  prices: FeedPrice[];
}

interface AgentResp {
  available: boolean;
  updatedAt?: string;
  prices?: Record<string, { price: string; updatedAt: number; stale: boolean }>;
  positions?: Record<string, { amount: string; avgCost: string; totalCost: string }>;
  decisions?: {
    at: string;
    ticker: string;
    action: string;
    rationale: string;
    llmRationale: string | null;
  }[];
  dryRunTrades?: { at: string; ticker: string; action: string; mode: string; txHash: string | null; args: Record<string, string> }[];
  liveTrades?: { at: string; ticker: string; action: string; mode: string; txHash: string | null; args: Record<string, string> }[];
}

interface TradesResp {
  deployed: boolean;
  source?: string;
  address?: string;
  trades?: {
    index: number;
    portfolioId: number;
    ticker: string;
    isBuy: boolean;
    tokenAmount: string;
    usdcAmount: string;
    price: string;
    rationale: string;
    timestamp?: number;
    txHash?: string;
  }[];
  positions?: Record<string, { amount: string; avgCost: string; totalCost: string }>;
}

/* ---------------- helpers ---------------- */

function ageLabel(ageSec: number | null): string {
  if (ageSec === null) return "—";
  if (ageSec < 3600) return `${Math.round(ageSec / 60)} min ago`;
  if (ageSec < 86400) return `${(ageSec / 3600).toFixed(1)} h ago`;
  return `${(ageSec / 86400).toFixed(1)} days ago`;
}

function statusPill(status: string) {
  if (status === "market-open")
    return <span className="pill pill-green">● Market open — live prices</span>;
  if (status === "market-open-stale")
    return <span className="pill pill-amber">● Market open — a feed is stale</span>;
  return <span className="pill pill-sky">● Market closed / weekend hold — showing last close</span>;
}

/* ---------------- page ---------------- */

export default function Home() {
  const [prices, setPrices] = useState<PricesResp | null>(null);
  const [agent, setAgent] = useState<AgentResp | null>(null);
  const [trades, setTrades] = useState<TradesResp | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/prices");
      if (!r.ok) throw new Error(`prices API ${r.status}`);
      setPrices(await r.json());
      setPricesError(null);
    } catch (e) {
      setPricesError(e instanceof Error ? e.message : String(e));
    }
    try {
      const r = await fetch("/api/agent");
      if (r.ok) setAgent(await r.json());
    } catch {
      /* agent panel shows its own empty state */
    }
    try {
      const r = await fetch("/api/trades");
      if (r.ok) setTrades(await r.json());
    } catch {
      /* trades panel falls back to agent state */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const priceMap = new Map((prices?.prices ?? []).map((p) => [p.ticker, p]));
  const agentPositions = agent?.positions ?? {};
  const onchainPositions = trades?.positions ?? {};
  const positions = Object.keys(onchainPositions).length > 0 ? onchainPositions : agentPositions;
  const positionTickers = Object.keys(positions);

  let totalCost = 0;
  let totalMark = 0;
  for (const t of positionTickers) {
    const pos = positions[t];
    const tokens = Number(pos.amount) / 1e18;
    const cost = Number(pos.totalCost) / 1e6;
    const cur = priceMap.get(t)?.priceUsd ?? Number(pos.avgCost) / 1e8;
    totalCost += cost;
    totalMark += tokens * cur;
  }
  const totalPnl = totalMark - totalCost;

  const onchainTrades = trades?.deployed ? trades.trades ?? [] : [];
  const liveTrades = agent?.liveTrades ?? [];
  const dryRunTrades = agent?.dryRunTrades ?? [];

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>
            StockPilot <span className="muted">— autonomous paper-trading agent</span>
          </h1>
          <p className="muted" style={{ maxWidth: 640 }}>
            The agent reads real Coinbase tokenized-stock prices from Chainlink feeds on Base Mainnet,
            reasons about them, and paper-trades synthetic <code>TEST-</code> B20 tokens on Base Sepolia.
            Every trade settles onchain; every decision carries a written rationale.
          </p>
        </div>
        <div className="badges">
          <span className="badge badge-amber">TESTNET ONLY — BASE SEPOLIA</span>
          <span className="badge badge-gray">Paper trading — no real shares, no real money</span>
        </div>
      </header>

      <div className="banner">
        <strong>Honest labelling.</strong> Prices below are <strong>real</strong> — Chainlink Coinbase
        tokenized-equity feeds on Base Mainnet. The instruments the agent trades are{" "}
        <strong>synthetic TEST- tokens</strong> (e.g. <code>TEST-NVDA</code>) minted through Base&apos;s B20
        factory on Sepolia; they are <strong>not</strong> real shares and never mimic real tickers. Trades use
        test USDC only. Nothing here is investment advice.
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Live prices — Chainlink Coinbase feeds (Base Mainnet)</h2>
          {prices && statusPill(prices.status)}
        </div>
        <p className="small">
          8-decimal feeds, 24/5. On weekends and outside US market hours (13:30–20:00 UTC, Mon–Fri) the feeds
          hold the last close — that is expected. A feed older than 3 days is treated as stale and the agent holds.
        </p>
        {pricesError && (
          <p className="notice notice-red">Could not reach the price feeds: {pricesError}</p>
        )}
        <div className="grid-prices">
          {(prices?.prices ?? []).map((p) => (
            <div key={p.ticker} className="card">
              <div className="price-row">
                <span className="ticker">{p.ticker}</span>
                <span className="small">TEST-{p.ticker}</span>
              </div>
              <div className="price">{p.priceUsd !== null ? formatUsdRaw(p.priceUsd) : "—"}</div>
              <div className="sub">
                {p.updatedAt ? `Updated ${formatTs(p.updatedAt)}` : "no feed data"}
                <br />
                Age: {ageLabel(p.ageSec)}{" "}
                {p.stale ? <span className="stale">· stale</span> : <span className="fresh">· fresh</span>}
              </div>
              <a className="link" href={mainnetAddressUrl(p.feed)} target="_blank" rel="noreferrer">
                Feed {p.feed.slice(0, 8)}… ↗ Basescan
              </a>
            </div>
          ))}
          {!prices && !pricesError && <p className="muted">Loading live prices…</p>}
        </div>
        {prices && <p className="small">Fetched at {prices.fetchedAt} · refreshes every 60 s.</p>}
      </section>

      <section className="section">
        <h2>Agent portfolio</h2>
        <p className="small">
          Positions{" "}
          {Object.keys(onchainPositions).length > 0
            ? "read onchain from PaperMarket (Base Sepolia)"
            : "from the agent's state file (agent/state.json)"}
          {agent?.updatedAt ? ` · agent state updated ${agent.updatedAt}` : ""}. P&amp;L is marked against the
          live feed prices above. Synthetic TEST- tokens only.
        </p>

        <div className="stats">
          <div className="card">
            <div className="stat-label">Open positions</div>
            <div className="stat-value">{positionTickers.length}</div>
          </div>
          <div className="card">
            <div className="stat-label">Cost basis (test USDC)</div>
            <div className="stat-value">{formatUsdRaw(totalCost)}</div>
          </div>
          <div className="card">
            <div className="stat-label">Unrealized P&amp;L</div>
            <div className={`stat-value ${totalPnl >= 0 ? "pos" : "neg"}`}>
              {totalPnl >= 0 ? "+" : ""}
              {formatUsdRaw(totalPnl)}
            </div>
          </div>
        </div>

        {positionTickers.length === 0 ? (
          <p className="notice">
            No open positions — the agent is flat. It is holding while the market is closed (feeds hold
            Friday&apos;s close) and will trade when the market opens and its rules fire.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Tokens</th>
                <th>Avg cost</th>
                <th>Current</th>
                <th>Unrealized P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {positionTickers.map((t) => {
                const pos = positions[t];
                const tokens = Number(pos.amount) / 1e18;
                const avg = Number(pos.avgCost) / 1e8;
                const cost = Number(pos.totalCost) / 1e6;
                const cur = priceMap.get(t)?.priceUsd ?? avg;
                const pnl = tokens * cur - cost;
                return (
                  <tr key={t}>
                    <td><strong>TEST-{t}</strong></td>
                    <td>{tokens.toFixed(4)}</td>
                    <td>{formatUsdRaw(avg)}</td>
                    <td>{formatUsdRaw(cur)}</td>
                    <td className={pnl >= 0 ? "pos" : "neg"}>
                      <strong>
                        {pnl >= 0 ? "+" : ""}
                        {formatUsdRaw(pnl)}
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <h3 style={{ marginTop: 24 }}>Trade history</h3>
        {!trades?.deployed && (
          <p className="small">
            Contracts not deployed yet — no onchain trades exist. Below is the agent&apos;s dry-run record
            (calldata the agent <em>would</em> have sent). Live onchain trades will appear here after deployment.
          </p>
        )}
        {trades?.deployed && (
          <p className="small">
            Onchain trades from PaperMarket{" "}
            <a href={sepoliaAddressUrl(PAPER_MARKET_ADDRESS)} target="_blank" rel="noreferrer">
              {PAPER_MARKET_ADDRESS}
            </a>{" "}
            (source: {trades.source}).
          </p>
        )}
        {onchainTrades.length === 0 && liveTrades.length === 0 && dryRunTrades.length === 0 && (
          <p className="notice">No trades yet — the agent has only made HOLD decisions so far.</p>
        )}
        {onchainTrades.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>Side</th>
                <th>Instrument</th>
                <th>Amount</th>
                <th>Price</th>
                <th>Rationale</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {onchainTrades.map((t) => (
                <tr key={t.index}>
                  <td className={t.isBuy ? "pos" : "neg"}>
                    <strong>{t.isBuy ? "BUY" : "SELL"}</strong>
                  </td>
                  <td>TEST-{t.ticker}</td>
                  <td>{(Number(t.usdcAmount) / 1e6).toFixed(2)} USDC</td>
                  <td>{formatUsd(t.price)}</td>
                  <td>{t.rationale || "—"}</td>
                  <td>
                    {t.txHash ? (
                      <a href={sepoliaTxUrl(t.txHash)} target="_blank" rel="noreferrer">
                        ↗
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {dryRunTrades.length > 0 && (
          <div>
            <p className="small" style={{ marginTop: 12 }}>
              <strong>DRY-RUN RECORD</strong> (no transactions sent — contracts not deployed)
            </p>
            <ul className="list">
              {dryRunTrades.slice(0, 10).map((t, i) => (
                <li key={i}>
                  <strong>{t.action}</strong> TEST-{t.ticker} · <span className="muted">{t.at}</span>{" "}
                  <span className="tag tag-dry">dry-run</span>
                  <div className="mono small break" style={{ marginTop: 4 }}>
                    {t.args ? JSON.stringify(t.args) : ""}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Agent rationale log</h2>
        <p className="small">
          Every decision carries a written reason. Rules decide; the free LLM only explains (a failed LLM call
          never blocks a trade).
        </p>
        {!agent?.available && (
          <p className="notice">Agent state not available yet — the agent has not written a state file to this host.</p>
        )}
        <ul className="list">
          {(agent?.decisions ?? []).slice(0, 12).map((d, i) => (
            <li key={i}>
              <div>
                <strong>TEST-{d.ticker}</strong>{" "}
                <span className={`tag ${d.action === "BUY" ? "tag-buy" : d.action === "SELL" ? "tag-sell" : "tag-hold"}`}>
                  {d.action}
                </span>{" "}
                <span className="muted">{d.at}</span>
              </div>
              <p style={{ margin: "4px 0 0" }}>{d.rationale}</p>
              {d.llmRationale && <p className="small" style={{ fontStyle: "italic" }}>LLM: {d.llmRationale}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <Onboarding />
      </section>

      <footer className="footer">
        <p>
          <strong>Contracts — Base Sepolia (chain 84532)</strong>
        </p>
        <ul className="mono">
          <li>
            StockPilotVault:{" "}
            {VAULT_ADDRESS ? (
              <a href={sepoliaAddressUrl(VAULT_ADDRESS)} target="_blank" rel="noreferrer">
                {VAULT_ADDRESS} ↗
              </a>
            ) : (
              "not deployed yet"
            )}
          </li>
          <li>
            PaperMarket:{" "}
            {PAPER_MARKET_ADDRESS ? (
              <a href={sepoliaAddressUrl(PAPER_MARKET_ADDRESS)} target="_blank" rel="noreferrer">
                {PAPER_MARKET_ADDRESS} ↗
              </a>
            ) : (
              "not deployed yet"
            )}
          </li>
          <li>
            TestOracle:{" "}
            {TEST_ORACLE_ADDRESS ? (
              <a href={sepoliaAddressUrl(TEST_ORACLE_ADDRESS)} target="_blank" rel="noreferrer">
                {TEST_ORACLE_ADDRESS} ↗
              </a>
            ) : (
              "not deployed yet"
            )}
          </li>
          <li>Test USDC (Sepolia): 0x036CbD53842c5426634e7929541eC2318f3dCF7e</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          StockPilot — Base Stocks Maxxing Builder Quest 2026, Agentic Stock Finance track. Builder: Maulana Abdan
          Sakur (solo).{" "}
          {CONTRACTS_DEPLOYED
            ? ""
            : "Contracts not deployed yet — dashboard runs against live price feeds + the agent's dry-run state."}{" "}
          Testnet only. Paper trading. No real shares, no real money, no investment advice.
        </p>
      </footer>
    </main>
  );
}
