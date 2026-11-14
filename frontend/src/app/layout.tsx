import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockPilot — paper-trading tokenized stocks on Base (testnet)",
  description:
    "Autonomous AI agent that paper-trades synthetic TEST- tokenized stocks on Base Sepolia, priced from real Chainlink Coinbase feeds on Base Mainnet. Testnet only — paper trading, no real shares, no real money.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0f1e] text-gray-200 antialiased">{children}</body>
    </html>
  );
}
