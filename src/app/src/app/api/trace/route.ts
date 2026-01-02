import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { source, token } = body;

    if (!source || !/^0x[a-fA-F0-9]{40}$/.test(source)) {
      return NextResponse.json(
        { error: "Invalid source address" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing ETHERSCAN_API_KEY" },
        { status: 500 }
      );
    }

    const url = new URL("https://api.etherscan.io/api");
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    url.searchParams.set("address", source);
    if (token) url.searchParams.set("contractaddress", token);
    url.searchParams.set("sort", "desc");
    url.searchParams.set("apikey", apiKey);

    const res = await fetch(url.toString());
    const json = await res.json();

    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
