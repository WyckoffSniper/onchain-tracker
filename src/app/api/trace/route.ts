import { NextResponse } from "next/server";

type TokentxItem = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  contractAddress: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
};

type EtherscanTokentxResponse = {
  status: string; // "1" or "0"
  message: string;
  result: TokentxItem[] | string;
};

type EtherscanProxyResponse = {
  status: string;
  message: string;
  result: string; // "0x..." bytecode
};

function isEthAddress(x: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(x);
}

function normAddr(x: string) {
  return x.toLowerCase();
}

function formatAmount(value: string, decimals: number) {
  // safe-ish formatting for UI; avoids big-int libs for MVP
  const v = value.replace(/^0+/, "") || "0";
  const d = Math.max(0, Math.min(36, decimals || 0));
  if (d === 0) return v;

  const pad = d - v.length + 1;
  const s = pad > 0 ? "0".repeat(pad) + v : v;

  const i = s.length - d;
  const whole = s.slice(0, i);
  const frac = s.slice(i).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

async function etherscanTokentx(params: {
  address: string;
  token: string;
  apiKey: string;
  offset: number;
}) {
  const url = new URL("https://api.etherscan.io/api");
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "tokentx");
  url.searchParams.set("address", params.address);
  url.searchParams.set("contractaddress", params.token);
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(params.offset));
  url.searchParams.set("sort", "desc");
  url.searchParams.set("apikey", params.apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as EtherscanTokentxResponse;
  return data;
}

async function isContractAddress(address: string, apiKey: string) {
  // Uses Etherscan proxy eth_getCode
  const url = new URL("https://api.etherscan.io/api");
  url.searchParams.set("module", "proxy");
  url.searchParams.set("action", "eth_getCode");
  url.searchParams.set("address", address);
  url.searchParams.set("tag", "latest");
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as EtherscanProxyResponse;
  const code = (data.result || "").toLowerCase();
  return code !== "0x" && code !== "0x0";
}

type Direction = "upstream" | "downstream" | "both";

type GraphNode = {
  id: string;
  label: string;
  kind: "wallet" | "contract" | "unknown";
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  txHash: string;
  timeStamp: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      wallet?: string;
      token?: string;
      direction?: Direction;
      maxHops?: number;
      perAddressLimit?: number;
    };

    const wallet = (body.wallet || "").trim();
    const token = (body.token || "").trim();
    const direction: Direction = body.direction || "downstream";
    const maxHops = Math.max(1, Math.min(4, Number(body.maxHops ?? 2))); // keep it reasonable for Etherscan
    const perAddressLimit = Math.max(10, Math.min(200, Number(body.perAddressLimit ?? 50)));

    if (!isEthAddress(wallet)) {
      return NextResponse.json({ ok: false, error: "Invalid wallet address" }, { status: 400 });
    }
    if (!isEthAddress(token)) {
      return NextResponse.json({ ok: false, error: "Invalid token contract address" }, { status: 400 });
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing ETHERSCAN_API_KEY (set it in Vercel env vars)" },
        { status: 500 }
      );
    }

    // BFS trace
    const start = normAddr(wallet);
    const tokenNorm = normAddr(token);

    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const transfers: Array<
      TokentxItem & {
        direction: "in" | "out";
        amountFormatted: string;
      }
    > = [];

    nodes.set(start, { id: start, label: `Wallet A\n${start.slice(0, 6)}…${start.slice(-4)}`, kind: "unknown" });

    let frontier = new Set<string>([start]);
    const visited = new Set<string>([start]);

    // We'll label at most N nodes (contract/wallet) to keep calls low
    const classifyQueue: string[] = [start];
    const MAX_CLASSIFY = 25;

    for (let hop = 0; hop < maxHops; hop++) {
      const nextFrontier = new Set<string>();

      for (const addr of frontier) {
        const txRes = await etherscanTokentx({
          address: addr,
          token: tokenNorm,
          apiKey,
          offset: perAddressLimit,
        });

        if (txRes.status !== "1") {
          // If Etherscan returns "No transactions found", status may be "0"
          continue;
        }

        const list = Array.isArray(txRes.result) ? txRes.result : [];
        for (const t of list) {
          const from = normAddr(t.from);
          const to = normAddr(t.to);
          const ts = Number(t.timeStamp || "0");

          const isOut = from === addr;
          const isIn = to === addr;

          const include =
            direction === "both" ||
            (direction === "downstream" && isOut) ||
            (direction === "upstream" && isIn);

          if (!include) continue;

          const src = direction === "upstream" ? from : from;
          const dst = direction === "upstream" ? to : to;

          // We trace graph using natural transfer direction from->to
          const edgeKey = `${t.hash}:${t.transactionIndex}:${from}:${to}:${t.value}`;
          if (!edges.has(edgeKey)) {
            const dec = Number(t.tokenDecimal || "0");
            const amt = formatAmount(t.value, dec);
            const label = `${amt} ${t.tokenSymbol || ""}`.trim();

            edges.set(edgeKey, {
              id: edgeKey,
              source: from,
              target: to,
              label,
              txHash: t.hash,
              timeStamp: ts,
            });
          }

          // Add nodes
          if (!nodes.has(from)) {
            nodes.set(from, {
              id: from,
              label: `${from.slice(0, 6)}…${from.slice(-4)}`,
              kind: "unknown",
            });
            if (classifyQueue.length < MAX_CLASSIFY) classifyQueue.push(from);
          }

          if (!nodes.has(to)) {
            nodes.set(to, {
              id: to,
              label: `${to.slice(0, 6)}…${to.slice(-4)}`,
              kind: "unknown",
            });
            if (classifyQueue.length < MAX_CLASSIFY) classifyQueue.push(to);
          }

          // Build frontier for next hop based on user direction
          if (direction === "downstream") {
            if (isOut && !visited.has(to)) {
              visited.add(to);
              nextFrontier.add(to);
            }
          } else if (direction === "upstream") {
            if (isIn && !visited.has(from)) {
              visited.add(from);
              nextFrontier.add(from);
            }
          } else {
            // both
            if (isOut && !visited.has(to)) {
              visited.add(to);
              nextFrontier.add(to);
            }
            if (isIn && !visited.has(from)) {
              visited.add(from);
              nextFrontier.add(from);
            }
          }

          // For the table, record transfers only when they touch the starting wallet
          if (addr === start) {
            const dec = Number(t.tokenDecimal || "0");
            transfers.push({
              ...t,
              direction: from === start ? "out" : "in",
              amountFormatted: `${formatAmount(t.value, dec)} ${t.tokenSymbol}`.trim(),
            });
          }
        }
      }

      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }

    // Classify some nodes as contract/wallet
    const toClassify = Array.from(new Set(classifyQueue)).slice(0, MAX_CLASSIFY);
    await Promise.all(
      toClassify.map(async (a) => {
        try {
          const isC = await isContractAddress(a, apiKey);
          const n = nodes.get(a);
          if (n) nodes.set(a, { ...n, kind: isC ? "contract" : "wallet" });
        } catch {
          // ignore
        }
      })
    );

    // Start node label polish
    const startNode = nodes.get(start);
    if (startNode) {
      nodes.set(start, {
        ...startNode,
        kind: startNode.kind === "unknown" ? "wallet" : startNode.kind,
        label: `Wallet A\n${start.slice(0, 6)}…${start.slice(-4)}`,
      });
    }

    // Prepare response
    const nodeArr = Array.from(nodes.values());
    const edgeArr = Array.from(edges.values()).sort((a, b) => b.timeStamp - a.timeStamp);
    transfers.sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp));

    return NextResponse.json({
      ok: true,
      wallet: start,
      token: tokenNorm,
      direction,
      maxHops,
      perAddressLimit,
      graph: {
        nodes: nodeArr,
        edges: edgeArr,
      },
      summary: {
        nodes: nodeArr.length,
        edges: edgeArr.length,
        startTransfers: transfers.length,
      },
      startTransfers: transfers.slice(0, 100),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
