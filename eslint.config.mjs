import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const source = String(body?.source ?? "");
    const token = body?.token ? String(body.token) : undefined;

    // basic address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(source)) {
      return NextResponse.json({ error: "Invalid source address" }, { status: 400 });
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ETHERSCAN_API_KEY" }, { status: 500 });
    }

    const url = new URL("https://api.etherscan.io/api");
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    url.searchParams.set("address", source);
    if (token) url.searchParams.set("contractaddress", token);
    url.searchParams.set("sort", "desc");
    url.searchParams.set("apikey", apiKey);

    const res = await fetch(url.toString());
    const text = await res.text();

    // If Etherscan returns HTML or empty response, avoid JSON parse crash
    try {
      const json = JSON.parse(text);
      return NextResponse.json(json);
    } catch {
      return NextResponse.json(
        { error: "Upstream returned non-JSON", raw: text.slice(0, 500) },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export {};
