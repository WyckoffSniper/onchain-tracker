import { NextResponse } from "next/server";

type EtherscanResponse = {
  status: string; // "1" or "0"
  message: string;
  result: any;
};

function isEthAddress(x: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(x);
}

export async function POST(req: Request) {
  try {
    const { source, token } = (await req.json()) as {
      source?: string;
      token?: string;
    };

    if (!source || !isEthAddress(source)) {
      return NextResponse.json(
        { ok: false, error: "Invalid source wallet address" },
        { status: 400 }
      );
    }

    // token is optional — if provided, must be a contract address
    if (token && !isEthAddress(token)) {
      return NextResponse.json(
        { ok: false, error: "Invalid token contract address" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing ETHERSCAN_API_KEY. Add it in Vercel → Project → Settings → Environment Variables.",
        },
        { status: 500 }
      );
    }

    // ✅ Etherscan V2 endpoint (V1 is deprecated)
    const url = new URL("https://api.etherscan.io/v2/api");
    url.searchParams.set("chainid", "1"); // Ethereum mainnet
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    url.searchParams.set("address", source);
    if (token) url.searchParams.set("contractaddress", token);
    url.searchParams.set("page", "1");
    url.searchParams.set("offset", "100");
    url.searchParams.set("sort", "desc");
    url.searchParams.set("apikey", apiKey);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = (await res.json()) as EtherscanResponse;

    if (data.status !== "1") {
      return NextResponse.json(
        {
          ok: false,
          error: "Etherscan returned an error",
          etherscan: {
            status: data.status,
            message: data.message,
            result: data.result,
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      source,
      token: token ?? null,
      count: Array.isArray(data.result) ? data.result.length : 0,
      transfers: data.result,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
