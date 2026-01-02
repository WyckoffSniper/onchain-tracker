"use client";

import { useState } from "react";

export default function Home() {
  const [source, setSource] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTrace() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: source.trim(),
          token: token.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-2xl font-bold mb-2">
          ERC-20 Transfer Path Tracker
        </h1>
        <p className="text-sm text-zinc-300 mb-6">
          Track how ERC-20 tokens move between wallets and contracts.
        </p>

        <div className="space-y-4">
          <input
            className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none"
            placeholder="Source wallet address (0x...)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />

          <input
            className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none"
            placeholder="Token contract (optional)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          <button
            onClick={runTrace}
            disabled={loading}
            className="w-full rounded-xl bg-white text-black font-semibold py-3 disabled:opacity-50"
          >
            {loading ? "Tracing..." : "Track Transfers"}
          </button>

          {error && (
            <div className="text-red-400 text-sm border border-red-400/30 rounded-lg p-3">
              {error}
            </div>
          )}

          {result && (
            <pre className="text-xs bg-black/40 rounded-lg p-3 overflow-auto max-h-64">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </main>
  );
}
