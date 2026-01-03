"use client";

import React, { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, type Node, type Edge } from "reactflow";
import "reactflow/dist/style.css";

type Direction = "downstream" | "upstream" | "both";

type ApiNode = {
  id: string;
  label: string;
  kind: "wallet" | "contract" | "unknown";
};

type ApiEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  txHash: string;
  timeStamp: number;
};

type StartTransfer = {
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: string;
  value: string;
  direction: "in" | "out";
  amountFormatted: string;
};

type TraceResponse = {
  ok: boolean;
  error?: string;
  wallet: string;
  token: string;
  direction: Direction;
  maxHops: number;
  perAddressLimit: number;
  summary: { nodes: number; edges: number; startTransfers: number };
  graph: { nodes: ApiNode[]; edges: ApiEdge[] };
  startTransfers: StartTransfer[];
};

function isEthAddress(x: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(x.trim());
}

function shortAddr(a: string) {
  const s = a.trim();
  if (!isEthAddress(s)) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function fmtTime(ts: string) {
  const n = Number(ts) * 1000;
  if (!n) return "-";
  return new Date(n).toLocaleString();
}

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [token, setToken] = useState("");
  const [direction, setDirection] = useState<Direction>("downstream");
  const [maxHops, setMaxHops] = useState(2);
  const [perAddressLimit, setPerAddressLimit] = useState(50);

  const [tab, setTab] = useState<"graph" | "table">("graph");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flowNodes: Node[] = useMemo(() => {
    if (!data?.graph?.nodes) return [];
    // Simple layout: ReactFlow will auto-place at (0,0) if none; we give a radial-ish scatter
    const nodes = data.graph.nodes;
    const center = nodes[0]?.id;
    const radius = 220;

    return nodes.map((n, idx) => {
      const angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2;
      const isCenter = n.id === center;

      // Minimal styling, modern look
      const baseStyle: React.CSSProperties = {
        borderRadius: 14,
        padding: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)",
        color: "white",
        fontSize: 12,
        lineHeight: 1.2,
        width: 200,
        whiteSpace: "pre-line",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      };

      const kindTag =
        n.kind === "contract" ? "Contract" : n.kind === "wallet" ? "Wallet" : "Unknown";

      const label = `${n.label}\n${kindTag}`;

      return {
        id: n.id,
        position: isCenter
          ? { x: 0, y: 0 }
          : { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: { label },
        style: baseStyle,
      };
    });
  }, [data]);

  const flowEdges: Edge[] = useMemo(() => {
    if (!data?.graph?.edges) return [];
    return data.graph.edges.slice(0, 250).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: false,
      style: { strokeWidth: 1.2, stroke: "rgba(255,255,255,0.35)" },
      labelStyle: { fill: "rgba(255,255,255,0.85)", fontSize: 11 },
    }));
  }, [data]);

  async function run() {
    setError(null);
    setData(null);

    if (!isEthAddress(wallet)) {
      setError("Wallet must be a valid 0x address.");
      return;
    }
    if (!isEthAddress(token)) {
      setError("Token must be a valid token contract 0x address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: wallet.trim(),
          token: token.trim(),
          direction,
          maxHops,
          perAddressLimit,
        }),
      });

      const json = (await res.json()) as TraceResponse;
      if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Token Path Explorer</h1>
            <p className="text-zinc-300">
              Trace ERC-20 flows across connected wallets/contracts. Use upstream to find where tokens came from,
              downstream to see dispersal/sell paths.
            </p>
          </div>

          {/* Controls */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-6">
                <label className="text-sm text-zinc-300">Wallet (starting point)</label>
                <input
                  className="mt-2 w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none focus:border-white/20"
                  placeholder="0x..."
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                />
                <p className="mt-2 text-xs text-zinc-400">
                  This is your “Wallet A” starting node.
                </p>
              </div>

              <div className="md:col-span-6">
                <label className="text-sm text-zinc-300">Token Contract</label>
                <input
                  className="mt-2 w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none focus:border-white/20"
                  placeholder="0x..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <p className="mt-2 text-xs text-zinc-400">
                  Must be the ERC-20 contract address (not a wallet).
                </p>
              </div>

              <div className="md:col-span-4">
                <label className="text-sm text-zinc-300">Direction</label>
                <select
                  className="mt-2 w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none focus:border-white/20"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as Direction)}
                >
                  <option value="downstream">Downstream (where it went)</option>
                  <option value="upstream">Upstream (where it came from)</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="text-sm text-zinc-300">Max Hops (depth)</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  className="mt-2 w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none focus:border-white/20"
                  value={maxHops}
                  onChange={(e) => setMaxHops(Number(e.target.value))}
                />
                <p className="mt-2 text-xs text-zinc-400">
                  Higher hops = more addresses = slower/more API usage.
                </p>
              </div>

              <div className="md:col-span-4">
                <label className="text-sm text-zinc-300">Per Address Limit</label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  className="mt-2 w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none focus:border-white/20"
                  value={perAddressLimit}
                  onChange={(e) => setPerAddressLimit(Number(e.target.value))}
                />
                <p className="mt-2 text-xs text-zinc-400">
                  How many recent transfers to pull per node.
                </p>
              </div>

              <div className="md:col-span-12 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <button
                  onClick={run}
                  disabled={loading}
                  className="rounded-xl bg-white text-black font-semibold px-5 py-3 disabled:opacity-50"
                >
                  {loading ? "Tracing…" : "Trace Path"}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTab("graph")}
                    className={`rounded-xl px-4 py-2 text-sm border ${
                      tab === "graph"
                        ? "bg-white text-black border-white"
                        : "bg-transparent text-white border-white/15"
                    }`}
                  >
                    Graph
                  </button>
                  <button
                    onClick={() => setTab("table")}
                    className={`rounded-xl px-4 py-2 text-sm border ${
                      tab === "table"
                        ? "bg-white text-black border-white"
                        : "bg-transparent text-white border-white/15"
                    }`}
                  >
                    Transactions
                  </button>
                </div>
              </div>

              {error && (
                <div className="md:col-span-12 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          {data && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-xs text-zinc-400">Nodes</div>
                <div className="mt-1 text-2xl font-semibold">{data.summary.nodes}</div>
                <div className="mt-2 text-sm text-zinc-300">
                  Wallets/contracts detected in path.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-xs text-zinc-400">Edges</div>
                <div className="mt-1 text-2xl font-semibold">{data.summary.edges}</div>
                <div className="mt-2 text-sm text-zinc-300">
                  Transfer links between nodes.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-xs text-zinc-400">Start Wallet Transfers</div>
                <div className="mt-1 text-2xl font-semibold">{data.summary.startTransfers}</div>
                <div className="mt-2 text-sm text-zinc-300">
                  Recent transfers touching Wallet A.
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          {data && tab === "graph" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm text-zinc-300">Graph View</div>
                  <div className="text-xs text-zinc-500">
                    Wallet A: <span className="text-zinc-300">{shortAddr(data.wallet)}</span> · Token:{" "}
                    <span className="text-zinc-300">{shortAddr(data.token)}</span>
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  Tip: zoom/drag, click nodes, use controls.
                </div>
              </div>

              <div style={{ width: "100%", height: 560 }}>
                <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
                  <Background />
                  <MiniMap />
                  <Controls />
                </ReactFlow>
              </div>
            </div>
          )}

          {data && tab === "table" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-col gap-1 pb-4">
                <div className="text-sm text-zinc-300">Transactions touching Wallet A</div>
                <div className="text-xs text-zinc-500">
                  This table shows transfers directly in/out of your starting wallet (fast + useful for context).
                </div>
              </div>

              <div className="overflow-auto rounded-xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-black/30 text-zinc-300">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Time</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="text-left px-4 py-3 font-medium">From</th>
                      <th className="text-left px-4 py-3 font-medium">To</th>
                      <th className="text-left px-4 py-3 font-medium">Amount</th>
                      <th className="text-left px-4 py-3 font-medium">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.startTransfers.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-zinc-400" colSpan={6}>
                          No transfers found for that wallet + token (or API returned none).
                        </td>
                      </tr>
                    ) : (
                      data.startTransfers.map((t) => (
                        <tr key={t.hash} className="border-t border-white/10 text-zinc-100">
                          <td className="px-4 py-3 text-zinc-300">{fmtTime(t.timeStamp)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs border ${
                                t.direction === "in"
                                  ? "border-emerald-400/30 text-emerald-200 bg-emerald-500/10"
                                  : "border-amber-400/30 text-amber-200 bg-amber-500/10"
                              }`}
                            >
                              {t.direction === "in" ? "Received" : "Sent"}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-300">{shortAddr(t.from)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-300">{shortAddr(t.to)}</td>
                          <td className="px-4 py-3">{t.amountFormatted}</td>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-400">{shortAddr(t.hash)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pt-4 text-xs text-zinc-500">
                Next upgrade: click a node/tx to expand the graph around it (wallet clustering).
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
