"use client";

import { useMemo, useState } from "react";

type ApiOk = {
  ok: true;
  source: string;
  token: string;
  count: number;
  transfers: Array<{
    hash: string;
    from: string;
    to: string;
    timeStamp?: string; // etherscan string unix seconds
    tokenSymbol?: string;
    tokenName?: string;
    tokenDecimal?: string;
    value?: string; // raw integer string
  }>;
};

type ApiErr = {
  ok: false;
  error: string;
  etherscan?: {
    status: string;
    message: string;
    result: any;
  };
};

type ApiResponse = ApiOk | ApiErr;

function shortAddr(a: string) {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatTime(ts?: string) {
  if (!ts) return "";
  const n = Number(ts);
  if (!Number.isFinite(n)) return "";
  const d = new Date(n * 1000);
  return d.toLocaleString();
}

// Best-effort formatting; avoids BigInt issues for huge values
function formatTokenAmount(raw?: string, decimalsStr?: string) {
  if (!raw) return "";
  const decimals = Number(decimalsStr ?? "0");
  if (!Number.isFinite(decimals) || decimals <= 0) return raw;

  // If raw is enormous, do a simple string decimal shift without floating point
  const s = raw.replace(/^0+/, "") || "0";
  if (decimals === 0) return s;

  const pad = decimals - s.length + 1;
  const whole = pad > 0 ? "0" : s.slice(0, s.length - decimals);
  const frac = (pad > 0 ? "0".repeat(pad) + s : s).slice(-decimals);

  // trim trailing zeros
  const fracTrim = frac.replace(/0+$/, "");
  return fracTrim ? `${whole}.${fracTrim}` : whole;
}

export default function Home() {
  const [source, setSource] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);

  const ok = data && "ok" in data && data.ok;

  const rows = useMemo(() => {
    if (!ok) return [];
    return data.transfers ?? [];
  }, [ok, data]);

  async function runTrace() {
    setLoading(true);
    setData(null);

    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: source.trim(),
          token: token.trim(),
        }),
      });

      // read as text first so we can show a helpful error if server returns non-JSON
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setData({
          ok: false,
          error: `Server did not return JSON (status ${res.status}).`,
        });
        return;
      }

      if (!res.ok || !json?.ok) {
        setData({
          ok: false,
          error: json?.error || `Request failed (status ${res.status}).`,
          etherscan: json?.etherscan,
        });
        return;
      }

      setData(json as ApiOk);
    } catch (e: any) {
      setData({ ok: false, error: e?.message || "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">ERC-20 Transfer Path Tracker</h1>
          <p className="text-sm text-zinc-300">
            Paste a wallet + token <span className="text-white/80">(contract)</span> to view recent ERC-20 transfers.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none"
            placeholder="Source wallet address (0x...)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <input
            className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 outline-none"
            placeholder="Token contract address (0x...)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <button
          onClick={runTrace}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-white text-black font-semibold py-3 disabled:opacity-50"
        >
          {loading ? "Tracing..." : "Track Transfers"}
        </button>

        {/* Errors */}
        {data && !data.ok && (
          <div className="mt-4 text-sm border border-red-400/30 rounded-xl bg-red-500/10 p-4 text-red-200">
            <div className="font-semibold mb-1">Error</div>
            <div>{data.error}</div>

            {data.etherscan && (
              <div className="mt-3 text-xs text-red-100/90">
                <div>
                  <span className="text-red-100/70">Etherscan status:</span>{" "}
                  {data.etherscan.status} • {data.etherscan.message}
                </div>
                {typeof data.etherscan.result === "string" && (
                  <div className="mt-1">
                    <span className="text-red-100/70">Details:</span> {data.etherscan.result}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Success summary */}
        {ok && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-200">
            <span className="px-3 py-1 rounded-full bg-black/30 border border-white/10">
              Wallet: <span className="text-white">{shortAddr(data.source)}</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-black/30 border border-white/10">
              Token: <span className="text-white">{shortAddr(data.token)}</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-black/30 border border-white/10">
              Transfers: <span className="text-white">{data.count}</span>
            </span>
          </div>
        )}

        {/* Results table */}
        {ok && (
          <div className="mt-4 overflow-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full text-left text-xs">
              <thead className="text-zinc-300 bg-black/30">
                <tr>
                  <th className="px-3 py-2 whitespace-nowrap">Time</th>
                  <th className="px-3 py-2 whitespace-nowrap">From</th>
                  <th className="px-3 py-2 whitespace-nowrap">To</th>
                  <th className="px-3 py-2 whitespace-nowrap">Token</th>
                  <th className="px-3 py-2 whitespace-nowrap">Amount</th>
                  <th className="px-3 py-2 whitespace-nowrap">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.slice(0, 50).map((tx, i) => {
                  const amount = formatTokenAmount(tx.value, tx.tokenDecimal);
                  const symbol = tx.tokenSymbol || "";
                  return (
                    <tr key={`${tx.hash}-${i}`} className="hover:bg-white/5">
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-300">
                        {formatTime(tx.timeStamp)}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        {shortAddr(tx.from)}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        {shortAddr(tx.to)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {symbol || tx.tokenName || "-"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {amount ? `${amount} ${symbol}`.trim() : "-"}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        <a
                          className="underline underline-offset-2 text-zinc-200 hover:text-white"
                          href={`https://etherscan.io/tx/${tx.hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {tx.hash ? shortAddr(tx.hash) : "-"}
                        </a>
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-zinc-300" colSpan={6}>
                      No transfers found for that wallet + token. (Or Etherscan returned none.)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Helpful hint */}
        <div className="mt-4 text-xs text-zinc-400">
          Tip: the second field must be the <span className="text-zinc-200">token contract address</span> (not a wallet).
          Make sure you also set <span className="text-zinc-200">ETHERSCAN_API_KEY</span> in Vercel Environment Variables.
        </div>
      </div>
    </main>
  );
}
