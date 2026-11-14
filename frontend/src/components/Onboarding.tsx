"use client";

/**
 * StockPilot onboarding — "Open a paper portfolio".
 *
 * Flow (Base Sepolia, testnet only):
 *   1. Connect wallet (injected provider, e.g. MetaMask — no wallet SDK,
 *      no account creation, plain viem + window.ethereum).
 *   2. Switch to Base Sepolia (chain 84532).
 *   3. createPortfolio() on StockPilotVault.
 *   4. Approve test USDC, then deposit(portfolioId, amount).
 *   5. The agent trades that portfolio on PaperMarket.
 *
 * When the contracts are not deployed yet (env addresses unset) the whole
 * panel renders a clear locked state — never broken buttons.
 * Test USDC comes from the Circle faucet (faucet.circle.com), Sepolia ETH
 * from the Chainlink / Superchain faucets — links are shown, nothing is
 * sold or charged here.
 */
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { erc20Abi, vaultAbi } from "@/lib/abis";
import {
  CHAIN_ID_SEPOLIA,
  CONTRACTS_DEPLOYED,
  SEPOLIA_USDC,
  VAULT_ADDRESS,
  sepoliaAddressUrl,
  sepoliaTxUrl,
} from "@/lib/config";

type Step = "idle" | "connecting" | "switching" | "creating" | "approving" | "depositing" | "done" | "error";

const FAUCETS = [
  { name: "Circle faucet — test USDC", url: "https://faucet.circle.com/" },
  { name: "Chainlink faucet — Sepolia ETH", url: "https://faucets.chain.link/base-sepolia" },
  { name: "Superchain faucet — Sepolia ETH", url: "https://console.optimism.io/faucet" },
];

export default function Onboarding() {
  const [address, setAddress] = useState<string | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [amount, setAmount] = useState("100");
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string>("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPortfolioId(window.localStorage.getItem("stockpilot-portfolio-id"));
    } catch {
      /* ignore */
    }
  }, []);

  const getClients = useCallback(() => {
    const eth = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!eth) throw new Error("No injected wallet found. Install MetaMask (or another injected wallet) and try again.");
    const wallet = createWalletClient({ chain: baseSepolia, transport: custom(eth as never) });
    const pub = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
    return { wallet, pub };
  }, []);

  const connect = useCallback(async () => {
    setStep("connecting");
    setMessage("");
    try {
      const { wallet, pub } = getClients();
      const [acct] = await wallet.requestAddresses();
      setAddress(acct);
      const bal = (await pub.readContract({
        address: SEPOLIA_USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [acct],
      })) as bigint;
      setUsdcBalance((Number(bal) / 1e6).toFixed(2));
      setStep("idle");
    } catch (e) {
      setStep("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [getClients]);

  const switchChain = useCallback(async () => {
    const eth = (window as unknown as { ethereum?: { request: (a: unknown) => Promise<unknown> } }).ethereum;
    if (!eth) throw new Error("No injected wallet found.");
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${CHAIN_ID_SEPOLIA.toString(16)}` }],
      });
    } catch (e) {
      const err = e as { code?: number };
      if (err.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${CHAIN_ID_SEPOLIA.toString(16)}`,
              chainName: "Base Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }, []);

  const createPortfolio = useCallback(async () => {
    setStep("creating");
    setMessage("");
    try {
      const { wallet, pub } = getClients();
      if (!address) throw new Error("Connect your wallet first.");
      await switchChain();
      const nextId = (await pub.readContract({
        address: VAULT_ADDRESS as `0x${string}`,
        abi: vaultAbi,
        functionName: "nextPortfolioId",
      })) as bigint;
      const hash = await wallet.writeContract({
        address: VAULT_ADDRESS as `0x${string}`,
        abi: vaultAbi,
        functionName: "createPortfolio",
        account: address as `0x${string}`,
      });
      setTxHash(hash);
      await pub.waitForTransactionReceipt({ hash });
      const id = nextId.toString();
      setPortfolioId(id);
      try {
        window.localStorage.setItem("stockpilot-portfolio-id", id);
      } catch {
        /* ignore */
      }
      setStep("idle");
      setMessage(`Paper portfolio #${id} created on Base Sepolia.`);
    } catch (e) {
      setStep("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [address, getClients, switchChain]);

  const deposit = useCallback(async () => {
    setStep("approving");
    setMessage("");
    try {
      const { wallet, pub } = getClients();
      if (!address || !portfolioId) throw new Error("Create a portfolio first.");
      const amt = parseUnits(amount || "0", 6);
      if (amt <= 0n) throw new Error("Enter an amount greater than 0.");
      await switchChain();
      const allowance = (await pub.readContract({
        address: SEPOLIA_USDC,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address as `0x${string}`, VAULT_ADDRESS as `0x${string}`],
      })) as bigint;
      if (allowance < amt) {
        const approveHash = await wallet.writeContract({
          address: SEPOLIA_USDC,
          abi: erc20Abi,
          functionName: "approve",
          args: [VAULT_ADDRESS as `0x${string}`, amt],
          account: address as `0x${string}`,
        });
        setTxHash(approveHash);
        await pub.waitForTransactionReceipt({ hash: approveHash });
      }
      setStep("depositing");
      const hash = await wallet.writeContract({
        address: VAULT_ADDRESS as `0x${string}`,
        abi: vaultAbi,
        functionName: "deposit",
        args: [BigInt(portfolioId), amt],
        account: address as `0x${string}`,
      });
      setTxHash(hash);
      await pub.waitForTransactionReceipt({ hash });
      setStep("done");
      setMessage(
        `Deposited ${amount} test USDC into paper portfolio #${portfolioId}. The agent will trade it on its schedule — watch the portfolio panel above.`,
      );
    } catch (e) {
      setStep("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [address, amount, getClients, portfolioId, switchChain]);

  if (!CONTRACTS_DEPLOYED) {
    return (
      <section className="card" style={{ borderColor: "rgba(245,158,11,.4)", background: "rgba(245,158,11,.1)" }}>
        <h2 style={{ color: "#fde68a" }}>Open a paper portfolio</h2>
        <p style={{ fontSize: 14, color: "#fef3c7" }}>
          <strong>Contracts not deployed yet — onboarding unlocks after deployment.</strong> The
          StockPilotVault, PaperMarket and TestOracle contracts are written and tested but not yet
          deployed to Base Sepolia (the deployer wallet is awaiting test ETH). Once they are live,
          this panel lets you connect a wallet, deposit test USDC, and let the agent trade your
          paper portfolio.
        </p>
        <p style={{ fontSize: 14 }}>
          In the meantime you can get ready: claim test USDC from the{" "}
          <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
            Circle faucet
          </a>{" "}
          and Sepolia ETH from the{" "}
          <a href="https://faucets.chain.link/base-sepolia" target="_blank" rel="noreferrer">
            Chainlink faucet
          </a>
          .
        </p>
      </section>
    );
  }

  const busy = ["connecting", "switching", "creating", "approving", "depositing"].includes(step);

  return (
    <section className="card">
      <h2>Open a paper portfolio</h2>
      <p className="muted">
        Connect a wallet on <strong>Base Sepolia (testnet)</strong>, deposit test USDC into StockPilotVault, and
        the agent trades it on PaperMarket. Paper trading only — no real shares, no real money. Every transaction
        links to Basescan Sepolia.
      </p>

      <div className="row">
        {!address ? (
          <button onClick={connect} disabled={busy} className="btn btn-blue">
            {step === "connecting" ? "Connecting…" : "Connect wallet"}
          </button>
        ) : (
          <span className="chip mono">
            {address.slice(0, 6)}…{address.slice(-4)}
            {usdcBalance !== null && <span className="muted"> · test USDC: {usdcBalance}</span>}
          </span>
        )}
        {address && !portfolioId && (
          <button onClick={createPortfolio} disabled={busy} className="btn btn-green">
            {step === "creating" ? "Creating…" : "Create paper portfolio"}
          </button>
        )}
        {address && portfolioId && (
          <span className="chip">
            Paper portfolio <strong>#{portfolioId}</strong>
          </span>
        )}
      </div>

      {address && portfolioId && (
        <div className="row">
          <label className="muted">
            Deposit test USDC
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="input" />
          </label>
          <button onClick={deposit} disabled={busy} className="btn btn-blue">
            {step === "approving" ? "Approving USDC…" : step === "depositing" ? "Depositing…" : "Approve + deposit"}
          </button>
        </div>
      )}

      {step === "done" && <p className="notice notice-green">✅ {message}</p>}
      {message && step !== "done" && step !== "error" && <p className="notice">{message}</p>}
      {step === "error" && message && <p className="notice notice-red">Transaction failed: {message}</p>}
      {txHash && (
        <p style={{ fontSize: 14 }}>
          Last tx:{" "}
          <a className="mono" href={sepoliaTxUrl(txHash)} target="_blank" rel="noreferrer">
            {txHash.slice(0, 10)}…{txHash.slice(-6)} ↗ Basescan Sepolia
          </a>
        </p>
      )}
      <p className="small">
        Vault contract:{" "}
        <a className="mono" href={sepoliaAddressUrl(VAULT_ADDRESS)} target="_blank" rel="noreferrer">
          {VAULT_ADDRESS}
        </a>
      </p>
      <div className="divider">
        <p className="small">
          <strong>NEED TEST FUNDS? (FREE FAUCETS)</strong>
        </p>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 14 }}>
          {FAUCETS.map((f) => (
            <li key={f.url}>
              <a href={f.url} target="_blank" rel="noreferrer">
                {f.name} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
